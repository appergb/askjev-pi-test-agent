# 上游组件与来源

askJEV Agent 对外定位为“优化过的 Agent 框架”，是基于上游组件构建的独立测试应用，并非从零自研的模型或基础 Agent 内核。

运行时依赖 `@earendil-works/pi-coding-agent` 和 `@earendil-works/pi-ai`，版本均为 0.85.1。已安装包的元数据声明 MIT 许可，源码位于 [earendil-works/pi](https://github.com/earendil-works/pi)。依赖通过 npm 原样安装，未将其源码重新署名。上游许可与著作权声明应随相应组件保留。

本项目的定制包括：工具白名单、批准的 Skills、任务快照、askJEV 评分适配、测试隔离执行、结果与缺陷交接协议、原测试回归、独立 CLI 配置与云节点连接。完整依赖及固定版本见 `npm-shrinkwrap.json`；运行报告继续记录 `pi_version`，用于追溯兼容性。

`pi-test-agent` 命令、`PI_TEST_CONFIG` 环境变量、`skills/pi/` 和 `skills/codex/pi-test/` 路径保留用于兼容旧工作流；产品主入口为 `askjev`。原需求和历史评估中的 Pi 名称保留原意。

此说明记录依赖来源，不为本项目原创代码另行指定许可。
