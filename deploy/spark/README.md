# DGX Spark 单机双模型部署

本配置在一台 DGX Spark 上运行两个本机服务：

- Open JEV + `Qwen/Qwen3-4B-Instruct-2507` BF16：`127.0.0.1:8766`
- SGLang + `nvidia/Qwen3.8-27B-NVFP4`，服务模型 ID `TRIPFZ-Alpha-27b`：`127.0.0.1:30000`

权重和运行时文件位于 `~/workspaces/403-forbidden-runtime`，不写入项目 Git 目录。两个端口都只绑定本机回环地址。

启动脚本可通过 `SPARK_RUNTIME_ROOT` 指定已有运行目录；未设置时使用当前登录用户的上述目录。这里只保存部署参考，不包含公网登录端点或凭据。普通本地测试无需执行这些启动/停止脚本。

Open JEV 由 `tmux` 会话 `openjev-score` 托管。Agent 服务由 Docker 容器 `qwen38-agent` 托管，并使用 `unless-stopped` 重启策略。

临时公网试用入口由本机认证代理和 Cloudflare Quick Tunnel 提供。SGLang 仍只绑定回环地址；代理只允许 OpenAI 兼容的 `/v1/models` 和 `/v1/chat/completions`。官方 API Key 独享 1 个并发槽并向 SGLang 注入最高优先级；用户 API Key 使用 7 个并发槽，其他请求按 FIFO 排队，队列上限为 64。代理为每个聊天请求注入固定身份 system prompt，并把调用方传入的 `system` / `developer` 角色降为普通用户消息，避免覆盖固定身份。当前公网链路已实测支持标准 SSE 流式响应；Quick Tunnel 仍仅用于测试，URL 会在重启后变化。

Agent 服务在单机双模型配置中使用 `--mem-fraction-static 0.70`，为 Open JEV、操作系统和短时峰值保留内存。

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
