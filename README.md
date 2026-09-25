# askJEV Agent

**为 AI 编码提供可复现的测试反馈：发现问题、交付证据、用原测试验证修复。**

[![Quality checks](https://github.com/appergb/askjev-pi-test-agent/actions/workflows/quality.yml/badge.svg?branch=main)](https://github.com/appergb/askjev-pi-test-agent/actions/workflows/quality.yml)

**1.5.0 · 工程试用版** ｜ macOS ｜ JavaScript 模块与本地静态页面 ｜ 最近业务验证：2026-09-25

askJEV Agent 面向使用编码 Agent 开发软件的人。它读取明确授权的代码和需求，提出测试场景，生成并实际执行测试，再把需求原文、失败断言和复现材料交给编码 Agent。修复后继续执行原测试，让开发者能够核对问题是否消失。

**代码与需求 → 测试场景 → JEV 评分 → 真实执行 → 缺陷交接 → 修复后的原测试回归**

[评审速览](#评审速览) · [实测结果](#实测结果) · [项目贡献](#项目贡献与组件来源) · [现场演示](#现场演示) · [快速开始](#快速开始) · [完整文档](docs/README.md)

## 评审速览

以下按项目价值、实现和验证组织核查入口，便于逐项查看成果。

| 评审关注点 | 已交付内容 | 证据 |
| --- | --- | --- |
| 应用价值 | 为编码 Agent 提供需求驱动的测试、失败证据和修复反馈；在真实仓库的边界专项中发现原测试未覆盖的缺陷 | [klona 真实仓库评估](docs/mvp/github-evaluation.md) |
| 项目实现 | 源码快照、受限测试工具、Node/Chrome 执行、缺陷交接、原测试一致性校验 | [框架与源码职责](docs/framework.md) |
| Agent 能力 | 五个内置测试技能，支持后台会话和有预算的多轮补查 | [技能与完成度清单](docs/testing-capabilities.md) |
| 工程质量 | 自动检查、固定依赖、CI、失败分类、取消和预算控制；保存实际执行证据 | [质量报告](docs/quality-review-2026-09-23.md) · [CI](https://github.com/appergb/askjev-pi-test-agent/actions/workflows/quality.yml) |
| NVIDIA 技术使用 | DGX Spark 承担 JEV GPU 评分，并支持另一条自托管生成路径 | [技术分工与证据](docs/architecture/nvidia-stack.md) |
| 可复现性 | 提供缺陷样例、修复样例、任务配置、脱敏验收数据和回归命令 | [现场演示](#现场演示) · [证据索引](docs/evidence/README.md) |

## 实测结果

### 真实仓库：补到原测试未覆盖的边界

在固定版本的 **lukeed/klona 2.0.6** 上，Pi 生成的边界测试发现：克隆 `DataView` 时丢失 `byteOffset` 与 `byteLength`。例如原视图只覆盖缓冲区中的 4 字节，克隆结果却覆盖整个 8 字节。测试原仓库时未植入缺陷。

编码 Agent 核对证据后，在独立副本中修改两处实现；**16 组原 Pi 测试回归通过，上游基线在原版和修复版均为 137/137 通过**。三个失败记录归为一类缺陷。此结果来自 2026-09-21 的显式边界专项，首轮通用测试未发现它。[固定提交、方法与限制](docs/mvp/github-evaluation.md) · [验收数据](docs/evidence/klona-1.1.json) · [修复补丁](examples/github-klona/dataview-fix.patch)

### 两类任务：从生成测试到修复回归

2026-09-25，使用真实生成模型与 JEV 服务，选择 `all` 执行全部候选：

| 样例 | 原版执行结果 | 发现的预置缺陷 | 本次发现流程耗时 | 已有修复版的原测试回归 |
| --- | --- | --- | ---: | --- |
| JavaScript TaskStore | 8 项：6 通过、2 失败 | 数量 10 被错误拒绝；相同请求重试产生重复记录 | 17.27 秒 | **8/8 通过** |
| Chrome 购物页面 | 6 项：4 通过、2 失败 | 恰好 100 未免运费；优惠券按 5% 而非 10% 折扣 | 21.97 秒 | **6/6 通过** |

14 份生成测试在回归中逐字节不变，两个反馈状态均为 `regression_passed`。这些是受控样例的单次观测，耗时不含安装、配置和修复；不能外推为未知项目检错率或性能保证。[本次验证说明](docs/testing-capabilities.md#2026-09-25-实际验证) · [运行 ID、分数与测试摘要](docs/evidence/capability-review-2026-09-25.json)

### 工程检查

| 检查范围 | 记录 | 证据日期 |
| --- | --- | --- |
| Agent、终端及执行流程 | **51/51** 自动检查通过，无跳过 | 2026-09-25 |
| 本地运行时 `src` | 行覆盖率 **94.30%**，分支覆盖率 **78.44%** | 2026-09-23 |
| 模型 API 代理 | **36/36** 检查通过，行覆盖率 **94.91%**；严格类型与静态检查通过 | 2026-09-23 |

自动检查验证程序行为，覆盖率表示代码被测试触达的范围。模型检错的准确率、漏报率和评分收益尚无多仓库盲测结论。[检查方法与局限](docs/quality-review-2026-09-23.md)

## 项目贡献与组件来源

本项目基于 **Pi 0.85.1** 的 Agent 会话、模型调用和终端组件，重点实现以下测试工作流：

1. **将测试绑定到需求和源码。** 限定允许读取的文件，保存当前代码快照，为候选场景关联需求原文与源码引用；已有测试基线失败时先停止新缺陷发现。[范围与快照](src/common.mjs) · [流程编排](src/runner.mjs)
2. **用实际执行支撑报告。** 提供 Node 沙箱和受限浏览器操作，区分业务断言失败、生成测试错误与环境失败；报告引用执行器记录的日志和截图。[Node 执行](src/execution.mjs) · [Chrome 执行](src/browser.mjs)
3. **保留可检查的修复闭环。** 缺陷交接包含需求、源码身份、测试摘要和失败证据；对修复代码复用原测试，防止通过改写测试掩盖问题。[交接与反馈](src/handoff.mjs)
4. **支持有限的持续补查。** 后台会话管理任务；campaign 在时间、轮次和模型调用预算内生成后续测试、复现失败，并保存每轮证据和停止原因。[多轮测试](docs/campaigns.md) · [会话](docs/sessions.md)

内置五个测试技能：`brainstorming` 提出场景，`ask-jev` 调用评分，`writing-tests` 编写测试，`browser-tests` 编写页面操作计划，`bugs` 分析真实结果。Node 任务加载其中四个，浏览器任务追加 `browser-tests`；运行记录保存实际加载版本。[技能职责与源码](docs/testing-capabilities.md#五个内置测试技能)

Pi 提供基础内核，Open JEV 与已有模型提供推理能力，Playwright/Chrome 提供浏览器执行能力。本项目的贡献是上述测试编排、约束、适配和证据闭环；当前没有项目自行训练模型权重的验证记录。[上游来源](THIRD_PARTY_NOTICES.md)

## 当前框架结构

![askJEV 1.5 当前架构：本地终端和测试运行时连接生成与评分服务，真实执行后保存证据，再交接和回归修复](docs/architecture/framework.svg)

- **交互层：** `askjev-cli` 是面向人的终端前端，显示对话、进度和报告；默认模型固定。`askjev` 是输出 JSON 的脚本入口，编码 Agent 也可通过配套 Skill 调用。
- **编排与执行层：** 本机运行范围检查、快照、测试生成流程、Node/Chrome 测试和证据保存。测试 Agent 负责测试，编码 Agent 负责修改业务实现。
- **模型服务层：** 已验证的默认流程使用外部 Flash 生成服务与 Spark 上的 JEV 评分服务；另有自托管千问生成路径。它们独立配置，Spark 当前不承担本机测试执行器的职责。

**NVIDIA 的实际作用：** 已核对的 JEV 使用 PyTorch CUDA、BF16 在 DGX Spark/GB10 上推理。自托管生成另有 SGLang、量化权重与缓存等部署记录；默认外部 Flash 的生成耗时不能计为本机 GPU 加速成果。部署及推理调优与模型权重训练分别记录。[协议核对](docs/evidence/scoring-protocol-audit-2026-09-22.json) · [GPU 技术与验证边界](docs/architecture/nvidia-stack.md)

## 现场演示

完成[快速开始](#快速开始)后，在仓库根目录演示购物页面的“测试 → 查看证据 → 原测试回归”。这是带已知缺陷的受控样例，适合展示完整工作流；真实仓库检错证据见前面的 klona 案例。

**1. 运行全量浏览器测试。** 先展示[页面需求](examples/frontend-shop/requirements.md)与[待测代码](examples/frontend-shop/app.js)，再执行：

```bash
askjev run --request examples/frontend-shop/task.json --select all
```

任务配置要求六个场景；`--select all` 覆盖该示例原有的低分选测设置。检查输出的 `run_status`、`statistics`、`scoring.backend_mode` 和 `artifacts.directory`。发现确认缺陷时退出码为 **1**，表示任务完成并发现问题；失败、取消或未完成不能算通过。

**2. 展示缺陷证据。** 用输出中的 `artifacts.directory` 替换下面的 `<原运行目录>`：

```bash
askjev handoff --from "<原运行目录>"
```

打开该目录的 `report.md` 和 `evidence/`，核对需求中的免运费边界、实际页面运费与失败截图。评分不能代替这里的断言证据。

**3. 展示修复回归。** 先对照[已有修复版](examples/frontend-shop-fixed/app.js)，再复用同一份测试：

```bash
askjev regress --from "<原运行目录>" --project examples/frontend-shop-fixed
askjev feedback --from "<原运行目录>" --regression "<回归目录>"
```

`<回归目录>` 来自 regress 返回的 `artifacts.directory`。核查 `tests_unchanged=true`、全部保存测试通过和 `overall_status=regression_passed`。此演示复用预先准备的修复版；实际开发中，编码 Agent 在读取交接后修改业务实现。

可用 `examples/retry-demo/task.json` 与 `examples/retry-demo-fixed/` 演示相同的 Node 流程。`replay` 用于同一原快照的选测比较；验证修改后的代码使用 `regress`。[完整 CLI 说明](docs/cli.md)

## 快速开始

### 安装

需要 **macOS、Node.js ≥22.19、npm**；浏览器测试还需要本机 **Google Chrome**。真实任务需要可访问的生成服务和 JEV 服务，服务地址与凭据由运行者提供。

```bash
git clone https://github.com/appergb/askjev-pi-test-agent.git
cd askjev-pi-test-agent
npm ci --ignore-scripts
npm run package:skill
npm install -g --ignore-scripts ./artifacts/releases/403-forbidden-askjev-agent-1.5.0.tgz
askjev-cli --version
```

安装包由源码构建，尚未发布到 npm registry。若由编码 Agent 安装，选择[独立 Skill 安装方式](docs/skill-installation.md)，无需同时再装全局副本；`askjev-cli` 和 `askjev` 共享同一运行时。原生 `pi` / `pi-web` 的关系见[本机入口说明](docs/local-installation.md)。

### 配置并启动

首次使用时创建私密配置；已有配置则直接复用，`init` 拒绝覆盖：

```bash
askjev init
# 编辑 ~/.askjev-agent/config.json，填写服务地址和凭据引用
askjev doctor --browser --probe --model flash-direct
askjev-cli
```

`flash-direct` 是配置别名，需要对应实际可用的生成模型。配置参考：[通用模板](config/agent.example.json)、[Spark 模板](config/spark.example.json)、[字段说明](docs/mvp/configuration.md)。仅当配置要求 SSH 转发时，先运行 `askjev connect start`；它连接已有服务，不部署云端模型。

从仓库根目录启动终端后，输入 `/run examples/retry-demo/task.json`；`/report` 查看最近报告，`/help` 查看命令。跨目录任务优先使用绝对项目路径。终端不提供模型选择菜单，测试证据默认保存在 `~/.askjev-agent/runs/`。私密配置、日志、会话与凭据不随源码发布。

<details>
<summary>仅检查工程与安装包：无需私密模型凭据</summary>

完成上面的源码依赖安装后，在 macOS 与 Chrome 环境中运行：

```bash
npm test
npm run package:skill
```

自动测试通过本地模拟服务检查 Agent 协议，并实际调用本地执行器；这与真实模型的业务检测验收分开。也可直接查看公开 [GitHub Actions](https://github.com/appergb/askjev-pi-test-agent/actions/workflows/quality.yml)。完整受支持环境见 [CLI 说明](docs/cli.md)。

</details>

## 现在如何评分

JEV 评估的是“业务实现是否满足某个候选场景的预期”。Pi 在写测试前提交一批场景，适配器将相关源码、需求和问题发往 `POST /decide`。已核对的服务使用 Qwen3-4B-Instruct-2507，对 `supported`、`violated`、`unknown` 三个答案标签的 logits 做 softmax，取 `P(supported)` 作为相对支持度；信息不足或无效结果保留为 `null`。[评分实现与输入范围](docs/architecture/scoring-selection-v2.md#当前评分的实际实现)

**当前每批评一次，默认全测。** 2026-09-25 的浏览器免运费失败场景仍得到 1.0，优惠券失败场景约为 0.99957。因此分数只用于实验选测，不表示正确率、用户操作频率或整个项目的质量得分。显式 `lowest/highest/range` 会留下未测项；评分故障默认阻塞，只有全测下显式指定 `--scoring-failure all` 才可继续，并保留缺失评分记录。

## 适用范围与下一步

当前支持选定 JavaScript 模块与本地静态页面；生成模型可见源码和需求合计最多 16 KB，快照最多 512 KB，评分服务历史核对上限为 4096 tokens。工程已实现后台会话和有限多轮测试，尚不支持任意生产网址、登录/支付链路、通用后端 API、视觉差异测试、Linux 沙箱或步骤级断点恢复。[完整能力与限制](docs/testing-capabilities.md)

下一步设计是：**明确用户最少成功操作与最大业务范围 → 先测最短成功路径 → 扩展省略、重复、撤回及顺序变化 → 对同一证据做双轮评估 → 用真实执行检验收益**。最少/最多操作问答、双轮评分、独立断言复核与校准均尚未接入 1.5；后续需用多仓库保留集衡量检出、误报、漏报及时间成本。[目标架构与图示](docs/architecture/scoring-selection-v2.md) · [能力路线](docs/diagnostic-roadmap.md)

---

[文档总索引](docs/README.md) · [全部验收摘要](docs/evidence/README.md) · [配置与 CLI](docs/cli.md) · [改动记录](CHANGELOG.md) · [公开仓库](https://github.com/appergb/askjev-pi-test-agent)
