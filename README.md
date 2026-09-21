# askJEV · Pi 测试智能体

基于 Pi 0.85.1 的测试专用运行时：读取选定源码和需求，通过 `askJEV` 调用评分后端，由 Pi 编写并执行测试，再把可复现缺陷交给 coding agent。coding agent 负责业务修复，原 Pi 测试负责验证修复结果。

**当前版本：1.1.0，工程试用阶段。** 已在真实 GitHub JavaScript 仓库跑通测试、缺陷交接、修复和回归。当前支持 macOS 上明确选定的 `.js` / `.mjs` / `.cjs` 文件，不是任意仓库自动接入的通用测试平台。

[改动记录](CHANGELOG.md) · [真实仓库评估与完成度](docs/mvp/github-evaluation.md) · [配置说明](docs/mvp/configuration.md) · [文档索引](docs/README.md)

## 工作流程

```text
用户 / coding agent → CLI → 原测试基线 → Pi 阅读需求与源码
    → askJEV 云端评分 → Pi 生成测试 → 隔离执行 → 缺陷报告与交接包
    → coding agent 修复独立副本 → 原测试回归 → 结构化反馈
```

生成模型和评分后端独立配置。Pi 负责检查项、测试代码和结果分析；`askJEV` 负责评分协议、认证、校验与错误处理。业务代码不会由测试运行时自动修改。

## 已验证的结果

针对 MIT 许可的 [lukeed/klona](https://github.com/lukeed/klona)，固定提交 `e563341d88f433e74a9b4c3c0372d4ba55d2f79e`：

| 验证项 | 结果 |
| --- | --- |
| 上游四种模式原测试 | 原版和修复版均为 137/137 通过 |
| Pi 专项测试 | 发现 DataView 克隆丢失偏移和长度，影响两个实现位置 |
| 缺陷证据 | 3 条失败记录，归为一类独立缺陷 |
| 修复回归 | 16 组原 Pi 测试全部通过，测试摘要不变 |
| 本项目基础设施测试 | 25/25 通过 |

首次通用测试没有发现该问题，随后明确发起的边界专项测试才定位。评分模型给三个失败检查项都返回最高“满足”分，**目前不能根据高分跳过测试，也未证明评分能提高检出率**。

可提交的摘要见 [验收数据](docs/evidence/klona-1.1.json)，方法和限制见[完整评估](docs/mvp/github-evaluation.md)。原始日志、快照和运行报告留在本机，不随仓库上传。

## 安装与基础验证

需要 macOS、系统自带的 `sandbox-exec`、Git 和 Node.js。包声明 Node.js ≥22.19；本次完整验收使用 macOS / Homebrew Node.js 26.8.1。其他 Node 安装布局尚需验证。Python 3 仅在使用附带 SSH 隧道脚本时需要。

```bash
git clone https://github.com/appergb/askjev-pi-test-agent.git
cd askjev-pi-test-agent
npm ci --ignore-scripts
npm test
```

`npm test` 使用本地测试夹具和明确标记的 Mock，不需要云端凭据。它验证工具运行机制，不替代真实模型联调。

## 连接模型

首次使用可以复制脱敏样例：

```bash
mkdir -p docs/private
cp -n config/agent.example.json docs/private/mvp-config.local.json
chmod 600 docs/private/mvp-config.local.json
```

已有本机私密配置时直接复用，不要用样例覆盖。编辑模型 ID、服务地址和评分地址，并通过环境变量 `PI_TEST_API_KEY` 注入生成模型凭据。样例中的域名、模型 ID 和回环端口仅作占位，不能直接连接现有服务。

也可以显式引用已有 Pi `auth.json` 的 API-key 条目。CLI 支持 `--config <private-config>` 或环境变量 `PI_TEST_CONFIG`，详见[配置说明](docs/mvp/configuration.md)。个人 Pi 全局 Skills、扩展和执行配置不会自动加载。

如果评分服务需要 SSH 隧道，先在私密配置中补充 `ssh` 字段，再执行：

```bash
python3 scripts/cloud-tunnel.py start
node src/cli.mjs doctor
```

已自行建立连接或直接使用回环服务时，只需执行 `doctor`。该命令检查评分就绪和执行环境；模型鉴权与工具调用由实际运行验证。

## 运行 demo 与真实项目

```bash
# 带两个预置缺陷的小 demo
node src/cli.mjs run --request examples/retry-demo/task.json

# 准备固定版本的真实上游源码，不覆盖已有 checkout
node scripts/prepare-github-example.mjs

# 常见行为、边界专项、full 模式分别测试
node src/cli.mjs run --request examples/github-klona/task.json
node src/cli.mjs run --request examples/github-klona/edge-task.json
node src/cli.mjs run --request examples/github-klona/full-task.json
```

示例默认选择配置别名 `flash-direct`。本机也验证过 `glm` 和 `qwen-cloud`，配置后可通过 `--model` 切换。任务文件明确列出允许读取的文件、需求来源、已有基线和预算；模型不会扫描整个仓库。

运行进度写 stderr，stdout 只返回最终 JSON。发现确认缺陷时退出码为 **1**，表示检测完成且发现问题。每轮输出目录由返回对象的 `artifacts.directory` 给出。

## 交给 coding agent 修复

```bash
node src/cli.mjs handoff --from artifacts/<original-run>
node src/cli.mjs regress --from artifacts/<original-run> --project <fixed-checkout>
node src/cli.mjs feedback --from artifacts/<original-run> --regression artifacts/<regression-run>
```

- `coding-handoff.json`：确认缺陷、源码和需求引用、Git/快照身份、Pi 测试路径及摘要、失败证据和回归参数。
- `regress`：对新代码快照执行字节不变的原 Pi 测试，并重新运行配置的原测试基线。
- `coding-feedback.json`：校验运行关联与测试摘要后记录每个缺陷的回归结果。

结果由调用方读取，不会自动推送到任意 coding agent 会话。Codex Skill 位于 [skills/codex/pi-test](skills/codex/pi-test/SKILL.md)，项目内发现入口为 `.agents/skills/pi-test`。

退出码：`0` 完成且无确认问题；`1` 完成且有确认问题；`2` 输入/配置无效；`3` 失败/受阻；`4` 部分完成或结论不完整；`5` 已取消。

## 目录

| 路径 | 用途 |
| --- | --- |
| `src/` | Pi 运行时、评分、快照、基线、执行器、CLI 和反馈协议 |
| `skills/pi/` | 评分、场景构思、测试编写、缺陷分析四个 Skills |
| `skills/codex/` | coding agent 调用测试与修复回归的 Skill |
| `config/` | 可提交的脱敏配置样例 |
| `examples/` | demo、固定 GitHub 任务、修复补丁与上游许可 |
| `tests/` | 不依赖真实模型的基础设施验证 |
| `scripts/` | 仓库准备、连接和模型/评分评估辅助脚本 |
| `docs/` | 需求、配置、验收、完成度和历史环境记录 |
| `deploy/spark/` | 既有云端服务的部署与代理参考；普通使用无需运行 |
| `artifacts/`、`.runtime/`、`docs/private/` | 本机产物、临时状态和私密配置，Git 忽略 |

## 当前边界

- 明确选定的小型 JavaScript 模块；模型上下文上限 16 KB，快照上限 512 KB。
- Pi 生成 node:test 测试；已有基线支持显式配置的 node:test 和 uvu。
- macOS 执行配置限制网络、子进程、业务源文件写入和工作区外的数据读取，不能等同于任意敌意代码的通用沙箱。
- 最低检查项数避免范围缩水，但不证明语义覆盖；多个失败用例仍需按根因去重。
- MCP、其他语言/框架、大仓库、跨平台隔离和可靠评分排序仍待完善。

klona 补丁及相关材料遵循其附带的 [MIT 许可](examples/github-klona/LICENSE.upstream)。当前协作与提交规则见 [项目说明](docs/project/README.md)。
