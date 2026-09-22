# 可提交的验收摘要

[klona-1.1.json](klona-1.1.json) 从本机真实运行结果中提取，包含固定上游版本、运行 ID、统计和限制，不含凭据、服务地址、用户目录或原始日志。

完整分析见 [GitHub 仓库评估](../mvp/github-evaluation.md)。`artifacts/` 中的原始报告、测试、日志、源码快照和交接文件不提交。评估文件中的运行 ID 可以在持有本机产物的工作区查回对应目录；新的运行会生成不同 ID。

重新验证请按根目录 [README](../../README.md) 配置模型并运行固定任务。摘要是历史验收记录，不表示任何模型在未来运行中必然得到相同结果。

- [cli-1.2.json](cli-1.2.json)：独立应用打包、跨目录真实运行、Spark 接入与原测试回归的脱敏验收摘要。

- [frontend-1.3.json](frontend-1.3.json)：真实 Chrome 前端测试、低分/高分/全量比较、两个预置缺陷及修复回归。

- [skill-session-1.4.json](skill-session-1.4.json)：独立技能自安装、真实并行任务、上下文继续与清空验证。

- [scoring-protocol-audit-2026-09-22.json](scoring-protocol-audit-2026-09-22.json)：评分服务实时 CUDA/BF16、标签读出协议与无项目训练/无概率校准的只读核对。
