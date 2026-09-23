# askJEV Agent 架构与接入

askJEV Agent 是面向证据驱动测试的优化过的 Agent 框架。外部通过一个 CLI 调用，内部使用固定版本 Agent 内核、自定义工具和批准的 Skills。

```text
用户 / coding agent
        │ askjev CLI
        ▼
本地 askJEV Agent
  配置与预算 → 需求/源码快照 → 原测试基线
        │
        ├─ 生成服务：Flash / GLM / 自托管模型
        ├─ askJEV 工具 → 评分服务
        │                  ▲
        │           SSH 本地转发
        │                  │
        │           NVIDIA DGX Spark
        │         已有生成 / 评分服务
        ▼
测试生成 → 本地隔离执行 → 证据与缺陷交接
        ▲                       │
        └── 原测试回归 ← coding agent 修复
```

生成与评分服务可同机或分机，独立配置。当前私密配置对接已有 Spark 服务；连接动作只建立 SSH 转发，不执行部署脚本、不安装远端依赖。`connect status` 检查 SSH 控制连接，`doctor` 检查评分服务与本地执行器，`models --probe` 或 `doctor --probe` 才会实际验证选定生成模型的工具调用。三种检查不能互相替代。

本版本的本地执行器只支持 macOS。Spark 的 Linux/ARM64 用于服务推理；把整个应用移到 Spark 并运行测试，还需要 Linux 隔离执行器，尚未实现。

安装目录只保存程序、内置 Skills 和示例。用户配置默认位于 `~/.askjev-agent/config.json`，产物默认位于 `~/.askjev-agent/runs/`。任务运行时临时状态放在该运行目录并在会话结束清理，版本清单与测试证据保留。通过 `ASKJEV_HOME` 可隔离多个应用实例。

仅显式批准的源文件进入快照，基线文件不进入生成或评分上下文。内置四个 Skills 使用固定路径和内容摘要加载，不自动继承用户全局扩展。技术来源与兼容标识见 [组件说明](../THIRD_PARTY_NOTICES.md)。

1.4 增加独立编码技能安装包和持久会话。后台 worker 使用会话自己的 SDK 对话文件；一次性 run 仍使用内存会话。每次运行的快照、评分、工具状态都重新建立，旧对话只提供历史上下文。详情见 [会话管理](sessions.md) 与 [技能安装](skill-installation.md)。
