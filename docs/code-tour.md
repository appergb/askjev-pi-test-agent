# 代码导览（Code Tour）

适用版本：**askJEV Agent 1.5.0**（2026-09-29）。本文回答"代码怎么读、数据怎么流、怎么安全地改"；系统的概念模型、模块职责表与数据位置见[当前框架](framework.md)，用户视角的命令说明见 [cli.md](cli.md)。本文不重复前两者的表格。文中只引用函数名，不引用行号。

## 阅读顺序（Reading Order）

建议按四组阅读，每组内部自底向上；括号内是开始该组前需要的前置理解。

**第 1 组 · 地基**（无前置）

1. `src/paths.mjs` — 一切路径的源头：`ASKJEV_HOME`、运行目录、配置解析链。
2. `src/common.mjs` — 共享原语与安全校验核心：`validateTask`、`snapshot`、`verifySnapshot` 都在这里，后续所有模块都依赖它。
3. `src/model.mjs` — 私密配置加载（`loadConfig`）、模型注册（`modelRuntime`）与 Pi 会话组装（`createPi`）。

**第 2 组 · 执行器**（需要第 1 组的 `common`）

4. `src/execution.mjs` — `executeTest`：macOS Seatbelt 沙箱里跑 `node:test`，解析 TAP，四分类结果。
5. `src/browser.mjs` — `executeBrowser`/`validateBrowserPlan`：受限静态快照上的声明式浏览器测试。
6. `src/baseline.mjs` — `runBaseline`：项目原有 `node:test`/`uvu` 测试的门禁。
7. `src/provenance.mjs` — `provenance`：快照的 Git 出处元数据。

**第 3 组 · 流水线核心**（需要第 1、2 组；`runner` 是全仓最核心文件，放最后精读）

8. `src/scoring.mjs` — `scoreWithPolicy`/`normalizeScores`：三标签候选支持度评分协议。
9. `src/selection.mjs` — `selectItems`：all/lowest/highest/range 选测策略。
10. `src/handoff.mjs` — `createHandoff`/`recordFeedback`：与编码 Agent 的交接与回归反馈契约。
11. `src/replay.mjs` — `replay`：在冻结的源码、评分、测试上比较不同选测策略。
12. `src/runner.mjs` — `runTask`（一次完整测试运行）、`regress`（字节不变重跑）、`renderReport`。五个 Agent 工具 `readProject`/`askJEV`/`writeTests`/`runTests`/`finishReport` 全部定义在这里。

**第 4 组 · 外围与入口**（需要第 3 组）

13. `src/campaign.mjs` — `runCampaign`：有预算的多轮发现、失败复现与停滞检测。
14. `src/sessions.mjs` — 持久后台会话的生命周期（目录即状态机）。
15. `src/session-worker.mjs` — 被 `startSession` 以分离进程方式启动的入口脚本（不是模块）。
16. `src/application.mjs` — `initialize`/`createExample`/`connect`/`probeModel`/`doctor`。
17. `src/cli.mjs` — `askjev` 脚本化入口：12 个子命令、JSON 输出、退出码契约。
18. `src/terminal.mjs` — `askjev-cli` 交互终端入口（要求 TTY）。
19. `src/terminal-agent.mjs` — 终端背后的 `TerminalAgent`：用四个受限工具编排测试流水线的小型对话 Agent。

一句话索引（每个文件"读它解决什么问题"；职责细节见 framework.md）：

| 文件 | 读它解决什么问题 |
| --- | --- |
| paths.mjs | 配置到底从哪来、产物写到哪去 |
| common.mjs | 什么输入合法、快照如何防篡改 |
| model.mjs | 私密配置如何变成一个可调用的模型会话 |
| execution.mjs | 一次沙箱内的 Node 测试如何执行与分类 |
| browser.mjs | 一次静态快照上的浏览器测试如何执行与分类 |
| baseline.mjs | 上游原测试失败时如何阻断新缺陷发现 |
| provenance.mjs | 运行清单里的 Git 出处从哪来 |
| scoring.mjs | 评分后端如何被调用、分数如何被校验 |
| selection.mjs | 哪些候选会被真正执行 |
| handoff.mjs | 缺陷交接与回归反馈的 JSON 契约长什么样 |
| replay.mjs | 如何在完全相同的输入上比较选测策略 |
| runner.mjs | 一次 run 的完整编排与全部产物 |
| campaign.mjs | 多轮如何共享快照、如何判断停滞 |
| sessions.mjs | 后台会话的目录、锁与取消机制 |
| session-worker.mjs | 分离进程里到底跑了什么 |
| application.mjs | init/example/connect/doctor 的行为 |
| cli.mjs | 参数如何解析、退出码如何决定 |
| terminal.mjs | TUI 的命令分发与信号处理 |
| terminal-agent.mjs | 对话式编排如何映射到 `runTask` |

## 一次 run 的数据流（Data Flow of One Run）

以 `askjev run --request task.json` 为线索（`campaign` 在此之上多轮复用同一流程；`session run` 经分离进程调用同一流程）：

1. **解析与校验**：`cli.mjs` 的 `main` 读取 task.json，可能用 `--select`/`--scoring-failure` 覆盖任务的 `selection`/`scoring_failure`，然后进入 `runner.runTask`。
2. **任务合法性**：`validateTask`（common.mjs）校验 schema、文件白名单、预算范围；`snapshot` 固化源码到 `<runDir>/workspace/` 并写出 `task.json`、`snapshot.json`（含 `snapshot_id`）。
3. **基线门禁**：`runBaseline` 跑项目原有测试，写出 `baseline.json`；基线失败则整个 run 拒绝开始。`verifySnapshot` 确认快照未被改动。
4. **会话组装**：`createPi`（model.mjs）注册私有模型、装配五个工具与系统提示词；`.runtime/` 目录承接 Pi 的目录类产物，run 结束时删除。
5. **readProject**：Agent 领取目标、需求引用（`requirementReferences`）、基线状态与 `allowed_source_refs`。
6. **askJEV**：Agent 一次性提交全部候选；`normalizePrepared` 校验后写出 `prepared.json`，`scoreWithPolicy` 调用评分后端写出 `scores.json`、`score-quality.json`，`selectItems` 按 `--select` 策略决定执行范围并写出 `selection.json`。
7. **writeTests**：为每个候选生成测试（Node 用 `node:test` 源码，浏览器用 browser-plan JSON）；原子写入 `workspace/tests/` 并登记到 `tests.json`（含内容哈希）。只有 `test_error` 可以在尝试预算内修复重写。
8. **runTests**：只执行 `selected_ids`，逐例调用 `executeTest`/`executeBrowser`，证据落到 `evidence/<case_id>-<attempt>.json`（浏览器另存截图 PNG）；每例之后再次 `verifySnapshot`。
9. **finishReport**：Agent 对每个失败给出分类分析；`attachEvidence` 用执行器真实日志替换或校验模型摘录。
10. **收尾**：无论成败都写出 `events.json`、`manifest.json`（版本与技能哈希）、`result.json`（契约入口）、`report.md`、`coding-handoff.json`；`cli.mjs` 用 `exitCode` 把结论映射为退出码。

## 产物生命周期（Artifact Lifecycle）

run 目录（`$ASKJEV_HOME/runs/<run_id>/`）：

| 产物 | 写入者 | 消费者 | 说明 |
| --- | --- | --- | --- |
| `task.json` / `snapshot.json` | `runTask`（步骤 2） | `regress`、`replay` | 回归与重放的输入契约 |
| `baseline.json` | `runBaseline` | `regress`、报告 | 原测试基线状态 |
| `prepared.json` / `scores.json` / `score-quality.json` / `selection.json` | `askJEV` 工具（步骤 6） | `replay`（复用评分） | 评分与选测中间产物 |
| `tests.json` + `workspace/tests/` | `writeTests`（步骤 7） | `regress`（逐字节校验后复用） | 生成测试与哈希 |
| `evidence/*` | `runTests`（步骤 8） | 报告、交接 | 执行器原始证据，人读与机器读同源 |
| `events.json` / `manifest.json` | 收尾（步骤 10） | 审计、进度回放 | 清单含 `runtime_sha256` 与技能哈希 |
| `result.json` / `report.md` / `coding-handoff.json` | 收尾（步骤 10） | `handoff`/`regress`/`feedback` 命令、人 | `result.json` 是后续一切命令的契约入口 |

campaign 目录（`campaign-<uuid>/`）：`result.json`、`report.md`、`coding-handoff.json` 由 `runCampaign` 原子更新（`.next` + 改名）；`task.json`/`snapshot.json` 固定共享快照；子运行在其 `runs/` 下，复现在 `reproductions/` 下。

session 目录（`$ASKJEV_HOME/sessions/<id>/`）：`state.json` 是状态机，`busy/owner.json` 是互斥令牌，`job.json`/`cancel.json` 驱动后台任务，`context/current.json` 与 `.jsonl` 是持久对话（由 `createPi` 维护），`progress.jsonl` 是 worker 进度流，`runs/` 存放会话产生的底层运行。

贯穿身份：`snapshot_id`（快照内容哈希）串联 run、campaign 轮次、复现与回归；`result.json` 的 `run_status`/`assessment` 决定 `exitCode`。

## 安全与预算控制点（Guards）

| 机制 | 所在函数 | 一句话说明 |
| --- | --- | --- |
| 路径白名单 | `relativeFile`/`plainFile`（common.mjs） | 拒绝绝对路径、穿越、隐藏文件、`private`/`secrets`/`credentials`、符号链接 |
| 快照限额与扫描 | `snapshot`（common.mjs） | 总量 ≤512 KB、模型可见 ≤16 KB、内置凭据模式扫描；工作区文件只读（0400） |
| 快照防篡改 | `verifySnapshot`（common.mjs） | 对原始根与工作区双根逐一校验哈希，业务源码任何变动都终止 run |
| 沙箱执行 | `executeTest`（execution.mjs） | Seatbelt profile 拒绝网络、仅允许指定 Node 二进制执行进程 |
| 浏览器隔离 | `executeBrowser`（browser.mjs） | 仅 `http://askjev.local` 来源 + 资产映射白名单 + 严格 CSP，外联请求全部拦截 |
| 凭据不落盘 | `modelRuntime`（model.mjs）及 campaign/session-worker 的静默 catch | 密钥只进内存凭据库；持久化状态只记录通用错误码，不带 provider/传输层文本 |
| 墙钟预算 | `runTask` 中的 timer + `ensureActive` | 超时 abort，收尾落盘允许略超 |
| 模型轮次预算 | `createPi` 的 `beforeModelRequest` 回调 | 每次模型请求前递增并在达到上限时 abort |
| 尝试预算 | `writeTests`/`runTests` | 仅 `test_error` 可修复，次数受 `max_test_attempts` 限制 |
| 评分降级 | `scoreWithPolicy`（scoring.mjs） | `strict` 失败即终止；`all`（仅全量选测）允许 null 分数继续执行 |

## 如何扩展（Extending）

### 新增 CLI 子命令

1. 在 `cli.mjs` `main` 的命令白名单数组中加入命令名。
2. 需要新旗标时在 `parseArgs` 的 options 定义中补充（字符串或布尔）。
3. 在 `main` 的分发链中加分支：读取 `values`，调用实现函数，结果经 `complete()` 包裹后 `output()`。
4. 决定退出码：正常结论走 `exitCode`；需要独立语义时在该分支显式设置 `process.exitCode`。
5. 更新 `HELP` 模板字符串与 `docs/cli.md`。
6. 在 `tests/cli.test.mjs` 补测试（入口探测、stdout JSON、退出码）。

**必须保持的不变量**：stdout 只有 JSON，进度走 stderr；错误以结构化 JSON 输出并以退出码 2 表达输入/配置问题；不把内部异常文本直接透给用户。

### 新增 Agent 工具

在 `runner.mjs` 的 `tools` 数组中用现有 `tool()` 包装器定义：`Type.Object` schema 严格声明参数；`execute` 内先 `ensureActive()`，实现函数用 `check()` 抛模型可读错误（包装器会把错误转成模型可见文本而不是崩溃）。需要跨工具状态时沿用闭包变量 + 状态门模式（参考 `askJEV` 的"先 readProject、仅一批"约束），用 `mark(stage)` 记录进度事件。**不变量**：工具不得写业务源码、不得绕过快照校验、不得把凭据或 provider 文本带进对话与产物。

### 新增配置字段

配置由 `loadConfig`（model.mjs）读取并校验，样例在 `config/agent.example.json`；新字段应在 `loadConfig` 或对应消费函数中校验，同步更新样例文件与 [mvp/configuration.md](mvp/configuration.md)，必要时在 `initialize`（application.mjs）的导入校验中放行。**不变量**：涉及端点的字段必须满足 HTTPS-or-loopback；凭据字段只能是环境变量名或授权文件引用，不得存明文。

### 其他全局不变量

- `VERSION`（common.mjs）与 `package.json` 保持一致；`runner.mjs` 清单中的 Pi 版本与锁定的 `@earendil-works/*` 依赖保持一致。
- 评分是未校准的排序辅助：不得据分数跳过测试、不得把分数当缺陷证据。
- 模板字符串（HELP、报告、系统提示词、Seatbelt profile）是运行时输出，注释只能加在声明上方。
- 用户可见文案为简体中文，代码标识符与注释为英文。

## English Summary

askJEV Agent is an evidence-based testing agent. The code reads bottom-up in four groups: foundation (`paths`, `common`, `model`), executors (`execution`, `browser`, `baseline`, `provenance`), the pipeline core (`scoring`, `selection`, `handoff`, `replay`, and `runner` — the heart, defining the five agent tools `readProject`/`askJEV`/`writeTests`/`runTests`/`finishReport` inside `runTask`), and the outer layers (`campaign`, `sessions`, `session-worker`, `application`, `cli`, `terminal`, `terminal-agent`).

One run proceeds: validate the task, freeze an immutable source snapshot, gate on the project's own baseline tests, then let the model drive the five tools. Scoring ranks candidate scenarios via a three-label cloud protocol; only explicitly selected cases execute inside the Seatbelt sandbox or the jailed browser context; every failed case must be analyzed with executor-attached evidence. All artifacts (result, report, manifest, handoff) are written even on failure, and `result.json` is the contract entry for `handoff`, `regress`, `feedback` and `replay`.

Guards are concentrated in `common.mjs` (path allowlists, snapshot size limits, credential scanning, dual-root tamper checks), the executors (sandbox profiles, origin allowlists, strict CSP), and the budget gates (wall clock, model turns, repair attempts, scoring-failure policy). Credentials never reach disk or user-facing output.

To extend: add CLI commands via the whitelist + dispatch + `complete()` pattern in `cli.mjs`; add agent tools via the `tool()` wrapper with strict schemas and state gates in `runner.mjs`; add config fields with validation in `loadConfig` plus the example config and its documentation. Invariants: never modify business sources, never treat scores as defect evidence, keep stdout JSON-only, and keep the Chinese user-facing text with English identifiers and comments. The Chinese body of this document is authoritative.
