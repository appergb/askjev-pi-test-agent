# askJEV Agent 当前框架

状态：1.5.0 已实现的代码结构，2026-09-23。本文描述当前程序；最少/最多操作问答、少见路径建模和双轮评分见[下一步设计](architecture/scoring-selection-v2.md)。

![当前架构](architecture/framework.svg)

## 三层结构

**交互层**是本机终端与脚本入口。`askjev-cli` 提供品牌界面、流式对话、进度和报告；`askjev` 提供结构化命令和 JSON 结果；编码 Agent 的 Skill 调用匹配版本的 CLI。它们共享同一个测试运行时，没有另起一个网页业务服务器。

**编排与执行层**运行在本机。Pi SDK 管理模型对话和工具调用；askJEV 自定义工具、限定源码范围、建立快照、检查预算、安排测试、保存证据。测试 Agent 不能直接修改业务实现；修复由接收缺陷交接的编码 Agent 完成。

**模型服务层**提供生成与评分。默认生成别名为 `flash-direct`，可通过私密配置接入其他已部署服务。评分通过 Open JEV 接口进行。DGX Spark 用于已有的 GPU 评分与可选生成服务，不承担当前 macOS 测试沙箱的职责。

## 当前一次任务经过什么

| 顺序 | 工作 | 主要代码与产物 |
| --- | --- | --- |
| 1 | 验证字段、范围、预算，建立源码快照 | `common.mjs` → `task.json`、`snapshot.json` |
| 2 | 执行已配置的原测试基线；失败时不开始新缺陷发现 | `baseline.mjs` → `baseline.json` |
| 3 | Pi 的 `readProject` 读取批准快照与需求，提出场景 | `model.mjs`、`runner.mjs` |
| 4 | `askJEV` 提交整批候选；对引用的业务源码评分一次 | `scoring.mjs` → `prepared.json`、`scores.json`、`score-quality.json` |
| 5 | 按策略选择，生成并保存全部候选测试 | `selection.mjs`、`writeTests` → `selection.json`、`tests.json` |
| 6 | 只执行选中的测试，记录实际输出、断言与截图 | `execution.mjs` / `browser.mjs` → `evidence/` |
| 7 | 分析实际结果，输出报告与缺陷交接 | `finishReport`、`handoff.mjs` → `result.json`、`report.md`、`coding-handoff.json` |
| 8 | 编码 Agent 修复代码，新快照执行原测试并记录反馈 | `regress`、`feedback`；测试字节不变，不复用旧评分 |

第 4 步评的是“业务实现是否支持候选预期”，不是第 5 步尚未生成的测试代码。当前评分器也没有直接浏览主页、采集用户行为或向用户问问题的接口。

## 模块边界

| 模块 | 职责 |
| --- | --- |
| `terminal.mjs` / `terminal-agent.mjs` | 人机对话、固定默认模型、调用任务与报告工具；不开放通用 shell 或业务编辑 |
| `cli.mjs` / `application.mjs` | 参数、配置初始化、诊断、已有 SSH 转发；不自动部署云节点 |
| `model.mjs` | 私密凭据引用、Pi 会话、模型注册和受控资源加载 |
| `runner.mjs` / `common.mjs` | 测试工具、预算、任务校验、文件快照和证据 |
| `scoring.mjs` / `selection.mjs` | 三标签支持度、异常诊断、显式选测；没有双轮复核与校准 |
| `execution.mjs` / `browser.mjs` | macOS 隔离执行 / Chrome 静态页面步骤 |
| `campaign.mjs` | 总预算内多轮补查、失败重现、停滞提示 |
| `sessions.mjs` / `session-worker.mjs` | 后台进程、独立对话、同会话互斥、查询与取消 |
| `handoff.mjs` / `replay.mjs` | 交接与回归反馈 / 冻结快照选测比较 |

表内文件均位于 [`src/`](../src/)。API 认证代理及模型启动参考位于 [`deploy/spark/`](../deploy/spark/)，与本机测试工具分开维护。代理修复提交到 GitHub 不代表已经部署到云节点。

## 数据与状态

| 内容 | 默认位置 | 生命周期 |
| --- | --- | --- |
| 私有运行库 | `~/.local/share/askjev-agent/<version>/` | 版本固定，不放用户任务数据 |
| 编码 Agent Skill | `~/.codex/skills/askjev-agent/` | 包含匹配运行库的回执与调用脚本 |
| 私密配置 | `~/.askjev-agent/config.json` | 独立保存，初始化不覆盖 |
| 测试证据 | `~/.askjev-agent/runs/` | 保留结果、快照、测试和证据 |
| 后台会话 | `~/.askjev-agent/sessions/` | 独立对话及各自的 runs；清空上下文保留证据 |
| 终端对话 | 本次进程内存 | `/clear` 或退出后清空，测试证据仍保留 |

`ASKJEV_HOME` 可改变数据根目录，`--config` / `ASKJEV_CONFIG` 可指定配置。源码 checkout 中的 `artifacts/` 仅保存本机历史证据，不随安装包或 Git 发布。[本机安装整理](local-installation.md)

## 约束与可验证性

Node 执行器限制网络、创建子进程、读取非批准路径及写入业务源码；浏览器使用新建上下文和批准静态资源，阻止外部请求。任务还会核对业务快照是否变化。

运行时固定加载 `ask-jev`、`brainstorming`、`writing-tests`、`bugs` 四个 Skills，浏览器任务再加载 `browser-tests`。不自动继承用户原生 Pi 的扩展、工具或会话。组件来源见 [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md)。

生成模型可见源码与需求合计上限为 16 KB，完整快照上限为 512 KB。评分适配器只附上候选 `source_ref` 对应的源码与需求摘录；HTML 和其他依赖不保证进入评分上下文。评分服务历史核对上限为 4096 tokens，当前字符数检查不能证明请求一定在 token 上限内。这是待改善的证据完整性问题。

`connect status` 确认 SSH 控制连接；`doctor` 检查评分和执行环境；加 `--probe` 才验证生成模型工具调用。测试通过、模型可达、评分可信是不同结论。[当前质量与局限](quality-review-2026-09-23.md)

## 下一步如何接入

新设计在快照与候选生成之间加入“用户目标及最少/最多操作契约”，建立最短成功路径和有限异常扩展，再对同一快照的结构化证据做双轮评估。执行、证据、失败复现和原测试回归继续复用。

这些模块尚未实现，现有 `task.json`、`askJEV` 工具与单次评分协议保持原样。设计的职责、示例与验收条件见[评分与行为探索架构](architecture/scoring-selection-v2.md)。
