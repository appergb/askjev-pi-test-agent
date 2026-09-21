# Spark 云节点文档

本目录专门整理 Spark 云节点资料，分为公开能力说明和本地私密连接资料。

## 文件说明

| 文件 | 内容 | 是否提交 GitHub |
| --- | --- | --- |
| `agent.local.md` | 本次核查得到的精确节点身份和详细资料 | 否 |
| `access.local.md` | Spark 云节点原访问与使用手册的结构化版本 | 否 |
| `environment.local.md` | 含精确身份信息的环境快照 | 否 |
| [environment.md](environment.md) | 脱敏环境快照 | 是 |
| `login.local.md` | 登录表整理后的本地凭据 | 否 |
| [packages.md](packages.md) | `base` 与 `h3-comfy` 的 Python 包清单 | 是 |
| [model-deployment.md](model-deployment.md) | 已完成的 Spark 单机双模型部署、验收结果和操作方式 | 是 |

## 公开使用规则

- 代码从本地 GitHub 版本库同步到云端，不通过复制私密文档同步。
- 需要连接时，从本机 `login.local.md` 读取精确资料；不要把它写进 shell 历史、代码或日志。
- 服务只在经过认证后使用，非标准端口优先走 SSH 本地隧道。
- 长任务使用 tmux，重要结果回传到受控存储。

## 私密原始来源

原始 `Spark` 手册和登录信息表位于 `docs/private/source/`，仅用于核对，不提交到 GitHub。
