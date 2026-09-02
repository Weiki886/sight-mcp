# Provider profile 与 macOS Keychain 冒烟记录

**语言 / Language：** 中文 · [English](profile-smoke-record-2026-09-01.en.md)

- 执行时间：2026-09-01（Asia/Shanghai）
- 范围：Issue #16 合并前验证；不是发布候选
- 包：本地打包的 `@weiki/sight-mcp@0.1.0`
- 包 SHA-256：`cc0eba90a68e8a5d4a122af0b0a337a0ce0302aceeb8f2f0c82cad7a5e13ca1a`
- 素材：程序生成的合成图表 PNG；不含个人或仓库图片
- 凭据：用户授权的本地凭据；具体取值与请求体不作记录

## macOS Keychain 边界

真实的 `/usr/bin/security` 适配器在隔离服务 `dev.weiki886.sight-mcp.test.canary-20260901`
下被验证，而非生产服务。一个生成的 35 字节合成哨兵值通过系统隐藏输入提示录入，并按 macOS 要求重复输入一次。

| 操作                                  | 结果 |
| ------------------------------------- | ---- |
| 交互式设置且 argv 中不含密钥          | 通过 |
| 精确账户的状态查询                    | 通过 |
| 有界读取与内存内摘要计算              | 通过 |
| 精确账户的删除                        | 通过 |
| 删除后不存在性 / 清理                 | 通过 |
| 生产环境的 Qwen/DeepSeek 条目未受影响 | 通过 |

哨兵值本身不保留在本记录中。运行过程中比对了它回读的 SHA-256，清理操作同时返回了 `deleted: true` 与
`absent: true`。

## 直接的 MCP profile 验证

构建后的 CLI 通过 stdio 与官方 MCP 客户端启动，并带上新的 profile 参数。两个 Provider 分析了同一张合成图片，图中标题为
`Sight MCP Canary 2048`，数值为 Q1 12、Q2 28、Q3 19，并有三根对应的柱子。

| Profile    | Tool 发现 | 图片调用 | 标题/数值准确 | 最高柱   |
| ---------- | --------- | -------- | ------------- | -------- |
| `qwen`     | 通过      | 通过     | 通过          | Q2，通过 |
| `deepseek` | 通过      | 通过     | 通过          | Q2，通过 |

有一次 DeepSeek 的诊断运行故意把回答 token 上限压到
`1024`，结果在推理输出之后没有返回可接受的最终答案，Sight MCP 正确地报出了
`PROVIDER_RESPONSE_INVALID`。正常预算 `2048` 的运行通过；Host 运行器使用的是
`4096`。响应校验器没有被放宽。

## 真实 Host profile 矩阵

每个 Host 都通过隔离配置安装并运行了同一个本地 tarball 摘要。API 密钥从已授权的运行器环境继承，没有被写入 Host 配置、服务器参数、记录或输出。每个 Host 都发现了
`analyze_image`，执行一次调用，并校验了合成图片的标题、数值与最高柱。

| Host        | Host 版本             | Provider profile | Node.js | 操作系统            | 发现 | 视觉 |
| ----------- | --------------------- | ---------------- | ------- | ------------------- | ---- | ---- |
| Claude Code | 2.1.228 (Claude Code) | `qwen`           | v26.3.1 | Darwin 25.5.0 arm64 | 通过 | 通过 |
| Codex       | codex-cli 0.146.0     | `deepseek`       | v26.3.1 | Darwin 25.5.0 arm64 | 通过 | 通过 |

在运行器获得 profile 参数之后，确定性的本地 Host 矩阵也用同一个摘要在 Claude
Code 与 Codex 上重跑了一遍。发现、图表、OCR 类、拒绝路径、Provider 故障与主动取消场景全部通过，确认不带参数的通用模式与既有 Host 运行器仍然兼容。

脱敏后的机器可读记录属于本地忽略产物。Host 原始输出已丢弃。此处不含任何密钥、个人路径、图像字节、完整提示词、Provider 请求/响应体或临时目录名。

由于产出本记录时源码工作树尚未合并，发布操作者必须基于经过评审的 `main`
commit 重新构建不可变候选产物，重新生成其 SBOM 与来源证明，并在发布前重跑确定性 Host 矩阵与 profile 矩阵。
