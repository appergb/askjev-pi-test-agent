# NVIDIA / CUDA 技术使用与项目调优边界

核对日期：2026-09-22。本文将实时服务信息、仓库启动配置和历史验收结果分开说明。本轮未重启、部署、训练或重新跑 GPU 性能基准。

## 1. 可以对外使用的项目描述

> askJEV Agent 针对 NVIDIA DGX Spark / GB10 完成了 JEV 评分服务和千问生成服务的部署适配与推理参数调优。评分使用 PyTorch CUDA、BF16 与 SDPA；自托管生成服务采用混合 NVFP4/FP8 checkpoint，通过 SGLang 配置 FlashInfer、FP8 KV cache、CUDA Graphs、前缀缓存和模型内置 MTP。两类服务分配内存与调度资源，共同支撑测试场景生成、评分和工具调用。

JEV 基于经过后训练的 Qwen3-4B 系列指令模型构建，并通过任务协议、上下文组织和候选评分方式适配软件测试场景。当前基础模型为 `Qwen3-4B-Instruct-2507`；[模型说明](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507)标注其训练阶段包含预训练与后训练。部署调优、基础模型后训练与评分概率校准分别记录，具体服务字段保留在文末核对记录中。

用户已确认所述组件为 JEV 评分模型。本文统一使用 JEV 名称。

## 2. 两条模型路径

| 组件 | 实际模型/框架 | 项目承担的工作 | 证据 |
| --- | --- | --- | --- |
| JEV 评分 | Open JEV + Qwen3-4B-Instruct-2507；PyTorch / Transformers | CUDA/BF16 部署、固定模型与协议版本、评分适配、错误/ID 校验、真实联调 | 实时 status/report、start-openjev.sh、历史部署验收 |
| 自托管生成 | nvidia/Qwen3.8-27B-NVFP4；SGLang 0.5.19 / cu130 镜像 | 单机共存、内存/上下文/缓存/MTP 参数、工具调用解析与性能取舍 | start-sglang-agent.sh、2026-09-20 验收记录 |
| 外部生成 | Flash、GLM 的既有 API | 生成模型切换、凭据引用、任务运行 | 当前 CLI 联调记录 |

Flash / GLM 的外部 API 请求不能计入“本项目在 Spark 上使用 CUDA 加速生成”的证明。前端 1.3/1.4 实验默认由 Flash 生成，Spark 提供 JEV 评分；云端千问另有工具调用和部署验收。

## 3. 实际用到的技术

| 技术 | 在本项目中的角色 | 证据强度与限定 |
| --- | --- | --- |
| CUDA 13.0 / GB10 GPU | 评分与自托管生成的 GPU 执行基础 | 历史节点环境确认；本次评分 status 实时确认 device=cuda |
| PyTorch CUDA + BF16 | 评分模型以 bfloat16 在 GPU 推理 | 本次 report 实时确认 dtype=bfloat16 |
| SDPA | 评分模型的缩放点积注意力路径 | 历史部署记录；具体每个 shape 所选 CUDA kernel 未做本次 profiler 证明 |
| NVIDIA ModelOpt 混合 NVFP4/FP8 checkpoint | 降低生成模型权重占用，适配已验证的 GB10 推理路径 | 使用预量化 checkpoint；具体版本和格式见模型卡 |
| FlashInfer attention backend | 生成服务的 GPU 注意力计算后端 | 启动脚本显式设置；不同于名为 Flash 的外部生成 API |
| FP8 E4M3 KV cache | 生成服务的注意力缓存精度配置 | 显式 `--kv-cache-dtype fp8_e4m3`，历史验收记录缓存池分配 |
| CUDA Graphs | 生成阶段图捕获，降低重复 GPU 工作提交开销 | 历史启动日志记录 target/draft 等图捕获；不是所有请求和算子都必然走同一张图 |
| Radix Cache / LFU | 复用系统提示和工具 schema 的前缀计算，按频率淘汰 | SGLang 软件缓存策略；利用 GPU 上的状态，不是新的 CUDA API |
| MTP / NEXTN → EAGLE | 同一 checkpoint 的内置草稿层进行推测解码 | SGLang 算法与调度策略，底层运行于 GPU；不是另训练第三个草稿模型 |
| Chunked prefill、Mamba 状态配置 | 控制预填充、混合架构缓存与内存压力 | 服务配置；性能改善需实测，不能把参数名当作收益证明 |
| Docker `--gpus all` | 向生成服务容器提供 GPU | 服务部署设施，与本地 Agent 会话管理不同 |

CUDA Graphs 的通用机制见 [NVIDIA 官方说明](https://docs.nvidia.com/cuda/cuda-programming-guide/04-special-topics/cuda-graphs.html)。权重采用 Model Optimizer 的混合 NVFP4/FP8 量化格式，详见 [官方模型卡](https://huggingface.co/nvidia/Qwen3.8-27B-NVFP4)。推测解码机制见 [SGLang 文档](https://docs.sglang.io/docs/advanced_features/speculative_decoding)。这些来源解释技术机制，不能替代本项目的实际验收记录。

尚无证据表明本项目编写了自定义 CUDA kernel、做过 Nsight 系统性分析、启用了 TensorRT-LLM/Triton 推理服务、开展 NCCL 多 GPU 训练或多节点推理。本地 Node/Chrome 测试执行也不宣称使用 CUDA。

## 4. 我们实际调整过什么

配置和历史记录见 [启动脚本](../../deploy/spark/start-sglang-agent.sh) 与 [部署验收](../cloud-node/model-deployment.md)：

- `mem-fraction-static=0.70`：为同机 JEV 与系统保留内存。
- 服务上下文 `262144`：已完成长输入验收；它没有取消 CLI 16 KB 快照上下文和评分 4096-token 上限。
- `chunked-prefill-size=8192`：已设置并测试；历史结果没有证明它单独改善冷启动 TTFT。
- `fp8_e4m3` KV cache、float32 Mamba 状态、extra_buffer 与内存比例：按模型架构适配与同机资源条件配置。
- LFU Radix Cache、缓存命中报告：保持稳定前缀并观察实际缓存命中。
- NEXTN 参数 `3/1/4`：为单用户/低并发交互启用 MTP，同时承认高并发总吞吐的取舍。
- `qwen3` / `qwen3_coder` 解析器：对接思考与工具调用格式；测试框架的千问调用还可配置 `enable_thinking=false`。

这些推理配置均有部署与验收记录，按实际硬件、任务负载及服务共存要求选择。

## 5. 性能证据如何表述

2026-09-20 历史验收：评分固定短请求排除首次后约 59.5 ms；MTP 单路 128-token 输出配置观测 26.64 tok/s；同一部署此前不启用 MTP 的单路基准为 12.45 tok/s。两组伴随配置变化，不能把差异全部归因于 MTP。高并发时 MTP 的持续吞吐未超过该记录中的无 MTP 最佳配置。

前缀缓存曾在一组串行复用请求中命中 34,816 tokens，约 99.2%。这些是指定模型、输入、硬件和配置下的历史观测，不是当前所有任务的稳定性能，也不用于证明评分准确率。

## 6. 后续 GPU 优化与评分质量的关系

先建立统一的总成本账本，分别记录候选构建、评分队列、GPU 推理、测试执行和缺陷复核；后续新增小批量评分、稳定前缀、有限并发与隔离的评估队列。在改变精度或内核配置时，用冻结评分样本检查 logits 与排序是否发生变化，再进行性能对照。

JEV 当前使用 BF16；生成服务使用预量化权重。因此不能把 JEV 的高分漏检简单归因于生成服务的 NVFP4。**权重量化校准与软件缺陷概率校准是两件不同的事。** CUDA 优化提升执行效率，不会自动纠正错误断言或不可靠评分。

## 7. 可核对来源

- [本次实时协议核对](../evidence/scoring-protocol-audit-2026-09-22.json)
- [JEV 启动配置](../../deploy/spark/start-openjev.sh)
- [生成服务启动配置](../../deploy/spark/start-sglang-agent.sh)
- [历史部署与性能验收](../cloud-node/model-deployment.md)
- [历史节点能力](../agent.md)
