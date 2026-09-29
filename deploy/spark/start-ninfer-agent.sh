#!/usr/bin/env bash
# Start the verified ternary candidate after the old generator has been drained.
set -euo pipefail
runtime_root="${SPARK_RUNTIME_ROOT:-$HOME/workspaces/403-forbidden-runtime}"
export NINFER_RUNTIME_ROOT="$runtime_root"
python3 - "$@" <<'PY'
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request

def require(condition, message):
    if not condition:
        raise SystemExit(message)

root = Path(os.environ["NINFER_RUNTIME_ROOT"]).resolve()
config = json.loads((root / "config/ninfer-ternary.json").read_text())
require(sys.argv[1:] in ([], ["--check"]), "usage: start-ninfer-agent.sh [--check]")
files = {}
for kind in ("model", "binary"):
    file = (root / config[kind + "_relative_path"]).resolve()
    require(file.is_relative_to(root) and file.is_file(), "invalid installed artifact path")
    with file.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    require(digest == config[kind + "_sha256"], kind + " digest mismatch")
    files[kind] = file
require(1 <= config["context_length"] <= 262144, "unsupported context length")
require(config["kv_capacity"] >= config["context_length"], "KV pool too small")
require(1 <= config["max_concurrency"] <= 8, "unsupported concurrency")
require(config["prefill_chunk"] > 0 and config["prefill_chunk"] % 128 == 0, "invalid prefill chunk")
require(1 <= config["draft_tokens"] <= 5, "invalid MTP window")
image = config["image_id"]
require(image.startswith("sha256:") and len(image) == 71, "image must be pinned")
subprocess.run(["docker", "image", "inspect", image], check=True, stdout=subprocess.DEVNULL)
old = subprocess.run(["docker", "inspect", "--format", "{{.State.Running}}", "qwen38-agent"],
                     capture_output=True, text=True)
old_running = old.returncode == 0 and old.stdout.strip() == "true"
if sys.argv[1:] == ["--check"]:
    print(json.dumps({"artifacts_verified": True, "old_generator_running": old_running,
                      "model_id": config["model_id"], "context_length": config["context_length"],
                      "kv_capacity": config["kv_capacity"], "production_started": False}))
    raise SystemExit(0)
require(not old_running, "drain and stop qwen38-agent under maintenance before activation")
exists = subprocess.run(["docker", "inspect", "ninfer-agent"], capture_output=True)
require(exists.returncode != 0, "ninfer-agent already exists; inspect it before replacing")
command = ["docker", "run", "-d", "--name", "ninfer-agent", "--restart", "unless-stopped",
           "--gpus", "all", "--network", "host", "--read-only", "--tmpfs", "/tmp:rw,size=256m",
           "--memory", "48g", "--memory-swap", "48g", "--cap-drop", "ALL",
           "--security-opt", "no-new-privileges", "--log-opt", "max-size=10m", "--log-opt", "max-file=3",
           "-v", str(files["binary"].parent) + ":/opt/ninfer:ro",
           "-v", str(files["model"].parent) + ":/models:ro",
           "--entrypoint", "/opt/ninfer/" + files["binary"].name, image,
           "/models/" + files["model"].name, "--host", "127.0.0.1", "--port", "30000",
           "--model-id", config["model_id"], "--max-context", str(config["context_length"]),
           "--kv-capacity", str(config["kv_capacity"]), "--max-concurrency", str(config["max_concurrency"]),
           "--device-state-slots", str(config["max_concurrency"]), "--host-state-slots", "0",
           "--host-kv-mib", "0", "--kv-dtype", "fp8", "--prefill-chunk", str(config["prefill_chunk"]),
           "--spec", "mtp", "--draft-tokens", str(config["draft_tokens"])]
subprocess.run(command, check=True, stdout=subprocess.DEVNULL)
for _ in range(180):
    try:
        with urllib.request.urlopen("http://127.0.0.1:30000/health", timeout=3) as response:
            if response.status == 200:
                print(json.dumps({"ready": True, "container": "ninfer-agent", "public_gateway_unchanged": True}))
                raise SystemExit(0)
    except OSError:
        pass
    state = subprocess.run(["docker", "inspect", "--format", "{{.State.Running}}", "ninfer-agent"], capture_output=True, text=True)
    if state.stdout.strip() != "true":
        break
    time.sleep(2)
subprocess.run(["docker", "stop", "-t", "5", "ninfer-agent"], capture_output=True)
raise SystemExit("candidate failed readiness; inspect docker logs and restore the preserved generator")
PY
