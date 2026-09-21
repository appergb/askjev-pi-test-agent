#!/usr/bin/env bash
set -euo pipefail

runtime_root="${SPARK_RUNTIME_ROOT:-$HOME/workspaces/403-forbidden-runtime}"
cache_dir="$runtime_root/hf-cache"
container_name="qwen38-agent"
image="lmsysorg/sglang:v0.5.19-cu130-runtime"
expected_digest="sha256:710bc11443a7b1807d69803386468101bcfced35f86bf8fe92a8209e05a2f052"
model_revision="482ca0f3832238542f8f5295dde86b5f22711d80"
model_path="/root/.cache/huggingface/hub/models--nvidia--Qwen3.8-27B-NVFP4/snapshots/$model_revision"

mkdir -p "$cache_dir"

docker image inspect "$image" >/dev/null
docker image inspect "$image" --format '{{join .RepoDigests "\n"}}' | grep -Fq "@$expected_digest"
test -d "$cache_dir/models--nvidia--Qwen3.8-27B-NVFP4/snapshots/$model_revision"

if docker container inspect "$container_name" >/dev/null 2>&1; then
  docker rm -f "$container_name" >/dev/null
fi

docker run -d \
  --name "$container_name" \
  --restart unless-stopped \
  --gpus all \
  --ipc host \
  --cap-add SYS_NICE \
  --ulimit memlock=-1 \
  --ulimit stack=67108864 \
  -p 127.0.0.1:30000:30000 \
  -e HF_HUB_OFFLINE=1 \
  -e TRANSFORMERS_OFFLINE=1 \
  -v "$cache_dir:/root/.cache/huggingface/hub" \
  "$image" \
  sglang serve \
    --model-path "$model_path" \
    --served-model-name TRIPFZ-Alpha-27b \
    --trust-remote-code \
    --attention-backend flashinfer \
    --kv-cache-dtype fp8_e4m3 \
    --context-length 262144 \
    --mem-fraction-static 0.70 \
    --enable-priority-scheduling \
    --default-priority-value 0 \
    --priority-scheduling-preemption-threshold 10 \
    --retraction-policy priority \
    --radix-eviction-policy lfu \
    --enable-cache-report \
    --chunked-prefill-size 8192 \
    --mamba-ssm-dtype float32 \
    --mamba-radix-cache-strategy extra_buffer \
    --mamba-full-memory-ratio 4.59 \
    --speculative-algorithm NEXTN \
    --speculative-num-steps 3 \
    --speculative-eagle-topk 1 \
    --speculative-num-draft-tokens 4 \
    --reasoning-parser qwen3 \
    --tool-call-parser qwen3_coder \
    --host 0.0.0.0 \
    --port 30000

printf 'SGLang container started: %s\n' "$container_name"
printf 'Follow logs: docker logs -f %s\n' "$container_name"
