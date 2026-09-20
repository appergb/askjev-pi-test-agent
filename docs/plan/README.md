# Plan 连接资料

本目录整理 Plan 的 SDK 接入方式。公开文档只描述变量和配置结构，不包含实际域名、完整请求地址、API Key 或认证参数。

## 配置分类

| 接入方式 | 公开说明 |
| --- | --- |
| OpenAI-compatible SDK | 使用本地私密资料中的 OpenAI-compatible Base URL |
| Anthropic-compatible SDK | 使用本地私密资料中的 Anthropic-compatible Base URL，并由客户端追加版本路径 |
| Chat Completions | 使用本地私密资料中的完整请求地址 |
| Messages | 使用本地私密资料中的完整请求地址 |
| 认证 | 从环境变量或本机密钥管理器读取，不写入代码和 Git |

## 本地资料

- `docs/plan/connection.local.md`：结构化连接说明和本地变量名。
- `docs/private/source/plan-connection-address.original.md`：原始 Plan 连接地址资料。

这两个文件都被 `.gitignore` 排除。使用前检查密钥是否仍然有效，泄露或怀疑泄露时应立即轮换。
