# v0.1.0 候选发布版冒烟记录

**语言 / Language：** 中文 · [English](smoke-record-v0.1.0-rc.en.md)

- 执行时间：2026-08-31（Asia/Shanghai）
- 包：`@weiki/sight-mcp@0.1.0`
- 候选实现 commit：`621d42418b8b584e3067f2def30f73397b248ca6`
- 候选文件：`weiki-sight-mcp-0.1.0.tgz`
- SHA-256：`fdbf97569c73803eb55aaaeeb1765e181c1cf4f8c66829bae66e709cb436d8e5`
- Provider：本地合成的 OpenAI 兼容端点；不使用任何 Provider 凭据
- 素材：程序生成的合成 PNG；不含个人或仓库图片

## 自动化干净安装记录

作为权威依据的 CI 候选产物在 Node.js v22.23.2、Linux
x64 上构建，并被安装到一个空的临时 npm 项目中。官方 MCP 客户端连接到打包后的可执行文件，stdout 被成功解析为 MCP 流量。

| 场景                   | 结果 |
| ---------------------- | ---- |
| 干净安装 / 可执行      | 通过 |
| Tool 发现              | 通过 |
| 图表类调用             | 通过 |
| OCR 类调用             | 通过 |
| 拒绝路径               | 通过 |
| Provider 故障映射      | 通过 |
| 主动取消               | 通过 |
| 取消之后再次调用       | 通过 |
| stderr 路径/提示词脱敏 | 通过 |

同一次运行用 `npm sbom` 生成了 `sight-mcp-0.1.0.sbom.cdx.json`，并把候选摘要与源码 commit 记录到
`release-manifest.json`。

## 真实 Host 矩阵

两个 Host 都安装并启动了同一个候选摘要，各自使用隔离的配置和相同的本地合成 Provider 行为。

| Host        | Host 版本             | Node.js | 操作系统            | 发现 | 图表 | OCR 类 | 拒绝路径 | Provider 故障 | 取消 |
| ----------- | --------------------- | ------- | ------------------- | ---- | ---- | ------ | -------- | ------------- | ---- |
| Claude Code | 2.1.228 (Claude Code) | v26.3.1 | Darwin 25.5.0 arm64 | 通过 | 通过 | 通过   | 通过     | 通过          | 通过 |
| Codex       | codex-cli 0.146.0     | v26.3.1 | Darwin 25.5.0 arm64 | 通过 | 通过 | 通过   | 通过     | 通过          | 通过 |

取消场景中，运行器只在合成 Provider 观察到进行中的请求之后才中断 Host，随后核实该 Host 关闭了对应的 Provider 响应。Host 的原始输出已被丢弃。

本记录有意排除凭据、个人路径、素材字节、原始图像/模型输出、完整提示词、Provider 请求体、stdout/stderr 抓取内容以及临时目录名。正式的 npm 发布、打标签与 GitHub
Release 尚未执行。
