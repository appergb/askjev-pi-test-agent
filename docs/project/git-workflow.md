# 本地开发与云端 Git 同步

项目采用本地开发、GitHub 保存版本、云端拉取的流程。云端不作为日常编辑副本，避免本地和云端各自产生无法合并的改动。

## 标准流程

### 本地开发

```bash
git checkout -b feature/<short-name>
# 在本地编辑和验证
git status --short
git diff --check
git add <code-and-public-docs>
git commit -m "Describe the change"
git push -u origin feature/<short-name>
```

### 合并到主分支

通过 GitHub Pull Request 合并到 `main`。合并前确认：

- 敏感扫描通过。
- 代码和公开文档不包含云端 IP、端口、密码、Key 或 Token。
- `.gitignore` 和锁文件没有被意外修改。

### 云端同步

云端工作区只执行：

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
```

如果云端工作区出现未提交改动，先停止并记录状态，不要直接覆盖或执行 `reset --hard`。需要在云端修改时，创建分支并推送到同一个 GitHub 远端，再通过 Pull Request 合并。

## 版本一致性检查

```bash
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

两端处于同一分支且两个 commit ID 相同，才视为同步完成。云端运行前先确认工作区干净。

## 不同步的内容

私密资料、模型、数据、日志、输出、缓存和本机工具状态不进入 Git。它们需要单独的受控存储或传输流程。
