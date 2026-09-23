# askJEV Agent 文档

最新发布质量、终端前端/后端完成度与比赛演示评估见 [2026-09-23 质量报告](quality-review-2026-09-23.md)。

持续测试见 [campaigns.md](campaigns.md)。

编码模型技能安装见 [skill-installation.md](skill-installation.md)，会话管理见 [sessions.md](sessions.md)。

评分选测目标架构见 [设计文档](architecture/scoring-selection-v2.md) 与 [SVG](architecture/scoring-selection-v2.svg)；NVIDIA 技术核对见 [技术清单](architecture/nvidia-stack.md)。1.5 已实现质量诊断与显式故障降级；hybrid 与校准仍为目标设计。

独立 CLI 使用见 [cli.md](cli.md)，架构见 [framework.md](framework.md)，排查能力缺口见 [diagnostic-roadmap.md](diagnostic-roadmap.md)。

本目录按来源和用途整理项目资料。公开文档只保留可提交到 GitHub 的脱敏内容，精确 IP、端口、密码、API Key、原始表格和原始手册均放在本地私密区，并由 `.gitignore` 排除。

## 文档分区

| 分区 | 内容 | GitHub 状态 |
| --- | --- | --- |
| [agent.md](agent.md) | 节点能力、资源和操作边界 | 可提交，已脱敏 |
| [cloud-node/](cloud-node/README.md) | Spark 节点登录、访问手册、环境与包清单 | 说明可提交，精确资料仅本地 |
| [plan/](plan/README.md) | Plan 连接方式和 SDK 配置 | 说明可提交，地址和密钥仅本地 |
| [project/](project/README.md) | 本地开发、GitHub 和云端同步 | 可提交，已脱敏 |
| [mvp/plan.md](mvp/plan.md) | Pi 测试智能体 MVP 范围、使用配置和真实评估 | 可提交，运行证据仅本机 |
| [evidence/](evidence/README.md) | 从真实运行提取的脱敏验收摘要 | 可提交 |
| `private/` | 原始 `xlsx`、`docx`、Plan 地址和本地登录资料 | 永不提交 |

## 使用顺序

本地 Pi 测试 MVP 从项目根目录 [README](../README.md) 开始；实际验收结果见 [MVP 评估](mvp/evaluation.md)。

最新 1.1 真实项目验证、缺陷反馈与完成度见 [GitHub 仓库评估](mvp/github-evaluation.md)。

1. 先读 [agent.md](agent.md)，了解节点能力和禁止事项。
2. 云节点操作读 [cloud-node/README.md](cloud-node/README.md)。精确登录信息只读本地的 `cloud-node/login.local.md`。
3. Plan 接入读 [plan/README.md](plan/README.md)。原始连接资料只读本地 `private/`，不复制密钥到代码或公开文档。
4. Git 工作流读 [project/README.md](project/README.md)。新仓库发布仅同步代码；云端拉取需要独立确认仓库权限和部署需求。

## 私密资料位置

本地私密资料包括：

- `docs/cloud-node/login.local.md`
- `docs/cloud-node/access.local.md`
- `docs/cloud-node/agent.local.md`
- `docs/cloud-node/environment.local.md`
- `docs/project/git-workflow.local.md`
- `docs/private/source/`

这些文件和目录已写入 `.gitignore`。不要通过 `git add -f` 强制加入。
