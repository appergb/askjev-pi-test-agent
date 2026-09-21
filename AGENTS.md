# 项目协作说明

本项目为 askJEV Pi 测试智能体，当前版本 1.1.0。GitHub 主仓库为 `appergb/askjev-pi-test-agent`（private）。原 `appergb/403-forbidden` 环境文档仓库保留为 `legacy-origin`，不向它推送本项目后续修改。开始任何云节点操作前，先阅读 `docs/README.md`、`docs/agent.md` 和 `docs/cloud-node/README.md`。

本地 Pi 测试智能体 MVP 的入口为根目录 `README.md`、`docs/mvp/plan.md` 和 `docs/mvp/evaluation.md`。默认使用已验证的 Flash 直连生成模型，`askJEV` 通过私密配置连接已有云端 Open JEV；运行证据保存在被忽略的 `artifacts/`。不要把评分当作独立正确率或据高分跳过必测项。Pi 编写与执行业务测试，Codex 修改业务实现后通过 CLI 复用原测试回归。

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
