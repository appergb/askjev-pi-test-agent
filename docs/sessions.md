# 像管理容器一样管理测试会话

1.4 引入持久测试会话：每个会话有独立的模型对话、后台工作进程、运行锁和证据目录。编码 Agent 可以决定何时继续、清空、重开，以及创建多少个会话并行工作。它是应用层生命周期管理，不是真正的 Docker 容器；没有新增操作系统、资源配额或远端执行隔离。

```bash
askjev session create --name frontend --count 2
askjev session list
askjev session run --id <session-id> --request <task.json>
askjev session inspect --id <session-id>
askjev session logs --id <session-id>
askjev session stop --id <session-id>
askjev session clear --id <session-id>
askjev session restart --id <session-id>
```

| 操作 | 行为 |
| --- | --- |
| create | 创建空会话；count 为 1..8，只创建，不自动消耗模型额度 |
| run | 后台提交任务，立即返回 job ID；继续当前会话上下文 |
| inspect / list | 查看状态、是否仍忙、上下文代数及最后结果位置 |
| logs | 返回最近的阶段日志，不输出模型原文或凭据 |
| stop | 请求合作式取消，保留已收集证据；需要继续 inspect 确认退出 |
| clear | 仅在不忙时清空真实 SDK 对话文件，增加 generation；保留测试证据 |
| restart | 停止、等待退出、清空上下文，再提交上一次任务；可指定新 --request |

同一会话只允许一个活跃任务；不同会话可以同时运行。`create --count` 不设全局并发上限，启动多少任务由编码 Agent 根据用户预算与模型服务能力决定。第一次任务绑定真实项目路径，之后不允许用它测试另一项目。

每次 run 都读取新的源码快照、重新构造候选并评分。历史对话只提供背景，不能替代本轮证据。run 不是从中断的测试步骤继续；restart 会重新发起完整流程并产生新费用。会话内容较长、偏离当前任务、发生不完整工具调用时，应 clear 后重开；目前不自动压缩上下文。

状态通常为 idle → starting → running → completed/partial/failed/cancelled。completed 与测试无 bug 不等价，需读取 last_result 的 assessment、未执行项和证据。后台工作进程意外死亡时 inspect 标为 interrupted，可 clear 回收；没有用复用风险较高的 PID 强杀陌生进程。活进程尚未响应取消时 clear/restart 拒绝清理，不假装停止成功。

数据位于 `ASKJEV_HOME/sessions/<id>/`：context 为私密对话，runs 为每轮快照与结果。clear 仅清上下文，不删除源码证据、报告、最后提交的任务或连接配置；它不是彻底的数据擦除命令。原有一次性 `askjev run` 保持独立、无持久对话的行为。

## 持续任务（1.5）

`session campaign --id ID --request TASK --select all --rounds 3 --max-seconds 600 --max-model-turns 60` 提交有限多轮任务，生命周期命令保持一致。每轮独立对话，历史单轮会话不参与 campaign；结果包含各轮与失败复现的证据。restart 不指定新请求时保留上一 campaign 预算。详见 [campaigns.md](campaigns.md)。
