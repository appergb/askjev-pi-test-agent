# 前端自动测试与按分数选测

1.3 支持本地静态前端工程的真实 Chrome 测试：测试 Agent 读取需求和源码，产生候选场景，经 askJEV 实际评分后保存浏览器步骤，执行用户选择的场景，并保留步骤结果、断言和截图。生成模型仍默认 Flash，评分连接已有 Spark 服务。

## 使用

本机需已安装 Google Chrome。浏览器通过 Playwright 的 Chrome channel 启动独立临时会话，不使用个人登录状态。[Playwright 官方启动接口](https://playwright.dev/docs/api/class-browsertype#browser-type-launch)

```bash
askjev doctor --browser
# 从源码 checkout 运行自带购物结算工程
askjev run --request examples/frontend-shop/task.json --select lowest --count 3
# 也可只测最低的一项
askjev run --request examples/frontend-shop/task.json --select lowest --count 1
# 或只测高分项、指定区间
askjev run --request examples/frontend-shop/task.json --select highest --count 3
askjev run --request examples/frontend-shop/task.json --select range --min-score 0 --max-score 0.1
```

`--select` 覆盖任务中的 selection。默认未设置时为 all；样例任务显式设置 lowest/count=3。lowest/highest 的 count 范围为 1..12。数值模式只使用有效数值评分，unknown/非法/缺失评分不当成零分；有效项不足时只执行实际有效项。边界分数包含在 range 中。并列分数按 case_id 排序，不能把该顺序解释为风险差异。

显式选测不会强制追加 baseline=true 的候选项；原有单元测试基线若已配置，仍在发现阶段之前执行。未选中项记录于 selection.json 和报告，不能算作通过。没有选中任何项时结论为 inconclusive。

## 同一批候选的比较与回归

```bash
askjev replay --from <original-run-directory> --select lowest --count 1
askjev replay --from <original-run-directory> --select highest --count 3
askjev replay --from <original-run-directory> --select all
askjev regress --from <original-run-directory> --project examples/frontend-shop-fixed
```

为保证比较时测试一致，首次运行由 Agent 为全部候选生成并保存计划，但只执行选中的计划。replay 不调用生成或评分模型：使用保存的源码快照、分数与测试，校验源码快照和测试摘要后执行不同分组。它不使用当前业务工作区的新代码。若原快照被改动则拒绝复用评分。

replay 只提供真实执行结果，新增失败标记为 suspected_issue，需核对断言后才能称为产品缺陷。因此含断言失败的 replay 退出码为 4；不能把这个退出码当作浏览器没有执行。首次 run 的实际失败经 Agent 分析后可形成 coding-handoff.json。

regress 用修复后的新源码运行全部保存的原测试，包括原先未选中的候选；测试字节保持不变，不复用旧评分。其范围可能大于首次选测范围。

## 输入与边界

任务包含 `execution: {"type":"browser","entry":"index.html","assets":["index.html","app.js","styles.css"]}`。assets 必须已在 files 中明确授权；需求文件不作为网页资源提供。

测试计划是 JSON，而不是任意可执行的模型代码。支持 click、fill、select、check、uncheck，以及 text、value、count、visible、hidden、enabled、disabled 断言。选择器使用页面中真实 ID。每个案例使用全新浏览器上下文，页面通过拦截请求加载批准的静态快照；外部请求、WebSocket、Service Worker、下载与表单提交被限制。支持的是经过用户授权的本地静态项目，不是任意恶意网页的通用隔离环境。

当前不自动安装前端依赖、运行项目构建脚本，也不测试生产网站、登录流程、支付、后端 API 或跨服务调用。页面断言读取动作后的状态，尚无面向复杂异步页面的显式等待策略。报告提供的是功能断言与失败截图，尚未实现截图视觉差异比较。

## 本次实验的解释

样例是一个实际可渲染、可交互的购物结算页面，包含数量、配送方式、优惠码和金额计算。按用户要求植入两个缺陷，不是外部真实项目的盲测。缺陷清单不进入 Agent 上下文。

六个候选中，优惠码错误得到低分约 0.00247，而免运费边界错误得到 1.0。低分三项找到优惠码问题，却漏掉边界问题；全量执行找到两个问题。多数候选同为 1.0，高分组的具体成员由固定的并列规则选出。

当前分数是三个候选答案中“满足需求”的条件支持度，不是用户执行某操作的概率，也不是经过校准的 bug 概率。测试分组功能通过验收，不代表评分排序已经可靠。完整时间和结果见 [验收数据](evidence/frontend-1.3.json)。
