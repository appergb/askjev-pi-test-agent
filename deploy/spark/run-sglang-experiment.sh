#!/usr/bin/env bash
set -euo pipefail

# Bash reads scripts incrementally. Execute a fixed copy so a deployment cannot
# change the remaining commands of an experiment already in progress.
if [[ "${SPARK_EXPERIMENT_SNAPSHOT:-}" != yes ]]; then
  experiment_copy="$(mktemp "${TMPDIR:-/tmp}/sglang-experiment.XXXXXX")"
  trap 'rm -f "$experiment_copy"' EXIT
  cp "$0" "$experiment_copy"
  experiment_status=0
  SPARK_EXPERIMENT_SNAPSHOT=yes bash "$experiment_copy" "$@" || experiment_status=$?
  exit "$experiment_status"
fi

runtime_root="${SPARK_RUNTIME_ROOT:-$HOME/workspaces/403-forbidden-runtime}"
start_script="$runtime_root/bin/start-sglang-agent.sh"
backup_root="$runtime_root/config-backups"
evidence_root="$runtime_root/artifacts/sglang-benchmarks"
profile="${1:-}"
stage="${2:-screen}"
fp4_gemm_backend="auto"
memory_profile="${SGLANG_MEMORY_PROFILE:-interactive}"
baseline_speculative_profile="${SGLANG_SPECULATIVE_PROFILE:-dspark}"
baseline_chunked_prefill_size="${SGLANG_CHUNKED_PREFILL_SIZE:-8192}"
baseline_continuous_decode_steps="${SGLANG_CONTINUOUS_DECODE_STEPS:-1}"
baseline_fp4_gemm_backend="${SGLANG_FP4_GEMM_BACKEND:-auto}"
case "$memory_profile" in
  legacy|interactive) ;;
  *) printf 'Unsupported memory profile: %s\n' "$memory_profile" >&2; exit 2 ;;
esac

if [[ "${SPARK_MAINTENANCE_ACKNOWLEDGED:-}" != "yes" ]]; then
  printf '%s\n' \
    'Refusing restart: first use the authorized ingress maintenance/drain mechanism,' \
    'then set SPARK_MAINTENANCE_ACKNOWLEDGED=yes.' >&2
  exit 2
fi

case "$profile" in
  baseline-mtp-3-1-4)
    speculative_profile="3-1-4"
    chunked_prefill_size="8192"
    continuous_decode_steps="1"
    ;;
  mtp-off)
    speculative_profile="off"
    chunked_prefill_size="8192"
    continuous_decode_steps="1"
    ;;
  mtp-1-1-2)
    speculative_profile="1-1-2"
    chunked_prefill_size="8192"
    continuous_decode_steps="1"
    ;;
  mtp-5-1-6)
    speculative_profile="5-1-6"
    chunked_prefill_size="8192"
    continuous_decode_steps="1"
    ;;
  dspark)
    speculative_profile="dspark"
    chunked_prefill_size="8192"
    continuous_decode_steps="1"
    ;;
  gemm-cudnn)
    speculative_profile="3-1-4"
    chunked_prefill_size="8192"
    continuous_decode_steps="1"
    fp4_gemm_backend="flashinfer_cudnn"
    ;;
  chunk-16384)
    speculative_profile="3-1-4"
    chunked_prefill_size="16384"
    continuous_decode_steps="1"
    ;;
  decode-steps-2)
    speculative_profile="3-1-4"
    chunked_prefill_size="8192"
    continuous_decode_steps="2"
    ;;
  decode-steps-4)
    speculative_profile="3-1-4"
    chunked_prefill_size="8192"
    continuous_decode_steps="4"
    ;;
  chunk-2048)
    speculative_profile="3-1-4"
    chunked_prefill_size="2048"
    continuous_decode_steps="1"
    ;;
  chunk-4096)
    speculative_profile="3-1-4"
    chunked_prefill_size="4096"
    continuous_decode_steps="1"
    ;;
  *)
    printf 'Usage: %s PROFILE\n' "$0" >&2
    printf '%s\n' \
      'Profiles: baseline-mtp-3-1-4, mtp-off, mtp-1-1-2,' \
      '          mtp-5-1-6, gemm-cudnn, chunk-16384, dspark,' \
      '          decode-steps-2, decode-steps-4, chunk-2048, chunk-4096' >&2
    exit 2
    ;;
esac

case "$stage" in
  screen)
    benchmark_args=(--scenario 4k --scenario 32k --repetitions 1)
    ;;
  long)
    benchmark_args=(--scenario 128k --repetitions 1)
    ;;
  full)
    benchmark_args=(--repetitions 3)
    ;;
  *)
    printf 'Unsupported stage: %s (use screen, long, or full)\n' "$stage" >&2
    exit 2
    ;;
esac

test -x "$start_script"
mkdir -p "$backup_root" "$evidence_root"

# Verify the actual authenticated ingress, not just an operator acknowledgement.
python3 - "$runtime_root" <<'PY'
import json, sys, time, urllib.error, urllib.request
from pathlib import Path
root = Path(sys.argv[1])
gate = json.loads((root / 'maintenance.json').read_text())
if float(gate['expires_at']) - time.time() < 1200:
    raise SystemExit('Maintenance gate must remain active for at least 20 minutes.')
key = (root / 'secrets/agent-api-key-official').read_text().strip()
request = urllib.request.Request('http://127.0.0.1:31000/v1/models', headers={'Authorization': 'Bearer ' + key})
try:
    urllib.request.urlopen(request, timeout=5)
except urllib.error.HTTPError as error:
    if error.code != 503:
        raise SystemExit('Ingress did not confirm maintenance.')
else:
    raise SystemExit('Ingress is still admitting traffic.')
PY

for _ in $(seq 1 30); do
  load="$(curl -fsS http://127.0.0.1:30000/get_load)"
  if ! python3 - "$load" <<'PY'
import json
import sys

loads = json.loads(sys.argv[1])
busy = any(
    int(item.get(key, 0))
    for item in loads
    for key in ("num_reqs", "num_waiting_reqs", "num_pending_tokens")
)
raise SystemExit(1 if busy else 0)
PY
  then
    printf 'Scheduler became busy; refusing to restart.\n' >&2
    exit 3
  fi
  sleep 1
done

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$backup_root/sglang-experiment-$timestamp-$profile"
mkdir -p "$backup_dir"
cp -a "$start_script" "$backup_dir/start-sglang-agent.sh"
cp "$0" "$backup_dir/run-sglang-experiment.sh"
docker inspect qwen38-agent > "$backup_dir/qwen38-agent.inspect.json"
docker image inspect lmsysorg/sglang:v0.5.19-cu130-runtime \
  > "$backup_dir/sglang-image.inspect.json"

cat > "$backup_dir/profile.env" <<EOF
SGLANG_SPECULATIVE_PROFILE=$speculative_profile
SGLANG_CHUNKED_PREFILL_SIZE=$chunked_prefill_size
SGLANG_CONTINUOUS_DECODE_STEPS=$continuous_decode_steps
SGLANG_FP4_GEMM_BACKEND=$fp4_gemm_backend
SGLANG_MEMORY_PROFILE=$memory_profile
EOF

export SGLANG_SPECULATIVE_PROFILE="$speculative_profile"
export SGLANG_CHUNKED_PREFILL_SIZE="$chunked_prefill_size"
export SGLANG_CONTINUOUS_DECODE_STEPS="$continuous_decode_steps"
export SGLANG_FP4_GEMM_BACKEND="$fp4_gemm_backend"
export SGLANG_MEMORY_PROFILE="$memory_profile"

wait_ready() {
  for _ in $(seq 1 180); do
    if curl -fsS http://127.0.0.1:30000/health >/dev/null 2>&1; then
      return 0
    fi
    if [[ "$(docker inspect --format '{{.State.Running}}' qwen38-agent 2>/dev/null || true)" == false ]]; then
      return 1
    fi
    sleep 5
  done
  return 1
}

restore_baseline() {
  SGLANG_SPECULATIVE_PROFILE="$baseline_speculative_profile" \
  SGLANG_CHUNKED_PREFILL_SIZE="$baseline_chunked_prefill_size" \
  SGLANG_CONTINUOUS_DECODE_STEPS="$baseline_continuous_decode_steps" \
  SGLANG_FP4_GEMM_BACKEND="$baseline_fp4_gemm_backend" \
  SGLANG_MEMORY_PROFILE="$memory_profile" \
    bash "$backup_dir/start-sglang-agent.sh" && wait_ready
}

candidate_started=false
finish() {
  status=$?
  trap - EXIT INT TERM
  if [[ "$candidate_started" == true && ( "$status" != 0 || "${SPARK_KEEP_CANDIDATE:-}" != yes ) ]]; then
    if [[ "$status" != 0 ]]; then
      docker logs qwen38-agent > "$backup_dir/failed-candidate.log" 2>&1 || true
      docker inspect qwen38-agent > "$backup_dir/failed-candidate.inspect.json" 2>/dev/null || true
    fi
    printf 'Restoring and checking the baseline profile.\n'
    restore_baseline || { printf 'Baseline recovery needs attention.\n' >&2; exit 6; }
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

candidate_started=true
if ! bash "$start_script"; then
  printf 'Candidate failed to start.\n' >&2
  exit 4
fi

if ! wait_ready; then
  printf 'Candidate did not become ready.\n' >&2
  exit 5
fi

curl -fsS http://127.0.0.1:30000/get_server_info \
  > "$backup_dir/server-info.json"
docker logs qwen38-agent > "$backup_dir/startup.log" 2>&1

benchmark_status=0
python3 "$runtime_root/bin/benchmark_sglang.py" \
  --config "$profile-$memory_profile" \
  --output-root "$evidence_root" \
  --maintenance-acknowledged \
  "${benchmark_args[@]}" || benchmark_status=$?

printf 'Experiment completed. Evidence: %s\n' "$evidence_root"
printf '%s\n' \
  'Rollback command:' \
  'SPARK_MAINTENANCE_ACKNOWLEDGED=yes bash run-sglang-experiment.sh baseline-mtp-3-1-4'
exit "$benchmark_status"
