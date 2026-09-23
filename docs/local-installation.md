# 本机入口与安装目录

日常使用只需记住：**`askjev-cli` 做交互测试，`askjev` 做脚本和后台任务；`pi` 是另一套通用助手。** 前两个入口应指向同一份 askJEV 运行库。

## 名称对应什么

| 入口 | 程序与用途 | 与 askJEV 的关系 |
| --- | --- | --- |
| `askjev-cli` | askJEV 交互终端，固定默认模型 | 同一运行库的终端入口 |
| `askjev` | JSON CLI，运行、回归、会话、持续测试 | 同一运行库的脚本入口 |
| `askJEV` / `pi-test-agent` | 兼容旧调用方式 | 别名，不是另外两个 Agent |
| `pi` | `@earendil-works/pi-coding-agent` 通用助手 | 可独立使用；不是运行 askJEV 的必要全局安装 |
| `pi-web` | `@agegr/pi-web` 网页入口 | 单独安装的 Pi 相关应用，不是 askJEV 的网页前端 |

askJEV 包内固定依赖 Pi SDK，这是运行库的一部分。不能仅因目录中有多个 `pi-*` 包就直接删除；删除依赖会导致相应程序无法启动。

## 选择一个 askJEV 安装来源

**源码全局安装**适合直接使用终端：按 [CLI 安装说明](cli.md)安装 tarball，npm 注册 `askjev` 与 `askjev-cli`。源码 checkout 是开发目录，不替代安装后的配置和数据目录。

**Skill 私有安装**适合由编码 Agent 调用：运行安装包的 `scripts/install.mjs`，默认保存到 `~/.local/share/askjev-agent/<version>/`。`~/.codex/skills/askjev-agent/install.json` 记录实际 `prefix`、`entry` 和 `commands`，自定义路径以此回执为准。需要终端命令时，把回执中的两个入口链接到已有 PATH 目录，无需再次全局安装相同应用。

在 macOS 上大小写不敏感的文件系统通常已经让 `askJEV` 指向 `askjev`，不要为它再复制程序。`pi-test-agent` 保留为旧脚本兼容链接即可。

## 哪些目录保留

| 目录 | 内容 | 整理原则 |
| --- | --- | --- |
| `~/.local/share/askjev-agent/<version>/` | 程序和依赖 | 活跃入口统一到选定版本；确认无引用后清理旧运行库 |
| `~/.askjev-agent/` | 私密配置、运行证据、后台会话 | 不随运行库清理；避免丢失凭据与测试证据 |
| `~/.codex/skills/askjev-agent/` | Skill、安装回执、版本匹配脚本 | 与所选运行库保持一致 |
| `~/.pi/agent/` | 原生 Pi 配置、扩展和会话 | 独立保留，不与 askJEV 数据混合 |
| 项目 checkout | 业务源码、测试和公开文档 | 不自动删掉；不是重复的已安装程序 |

整理前核对命令的真实路径、安装回执、正在运行的进程和旧目录中的数据。备份旧版本的安装包及回执后，可移除不再引用的程序副本，再把入口统一到当前安装。不要把用户配置、会话或测试证据放进公开的整理报告。

整理后检查 `askjev --version`、`askjev-cli --version`、帮助输出、符号链接目标和安装回执一致。原生 `pi` 与 `pi-web` 的已运行会话不需要停止。

[完整安装](skill-installation.md) · [框架中的数据布局](framework.md#数据与状态) · [交互命令](cli.md)
