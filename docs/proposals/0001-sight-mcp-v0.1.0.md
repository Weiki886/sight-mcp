# 提案 0001：Sight MCP v0.1.0

**语言 / Language：** 中文 · [English](0001-sight-mcp-v0.1.0.en.md)

- 状态：已接受
- 接受日期：2026-08-28
- 撰写日期：2026-08-28
- 负责人：Weiki886
- 跟踪：[Issue #1](https://github.com/Weiki886/sight-mcp/issues/1)
- 里程碑：[`v0.1.0 — MVP`](https://github.com/Weiki886/sight-mcp/milestone/1)

## 用户与场景

核心用户在 Claude Code、Codex 或其他 MCP
Host 中运行纯文本模型。当任务涉及截图、示意图、图表、扫描件或其他图片时，Host 模型自身无法查看像素。

Sight MCP 提供一条收窄的桥接：

1. Host 模型带上本地路径与问题调用 `analyze_image`。
2. Sight MCP 对该文件做授权与校验。
3. Sight MCP 在资源限额内对图片做归一化。
4. 配置好的视觉 Provider 分析这张图片。
5. Sight MCP 把可读文本与结构化结果返回给纯文本模型。

视觉端点由用户自行选择与运维。Sight MCP 不包含模型，也不训练或托管模型。

## 问题与价值

已有的视觉 MCP 服务器验证了这种桥接范式，但通常只在其中一个目标上做优化：实现体积小、媒体支持广、Provider 灵活，或者安全性好。Sight
MCP 应当吸收这些有用的部分，同时不继承不安全的默认值，也不做过于臃肿的首个版本。

v0.1.0 的价值在于：提供一条可靠、可评审的路径，把本地图片变成与 Provider 无关的文本结果，且在 Claude
Code 与 Codex 中表现一致。

## 来自相关项目的参考

设计参考了以下公开项目：

- [Winterfellwen/vision-mcp](https://github.com/Winterfellwen/vision-mcp)：图像归一化、限流、有界重试、排队、对比以及 OpenAI 兼容 API。
- [joshsssn/mcp-vision-server](https://github.com/joshsssn/mcp-vision-server)：小巧的 stdio 桥接，以及对 Ollama、LM
  Studio、vLLM 和远端 OpenAI 兼容端点的直接支持。
- [xiaoshengwpp/mcp-server-vision](https://github.com/xiaoshengwpp/mcp-server-vision)：Provider 抽象、允许路径、更丰富的图像/视频能力、严格类型以及成文的安全姿态。
- [look4yo/claudecode-vision-mcp](https://github.com/look4yo/claudecode-vision-mcp)：清晰演示了纯文本模型使用视觉工具的前后对比。

Sight
MCP 会采纳桥接、预处理、本地 Provider、重试与显式路径策略这些思路，不会采纳隐式代理、任意 URL 输入、无节制的功能膨胀、从当前工作目录加载明文凭据，以及默认使用全局单请求队列这些做法。

## 选定方案

基于官方 MCP TypeScript SDK v2 与 Zod v4，构建一个 TypeScript、ESM、以 stdio 为先的 MCP 服务器。

首个版本只对外暴露一个公开工具 `analyze_image`，只支持一种 Provider 类型
`openai-compatible`。Provider 实现位于中立接口之后，因此后续新增 Provider 不会改动工具契约。

受支持的输入是位于授权根目录之下的本地绝对路径。URL 输入、原始 base64 输入、多图对比、OCR 专用工具与视频都被有意排除，直到它们的用户价值与安全边界得到验证。

## 已考虑的备选方案

### Python 内核

Python 拥有优秀的 Pillow、OpenCV、OCR 与本地模型生态。没有选它是因为 v0.1.0 是一个协议与 HTTP 桥接项目，而不是模型运行时项目。要求用户具备 Python 环境也会让在编码 Host 中的安装变得不可预期。未来若某些能力确有需要，仍可增加可选的 Python 边车进程。

### 纯 JavaScript

纯 JavaScript 能减少初期的编译器配置。被否决的原因是：工具 schema、配置、Provider 结果与稳定的错误联合类型都是公开边界，编译期检查对它们很有价值。

### Go 或 Rust

两者都能产出紧凑的二进制并提供更强的运行时保证。首个版本没有选它们，是因为官方 TypeScript
SDK 是通向当前 MCP 特性、Host 示例与 npm 分发的最短路径。如果启动速度、体积或单二进制分发成为可度量的约束，它们仍是有效的备选。

### v0.1.0 提供多个工具

分开的 `describe_image`、`extract_text`、`compare_images`
工具容易理解，但会重复输入、安全与 Provider 行为。一个由提示词驱动的工具足以验证这条桥接。只有当评测显示工具选择或输出质量确有改善时，才应加入专用工具。

### HTTP 优先的服务器

Streamable
HTTP 适合共享的远端部署，但它会引入认证、授权、Origin/Host 校验、服务运维与网络暴露面，这些对本地编码 Host 的 MVP 来说并不必要。应用内核保持与传输无关，因此 HTTP 可以在后续提案中引入。

## v0.1.0 范围

### 包含

- 在受支持的 Node.js LTS 版本上运行的 TypeScript 严格模式 ESM 项目。
- 官方 `@modelcontextprotocol/server` v2 包与 stdio 传输。
- 一个 `analyze_image` 工具，提供带版本的结构化结果与文本兜底。
- 按规范化允许根目录授权的本地绝对路径。
- 通过 `sharp` 解码 PNG、JPEG、WebP。
- 方向归一化、元数据移除、有界缩放，以及区分不透明/带 alpha 的编码。
- 一个 OpenAI 兼容的 `/chat/completions` 视觉 Provider。
- 基于环境变量的配置，带校验与密钥脱敏。
- 取消、截止时间、有界并发、有界排队与瞬时错误重试策略。
- 单元测试、Provider 契约测试、MCP 集成测试、打包验证与真实 Host 冒烟测试计划。
- npm 包与 `npx` 执行路径。

### 排除

- 内置模型推理或模型下载。
- URL、data URL、原始 base64、stdin 图像字节、目录、通配符与压缩包。
- GIF、SVG、PDF、HEIC、TIFF、RAW 格式、视频、音频或多图调用。
- 按工具调用逐次选择 Provider、故障转移、负载均衡，或回退到另一个端点。
- Anthropic 原生、Gemini 原生或其他厂商专有适配器。
- SSE、旧版 SSE 或 Streamable HTTP 服务端传输。
- GUI 自动化、由服务器抓取截图、OCR 引擎、图像生成或图像编辑。
- 持久缓存、会话记忆、遥测、分析或后台守护进程。
- 超出运行时标准网络行为的企业代理配置。

### 分发名称约束

无 scope 的 npm 名称 `sight-mcp` 已被占用（2026-08-28 观察到版本为
`1.0.4`）。脚手架 Issue 必须先选定并验证一个可发布的 scoped 包名，之后才能把包元数据视为公开信息。在该决定被记录之前，文档中使用包名占位符；GitHub 项目名与产品名仍为 Sight
MCP。

## 架构

```text
Claude Code / Codex
        |
        | MCP over stdio
        v
Transport entrypoint
        |
        v
analyze_image tool adapter
        |
        v
AnalyzeImage service
   |           |             |
   v           v             v
InputGuard  ImagePipeline  VisionProvider
   |           |             |
   v           v             v
filesystem    sharp       HTTPS / loopback HTTP
```

依赖方向向内。MCP 类型止步于工具适配器；厂商响应类型止步于 Provider 适配器；文件系统与 `sharp`
的细节止步于各自的适配器。应用服务只协调带类型的领域输入与结果。

请求生命周期如下：

1. Zod 校验 MCP 参数。
2. `InputGuard`
   要求绝对路径，解析其规范化目标，确认位于允许根目录内，打开常规文件，并施加流式字节上限。
3. `ImagePipeline`
   执行有界解码，拒绝不支持的格式与超出像素/尺寸限额的输入，归一化方向，剥离元数据，只缩小不放大，并对不透明图片输出 JPEG、对需要 alpha 的图片输出 PNG。尺寸与传输字节都有上界。
4. `VisionProvider` 带上 `AbortSignal`，把提示词与 data
   URL 发送到配置好的端点，不跟随重定向，限制响应体大小，并做脱敏的错误映射。
5. 工具返回一个带版本的对象。其可读文本会明确标注图像/Provider 内容为不可信，且绝不返回本地路径、源字节、base64 数据、凭据、请求头或上游原始响应体。
6. 所有诊断信息走 stderr。stdout 只保留给 MCP 协议流。

## 公开契约

规范性的工具、输出、错误、Provider 接口、取消与兼容性规则见[视觉工具契约](../specs/vision-tool-contract.md)。

规范性的环境变量、默认值、URL 策略与校验规则见[配置规范](../specs/configuration.md)。

## 安全与隐私

图片本身、无关的本地文件、Provider 凭据以及返回的分析结果都是受保护资产。把图片发送给远端 Provider 是一次有意的信息披露，必须在文档与配置中清晰可见。

实现必须满足[威胁模型](../security/threat-model.md)中的各项控制，包括规范化路径授权、symlink 处理、有界解码、基于内容的格式识别、拒绝重定向、密钥脱敏、提示注入处理、依赖评审与协议流完整性。

v0.1.0 运行时是本地单用户的开发者工具，不是多租户沙箱，也不防御那些已经拥有同一操作系统账号、并能持续篡改授权文件的攻击者。残留的本地 TOCTOU 限制必须被记录，并通过在同一个有界文件句柄生命周期内打开并读取已解析文件来尽量降低。

## 质量与交付

[测试与交付策略](../testing/strategy.md)定义了：

- 覆盖每个外部边界与安全决策的单元测试；
- 不依赖付费端点的确定性 Provider 契约测试；
- 拉起子进程的 stdio MCP 集成测试套件；
- 基于打包 tarball 的打包验证；
- 在当前版本 Claude Code 与 Codex 中的人工发布冒烟测试；
- CI 权限、第三方 Action 固定、依赖评审与产物证据要求。

在基线数据出现之前不设定覆盖率数值门槛。安全关键模块中缺失的分支覆盖会阻塞发布，与总体百分比无关。

## 兼容性与版本管理

工具名、输入 schema、输出 schema、稳定错误码、CLI 参数与环境变量键都是公开接口。v0.x 阶段只有在提供发布说明与迁移指引时才可变更它们。1.0 之后，不兼容变更需要发布主版本。

结构化结果包含
`schemaVersion: "1"`。较旧的 MCP 客户端仍会收到文本内容块。即便当前 MCP 规范允许其他 JSON 值，v0.1.0 的结构化结果仍保持为对象，以兼容较旧的 Host。

## 可观测性与运维

服务器是本地、短生命周期的。它向 stderr 输出结构化且脱敏的诊断信息，包含 request
ID、阶段、耗时、结果、稳定错误码、重试次数与排队时长，不记录完整文件路径、提示词、图像数据、凭据、Authorization 请求头或 Provider 响应体。

没有任何遥测数据离开本机。未来若有遥测提案，必须是选择加入的，并经过独立评审。

## 交付切片

实现应按依赖顺序拆成小的 Issue 推进：

1. [#2：TypeScript/MCP 项目脚手架与 CI 基础](https://github.com/Weiki886/sight-mcp/issues/2)。
2. [#3：本地图片的安全授权与预处理](https://github.com/Weiki886/sight-mcp/issues/3)。
3. [#4：OpenAI 兼容 Provider 适配器与韧性策略](https://github.com/Weiki886/sight-mcp/issues/4)。
4. [#5：`analyze_image` 应用服务与 MCP 工具集成](https://github.com/Weiki886/sight-mcp/issues/5)。
5. [#6：Claude Code/Codex 兼容性、打包、文档与 v0.1.0 发布就绪](https://github.com/Weiki886/sight-mcp/issues/6)。

## 验收标准

- [ ] 评审者能把每一项范围内行为追溯到某条规范性契约或配置规则。
- [ ] 工具契约具备封闭的输入 schema、带版本的成功/错误输出、稳定的错误分类、取消与超时语义。
- [ ] Provider 可被替换，无需引入 MCP 类型，也不改动公开工具 schema。
- [ ] 威胁模型覆盖文件系统、解码器、网络、Provider、提示注入、日志、成本、依赖与 stdout 完整性风险。
- [ ] 测试矩阵覆盖单元、契约、集成、打包以及两个目标 Host。
- [ ] 每个交付切片在 v0.1.0 里程碑中都有可独立验证的关联 Issue。
- [ ] 在运行时实现开始之前，提案获得明确的人工接受记录。

## 风险与验证计划

| 假设或风险                       | 验证方式                                                             | 退出或调整条件                                              |
| -------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| 单个提示词驱动的工具能被可靠选中 | 在 Claude Code 与 Codex 中运行同一组图片-问题素材                    | 只有在反复出现选择或提示失败时才加入专用工具                |
| OpenAI 兼容 API 覆盖首批用户     | 对代表性响应形态做契约测试；发布前手动测试一个本地端点与一个远端端点 | 当兼容性补丁会把厂商行为泄漏进工具契约时，另行提案新适配器  |
| `sharp` 提供足够安全的有界预处理 | 测试字节数、像素、尺寸、畸形输入、alpha、方向与取消行为              | 若无法在昂贵分配之前施加限额，则替换或隔离解码              |
| 仅用环境变量配置是可用的         | 在 macOS、Linux 与 Windows 语法下验证项目级与用户级 Host 示例        | 只有当环境变量方式确实难以管理时才引入配置文件              |
| 存在清晰可用的 npm 分发身份      | 在接受脚手架元数据之前，验证某个 scoped 包名的归属与可发布性         | 记录命名决定或改用其他 scope；绝不覆盖无关的 `sight-mcp` 包 |
| 文本加结构化输出在各 Host 中可用 | 拉起 SDK 客户端并运行当前的 Host 冒烟测试                            | 保留文本兜底；结构化字段只通过带版本的 schema 演进来修改    |

## 决策与安全影响

- ADR：必需，见 [ADR 0001](../adr/0001-runtime-and-architecture.md)。
- 威胁模型：必需，见 [v0.1.0 威胁模型](../security/threat-model.md)。
- 接受后的运行时风险：高，因为实现会读取本地文件、处理密钥、调用外部服务并发布 MCP 工具契约。
- 提案本身的变更风险：低；本文档不改变任何运行时行为，可被回退或取代。

## 参考资料

- [MCP TypeScript SDK v2 包指引](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/get-started/packages.md)
- [MCP 2026-07-28 工具规范](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP 2026-07-28 传输规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
- [Claude Code MCP 文档](https://code.claude.com/docs/en/mcp)
- [Codex MCP 文档](https://developers.openai.com/codex/mcp)
