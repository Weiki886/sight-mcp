# 配置规范

**语言 / Language：** 中文 · [English](configuration.en.md)

- 状态：已接受
- 接受日期：2026-08-28
- 修订：2026-08-31，依据 Issue #14（可选的 Provider 推理强度）
- 修订：2026-09-01，依据 Issue #16（Provider profiles 与 macOS Keychain 凭据）
- 版本：v0.1.0
- 相关：[提案 0001](../proposals/0001-sight-mcp-v0.1.0.md)、
  [ADR 0002](../adr/0002-macos-keychain-provider-profiles.md)

## 来源与优先级

通用的「不带参数」模式有两个来源，按优先级从高到低：

1. 由 MCP 宿主或 shell 显式传入的进程环境变量；
2. 下文记录的、编译进程序的安全默认值。

Sight MCP 不会隐式加载
`.env`、YAML、JSON、TOML、shell 配置文件或仓库中的凭据文件，也不会在当前目录搜索配置。这避免了令人意外的凭据发现行为，并使宿主配置成为可审计的运行时边界。

`--provider qwen|deepseek`
会激活一个内置 profile。该 profile 固定 API 根地址与模型；它不会加载任何通用配置文件。其凭据优先级为：

1. `SIGHT_PROVIDER_API_KEY`；
2. 所选 profile 的 `SIGHT_QWEN_API_KEY` 或 `SIGHT_DEEPSEEK_API_KEY`；
3. 所选 profile 的 macOS Keychain 条目。

只会读取所选 profile 的凭据。凭据缺失时启动失败，且不会尝试改用其它 Provider。其余变量（包括允许根目录与资源限制）仍然来自进程环境与编译默认值。

新增通用配置文件或其它运行时 CLI 覆盖方式，需要一份定义了优先级与密钥处理方式的提案。

## CLI 与内置 profiles

```text
sight-mcp [--provider <qwen|deepseek>]
sight-mcp credentials set <qwen|deepseek>
sight-mcp credentials status [qwen|deepseek]
sight-mcp credentials delete <qwen|deepseek> [--yes]
```

不带参数即以通用环境变量模式启动。未知参数或未知 profile 会在 stdio 传输启动之前以状态码 `2`
退出。凭据管理命令是面向人类的普通 CLI 命令，可以向 stdout 写入状态；而服务端模式依然把 stdout 专门保留给 MCP 帧。

| Profile    | API 根地址                                          | 模型                           | 默认推理强度 |
| ---------- | --------------------------------------------------- | ------------------------------ | ------------ |
| `qwen`     | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.8-flash`                | `low`        |
| `deepseek` | `https://api.deepseek.com`                          | `deepseek-v4-flash-vision-exp` | `low`        |

`SIGHT_PROVIDER_REASONING_EFFORT` 可以覆盖 profile 的默认推理强度。Provider
profile 的 URL 与模型是原子绑定的，在 profile 生效期间不可覆盖。更换 `--provider`
并重启 MCP 宿主是唯一的 Provider 切换方式；不存在自动回退。

## 变量

图像流水线与日志相关变量由 Issue
#3 实现。Provider 的 URL/模型/密钥、Provider 响应、重试与超时相关变量由 Issue
#4 实现。并发与队列相关变量由 Issue #5 在应用服务边界实现。

| 变量                                | 必填/默认值 | 校验与用途                                                                                                  |
| ----------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `SIGHT_PROVIDER_BASE_URL`           | 必填        | 以 API 根结尾的绝对 Provider 基础 URL，例如 `https://provider.example/v1`；不含 userinfo、query 或 fragment |
| `SIGHT_PROVIDER_MODEL`              | 必填        | 非空模型标识，最多 256 个字符                                                                               |
| `SIGHT_PROVIDER_API_KEY`            | 可选        | Bearer 凭据；为空或未设置表示不发送 authorization 头，适用于本地端点                                        |
| `SIGHT_QWEN_API_KEY`                | 可选        | 仅由 `--provider qwen` 使用的 Qwen 凭据，优先级在通用覆盖之后、Keychain 之前                                |
| `SIGHT_DEEPSEEK_API_KEY`            | 可选        | 仅由 `--provider deepseek` 使用的 DeepSeek 凭据，优先级在通用覆盖之后、Keychain 之前                        |
| `SIGHT_PROVIDER_REASONING_EFFORT`   | 可选        | `low`、`medium`、`high`、`xhigh` 或 `max`；未显式配置时不发送                                               |
| `SIGHT_ALLOWED_ROOTS`               | 进程 cwd    | 使用 Node `path.delimiter` 分隔的绝对根目录；每个根在启动时被规范化                                         |
| `SIGHT_REQUEST_TIMEOUT_MS`          | `60000`     | 1000 到 300000 之间的整数；工具调用的整体截止时间，含排队与重试                                             |
| `SIGHT_MAX_IMAGE_BYTES`             | `20971520`  | 1 到 104857600 之间的整数；读取的源文件最大字节数                                                           |
| `SIGHT_MAX_IMAGE_PIXELS`            | `40000000`  | 1 到 100000000 之间的整数；解码后的像素上限                                                                 |
| `SIGHT_MAX_IMAGE_DIMENSION`         | `12000`     | 1 到 32768 之间的整数；解码后的最大宽或高                                                                   |
| `SIGHT_TRANSMIT_MAX_DIMENSION`      | `2048`      | 64 到 `SIGHT_MAX_IMAGE_DIMENSION` 之间的整数；不放大前提下的缩放边界                                        |
| `SIGHT_MAX_TRANSMIT_BYTES`          | `10485760`  | 1024 到 `SIGHT_MAX_IMAGE_BYTES` 之间的整数；发送给 Provider 的归一化图片最大字节数                          |
| `SIGHT_JPEG_QUALITY`                | `85`        | 40 到 95 之间的整数；不透明 JPEG 输出的质量                                                                 |
| `SIGHT_PROVIDER_MAX_TOKENS`         | `4096`      | 1 到 32768 之间的整数；请求 Provider 的答案 token 上限                                                      |
| `SIGHT_MAX_PROVIDER_RESPONSE_BYTES` | `1048576`   | 1024 到 10485760 之间的整数；读取上游响应体的最大字节数                                                     |
| `SIGHT_MAX_OUTPUT_CHARS`            | `32000`     | 256 到 200000 之间的整数；返回答案的最大字符数                                                              |
| `SIGHT_MAX_CONCURRENCY`             | `2`         | 1 到 16 之间的整数；同时进行的分析数                                                                        |
| `SIGHT_MAX_QUEUE_SIZE`              | `8`         | 0 到 128 之间的整数；等待中的调用数；为零表示禁用排队                                                       |
| `SIGHT_LOG_LEVEL`                   | `info`      | `silent`、`error`、`warn`、`info`、`debug` 之一；输出始终为 stderr 且已脱敏                                 |
| `SIGHT_MAX_RETRIES`                 | `2`         | 0 到 5 之间的整数；首次 Provider 尝试之后的重试次数                                                         |

实现必须从同一个带类型的配置模块发布这些生效默认值，并在帮助文本与文档测试中复用它们，以防止漂移。

`SIGHT_PROVIDER_REASONING_EFFORT` 是面向兼容 Provider 的可选扩展字段。未设置时，适配器不发送
`reasoning_effort`，从而保持最小化的 Chat
Completions 请求。运营方必须选择所配置模型支持的取值；Sight
MCP 只校验这个可移植枚举，不推断厂商，也不会静默改写某个 Provider 的模型专属映射。

如果归一化无法在既不丢弃必要的 alpha 信息、也不违反最低 JPEG 质量的前提下，同时满足传输尺寸与传输字节数的要求，调用将以
`IMAGE_TOO_LARGE` 失败。Sight MCP 不会静默发送超限载荷。

## Provider URL 策略

- 非回环主机必须使用 `https`。
- 仅当 URL 主机恰好是 `localhost`、`127.0.0.0/8` 内的 IPv4 回环地址，或 IPv6 回环 `::1`
  时，才接受明文 `http`。
- 内嵌的用户名/密码、查询字符串、fragment、非 HTTP 协议以及非法端口一律拒绝。
- 适配器从规范化后的 API 根构造出唯一的 `/chat/completions`
  路径。若配置本身已包含该操作路径，则予以拒绝，以避免路径拼接歧义。
- HTTP 重定向被禁用。重定向被视为上游故障，而不是一个可以跟随的新目标。
- 配置的目标地址是可信的运营方输入，而非工具调用输入。端点与模型无法按请求更改。

这些规则允许在无 TLS 的情况下使用本地 Ollama、LM
Studio、vLLM 或类似网关，同时防止意外把明文传输到远程主机。

## 允许根目录策略

- `SIGHT_ALLOWED_ROOTS` 为空或未设置时，仅表示服务启动时的 cwd。
- 每个配置的根目录都必须是绝对路径、真实存在、在启动时可规范化解析，并且是一个目录。
- 重复与嵌套的根会被归并为最小等价集合。
- 根目录本身是允许的；目标在经过平台适配的规范化比较后，必须是其子孙节点。
- 在大小写不敏感的平台上，比较遵循平台文件系统语义，而不是调用方提供的字符串大小写。
- 不展开 `~` 之类的主目录简写。宿主配置必须传入绝对路径。
- 文件系统根目录或整个主目录这类过宽的根，只有在显式配置时才被接受；启动时会输出一条脱敏警告，因为这一选择削弱了最小权限。

示例使用占位符而非真实用户路径：

```json
{
  "SIGHT_ALLOWED_ROOTS": "/absolute/project/path:/absolute/image-fixtures"
}
```

在 Windows 上，Node 的平台分隔符是 `;`：

```json
{
  "SIGHT_ALLOWED_ROOTS": "C:\\absolute\\project;D:\\image-fixtures"
}
```

## 启动行为

服务在连接 MCP 传输之前会校验全部配置。必填值缺失、数字非法、根目录非法以及不安全的 Provider
URL，都会导致以非零状态退出，并在 stderr 输出稳定的脱敏诊断。

诊断信息会指出变量名与规则，但绝不回显密钥值。例如，非法的 API 密钥会被报告为
`SIGHT_PROVIDER_API_KEY is invalid`，而不会包含该值本身。

服务不会向 stdout 打印启动横幅。

## 密钥处理

- API 密钥只存在于进程内存与请求的 authorization 头中。
- 配置对象通过一个窄口径的密钥类型暴露敏感值，该类型在日志与序列化辅助函数中会被脱敏。
- 错误与调试日志绝不能序列化 `process.env`、完整配置对象、请求头或 Provider 请求对象。
- 测试使用明显的占位符，并针对有代表性的错误路径验证脱敏效果。
- 在 macOS 上，`credentials set` 通过 `/usr/bin/security`
  与系统交互式密码提示，写入一条精确的 generic-password 条目。service 为
  `dev.weiki886.sight-mcp.provider-api-key`；account 恰好是 `qwen` 与 `deepseek`。
- 交互式配置不会通过进程参数或 shell 传递任何密钥。它要求 stdin 与 stderr 均为终端，宁可失败也不接受通过管道传入的密钥材料。
- 运行时查询最多只捕获校验过的密钥上限长度，丢弃系统诊断信息，并只把值保留在进程内存中。`credentials status`
  只检查条目是否存在，不读取密码。
- `credentials delete` 精确指定一个 profile，且默认会提示确认。显式的非交互式删除需要 `--yes`。
- Keychain 被锁定、不可用或查询失败时，产生一次脱敏的启动失败，而不会回退到另一个 Provider。
- 文档推荐使用 macOS Keychain、由宿主管理的环境变量，或本地 Provider。绝不能推荐把密钥提交到
  `.mcp.json`、`config.toml`、shell 脚本或仓库 `.env` 文件中。

v0.1.0 中 Keychain 存储仅限 macOS。在 Linux 与 Windows 上，profile 可以使用其对应的 profile 专属环境变量或通用覆盖变量。通用的「不带参数」模式保持不变，且从不查询 Keychain。

## 兼容性策略

环境变量名、profile 名称、凭据命令及其优先级都属于公开接口。新增可选变量是向后兼容的。删除、重命名、更改优先级或削弱某个安全默认值，都需要发布说明与迁移路径；1.0 之后还需要主版本号变更。
