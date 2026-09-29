# DGX Spark 单机双模型部署

本配置在一台 DGX Spark 上运行两个本机服务：

- Open JEV + `Qwen/Qwen3-4B-Instruct-2507` BF16：`127.0.0.1:8766`
- SGLang + `nvidia/Qwen3.8-27B-NVFP4`，服务模型 ID `TRIPFZ-Alpha-27b`：`127.0.0.1:30000`

权重和运行时文件位于 `~/workspaces/403-forbidden-runtime`，不写入项目 Git 目录。两个端口都只绑定本机回环地址。

启动脚本可通过 `SPARK_RUNTIME_ROOT` 指定已有运行目录；未设置时使用当前登录用户的上述目录。这里只保存部署参考，不包含公网登录端点或凭据。普通本地测试无需执行这些启动/停止脚本。

Open JEV 由 `tmux` 会话 `openjev-score` 托管。Agent 服务由 Docker 容器 `qwen38-agent` 托管，并使用 `unless-stopped` 重启策略。

临时公网试用入口由本机认证代理和 Cloudflare Quick Tunnel 提供。SGLang 仍只绑定回环地址；代理只允许 OpenAI 兼容的 `/v1/models` 和 `/v1/chat/completions`。官方 API Key 独享 1 个并发槽并向 SGLang 注入最高优先级；用户 API Key 使用 7 个并发槽，其他请求按 FIFO 排队，队列上限为 64。代理为每个聊天请求注入固定身份 system prompt，并把调用方传入的 `system` / `developer` 角色降为普通用户消息，避免覆盖固定身份。当前公网链路已实测支持标准 SSE 流式响应；Quick Tunnel 仍仅用于测试，URL 会在重启后变化。

Agent 服务在单机双模型配置中使用 `--mem-fraction-static 0.70`。当前启动默认采用 `interactive` 固定内存池和 `dspark` 草稿加速；实测结果、资源取舍及限制见 [2026-09-23 调优记录](../../docs/cloud-node/spark-tuning-2026-09-23.md)。

DSpark 需要事先缓存 `RadixArk/Qwen3.8-27B-DSpark` 的 `config.json` 和 `model.safetensors`，revision 为 `b9a5dbdf03bc999c6c73c426b19c2d9041cea393`，目录为运行目录下 `hf-cache/models--RadixArk--Qwen3.8-27B-DSpark/snapshots/<revision>/`。启动脚本在替换容器前检查文件及权重 SHA-256；不会自动下载模型或安装库。只使用现有 SGLang 的原生模型实现。需要更低内存占用时，可设置 `SGLANG_SPECULATIVE_PROFILE=3-1-4` 使用模型内置 MTP。

```bash
bash start-openjev.sh
bash start-sglang-agent.sh
bash verify-models.sh
bash start-public-api.sh
```

停止服务但保留权重缓存：

```bash
bash stop-models.sh
```

## 推理性能验收

`benchmark_sglang.py` 使用 OpenAI 流式接口每个输出分片里的累计服务端 Token 数计算解码速度。它分别记录 TTFT、完整请求时间、思考 Token、最终回答 Token、缓存命中、MTP 统计、可用内存、换页和 GPU 遥测；不会把 SSE 分片数或未接受的草稿 Token 当成输出。

先让认证代理进入维护状态，等待在途请求结束，再在节点本机运行。代理通过 `AGENT_MAINTENANCE_FILE` 读取包含 `expires_at` Unix 时间戳的本机 JSON 文件；维护期间，认证后的请求返回 `503`，到期自动恢复。该机制不重启 Cloudflare 隧道，也不更改访问地址。启动脚本将维护文件设为运行目录下的 `maintenance.json`。例如，在已部署新版代理的节点上开启 90 分钟维护：

```bash
python3 - <<'PY'
import json, time
from pathlib import Path
root = Path.home() / 'workspaces/403-forbidden-runtime'
temporary = root / 'maintenance.tmp'
temporary.write_text(json.dumps({'expires_at': time.time() + 5400}))
temporary.chmod(0o600)
temporary.replace(root / 'maintenance.json')
PY
```

每轮冷测前清空前缀缓存，随后使用完全相同的请求做热测。默认对 4K、32K、128K 和约 237K 输入各执行三组冷／热测试，每次要求至少生成 1024 tokens：

```bash
python3 benchmark_sglang.py \
  --config baseline-mtp-3-1-4 \
  --maintenance-acknowledged
```

结果默认写入 `artifacts/sglang-benchmarks/`，包括 manifest、逐请求 JSON/CSV、遥测和同口径汇总。每个请求完成后立即落盘。`--maintenance-acknowledged` 只是操作员对维护状态的确认；单独运行 Python 测量脚本不会开启维护。脚本检查调度队列持续为空和 `context_length=262144`，允许请求结束后异步负载统计完成更新，并设置等待上限。

输出速度统计包含思考和最终回答的全部已接受 Token；首个分片可能包含多个 Token，会整体从解码计数中扣除。服务未返回思考 Token 明细时，拆分字段保留 `null`，同时保存两类文本长度和首个最终回答的时间。达到输出长度上限的性能请求不能作为答案质量通过证据。冷输入的 `prompt_tokens / TTFT` 仅表示含固定开销的端到端输入处理速度，不能写成 GPU 内核的纯 prefill 吞吐。

`run-sglang-experiment.sh` 以 MTP `3/1/4`、8K chunk、auto GEMM 为对照，提供受控候选：关闭 MTP、MTP `1/1/2`、基线 `3/1/4`、`5/1/6`、连续解码步数 `2/4`、chunked prefill `2048/4096/16384`，以及 `flashinfer_cudnn` FP4 GEMM 后端。它先核对维护截止时间和认证入口的实际 `503`，再连续 30 秒检查队列为空，保存完整启动脚本、容器和镜像信息。启动、就绪检查、基准失败或中断都会触发基线恢复，并等待恢复后的健康检查通过。

`screen` 阶段各测一次 4K/32K，`long` 阶段测一次 128K，`full` 阶段对全部 A–D 场景重复三次冷／热验收。单次筛选结果不能表述成三次完整验收。候选测完默认恢复基线；只有成功且显式设置 `SPARK_KEEP_CANDIDATE=yes` 才保留候选。恢复参数取自实验开始前的 `SGLANG_SPECULATIVE_PROFILE`、`SGLANG_CHUNKED_PREFILL_SIZE`、`SGLANG_CONTINUOUS_DECODE_STEPS`、`SGLANG_FP4_GEMM_BACKEND` 和 `SGLANG_MEMORY_PROFILE`，未设置时采用当前默认值。测试非默认部署时，应先提供与正在运行服务一致的参数。完成最终验证并确认两个模型健康后，删除维护文件恢复入口。

每次实验从固定的脚本副本执行，并保存该副本，避免部署更新改变正在运行的 Bash 命令。向节点安装文件时也应先写临时文件，再用同文件系统的原子替换完成更新。

默认 `SGLANG_MEMORY_PROFILE=interactive` 将调度并发设为 8、Mamba 缓存设为 64 个状态槽、KV Token 池上限设为 300,000，适配现有 1+7 路公网入口。`legacy` 保留原来的自动分配方式。实际分配仍受可用内存约束，因此测量脚本检查实际 KV 容量能否容纳 262,144 Token，不能只相信模型列表中的声明。对照计算后端、MTP 或分块大小时应使用同一内存配置。例如，当前运行 MTP 的节点可以这样测试并恢复 MTP：

```bash
SGLANG_MEMORY_PROFILE=interactive \
SGLANG_SPECULATIVE_PROFILE=3-1-4 \
SPARK_MAINTENANCE_ACKNOWLEDGED=yes \
bash run-sglang-experiment.sh gemm-cudnn screen
```

最终候选完成 A–D 后，使用 `benchmark_sglang_load.py` 验证 E 的 8 并发总吞吐和逐请求体验，以及 F 的 128K 冷 prefill 与 4K 请求并行时的短请求 TTFT、解码速度和停顿。E 使用相同的 4K 提示词，允许同组请求共享前缀；其总吞吐包含 prefill 时间，不能与单路解码速度直接混比。它沿用相同的服务端 Token 计数与遥测口径。

`benchmark_dual.py` 在同一阶段同时驱动两个服务：Open JEV 的 `/decide` 评分与 SGLang 的流式生成。它先按两种 state 大小（约 1 KB / 16 KB）对 JEV 做并发 2/4/8/16 的延迟与吞吐扩展，再对 SGLang 各上下文长度做固定并发解码，最后在联合阶段把两边的并发同时发出。每个阶段记录逐请求结果、错误（按容量证据保留，不中断）、总吞吐与相同口径的 GPU 遥测；JEV 请求格式与 `src/scoring.mjs` 的评分适配器保持一致，概率不归一的响应会被拒绝。同样要求维护状态并显式 `--maintenance-acknowledged`：

```bash
python3 benchmark_dual.py --config dual-baseline --maintenance-acknowledged
```

可配置 `--sglang-contexts`（默认 `4k,32k`）、`--sglang-concurrency`（默认 8）、`--jev-concurrencies`（默认 `2,4,8,16`）与 `--joint-jev-concurrency`。联合阶段在 SGLang 排队 drained 后启动，避免把上一阶段的残留负载计入。单服务 JEV 扩展结果是该服务首次实测容量数据，不能外推为评分准确率。

`verify_sglang_quality.py` 对最终候选重复验证严格 JSON schema、工具名和参数、可执行代码、约 128K 上下文前／中／后证据定位及联合推理，同时检查 Open JEV 仍在 CUDA 上就绪。生成代码在现有镜像的独立容器中运行，关闭网络、使用非 root 用户和只读文件系统，并限制 CPU、内存、进程数与时间。`--check` 可选择检查项，未选项不计为通过。Pi → askJEV 的真实业务回归仍通过 `askjev run`、`handoff` 和 `regress` 的既有证据链执行，不由模型服务脚本伪造。

质量验证默认 `--thinking on`，可用 `--thinking off` 对照简单任务。该参数只作用于本次验证请求；结果记录模式、完整响应和耗时。减少思考 Token 带来的答案等待时间变化，应与相同生成策略下的硬件/推理解码吞吐变化分别报告。
