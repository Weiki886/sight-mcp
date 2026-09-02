# Claude Code 与 Codex Host 冒烟

**语言 / Language：** 中文 · [English](host-smoke.en.md)

- 范围：v0.1.0 候选发布版
- 输入：一个候选 `.tgz`、合成测试素材、本地合成的 OpenAI 兼容端点
- 输出：与候选 SHA-256 绑定的脱敏 JSON 记录

已验收的 v0.1.0 本地候选证据记录在 [smoke-record-v0.1.0-rc.md](smoke-record-v0.1.0-rc.md)。Issue
#16 合并前的实测 profile 证据单独记录在
[profile-smoke-record-2026-09-01.md](profile-smoke-record-2026-09-01.md)。

这套矩阵必须基于打包后的产物运行，绝不能用源码检出目录。辅助脚本会把归档安装到新的临时目录，在运行时创建非个人化素材，启动一个环回 Provider，为每个 Host 提供隔离的 MCP 配置，并丢弃 Host 的原始输出。

```sh
pnpm release:host-smoke -- \
  --host claude-code \
  --archive /absolute/path/to/weiki-sight-mcp-0.1.0.tgz \
  --record /absolute/path/to/claude-code-smoke.json

pnpm release:host-smoke -- \
  --host codex \
  --archive /absolute/path/to/weiki-sight-mcp-0.1.0.tgz \
  --record /absolute/path/to/codex-smoke.json
```

Host 必须已安装且已完成认证。整个过程不使用任何 Provider 密钥。脚本会校验：

| 场景          | 预期结果                                                 |
| ------------- | -------------------------------------------------------- |
| 发现          | Host 从已安装的 tarball 中发现并调用 `analyze_image`     |
| 图表          | 合成 Provider 的回答包含预期的月份/数值                  |
| OCR 风格      | 合成 Provider 的回答包含预期的发票文本                   |
| 拒绝路径      | Tool 返回 `PATH_NOT_ALLOWED`                             |
| Provider 故障 | 本地 HTTP 503 映射为 `PROVIDER_UNAVAILABLE` 且不无限重试 |
| 取消          | 中断 Host 会中止进行中的 Tool/Provider 请求              |

每份记录只包含 Host/版本、Node、操作系统、本地 Provider 分类、摘要、时间戳与通过/失败状态，不得包含凭据、个人路径、图像、原始模型输出、完整提示词、Provider 请求体或 stdout/stderr 抓取内容。把记录附到发布之前，请按此规则复核。

## 实测内置 profile 模式

加上 `--profile qwen|deepseek`
可以针对远端 Provider 校验打包后的 profile 入口。运行器要求其继承的环境中存在
`SIGHT_PROVIDER_API_KEY`，它会创建一张合成图表，并执行一次有界的视觉调用。请通过已授权的终端或密钥管理器提供密钥，绝不要写进运行器参数或提交到仓库的文件里。

```sh
pnpm release:host-smoke -- \
  --host claude-code \
  --archive /absolute/path/to/weiki-sight-mcp-0.1.0.tgz \
  --record /absolute/path/to/claude-qwen-profile.json \
  --profile qwen
```

profile 记录只包含发现/视觉状态与 profile 名称。Host 从运行器进程继承凭据；生成的 MCP 配置与
`--provider`
服务器参数中都不含它。这一实测模式是对确定性本地矩阵的补充而非替代：Provider 故障与取消这两道门禁仍在本地合成端点上执行。

若某个 Host 失败，则保持候选产物不发布，只保留脱敏诊断信息，向前修复，生成新的候选产物，并对两个 Host 重跑完整矩阵。源码级的 MCP 客户端测试不能替代这套矩阵，但它仍然是一道独立的协议回归门禁。
