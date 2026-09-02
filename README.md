<div align="center">

# Sight MCP

**让只会读文字的 Agent 拥有视觉能力。** 一个安全的 Model Context
Protocol（MCP）视觉桥接服务，为 Claude Code、Codex 以及任何 stdio
MCP 宿主增加图像识别能力——同时不会把无限制的文件读取能力交给模型。

[![npm version](https://img.shields.io/npm/v/@weiki/sight-mcp)](https://www.npmjs.com/package/@weiki/sight-mcp)
[![npm monthly downloads](https://img.shields.io/npm/dm/@weiki/sight-mcp)](https://www.npmjs.com/package/@weiki/sight-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/node/v/@weiki/sight-mcp)](https://nodejs.org/)
[![CI](https://github.com/Weiki886/sight-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Weiki886/sight-mcp/actions/workflows/ci.yml)

**语言 / Language：** [中文](README.md) · [English](README.en.md)

**目录：** [快速开始](#快速开始) · [特性](#特性) · [安装](#安装) · [模型配置](#模型配置) ·
[Claude Code](#claude-code-配置) · [Codex](#codex-配置) · [工具](#工具) · [配置项](#配置项) ·
[隐私](#隐私与数据流向) · [错误码](#错误码) · [排错](#排错) · [开发](#开发) · [文档](#设计文档)

</div>

---

Sight MCP 提供两个只读图像工具：`analyze_image` 用于读取已授权的本地 PNG、JPEG 或 WebP 文件，
`analyze_clipboard_image`
用于读取 macOS 系统剪切板中已经过一键确认的图片。服务会校验路径、移除元数据、在内存中对图像做边界限制与尺寸归一化，然后把像素与问题发送到你指定的某个 OpenAI 兼容视觉端点。它绝不会把无限制的文件读取器交给大模型。

## 快速开始

```sh
# 1. 一次性保存你的 Provider 密钥（macOS Keychain；交互式输入，不会进入 shell 历史）
npx -y @weiki/sight-mcp@0.1.0 credentials set qwen

# 2. 在你的宿主中注册服务并选择 Provider（见下方配置片段）。

# 3. 让模型分析一张图片：
#    analyze_image(path="/absolute/path/to/image.png", prompt="总结一下这张截图")
```

然后重启宿主，运行 `/mcp` 确认两个工具都已出现。在 macOS 上，你也可以先把图片复制到剪切板，再调用
`analyze_clipboard_image(prompt)`，无需提供路径。

## 特性

- **只读设计** —— 仅两个职责单一的窄口径工具，不会把任意文件读取、shell 或网络访问能力交给模型。
- **安全的文件访问** —— 读取前基于 `SIGHT_ALLOWED_ROOTS`
  做绝对路径校验、路径规范化，并对符号链接边界进行检查。
- **工作区外一次性授权（macOS）** —— 当 `analyze_image` 的绝对路径位于 `SIGHT_ALLOWED_ROOTS`
  之外时，会弹出一个一次性原生确认框，允许后才读取；拒绝则返回 `PATH_ACCESS_DENIED`。
- **纯内存处理** —— `analyze_image`
  不产生任何临时副本；图片在发送前于内存中移除元数据、校正方向、不做放大只做缩小。
- **一键读取剪切板（macOS）** —— `analyze_clipboard_image`
  会请求一次显式的原生授权，并在所有退出路径中删除临时中转文件。
- **内置国内模型** —— `--provider qwen`（Qwen 3.8 Flash）与 `--provider deepseek` （DeepSeek V4
  Flash Vision Exp），各自对应一组经过审核的固定端点 + 模型。
- **Keychain 优先凭据** ——
  macOS 上把密钥存在宿主配置与 shell 历史之外；在 Linux、Windows 和 CI 上仍可通过环境变量保持可移植。
- **失败即关闭、可观测**
  —— 不会静默切换 Provider/端点，不跟随重定向，日志为脱敏的结构化输出，并返回不会泄露路径、密钥或原始响应的稳定错误码。
- **面向生产的交付** ——
  TypeScript + 严格 lint/typecheck，单元/契约/安全/集成测试，包内容与许可证审计，以及 npm
  provenance 证明。

## 安装

- Node.js 22 或更高版本
- 一个支持视觉模型的 OpenAI 兼容端点（本地或远程均可）
- macOS 用于原生 Keychain 存储；基于环境变量的配置在其它平台也可用

v0.1.0 发布后，宿主应运行固定版本的 scoped 包：

```sh
npx -y @weiki/sight-mcp@0.1.0
```

无关的未加 scope 的 `sight-mcp` 包不是本项目。在做 release-candidate 测试时，请安装并使用生成的
`.tgz`，而不要替换成别的包名。

## 模型配置

把每个远程 Provider 的密钥在 macOS
Keychain 中保存一次。系统命令会直接以交互方式索要密钥，因此密钥不会出现在命令、shell 历史、MCP 宿主配置或仓库的
`.env` 文件中：

```sh
npx -y @weiki/sight-mcp@0.1.0 credentials set qwen
npx -y @weiki/sight-mcp@0.1.0 credentials set deepseek
npx -y @weiki/sight-mcp@0.1.0 credentials status
```

只配置你真正使用的 Provider。`credentials status [qwen|deepseek]` 会报告 `configured` 或
`missing`，但不会读取已存储的密码。要删除某个条目，运行
`credentials delete qwen|deepseek`；除非显式加上 `--yes`，否则删除前会要求确认。

用 `--provider qwen` 或 `--provider deepseek`
启动服务。该 profile 绑定了经过审核的 API 根地址、模型、默认推理强度，以及对应的 Keychain 账户。切换参数并重启宿主即可切换 Provider；Sight
MCP 永远不会自动回退。

## Claude Code 配置

Claude Code 支持在 local、project、user 三种作用域下运行本地 stdio 服务。项目级配置是项目根目录下的
`.mcp.json`。在 macOS 上，推荐的 profile 配置里不含任何 API 密钥：

```json
{
  "mcpServers": {
    "sight-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@weiki/sight-mcp@0.1.0", "--provider", "qwen"],
      "env": {
        "SIGHT_ALLOWED_ROOTS": "/absolute/path/to/allowed/images"
      }
    }
  }
}
```

要注册一个 user 作用域的私有条目，把同一个 server 对象传给
`claude mcp add-json --scope user sight-mcp '<json>'`。可用 `claude mcp get sight-mcp`、
`claude mcp list` 或 `/mcp` 验证。当前的作用域与 CLI 行为请参阅
[官方 Claude Code MCP 文档](https://code.claude.com/docs/en/mcp)。

## Codex 配置

Codex 从 `~/.codex/config.toml` 读取用户配置；可信项目也可以改用
`.codex/config.toml`。在 macOS 上，在 `args` 中选择 profile，并把凭据留在 Keychain 中：

```toml
[mcp_servers.sight-mcp]
command = "npx"
args = ["-y", "@weiki/sight-mcp@0.1.0", "--provider", "qwen"]
startup_timeout_sec = 20
tool_timeout_sec = 70

[mcp_servers.sight-mcp.env]
SIGHT_ALLOWED_ROOTS = "/absolute/path/to/allowed/images"
```

用 `codex mcp list` 验证服务发现，用 Codex 内的 `/mcp` 检查连接。工具超时有意略长于 Sight
MCP 默认的 60 秒内部截止时间。当前的用户/项目配置行为请参阅
[官方 Codex MCP 文档](https://developers.openai.com/codex/mcp)。

## 工具

```text
analyze_image(path, prompt)
analyze_clipboard_image(prompt)   (仅 macOS)
```

- `path` 必须是绝对路径。位于 `SIGHT_ALLOWED_ROOTS`
  之内的路径会被直接读取；在 macOS 上，位于工作区之外的路径会先弹出一个一次性原生授权框，允许后才读取。用户直接粘贴的图片请改用
  `analyze_clipboard_image`。
- `prompt` 是一个非空问题，最多 8,000 个字符。
- `analyze_clipboard_image`
  在弹出一个原生的一键确认对话框后读取系统剪切板当前图片。它不接受路径，因此 `SIGHT_ALLOWED_ROOTS`
  不适用，宿主也无法改变其来源。在非 macOS 系统上它会直接返回
  `CLIPBOARD_UNAVAILABLE`，而不会调用辅助程序。
- 成功时返回可读文本以及结构化的媒体/Provider 元数据。
- 失败时设置 MCP
  `isError: true`，并返回一个稳定错误码，而不会包含路径、prompt、密钥、端点、图片字节、Provider 原始响应体或堆栈。
- 图片中的文本与 Provider 的输出始终被视为不可信数据；宿主不得把它当作指令执行。

## 配置项

| 变量                                | 默认值       | 用途                                                     |
| ----------------------------------- | ------------ | -------------------------------------------------------- |
| `SIGHT_ALLOWED_ROOTS`               | 服务启动目录 | 允许用于图像使用的、以平台分隔符连接的绝对目录           |
| `SIGHT_MAX_IMAGE_BYTES`             | `20971520`   | 读取的源文件最大字节数                                   |
| `SIGHT_MAX_IMAGE_PIXELS`            | `40000000`   | 解码后的最大像素数                                       |
| `SIGHT_MAX_IMAGE_DIMENSION`         | `12000`      | 解码后的最大宽或高                                       |
| `SIGHT_TRANSMIT_MAX_DIMENSION`      | `2048`       | 不放大前提下的归一化最大宽或高                           |
| `SIGHT_MAX_TRANSMIT_BYTES`          | `10485760`   | 归一化后的最大图片字节数                                 |
| `SIGHT_JPEG_QUALITY`                | `85`         | 不透明 JPEG 质量，范围 40 到 95                          |
| `SIGHT_PROVIDER_BASE_URL`           | required*    | Provider API 根地址；远程用 HTTPS，本机回环可用精确 HTTP |
| `SIGHT_PROVIDER_MODEL`              | required*    | 配置的视觉模型标识                                       |
| `SIGHT_PROVIDER_API_KEY`            | 未设置       | 可选的 Bearer 凭据，从宿主继承                           |
| `SIGHT_QWEN_API_KEY`                | 未设置       | 可选的 `--provider qwen` 环境凭据                        |
| `SIGHT_DEEPSEEK_API_KEY`            | 未设置       | 可选的 `--provider deepseek` 环境凭据                    |
| `SIGHT_PROVIDER_REASONING_EFFORT`   | 未设置       | 可选 `low`、`medium`、`high`、`xhigh` 或 `max`           |
| `SIGHT_REQUEST_TIMEOUT_MS`          | `60000`      | 工具整体截止时间，含排队与 Provider 重试                 |
| `SIGHT_PROVIDER_MAX_TOKENS`         | `4096`       | Provider 回答 token 数上限请求                           |
| `SIGHT_MAX_PROVIDER_RESPONSE_BYTES` | `1048576`    | Provider 响应最大字节数                                  |
| `SIGHT_MAX_OUTPUT_CHARS`            | `32000`      | 返回答案的最大字符数                                     |
| `SIGHT_MAX_CONCURRENCY`             | `2`          | 最多同时进行的分析数                                     |
| `SIGHT_MAX_QUEUE_SIZE`              | `8`          | 最多排队等待的分析数；设为 0 禁用排队                    |
| `SIGHT_MAX_RETRIES`                 | `2`          | 首次符合条件的 Provider 尝试之后的重试次数               |
| `SIGHT_LOG_LEVEL`                   | `info`       | `silent`、`error`、`warn`、`info` 或 `debug`             |

允许的根目录必须已经存在，并在启动时进行规范化。macOS 与 Linux 上多个根目录用 `:` 分隔，Windows上用
`;`。避免使用整个 home 目录这类过于宽泛的根目录。PNG、JPEG、WebP 依据内容而不是文件扩展名识别。动图或不受支持的格式会被拒绝。图片会被校正方向、移除元数据、不做放大地缩放，并在不透明时编码为 JPEG、需要透明时编码为 PNG。

`*` `SIGHT_PROVIDER_BASE_URL` 与 `SIGHT_PROVIDER_MODEL` 仅在通用无参数模式下才必需。内置的
`--provider` profile 会把两者作为一组固定参数提供。

### 推荐的国内视觉模型

使用 Qwen 3.8 Flash profile 作为首选 Provider：

```text
--provider qwen
```

使用 DeepSeek V4 Flash Vision Exp 作为手动指定的备选：

```text
--provider deepseek
```

这两个 profile 分别使用 `https://dashscope.aliyuncs.com/compatible-mode/v1` + `qwen3.8-flash`，以及
`https://api.deepseek.com` + `deepseek-v4-flash-vision-exp`；两者默认推理强度均为
`low`。macOS 上优先使用 Keychain。在 Linux、Windows、CI，或只是想做一次性临时覆盖时，可以在宿主进程环境中设置
`SIGHT_QWEN_API_KEY`、`SIGHT_DEEPSEEK_API_KEY`，或更高优先级的通用
`SIGHT_PROVIDER_API_KEY`。绝不要把真实密钥粘贴到被跟踪的
`.mcp.json`、`config.toml`、`.env`、shell 脚本、Issue 或日志中。

无参数的通用模式仍可用于本地或其它 OpenAI 兼容端点：

```text
SIGHT_PROVIDER_BASE_URL=http://127.0.0.1:11434/v1
SIGHT_PROVIDER_MODEL=your-vision-model
SIGHT_PROVIDER_API_KEY=optional-for-local-endpoints
```

### 从 `.env` 或宿主托管的明文迁移

1. 在交互式终端运行 `credentials set qwen` 和/或 `credentials set deepseek`。
2. 用 `credentials status` 确认要保留的条目。
3. 在宿主的服务参数中加入 `--provider qwen` 或 `--provider deepseek`。
4. 从宿主条目中移除 API 密钥与通用 Provider URL/模型，然后重启宿主。
5. 在确认工具被发现、且一次合成图片调用成功后，安全删除你能控制的
   `.env`、shell 脚本、剪切板管理器和配置备份中的旧明文副本。

在 Keychain 启动被验证之前，不要删除旧的副本。如果需要回滚，移除 `--provider`
并恢复原先仅靠环境变量的配置。

## 隐私与数据流向

| Provider 位置   | 离开 Sight MCP 进程的数据                         |
| --------------- | ------------------------------------------------- |
| 精确回环地址    | 归一化后的可见像素与 prompt 仍留在本机            |
| 远程 HTTPS 端点 | 归一化后的可见像素与 prompt 会被发送给该 Provider |

Provider 请求中不会发送文件路径、源文件名、元数据、凭据以及 Provider 原始响应。可见的图片内容本身仍可能包含敏感信息。对于远程 Provider，其数据保留、训练、访问、司法管辖、费用与删除策略由运营者自行负责。

`analyze_clipboard_image`
会把剪切板图片暂存到一个用户私有的临时文件（`~/Library/Caches/Sight MCP/inbox`，权限
`0700`），只保留到读取完成，之后在每条退出路径中删除它。剪切板本身永远不会被修改，临时路径与字节也永远不会被记录或返回。

Sight MCP 从不跟随重定向，也从不静默切换端点。它只对连接失败以及 HTTP
408、429、502、503、504 进行重试，并受整体截止时间与配置的重试上限约束。宿主的取消操作会传递到排队任务以及 Provider 请求。运行日志是 stderr 上的脱敏结构化 JSON；stdout 仅用于 MCP 协议流量。

## 错误码

| 类别           | 错误码                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 输入/路径/文件 | `INVALID_INPUT`、`PATH_ACCESS_DENIED`、`PATH_NOT_ABSOLUTE`、`PATH_NOT_ALLOWED`、`FILE_NOT_FOUND`、`FILE_NOT_REGULAR`、`FILE_TOO_LARGE`          |
| 剪切板         | `CLIPBOARD_ACCESS_DENIED`、`CLIPBOARD_NO_IMAGE`、`CLIPBOARD_READ_FAILED`、`CLIPBOARD_UNAVAILABLE`                                               |
| 图像           | `UNSUPPORTED_MEDIA`、`IMAGE_TOO_LARGE`、`IMAGE_DECODE_FAILED`                                                                                   |
| 容量/生命周期  | `QUEUE_FULL`、`CANCELLED`、`INTERNAL_ERROR`                                                                                                     |
| Provider/输出  | `PROVIDER_AUTHENTICATION`、`PROVIDER_RATE_LIMITED`、`PROVIDER_TIMEOUT`、`PROVIDER_UNAVAILABLE`、`PROVIDER_RESPONSE_INVALID`、`OUTPUT_TOO_LARGE` |

只有 `QUEUE_FULL`、`PROVIDER_RATE_LIMITED`、`PROVIDER_TIMEOUT`、`PROVIDER_UNAVAILABLE`
会被标记为可重试。服务本身已经执行了配置好的有界 Provider 重试；宿主应避免立即进行无上限的重试循环。

## 排错

- **服务未连接：** 运行宿主的 MCP 列表/获取命令。确认 Node 22+、scoped 包名，以及合法的 `--provider`
  profile 或两个通用 Provider 变量。
- **profile 凭据缺失：** 运行 `credentials status qwen|deepseek`，然后在交互式 macOS 终端运行
  `credentials set qwen|deepseek`。在其它操作系统上，注入所选 profile 的环境变量。
- **Keychain 查询失败：** 解锁登录钥匙串后重试。Sight MCP 会失败即关闭，不会切换 Provider 或凭据。
- **启动立即退出：**
  允许的根目录必须是已存在的绝对目录；非回环的 HTTP 端点会被拒绝，必须使用 HTTPS。
- **`PATH_NOT_ALLOWED`：**
  传入一个位于窄口径允许根目录之下的规范化绝对路径。符号链接无法绕过该边界。
- **`PATH_ACCESS_DENIED`：** macOS 上弹出的授权框被拒绝或取消。重试该工具，并在弹出时选择允许。
- **`CLIPBOARD_ACCESS_DENIED`：** 确认对话框被取消或拒绝。重试该工具，并在弹出时选择允许。
- **`CLIPBOARD_NO_IMAGE`：** 先把 PNG、JPEG 或 WebP 图片复制到剪切板，然后重试。
- **`CLIPBOARD_UNAVAILABLE`：** v0.1.0 中剪切板读取仅限 macOS。在其它平台上改用 `analyze_image`
  读取已保存的文件。
- **没有出现剪切板确认框或返回 `CLIPBOARD_READ_FAILED`：**
  确认辅助功能权限（系统设置 → 隐私与安全性 → 自动化）允许宿主控制系统对话框，然后重试。
- **`PROVIDER_AUTHENTICATION`：**
  替换所选 Keychain 条目或导出的环境密钥。绝不要把它加入任何被跟踪的配置文件。
- **`PROVIDER_TIMEOUT` 或 `PROVIDER_UNAVAILABLE`：** 确认模型支持图片，且配置的 API 根地址没有以
  `/chat/completions` 结尾。
- **协议解析/启动错误：** stdout 必须保持不被占用。通过 `claude --debug mcp`、Claude `/mcp`
  面板或 Codex 日志检查服务 stderr。
- **原生 `sharp` 安装失败：**
  确认 Node/操作系统/架构组合受支持，并从干净目录重新安装，而不要跨平台复制 `node_modules`。

## 开发

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run ci
pnpm release:candidate -- --output artifacts/release-candidate
```

`release-candidate`
命令只构建并打包一次，记录 SHA-256 与源码 commit，把同一个 tarball 安装到一个空的临时目录，跑通 discovery/图表/OCR 风格/拒绝路径/Provider 失败/取消等场景，并用
`npm sbom` 生成 CycloneDX SBOM。CI 会把这些文件作为一个 artifact 上传；`main` 分支的运行还会为精确的
`.tgz` 生成 GitHub 构建 provenance。

更多发布证据与手动宿主矩阵见 [v0.1.0 发布 runbook](docs/release/process.md)。正式的 npm 发布、Git
tag 与 GitHub Release 仍是单独的人工批准步骤。

## 贡献

欢迎提交 issue 与 pull
request。除很小的修复外，请先开一个 issue，以便在写代码前就范围与设计达成一致。

## 设计文档

- [v0.1.0 提案与完整规范](docs/proposals/0001-sight-mcp-v0.1.0.md)
- [运行时与架构 ADR](docs/adr/0001-runtime-and-architecture.md)
- [macOS Keychain 与 Provider profiles ADR](docs/adr/0002-macos-keychain-provider-profiles.md)
- [一键剪切板图片读取 ADR](docs/adr/0003-clipboard-image-reading.md)
- [视觉工具与 Provider 契约](docs/specs/vision-tool-contract.md)
- [配置规范](docs/specs/configuration.md)
- [威胁模型](docs/security/threat-model.md)
- [OpenAI 兼容 Provider](docs/providers/openai-compatible.md)
- [测试与交付策略](docs/testing/strategy.md)
- [v0.1.0 发布说明](docs/release/v0.1.0.md)

## 许可证

[MIT](LICENSE)
