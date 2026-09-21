# 私密配置与任务接口

配置对象包含 `models`、`scoring` 和可选的 `ssh`。可运行配置仅保存在 `docs/private/`；示例不含真实地址或密钥。连接资料不进入 Git。

首次安装可使用 [agent.example.json](../../config/agent.example.json)，复制到本机忽略目录后填写实际模型 ID、地址和凭据引用。样例字段均为占位，成本字段为零不表示服务免费；按实际供应商资料配置。本机已有配置不要覆盖。

每个 `models.<alias>` 包含：

- `definition`：Pi 模型定义，包括 id、name、api、baseUrl、reasoning、input、cost、contextWindow、maxTokens 和兼容设置 compat。
- 凭据二选一：`api_key_env` 指向环境变量名；或 `auth_file` 指向本机已存在的 Pi auth.json，`auth_provider` 指向其中明确的 API-key 条目。
- 可选 `chat_template_kwargs`：仅用于兼容此字段的自托管模型。已知千问服务可使用 `{"enable_thinking": false}`。

本机已经核实的别名：`flash-direct` 为 DeepSeek Flash 直连，`glm` 为已有 GLM 5.3 直连，`qwen-cloud` 为已有云端千问。`flash` 和 `qwen-flash` 使用已有中转账户，本次其中 Flash 请求返回余额不足，不作为默认通道。密钥无需重新填写或复制到普通配置。

实际连接仅接受 HTTPS 或本地回环 HTTP 隧道。Pi 的个人 settings、扩展和全局 Skills 不会加载。现有账户配置仅被当作明确选择的凭据来源，不继承它的执行权限。

`scoring.baseUrl` 指向本地评分隧道；可选 `apiKey` 仅允许放在本机私密配置中。测试用 `scoring.mode=mock` 和 `scoring.response` 注入固定响应，产物标记为 mock，不能用于真实验收。

`ssh` 仅供连接脚本使用，字段为 host、port、user、control_socket、login_document（可选）、forwards。每个 forward 为 local_port / remote_port，绑定地址固定为回环，不开放公网。host 和端口来自本机云节点资料。主机密钥必须已在 known_hosts 中可信；脚本不跳过主机校验，也不在输出中打印连接身份。

任务格式见 `examples/retry-demo/task.json`：

- schema_version 固定为 1.0；project 相对于调用时工作目录解析。
- files 明确列出允许读取的相对路径；不允许隐藏文件、private、credentials、符号链接或目录穿越。
- requirement_file 必须包含在 files 中；总源码上下文上限 16 KB。
- objective 为本次目标，model 为配置别名，可由 CLI --model 覆盖。
- budget 设置总时长、检查项上限、模型轮次和测试修正次数，均有有限上限。

1.1 新增：budget.min_cases 可要求最低检查项数，避免模型在出错后缩减到单一冒烟测试。原始 .js/.mjs/.cjs 文件均可选入，不需要改名；包的 module type 由快照中的 package.json 与 Node.js 解释规则决定。

可选 baseline 对象包含 framework（node-test 或 uvu）、files 和 entrypoints。files 是只供执行使用的已批准相对文件列表，entrypoints 必须包含在快照中。uvu 使用固定版本的 uvu 0.5.2 和 jiti 2.7.0 兼容原有无扩展名 ESM 导入，不运行上游 npm install/build/pretest 脚本。基线文件进入 snapshot_id，但不发送给生成模型或评分模型。快照文件总量上限 512 KB；模型可见 task.files 仍限制为 16 KB。

Pi 可以通过 readProject 返回的 requirement_refs ID 引用需求。适配层把 ID 解析为原文摘录；引用本身不会被当作新的指令。评分只附上检查项引用的源文件和对应需求摘录，不再附上整份 README、基准表格或 package 脚本。

同一故障可能产生多个失败检查项。statistics.confirmed_findings 统计确认的检查项记录，不等于去重后的独立 bug 数；coding agent 应结合源码与复现证据归并。

输入内容快照来自当前工作区字节，不依赖 Git commit；未提交变化同样进入 snapshot_id。测试从独立副本运行，原业务文件与快照在执行后校验摘要。

结果的 run_status 表示完成程度，assessment 表示发现情况。退出码：0 完成且无确认问题，1 完成且有确认问题，2 输入/配置无效，3 失败/受阻，4 部分完成或结论不完整，5 已取消。

已确认缺陷必须引用实际断言失败与预期来源。修复回归校验保存测试的内容摘要；测试被改动则拒绝复用。回归使用新源码快照，不复用旧评分。
