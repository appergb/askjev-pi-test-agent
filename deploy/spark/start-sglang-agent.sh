#!/usr/bin/env bash
set -euo pipefail

runtime_root="${SPARK_RUNTIME_ROOT:-$HOME/workspaces/403-forbidden-runtime}"
cache_dir="$runtime_root/hf-cache"
container_name="qwen38-agent"
image="lmsysorg/sglang:v0.5.19-cu130-runtime"
expected_digest="sha256:710bc11443a7b1807d69803386468101bcfced35f86bf8fe92a8209e05a2f052"
model_revision="482ca0f3832238542f8f5295dde86b5f22711d80"
model_path="/root/.cache/huggingface/hub/models--nvidia--Qwen3.8-27B-NVFP4/snapshots/$model_revision"
draft_revision="b9a5dbdf03bc999c6c73c426b19c2d9041cea393"
draft_snapshot="$cache_dir/models--RadixArk--Qwen3.8-27B-DSpark/snapshots/$draft_revision"
draft_model_path="/root/.cache/huggingface/hub/models--RadixArk--Qwen3.8-27B-DSpark/snapshots/$draft_revision"
draft_sha256="2aff025f45823b40ebe726b9dfa40302f3512bd9a11c3a7347de32a567acd9a7"
chunked_prefill_size="${SGLANG_CHUNKED_PREFILL_SIZE:-8192}"
continuous_decode_steps="${SGLANG_CONTINUOUS_DECODE_STEPS:-1}"
speculative_profile="${SGLANG_SPECULATIVE_PROFILE:-dspark}"
fp4_gemm_backend="${SGLANG_FP4_GEMM_BACKEND:-auto}"
memory_profile="${SGLANG_MEMORY_PROFILE:-interactive}"
docker_env_args=()
loader_args=()

case "$memory_profile" in
  legacy)
    memory_args=()
    ;;
  interactive)
    memory_args=(--max-running-requests 8 --max-mamba-cache-size 64 --max-total-tokens 300000)
    ;;
  *)
    printf 'Unsupported SGLANG_MEMORY_PROFILE: %s\n' "$memory_profile" >&2
    exit 2
    ;;
esac

case "$speculative_profile" in
  off)
    speculative_args=()
    ;;
  dspark)
    test -f "$draft_snapshot/config.json"
    test -f "$draft_snapshot/model.safetensors"
    printf '%s  %s\n' "$draft_sha256" "$draft_snapshot/model.safetensors" | sha256sum --check --status
    docker_env_args=(
      -e PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
      -e SGLANG_RAGGED_VERIFY_MODE=static
    )
    loader_args=(
      --model-loader-extra-config '{"enable_multithread_load":false}'
      --weight-loader-drop-cache-after-load
    )
    speculative_args=(
      --speculative-algorithm DSPARK
      --speculative-draft-model-path "$draft_model_path"
      --speculative-draft-model-quantization unquant
      --speculative-draft-attention-backend flashinfer
      --speculative-dspark-block-size 7
      --speculative-num-steps 1
      --speculative-eagle-topk 1
    )
    ;;
  1-1-2)
    speculative_args=(
      --speculative-algorithm NEXTN
      --speculative-num-steps 1
      --speculative-eagle-topk 1
      --speculative-num-draft-tokens 2
    )
    ;;
  3-1-4|5-1-6)
    steps="${speculative_profile%%-*}"
    draft_tokens="${speculative_profile##*-}"
    speculative_args=(
      --speculative-algorithm NEXTN
      --speculative-num-steps "$steps"
      --speculative-eagle-topk 1
      --speculative-num-draft-tokens "$draft_tokens"
    )
    ;;
  *)
    printf 'Unsupported SGLANG_SPECULATIVE_PROFILE: %s\n' "$speculative_profile" >&2
    exit 2
    ;;
esac

case "$chunked_prefill_size" in
  2048|4096|8192|16384) ;;
  *)
    printf 'Unsupported SGLANG_CHUNKED_PREFILL_SIZE: %s\n' "$chunked_prefill_size" >&2
    exit 2
    ;;
esac

case "$fp4_gemm_backend" in
  auto|flashinfer_cutlass|flashinfer_cudnn) ;;
  *)
    printf 'Unsupported SGLANG_FP4_GEMM_BACKEND: %s\n' "$fp4_gemm_backend" >&2
    exit 2
    ;;
esac

case "$continuous_decode_steps" in
  1|2|4) ;;
  *)
    printf 'Unsupported SGLANG_CONTINUOUS_DECODE_STEPS: %s\n' "$continuous_decode_steps" >&2
    exit 2
    ;;
esac

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
  ${docker_env_args[@]+"${docker_env_args[@]}"} \
  -v "$cache_dir:/root/.cache/huggingface/hub" \
  "$image" \
  sglang serve \
    --model-path "$model_path" \
    --served-model-name TRIPFZ-Alpha-27b \
    --trust-remote-code \
    ${loader_args[@]+"${loader_args[@]}"} \
    --attention-backend flashinfer \
    --fp4-gemm-backend "$fp4_gemm_backend" \
    --kv-cache-dtype fp8_e4m3 \
    --context-length 262144 \
    --mem-fraction-static 0.70 \
    ${memory_args[@]+"${memory_args[@]}"} \
    --schedule-conservativeness 0.3 \
    --enable-priority-scheduling \
    --default-priority-value 0 \
    --priority-scheduling-preemption-threshold 10 \
    --retraction-policy priority \
    --radix-eviction-policy lfu \
    --enable-cache-report \
    --chunked-prefill-size "$chunked_prefill_size" \
    --num-continuous-decode-steps "$continuous_decode_steps" \
    --mamba-ssm-dtype float32 \
    --mamba-radix-cache-strategy extra_buffer \
    --mamba-full-memory-ratio 4.59 \
    ${speculative_args[@]+"${speculative_args[@]}"} \
    --reasoning-parser qwen3 \
    --tool-call-parser qwen3_coder \
    --host 0.0.0.0 \
    --port 30000

printf 'SGLang container started: %s\n' "$container_name"
printf 'Follow logs: docker logs -f %s\n' "$container_name"
