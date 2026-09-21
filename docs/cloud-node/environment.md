# 云节点脱敏环境快照

本文件记录已核实的环境能力，不记录精确 IP、SSH 端口、hostname、密码或其他连接密钥。精确版本快照保存在本机的 `environment.local.md`。

## 系统和硬件

| 项目 | 结果 |
| --- | --- |
| 平台 | NVIDIA DGX Spark |
| OS | Ubuntu `24.04.4 LTS` Noble |
| Kernel | `6.17.0-1014-nvidia` |
| Architecture | `aarch64` |
| CPU | 20 online CPU；10 × Cortex-X925 + 10 × Cortex-A725 |
| Memory | `121 GiB` total |
| Root filesystem | `3.7T` total，检查时使用率约 `9%` |
| GPU | `NVIDIA GB10` |
| NVIDIA driver | `580.142` |
| CUDA compiler | `13.0`, `V13.0.88` |

## 软件和环境

| 软件 | 版本或状态 |
| --- | --- |
| Python | `3.14.6` |
| pip | `26.2.1` |
| Conda | `26.7.2` |
| Mamba | `2.5.0` |
| Docker | `29.2.1` |
| Docker Buildx | `v0.31.1` |
| Docker Compose | `v5.0.2` |
| Git | `2.43.0` |
| tmux | `3.4` |
| Conda environments | `base`, `h3-comfy` |
| Jupyter / Uvicorn / Ollama / vLLM CLI | 检查时未发现 |

## 检查结论

- Docker 可用，检查时没有镜像和容器。
- 公网服务端口检查时没有运行项目服务。
- 用户目录下的既有项目未修改。
- 本次初始化只创建了云端 Git 工作区，由 GitHub 版本库负责同步。

## 后续状态

`2026-09-20` 已在同一节点部署 Open JEV BF16 评分服务和 SGLang NVFP4 Agent 服务。上面的“没有镜像和容器”只是初始盘点时的历史状态。当前已验收状态见 [model-deployment.md](model-deployment.md)。

完整原始快照位于本机的 `environment.local.md`，不进入 GitHub。
