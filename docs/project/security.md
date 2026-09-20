# 提交前安全规则

## 必须排除

- 精确云节点 IP、hostname、SSH 端口、登录密码和私钥。
- Plan 连接密钥、API Key、Token 和带认证信息的 URL。
- 原始登录表格、原始云节点手册和本地接入资料。
- `.env`、`.mimosa/`、缓存、日志、模型、数据和输出目录。

## 本项目的忽略规则

`.gitignore` 已覆盖 `docs/private/`、所有 `*.local.md`、`.env*`、`.mimosa/` 和原始资料文件。敏感文件即使存在于工作区，也不应使用 `git add -f` 加入提交。

## 提交前检查

```bash
git status --short --ignored
git diff --cached --check
git grep -n -I -E 'BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|api[_-]?key|auth[_-]?token|password|secret|token' -- ':!docs/private/**'
```

如果需要检查 IP 或 Plan 域名，应在提交前按团队约定检查 staged 内容。发现密钥已经进入 Git 历史时，不要只删除当前文件，应立即撤销远端暴露并轮换密钥。
