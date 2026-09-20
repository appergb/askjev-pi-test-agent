# 云节点代理说明

本文档是后续 Agent 的公开入口，记录已核实的云节点能力和操作边界，不包含精确 IP、端口、密码、API Key 或其他连接密钥。精确连接资料只在本机私密文档中保存。

## 已核实能力

- 平台：NVIDIA DGX Spark。
- 系统：Ubuntu `24.04.4 LTS`，ARM64 / `aarch64`。
- CPU：20 个在线 CPU，包含 10 个 `Cortex-X925` 和 10 个 `Cortex-A725` 核心。
- 内存：约 `121 GiB`。
- GPU：`NVIDIA GB10`，驱动 `580.142`。
- CUDA 编译器：`13.0`, `V13.0.88`。
- Python：`3.14.6`，Conda `26.7.2`，Mamba `2.5.0`。
- Docker Engine：`29.2.1`，Buildx `v0.31.1`，Compose `v5.0.2`。
- Git：`2.43.0`，tmux：`3.4`。
- 已有 Conda 环境：`base` 和 `h3-comfy`。
- `base` 与 `h3-comfy` 的 Python 包清单见 [cloud-node/packages.md](cloud-node/packages.md)。

## 可执行的后续工作

- 在本地完成代码后，通过 GitHub 版本库同步到云端。
- 使用已有 Conda 环境运行 GPU 计算、图像/视频生成和模型推理。
- 使用 Docker 运行隔离的工作负载。
- 用 tmux 托管长时间任务并保留日志。
- 对需要临时访问的服务使用经过认证的端口映射或 SSH 本地隧道。

## 操作边界

- 未经明确授权，不安装、卸载或升级云端软件，不修改系统级配置，不重启节点。
- 不扫描、探测或登录其他节点，不运行挖矿、攻击、代理、暴力破解或违规任务。
- 不把密码、API Key、IP、端口映射、私钥或原始连接资料提交到 GitHub。
- 不在公网暴露无认证的文件管理器、Web 终端、数据库控制台或其他管理面板。
- 超过 `1 GB` 的文件不使用 `scp` 上传，优先在云端下载或使用断点续传。
- 磁盘保持至少约 `20%` 空闲，长任务使用 tmux 或 screen。

## 精确连接资料

精确节点身份、登录端点和登录密码见本地 `docs/cloud-node/login.local.md`。该文件被忽略，不属于 GitHub 版本库内容。
