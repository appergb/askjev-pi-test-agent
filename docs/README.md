# askJEV Agent 文档

先看[当前完成度与测试技能](testing-capabilities.md)：区分已实现功能、当前连接状态、历史验证和未来设计。当前版本为 1.5.0，适用于选定 JavaScript 模块与本地静态页面的工程试用。

## 按目的阅读

| 你要做什么 | 入口 |
| --- | --- |
| 看实际做到什么程度、有哪些测试技能 | [能力与技能清单](testing-capabilities.md) · [待补齐能力](diagnostic-roadmap.md) |
| 安装并开始使用 | [根 README](../README.md) · [Skill 安装](skill-installation.md) · [本机入口整理](local-installation.md) |
| 使用终端或脚本运行测试 | [CLI](cli.md) · [任务格式](mvp/configuration.md) · [浏览器测试](frontend-testing.md) |
| 持续补查或后台执行 | [有预算的多轮测试](campaigns.md) · [会话管理](sessions.md) |
| 理解前端、运行时和模型服务的分工 | [当前框架](framework.md) · [架构图](architecture/framework.svg) |
| 理解实际评分和下一步设计 | [评分机制、最少操作与双轮评估](architecture/scoring-selection-v2.md) |
| 核查结果与证据 | [验收摘要索引](evidence/README.md) · [质量与比赛演示评估](quality-review-2026-09-23.md) |
| 了解 GPU 使用与云节点边界 | [NVIDIA 技术清单](architecture/nvidia-stack.md) · [节点说明](agent.md) · [云节点文档](cloud-node/README.md) |

1.5 已有多轮测试、质量诊断与显式评分故障降级。最少/最多操作问答、最短成功路径建模、双轮评分、独立断言复核与校准仍属设计，不能因存在架构图而视为已实现。

## 历史与项目资料

[MVP 计划](mvp/plan.md)、[早期评估](mvp/evaluation.md)及 [1.1 真实仓库评估](mvp/github-evaluation.md)保留当时的范围和结果。当前能力以新版清单、源代码和对应实际运行记录为准；历史服务成功不等于现在在线。

| 分区 | 内容 |
| --- | --- |
| [evidence/](evidence/README.md) | 可公开的脱敏验收摘要；原始日志、快照和测试保留在本机 |
| [project/](project/README.md) | 本地开发、GitHub 同步和发布边界 |
| [cloud-node/](cloud-node/README.md) | 节点能力、部署记录和环境说明；精确连接资料仅本地 |
| [plan/](plan/README.md) | Plan 接入说明；地址和凭据仅本地 |
| `private/` | 原始表格、手册和连接资料，不提交 |

## 云节点与私密资料

云节点操作前阅读 [agent.md](agent.md) 和 [cloud-node/README.md](cloud-node/README.md)。连接已有服务与部署服务是不同操作；本地测试安装不包含云端部署。新仓库发布仅同步代码，云端更新需要独立的部署需求。

精确 IP、端口、密码、API Key、原始资料放在被忽略的本地区域，包括 `docs/cloud-node/*.local.md`、`docs/project/git-workflow.local.md` 与 `docs/private/`。不要强制加入 Git。公开目录只保留脱敏说明。
