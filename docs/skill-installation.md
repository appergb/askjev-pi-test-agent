# 给编码模型的独立技能安装包

**请使用你的 ChatGPT Codex 安装该技能。** 将 `askjev-agent-skill-1.5.0.tar.gz` 交给具有本地文件和终端执行能力的编码 Agent，并要求它解压后执行 `askjev-agent/scripts/install.mjs`。安装脚本完成真正的依赖安装；只读取或复制 SKILL.md 不会自动执行程序。

可以直接对编码 Agent 说：

> 请安装我提供的 askjev-agent 技能包。检查包内 SKILL.md，运行 scripts/install.mjs 安装配套 CLI 和技能；保留已有配置，通过该技能的 scripts/askjev.mjs 验证版本和连接。以后需要测试本项目时，使用此技能管理测试会话、调用 CLI 并读取缺陷证据。不要将模型密钥或云节点连接资料写进仓库。

支持本地安装脚本的 Codex/ChatGPT 编码环境可使用这条流程；其他编码 Agent 可指定自己的 skills 目录。只有聊天能力、没有本地执行工具的界面无法安装本机 CLI。技能发现方式遵循宿主约定，参见 [OpenAI 官方技能说明](https://learn.chatgpt.com/docs/build-skills)。

## 制作安装包

在源码 checkout 中执行：

```bash
npm ci --ignore-scripts
npm run package:skill
```

产物：`artifacts/releases/askjev-agent-skill-1.5.0.tar.gz`。包中包含独立 Skill、安装和调用脚本、使用参考，以及固定版本 CLI 的 npm tarball 和 SHA-256。SHA-256 校验包内文件一致性，不是发布者身份签名。运行时 tarball 使用提交范围之外的明确文件白名单，不包含私密配置、API Key、历史会话或测试产物。

## 安装与第一次使用

```bash
tar -xzf askjev-agent-skill-1.5.0.tar.gz
node askjev-agent/scripts/install.mjs
node ~/.codex/skills/askjev-agent/scripts/askjev.mjs --version
node ~/.codex/skills/askjev-agent/scripts/askjev.mjs doctor --browser
```

若设置了 CODEX_HOME，技能默认安装至其 skills 子目录。可用 `--skills-dir <directory>` 与 `--prefix <directory>` 指定技能及运行时安装位置。未被本安装器管理的已有目录不会被覆盖。

安装器自动安装：

- 固定版本 askJEV Agent CLI 与锁定的 npm 依赖。
- `askjev`、`askJEV`、`pi-test-agent` 三个脚本命令入口，以及 `askjev-cli` 交互终端入口。
- 内置 Agent 运行库、askJEV 评分工具和批准的测试 Skills。
- 编码模型侧 `askjev-agent` Skill 及统一调用脚本。

应用默认安装在 `~/.local/share/askjev-agent/1.5.0`；不更改 shell 配置或替换用户的全局 Pi。Skill 使用绝对路径调用自己的匹配版本，第一次调用时缺少运行时会自动补装。原生 Pi 是底层依赖，askJEV 是运行时工具，不需要另安装一个同名独立产品。

Skill 私有安装与全局 npm 安装选择其一即可。已有私有运行库时，把终端入口链接到现有 PATH 目录，避免再装一份全局副本。`askjev` 与 `askjev-cli` 应指向同一版本；原生 `pi` 和 `pi-web` 独立保留。参见[本机入口与目录整理](local-installation.md)。

技能私有安装的交互入口见 `install.json` 中 `commands.askjev-cli`；需要直接在任意终端输入 `askjev-cli` 时，可把该入口链接至已有 PATH 目录，或按 [CLI 文档](cli.md) 全局安装打包后的应用。界面品牌为 askJEV，模型由应用固定。

前提是已具备 Node.js ≥22.19 与 npm，依赖安装需要网络。本地单元测试执行需要 macOS，浏览器测试需要本机 Chrome。模型与评分连接配置仍由用户提供；安装包不携带服务端点与凭据。已有私密配置可显式引用或导入，新安装执行 init 只创建样例，不代表已连接云端。

## 自动调用与会话

Skill 默认允许宿主按任务自动选择，也可以明确指定 `$askjev-agent`。技能是否自动被选中取决于宿主匹配，不能保证每次聊天都触发。技能指导编码 Agent 调用 wrapper、创建任务、等待后台结果、核对缺陷并回归，而不是要求用户逐条手动运行。

会话命令与边界见 [会话管理](sessions.md)。测试准确率与分数局限见 [前端实验](frontend-testing.md)：自动化执行和证据交接已经有实际价值；低分优先能减少当前执行量，但不足以证明可放心省掉高分测试。
