# 项目协作说明

本项目为 askJEV Agent（优化过的 Agent 框架），当前版本 1.5.0。GitHub 主仓库为 `appergb/askjev-pi-test-agent`（public）。原 `appergb/403-forbidden` 环境文档仓库保留为 `legacy-origin`，不向它推送本项目后续修改。开始任何云节点操作前，先阅读 `docs/README.md`、`docs/agent.md` 和 `docs/cloud-node/README.md`。

独立 CLI 与框架说明见 `docs/cli.md`、`docs/framework.md`；排查能力缺口见 `docs/diagnostic-roadmap.md`。本地测试智能体 MVP 的入口为根目录 `README.md`、`docs/mvp/plan.md` 和 `docs/mvp/evaluation.md`。默认使用已验证的 Flash 直连生成模型，`askJEV` 通过私密配置连接已有云端 Open JEV；新版运行证据默认保存在 `~/.askjev-agent/runs/`，历史证据保存在被忽略的 `artifacts/`。不要把评分当作用户操作概率或独立正确率。默认 all 执行全部候选；用户显式设置 lowest/highest/range 时，仅执行选中的候选，未测项不能记为通过。Pi 编写与执行业务测试，Codex 修改业务实现后通过 CLI 复用原测试回归。

1.1 真实 GitHub 仓库验证与当前完成度见 `docs/mvp/github-evaluation.md`。通过 `handoff` 读取缺陷交接，修复后用 `regress` 和 `feedback` 记录闭环；不要把多个失败用例重复计为独立缺陷。上游源码保留在本机 `artifacts/github/` 的固定提交，修复在独立副本完成。

## 工作边界

- 云节点文档记录历史环境与部署状态；测试能力和当前完成度以本地运行记录、验收摘要及对应评估文档为准。
- 未经明确要求，不安装、卸载或升级云节点软件，不修改系统级配置，不重启节点，不启动公网服务。
- 不修改云节点上已有的 `minimax-h3-dgx-spark`、`sage22_build` 等目录。
- 不把密码、令牌或其他凭据写入普通文档、代码、日志或公开仓库。
- 云节点的精确标识、IP、端口和凭据只允许从本地私密文档读取，不写入公开代码或 Git 历史。

## 文档入口

- `docs/README.md`：文档索引和当前状态。
- `docs/agent.md`：节点详细信息、能力边界和操作约定。
- `docs/cloud-node/`：云节点登录资料、访问手册、环境快照和包清单。
- `docs/plan/`：Plan 连接地址和脱敏接入说明。
- `docs/project/`：本地开发、GitHub、云端同步和敏感信息排除规则。
- `docs/private/`：原始表格、手册和 Plan 连接资料，仅保存在本机。

1.3 支持本地静态前端的 Chrome 功能测试与分数组合选测，见 `docs/frontend-testing.md`。`replay` 使用冻结快照比较同一批测试；`regress` 对新代码执行全部已保存测试，不复用评分。浏览器接入不代表支持生产网站或后端 API。

1.4 独立编码技能包见 `docs/skill-installation.md`，持久会话管理见 `docs/sessions.md`。Skill 源码位于 `skills/codex/askjev-agent`。会话清空删除对话上下文但保留测试证据，后台任务必须等待状态及实际结果，不能把 session run 提交成功当作测试通过。

评分选测目标设计见 `docs/architecture/scoring-selection-v2.md` 与配套 SVG，NVIDIA 技术使用见 `docs/architecture/nvidia-stack.md`。这些是后续设计，不代表 1.4 已实现 hybrid/校准/独立复核。模型权重训练不得与部署及推理参数调优混称。

当前框架图见 `docs/architecture/framework.svg`。2026-09-23 重写的评分设计区分当前单批单轮支持度评分与目标的用户最少/最多操作问答、最短成功路径、少见路径扩展和双轮评估；这些新流程仅为文档设计，未改 1.5 运行时。`min_cases/max_cases` 不等于操作步数，评分不等于用户行为频率。安装入口关系见 `docs/local-installation.md`。

1.5 持续任务见 `docs/campaigns.md`：campaign / session campaign 在总预算内分轮测试，默认 all，每轮独立对话，失败用原测试重现。scoring_failure=all 只允许 all 策略；strict 仍是默认。测试指纹与需求引用仅用于停滞/覆盖提示，不能作为根因去重或完整覆盖证明。质量诊断和故障降级已实现，hybrid/独立复核/校准未实现。

交互终端入口为 `askjev-cli`，实现位于 `src/terminal.mjs` 与 `src/terminal-agent.mjs`，使用 Pi 终端组件并复用现有测试流程。交互界面固定使用私密配置默认模型，不提供模型菜单、切换快捷键或任务级模型覆盖；脚本入口 `askjev` 的模型选项保持原行为。终端对话仅在当前进程保留，测试证据持久保存；使用与安装见 `docs/cli.md`。
