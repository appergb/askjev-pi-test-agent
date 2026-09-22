# 项目协作与同步

本项目采用本地开发、GitHub 保存版本的流程。代码在本地完成并验证后提交到独立公开仓库；模型服务仍通过私密配置连接。发布源码不等于变更云节点部署。

当前主仓库：[appergb/askjev-pi-test-agent](https://github.com/appergb/askjev-pi-test-agent)，public，默认分支 `main`。本地 `origin` 指向新仓库。原 `appergb/403-forbidden` 保留为 `legacy-origin`；其云端 deploy key 不被假定具备新仓库权限。

## 入口

- [git-workflow.md](git-workflow.md)：本地提交、GitHub 推送和云端同步。
- [security.md](security.md)：敏感信息排除、扫描和提交前检查。
- `../private/README.local.md`：本机私密源资料索引，不提交。

## 版本库边界

提交内容包括代码、脱敏后的公开文档和必要的锁文件。以下内容永不提交：

- 云节点 IP、SSH 端口、用户名密码和私钥。
- Plan API Key、认证 Token、完整连接地址中携带的密钥参数。
- 原始登录信息表、原始云节点手册和第三方接入资料。
- `.env`、本地缓存、运行日志、模型、数据集、结果文件和工具会话状态。
