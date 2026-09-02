# OpenAI 兼容视觉 Provider

**语言 / Language：** 中文 · [English](openai-compatible.en.md)

- 状态：已实现，并由 Issue #5 接入对外的 `analyze_image` MCP Tool
- 适配器名称：`openai-compatible`
- 调用地址：`{SIGHT_PROVIDER_BASE_URL}/chat/completions`
- 传输格式：归一化后的 JPEG 或 PNG data URL
- 内置 profile：`qwen`、`deepseek`（Issue #16）

## 兼容性约定

适配器只使用 OpenAI、Ollama、LM Studio、vLLM 等网关普遍支持的 Chat
Completions 视觉能力最小交集。请求中包含配置好的模型、一条以安全为导向的 system 消息、一段 user 文本、一个
`image_url` data URL 以及 `max_tokens`。响应侧只接受非空的 `choices[0].message.content`
字符串，或有文档依据的文本分片数组。

当设置了 `SIGHT_PROVIDER_REASONING_EFFORT` 时，适配器会把校验后的值作为顶层 `reasoning_effort`
字段一并发送；未设置时该字段被省略，使既有 Provider 看到的仍是原始的最小请求。模型专属的 effort 映射仍由 Provider 自行负责。

这一做法遵循 OpenAI 官方的
[Create chat completion API 参考](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)，其中明确了文本/图片形式的 user
content，以及 `image_url` 中的 base64 图片数据。Sight
MCP 刻意不使用厂商专有的响应字段，也不引入 OpenAI SDK，以保持领域端口的独立性。

## 目标地址策略

- 远端主机必须使用 HTTPS。
- 只有精确的 `localhost`、IPv4 `127.0.0.0/8` 或 IPv6 `::1` 目标才允许明文 HTTP。
- userinfo、query、fragment、非 HTTP 协议、编码过的路径分隔符，以及本身已包含 `/chat/completions`
  的 base URL，都会在启动阶段被拒绝。
- 调用地址、模型、密钥、请求头、超时和重试策略只来自校验过的进程配置，Tool 调用无法覆盖它们。
- 重定向会被转换成脱敏的 Provider 失败，永远不跟随。
- 不存在兜底端点、Provider 自动切换、代理探测，也不接受由模型或工具输入提供的 URL。

## 内置 profile 与实测目标

内置 profile 与实测目标如下：

| Profile    | 角色     | Base URL                                            | 模型                           | 默认 effort |
| ---------- | -------- | --------------------------------------------------- | ------------------------------ | ----------- |
| `qwen`     | 主选     | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.8-flash`                | `low`       |
| `deepseek` | 手动备选 | `https://api.deepseek.com`                          | `deepseek-v4-flash-vision-exp` | `low`       |

在 macOS 上，`--provider` 会在文档所述的环境变量覆盖之后读取对应的 Keychain 账户。在其他平台上请使用
`SIGHT_QWEN_API_KEY` 或 `SIGHT_DEEPSEEK_API_KEY`；通用的 `SIGHT_PROVIDER_API_KEY`
是优先级最高的显式覆盖项。切换 Provider 是一次显式的重启参数变更。出错后 Sight
MCP 绝不会把图片再发给第二个 Provider。DeepSeek 目标属于实验性质，在发布验证矩阵通过之前不应被当作稳定的兼容性保证。

## 边界与重试

适配器会在 UTF-8/JSON 解析之前，按配置的字节上限流式读取响应。回答按 Unicode 码点边界截断。总体截止时间覆盖所有尝试、响应读取、解析和退避等待。

只有连接失败以及 HTTP
408、429、502、503、504 会重试。指数抖动、`Retry-After`、总尝试次数、单次延迟和剩余截止时间都有上界。重定向、认证失败、其他 4xx/5xx 响应、格式错误的响应、取消操作以及本地限额失败都不重试。

## 隐私与日志

精确指向环回地址的端点会把 Provider 请求留在本机，具体仍取决于本地 Provider 自身的存储行为。任何其他端点都会把归一化后的可见像素和提示词传输给该远端运营方。元数据在进入本适配器之前已被移除，但可见的图像内容本身仍可能包含敏感信息。

API 密钥被包裹在脱敏的配置包装内，只会被加入 Authorization 请求头。日志中包含生成的 request
ID、稳定的阶段/结果字段、尝试次数、延迟和耗时，绝不包含端点、模型、密钥、请求头、提示词、data
URL、原始响应体或堆栈。Provider 返回的原始错误和 request ID 既不被信任也不会向外透传。
