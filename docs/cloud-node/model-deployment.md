# Spark 单机双模型部署

`2026-09-20` 已在分配的一台 DGX Spark 上同时部署概率评分服务和千问 Agent 服务。两个原生服务均只绑定节点本机回环地址；Agent 另通过带双 API Key 鉴权的 HTTPS 临时隧道提供公网试用。

## 评分服务

- 程序：Open JEV，固定源码提交 `ff94f61ec3b2d6a71b4c2b01e76104dfe37da4e6`。
- 模型：`Qwen/Qwen3-4B-Instruct-2507`。
- 模型 revision：`cdbee75f17c01a7cc42f958dc650907174af0554`。
- 运行时：PyTorch / Transformers，CUDA，BF16，SDPA。
- 本机地址：`http://127.0.0.1:8766`。
- 托管方式：`tmux` 会话 `openjev-score`。
- 就绪检查：`/status`；模型、revision 和精度：`/report`；接口文档：`/docs`。

验收时 `/status` 返回 `ready=true`、`device=cuda`、`engine=PyTorch`，`/report` 返回 `dtype=bfloat16`。实际候选评分请求返回了完整概率分布和正确候选。预热后一条固定短请求的模型耗时约 `77 ms`，该数字仅是本次验收观测，不是性能承诺。

## Agent 服务

- 引擎：SGLang `0.5.19`。
- 镜像：`lmsysorg/sglang:v0.5.19-cu130-runtime`。
- 镜像摘要：`sha256:710bc11443a7b1807d69803386468101bcfced35f86bf8fe92a8209e05a2f052`。
- 模型：`nvidia/Qwen3.8-27B-NVFP4`。
- 模型 revision：`482ca0f3832238542f8f5295dde86b5f22711d80`。
- 服务模型名：`TRIPFZ-Alpha-27b`。
- 本机 OpenAI 兼容地址：`http://127.0.0.1:30000/v1`。
- 容器名：`qwen38-agent`，重启策略为 `unless-stopped`。

启动参数使用 FlashInfer 注意力后端、FP8 KV cache、`262144` 上下文、`8192` 分块 prefill、float32 Mamba 状态和 `qwen3` / `qwen3_coder` 解析器。为与 Open JEV 同机运行，`mem-fraction-static` 使用 `0.70`。Radix Cache 使用 `LFU` 淘汰策略，并启用 OpenAI 响应中的缓存命中统计。模型自带的 MTP 层以 NEXTN/EAGLE `3/1/4` 配置参与推测解码，不需要第三个模型。

SGLang 启动时确认量化类型为 `modelopt_mixed`，权重加载、KV cache 分配和 CUDA graph 捕获均完成。验收时：

- `/v1/models` 返回 `TRIPFZ-Alpha-27b` 和 `262144` 上下文。
- 普通对话返回预期内容。
- 工具调用返回 OpenAI 兼容的 `tool_calls` 结构，函数名和 JSON 参数均正确。
- 预热后一条极短对话端到端约 `0.18 s`，该数字仅是本次验收观测。

### 262K 上下文复测

`2026-09-20` 将 Agent 的服务上限从 `32768` 提升到模型原生的 `262144` tokens，并在 Open JEV 同机运行的情况下重新启动。服务启动成功，`/v1/models` 返回 `max_model_len=262144`，没有发生 OOM。

启动后的内存池记录如下：

- 权重：约 `21.62 GB`。
- Mamba 状态缓存：卷积状态约 `0.82 GB`，SSM 状态约 `41.91 GB`。
- FP8 KV cache：K、V 各约 `4.72 GB`，合计约 `9.44 GB`，容量约 `309079` tokens。
- Prefill / decode CUDA graph：分别约 `0.42 GB` 和 `1.76 GB`。
- Mamba 状态缓存将 `max_running_requests` 限制为 `59`；这不表示可以同时运行 59 条满长请求。

使用 SGLang 本地 `random-ids` 数据集、并发 `1`、每档测试前清空前缀缓存。下列结果是本机单次验收数据，不是服务等级承诺：

| 客户端输入 | 输出 | 请求数 | 平均 TTFT | 平均 TPOT | Decode 速度 | 平均端到端 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,024 | 128 | 3 | 0.497 s | 79.17 ms | 12.63 tok/s | 10.55 s |
| 8,192 | 128 | 3 | 3.70 s | 80.34 ms | 12.45 tok/s | 13.90 s |
| 32,768 | 128 | 2 | 18.11 s | 84.53 ms | 11.83 tok/s | 28.84 s |
| 131,072 | 64 | 1 | 126.51 s | 99.16 ms | 10.08 tok/s | 132.75 s |
| 241,000 | 64 | 1 | 359.09 s | 115.98 ms | 8.62 tok/s | 366.40 s |

最后一档的随机 ID 在服务端重新分词后实际约为 `260396` tokens，约占 KV token 池的 `84%`，成功输出完整 64 tokens。一次更大的随机输入重新分词后达到 `283502` tokens，服务按预期以超过 `262144` 上限拒绝，没有发生 OOM。测试结束后已清空逻辑前缀缓存。

双服务空闲时系统内存约 `121 GiB` 总量、`93 GiB` 已用、`28 GiB` 可用；`nvidia-smi` 记录 Agent 调度进程约 `76.9 GiB`、Open JEV 约 `8.0 GiB`。因此本次不需要停止评分机。

### 评分机复测

Open JEV 仍以 CUDA/BF16 运行，`/status` 返回 `ready=true`，`/report` 确认模型 revision、`bfloat16` 和 `calibration=none`。同一 117-token、三候选故障请求连续执行 5 次，端到端时间分别约为 `151.4`、`60.3`、`61.6`、`57.5` 和 `58.5 ms`；全部平均约 `77.9 ms`，排除首请求后约 `59.5 ms`。

包含三个问题的一次请求耗时约 `297 ms`，每题依次执行。明确的发布回滚场景正确选择了发布回归、回滚和回滚后恢复三个候选；证据不足场景正确选择 `unknown`，并返回所有候选的 logits 和条件概率。这里的概率仍是未校准的候选条件分布，不代表真实故障发生率。

### Radix Cache 复测

使用 SGLang 的 `generated-shared-prefix` 数据集测试约 35K tokens 的共享系统前缀，两个请求串行执行。第二个请求命中 `34816` 个缓存 tokens，只需重新 prefill `288` tokens，前缀命中率约 `99.2%`。根据两次请求的 TTFT 分布，冷请求约 `17.7 s`，命中请求约 `0.38 s`，说明缓存路径工作正常；此前随机长上下文测试在每档开始前主动清空缓存，测量的是冷 prefill。

服务保留 `mamba-radix-cache-strategy=extra_buffer`，以支持混合 Mamba/全注意力架构的分支前缀复用。生产请求应保持 system prompt、工具 schema 和消息序列化的前缀字节完全一致，把请求时间、请求 ID 和当前用户内容放到共享前缀之后。`LFU` 淘汰策略用于优先保留反复出现的系统与工具前缀；API 响应中的 `usage.prompt_tokens_details.cached_tokens` 用于观测实际命中。

启用 LFU 和命中统计后，又使用约 8K tokens 的共享前缀执行两条串行请求。第一条冷请求建立缓存，第二条命中 `8192` tokens、仅重新 prefill `654` tokens，单个重复请求的前缀命中率约 `92.6%`。把第一条必然冷启动的请求也计入总体后，基准报告 `17690` 个 prompt tokens 中命中 `8192`，总体命中率为 `46.3%`；命中全部来自设备内存。

当前没有改成通用 `Q4` 权重。现用 NVIDIA checkpoint 已是 ModelOpt 混合量化：MLP、输出头及部分投影采用 NVFP4，注意力和部分线性注意力投影采用 FP8；这是当前 GB10/SGLang 已验证的四位权重路径。通用 AWQ/GPTQ INT4 需要另一份匹配 checkpoint，GGUF `Q4_K_M` 则属于不同运行路径，均不能通过修改一个启动参数安全替换现有模型。KV cache 继续使用 NVIDIA 模型卡建议的 `fp8_e4m3`。

### MTP 与吞吐复测

`2026-09-20` 启用模型内置 MTP/NEXTN，参数为 3 speculative steps、top-k 1、4 draft tokens，同时把 chunked prefill 从 `2048` 调整为 `8192`。SGLang 将 NEXTN 解析为 EAGLE，并从同一 checkpoint 加载约 `5.62 GB` 的 `Qwen3_5ForCausalLMMTP` 权重，没有下载独立草稿模型。

启用 MTP 后，KV token 池约为 `284996` tokens，最大运行请求数受 Mamba 状态缓存限制为 `29`。服务完成了 target prefill、target verify、draft prefill、draft decode 和 draft extend CUDA graph 捕获。

短输入、固定长度输出的实测结果如下。持续输出吞吐是完整基准期间的平均值，峰值是采样窗口内观测值：

| 配置 | 并发 | 持续输出吞吐 | 峰值输出吞吐 | 平均接受长度 |
| --- | ---: | ---: | ---: | ---: |
| 不启用 MTP | 1 | 12.45 tok/s | 13 tok/s | — |
| 不启用 MTP | 48 | 274.02 tok/s | 336 tok/s | — |
| 不启用 MTP | 60 | 250.95 tok/s | 354 tok/s | — |
| MTP，128-token 输出 | 1 | 26.64 tok/s | 38 tok/s | 3.11 |
| MTP，400-token 输出 | 1 | 35.50 tok/s | 38 tok/s | 3.90 |
| MTP | 4 | 77.23 tok/s | 117 tok/s | 2.87 |
| MTP | 8 | 121.30 tok/s | 188 tok/s | 2.94 |
| MTP | 16 | 186.25 tok/s | 269 tok/s | 3.06 |
| MTP | 29 | 223.70 tok/s | 381 tok/s | 3.14 |

MTP 明显改善单路交互速度，但额外状态和草稿计算降低了高并发持续总吞吐。当前公网试用以单用户和低并发为目标，因此保留 MTP；如果目标改为批量离线吞吐，应使用未启用 MTP、约 48 并发的配置。

在 MTP + 8192 chunked prefill 组合下，一条 32768-token 冷输入的 TTFT 实测为 `26.57 s`。此前 MTP 关闭、2048 chunked prefill 的同长度测试平均 TTFT 为 `18.11 s`。本机没有复现“8192 让 TTFT 快 47%”的外部结果；当前保留 8192 是按本次要求设置，不能把该外部提升比例作为本机承诺。

### 临时公网 API

公网试用不直接使用 SGLang `--api-key`，避免当前版本把服务参数中的密钥写入启动日志或诊断接口。节点本机运行一个认证反向代理，SGLang 继续只绑定 `127.0.0.1:30000`。代理只允许：

- `GET /v1/models`
- `POST /v1/chat/completions`

代理使用两个 Bearer API Key：官方测试 Key 独享 1 个并发槽，不受用户队列占满影响；用户 Key 使用 7 个并发槽，其他已接收请求按 FIFO 排队，等待队列上限为 64。用户 Key 受每 IP 每分钟 60 次请求限制，官方 Key 不使用该用户限流器。代理为官方请求固定注入优先级 `100`，为用户请求固定注入优先级 `0`；调用方提交的 `priority` 会被覆盖。SGLang 已启用高数值优先、差值达到 `10` 时可抢占以及 priority retraction，从代理层和模型调度层同时保留官方通道。

公网模型 ID 为 `TRIPFZ-Alpha-27b`。代理以大小写不敏感方式校验调用方模型名并统一转换为标准写法，其他模型 ID 返回 `400`。所有聊天请求在首位注入固定身份 system prompt；调用方提供的 `system` / `developer` 角色会降为普通用户消息，`input_ids` 被拒绝，旧式 `/v1/completions` 不对公网开放，避免绕过固定提示词。

代理还使用常量时间密钥比较、32 MB 请求体上限和有界等待队列。两个密钥只保存在权限为 `0600` 的不同私密文件中。HTTPS 入口由固定版本并校验 SHA-256 的 Cloudflare Quick Tunnel 提供；它是临时测试入口，URL 会在隧道重启后变化。

从外部网络验收结果：无密钥 `401`，旧密钥 `401`，两个新密钥分别返回 `official` / `user` 层级；大小写变体模型 ID 均可调用，模型列表返回标准 ID。身份询问在调用方额外提交冲突 system message 时仍只返回规定的公开代号回答。7 条用户长请求同时执行时，随后到达的官方请求队列等待约 `0.006 ms`，约 `5.05 s` 完成，而用户请求最慢约 `17.40 s`；9 条用户请求全部被接收并返回 `200`，超出 7 个执行槽的请求记录到约 `4.77–5.69 s` 的 FIFO 等待。管理接口不在代理白名单内。认证代理的 24 项测试全部通过，代码覆盖率 `92.15%`。

SSE 流式输出也已从公网实测：`stream=true` 返回连续的 `data:` 事件和最终 `[DONE]`，HTTP 状态为 `200`；该次短请求首个分片约 `3.33 s` 到达，总请求约 `3.84 s`。因此当前临时入口允许流式调用，但仍应把 Quick Tunnel 视为测试设施，而不是稳定生产域名。

## 资源和操作

双服务稳定运行后，节点内存约 `121 GiB` 总量、`93 GiB` 已用、`27 GiB` 可用。根磁盘使用率约 `12%`。部署文件、模型缓存和日志位于：

```text
~/workspaces/403-forbidden-runtime/
```

节点上的管理脚本位于该目录的 `bin/` 子目录：

```bash
bash start-openjev.sh
bash start-sglang-agent.sh
bash start-public-api.sh
bash verify-models.sh
bash stop-models.sh
```

停止脚本会保留模型权重和缓存。Open JEV 在节点重启后需要重新执行启动脚本；Agent 容器配置了 Docker 重启策略。
