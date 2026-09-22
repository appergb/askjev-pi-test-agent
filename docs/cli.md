# 独立 CLI 使用说明

应用名为 **askJEV Agent**，主命令为 `askjev`。安装需要 Node.js ≥22.19；测试执行目前支持 macOS，连接 SSH 时还需要 Python 3 与系统 SSH。已完整验证的 Node 布局为 macOS Homebrew。

## 从源码制作安装包

```bash
npm ci --ignore-scripts
npm test
mkdir -p artifacts/releases
npm pack --ignore-scripts --pack-destination artifacts/releases
npm install -g --ignore-scripts ./artifacts/releases/403-forbidden-askjev-agent-1.4.0.tgz
askjev --version
```

安装包采用文件白名单，包含运行时、Skills、脱敏配置、demo 和锁定依赖清单。私密文件、业务快照、日志及真实连接信息不打包。尚未发布到 npm registry；不要假定可从 registry 直接下载同名包。全局安装路径需对当前用户可写；也可使用 `npm install --prefix <directory> <archive>` 后调用其 `node_modules/.bin/askjev`。

## 配置

```bash
askjev init
# 编辑 ~/.askjev-agent/config.json，设置模型 ID、服务地址和凭据环境变量引用
askjev models
askjev doctor --probe --model flash-direct
```

`init` 默认创建权限为 0600 的配置，遇到已有文件拒绝覆盖。导入已有私密配置：

```bash
askjev init --import-config /absolute/path/to/existing-config.local.json
```

导入的 `auth_file`、SSH socket、私密登录文档相对路径，按被导入配置所在目录转成绝对路径；不会搬运原凭据文件。若已有目标配置，使用 `--config <new-private-file>` 指定另一位置。

运行时配置优先级：`--config` → `ASKJEV_CONFIG` → 兼容变量 `PI_TEST_CONFIG` → `ASKJEV_HOME/config.json` → 源码 checkout 中的旧私密配置。`ASKJEV_HOME` 默认 `~/.askjev-agent`。`init` 的目标由 `--config` 或 `ASKJEV_HOME` 决定，不跟随配置查找环境变量。

模型凭据可引用 `api_key_env`，样例为 `ASKJEV_API_KEY`；也可引用既有 `auth_file` 与 `auth_provider`。普通 `models` 只列出别名；`--probe --model <alias>` 实际请求该模型一次并验证工具调用，未指定时检查 `default_model`，缺省为 `flash-direct`。不会自动探测所有账户或根据单次探针切换模型。

## DGX Spark

配置结构见源码中的 `config/spark.example.json`，所有地址、端口和模型 ID 都是占位值，需要按实际部署填写。服务需已在 Spark 上运行，SSH 主机密钥需已可信。

```bash
askjev connect start --config /absolute/path/to/spark-config.json
askjev connect status --config /absolute/path/to/spark-config.json
askjev doctor --probe --model spark --config /absolute/path/to/spark-config.json
askjev connect stop --config /absolute/path/to/spark-config.json
```

隧道仅绑定本机回环，远端目标也是回环。默认使用 SSH key / agent；既有部署可通过私密 `login_document` 兼容已有登录方式。`connect stop` 关闭所选配置对应的控制连接和转发，会影响正在使用它的任务。命令不启动、重启或部署远端模型。更改转发配置后需重建连接；`status` 成功不代表所有远端服务健康。

## 测试与反馈

```bash
askjev example --directory /absolute/path/to/new-demo
askjev run --request /absolute/path/to/new-demo/task.json --model flash-direct
askjev handoff --from /absolute/path/to/run-directory
askjev regress --from /absolute/path/to/run-directory --project /absolute/path/to/fixed-project
askjev feedback --from /absolute/path/to/run-directory --regression /absolute/path/to/regression-directory
```

`example` 拒绝已有目录并生成使用绝对项目路径的任务。自定义任务格式参见 [配置与任务接口](mvp/configuration.md)；其中 `project` 相对调用时工作目录解析，跨目录使用应写绝对路径。`run` 与 `regress` 可用 `--output <directory>` 指定证据根目录，返回值包含真实输出位置。

修复前需核对断言与需求是否一致。`handoff` 给出本机绝对路径和可从任意目录调用的结构化回归命令，尚不是可移交其他机器的产物包。回归必须复用字节不变的原测试；反馈未全部通过时退出码为 4。

除帮助和版本外 stdout 为单个 JSON，进度写 stderr。退出码：0 成功且无确认缺陷；1 完成且有确认缺陷；2 输入或配置无效；3 运行/健康检查失败；4 未完成或回归未通过；5 取消。SIGINT/SIGTERM 取消当前同步任务，已启动测试任务保存已收集证据；不具备断点续跑能力。

1.3 前端浏览器执行、--select 策略及冻结比较 replay 见 [前端测试](frontend-testing.md)。需要本机 Google Chrome，使用 `askjev doctor --browser` 验证。

1.4 独立技能自动安装与匹配版本调用见 [技能安装](skill-installation.md)，后台会话及清空/重开见 [会话管理](sessions.md)。Skill 的私有安装不会替换全局 CLI，请通过技能 wrapper 或 install.json 中的绝对命令路径使用它。
