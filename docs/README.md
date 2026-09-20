# 403 Forbidden 项目文档

本目录按来源和用途整理项目资料。公开文档只保留可提交到 GitHub 的脱敏内容，精确 IP、端口、密码、API Key、原始表格和原始手册均放在本地私密区，并由 `.gitignore` 排除。

## 文档分区

| 分区 | 内容 | GitHub 状态 |
| --- | --- | --- |
| [agent.md](agent.md) | 节点能力、资源和操作边界 | 可提交，已脱敏 |
| [cloud-node/](cloud-node/README.md) | Spark 节点登录、访问手册、环境与包清单 | 说明可提交，精确资料仅本地 |
| [plan/](plan/README.md) | Plan 连接方式和 SDK 配置 | 说明可提交，地址和密钥仅本地 |
| [project/](project/README.md) | 本地开发、GitHub 和云端同步 | 可提交，已脱敏 |
| `private/` | 原始 `xlsx`、`docx`、Plan 地址和本地登录资料 | 永不提交 |

## 使用顺序

1. 先读 [agent.md](agent.md)，了解节点能力和禁止事项。
2. 云节点操作读 [cloud-node/README.md](cloud-node/README.md)。精确登录信息只读本地的 `cloud-node/login.local.md`。
3. Plan 接入读 [plan/README.md](plan/README.md)。原始连接资料只读本地 `private/`，不复制密钥到代码或公开文档。
4. Git 工作流读 [project/README.md](project/README.md)，本地完成代码后提交并推送，再让云端 `pull --ff-only`。

## 私密资料位置

本地私密资料包括：

- `docs/cloud-node/login.local.md`
- `docs/cloud-node/access.local.md`
- `docs/cloud-node/agent.local.md`
- `docs/cloud-node/environment.local.md`
- `docs/project/git-workflow.local.md`
- `docs/private/source/`

这些文件和目录已写入 `.gitignore`。不要通过 `git add -f` 强制加入。
