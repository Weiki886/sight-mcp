# ADR 0001：TypeScript 运行时与 Provider 中立的 stdio 架构

**语言 / Language：** 中文 · [English](0001-runtime-and-architecture.en.md)

- 状态：已接受
- 接受日期：2026-08-28
- 日期：2026-08-28
- 修订：2026-09-01；凭据来源的相关细节已由 [ADR 0002](0002-macos-keychain-provider-profiles.md) 取代
- 决策者：Weiki886
- 相关：[提案 0001](../proposals/0001-sight-mcp-v0.1.0.md)、
  [Issue #1](https://github.com/Weiki886/sight-mcp/issues/1)

## 背景

Sight MCP 需要让 Claude
Code 或 Codex 中的纯文本模型，就一张本地图片向另一个视觉模型提问。首个版本需要具备可预期的安装方式、对当前 MCP 协议的支持、严格的对外契约、安全的图像预处理，以及一条能够独立演进而不影响 MCP 工具的 Provider 边界。

这个实现本质上是 MCP 生命周期、文件系统策略、图像预处理与 HTTP 编排的问题，而不是模型训练或本地推理运行时。

## 决策

### 运行时与语言

使用严格模式的 TypeScript、ESM 模块、pnpm，以及受支持的 Node.js
LTS 版本。包会显式声明并测试 Node 引擎版本下限，而不是默默依赖恰好装在机器上的那个运行时。

使用官方 MCP TypeScript SDK v2 的 server 包。新项目不使用 v1 兼容包。

在外部边界使用 Zod
v4，并在可行时从 schema 推导 TypeScript 类型。不为同一份公开载荷同时维护手写的运行时 schema 和另一套可能与之偏离的 TypeScript 接口。

### 传输层

v0.1.0 仅使用 stdio 作为服务端传输。stdout 专供 MCP 帧使用；诊断信息通过脱敏日志器写入 stderr。

将传输层构造与应用装配分离，使未来的 Streamable
HTTP 适配器可以复用应用层，而不会把 stdio 细节带进领域模块。

### 对外 MCP 接口

暴露一个工具
`analyze_image`。使用封闭的 Zod 输入与输出 schema、对象形态的带版本结构化结果，以及文本回退。

将该工具标记为只读、非破坏性，但**不**标记为幂等，因为重复调用会产生 Provider 费用。标记为 open-world，因为它需要与独立运营的 Provider 通信。

### 内部边界

采用如下自外向内的依赖方向：

```text
stdio entrypoint
  -> MCP tool adapter
    -> AnalyzeImage application service
      -> InputGuard port
      -> ImagePipeline port
      -> VisionProvider port
```

基础设施模块实现各个 port。领域层与应用层模块不导入 MCP、`sharp`、Provider
SDK 或 Node 传输类型。跨边界传递的图像字节使用 `Uint8Array`；取消操作使用平台原生的 `AbortSignal`。

### Provider 策略

定义 Provider 中立的 `VisionProvider` 接口，并实现一个 OpenAI 兼容的 `/chat/completions`
适配器。优先使用平台 HTTP 原语，除非某个 SDK 能带来无法以清晰方式自行实现的兼容性或安全价值。

Provider 的选择只在启动时发生一次。MCP 调用无法选择端点、模型、API 密钥或任意请求头。

### 配置

v0.1.0 使用经过校验的环境变量，加上有文档记录的安全默认值。不从仓库或当前目录隐式加载凭据。显式指定的内置 Provider
profile 可以使用 ADR 0002 定义的操作系统凭据源。必填配置非法时，启动失败并输出脱敏诊断。

### 图像处理

在 `ImagePipeline` 接口之后使用
`sharp`。解码前先完成授权与字节数限制；随后限制解码后的像素与尺寸、归一化方向、移除元数据、只缩小不放大，并编码出有界的 Provider 载荷。

## 影响

### 正面

- 官方 SDK 紧跟当前协议，并提供 stdio 与 output schema 支持。
- npm/`npx` 分发方式契合编码类宿主启动本地 MCP 服务的通行做法。
- TypeScript 与 Zod 让工具、配置、Provider 与错误契约在编译期和运行时都可审查。
- 新增 Provider 适配器无需重命名对外工具。
- 传输、图像、Provider 与 MCP 细节可以独立测试。
- 首个版本对外接口很小，隐私边界清晰。

### 负面

- 需要 Node 与一次包安装；v0.1.0 不是单个原生可执行文件。
- `sharp` 引入原生依赖，并在各受支持平台上带来供应链与打包工作。
- 通用的「纯环境变量」配置在宿主配置文件里会比较冗长；ADR 0002 为内置 profile 补充了显式的 macOS
  Keychain 路径。
- 各家 OpenAI 兼容实现在响应细节上存在差异；适配器必须拒绝不受支持的形态，而不是不断堆积隐式启发式规则。
- stdio 无法服务共享或远程客户端。

### 风险

- MCP v2 的新行为可能在较旧宿主上暴露兼容性差异。对象形态结果与文本回退降低了这一风险。
- Provider 兼容性容易诱使厂商特有字段渗入领域类型。契约测试与适配器边界可以防止这一点。
- 原生解码器扩大了攻击面。必须配合严格限制、依赖审查、最小格式集、测试夹具与及时升级。

## 已否决的备选方案

- Python 核心：更适合留给未来 OCR、OpenCV 或本地模型等确实需要独立运行时的能力。
- 纯 JavaScript：面对数量众多的公开与安全敏感边界，编译期保护不足。
- Go/Rust 核心：在有明确二进制体积/启动时间要求时有价值，但对首个 MCP 兼容版本而言推进更慢。
- MCP SDK v1：属于遗留线，不适合面向当前协议的新项目。
- 在工具处理函数里直接调用 Provider：会把协议代码与厂商耦合，也让确定性测试更困难。
- v0.1.0 提供多个工具：在核心桥接尚未验证前就扩大了 schema 与模型选择行为。
- HTTP 优先：显著扩大认证、授权、网络与运维范围。

## 合规检查

实现类 PR 满足以下条件时即符合本 ADR：

- 依赖方向与文档记录的 ports 一致；
- stdio 入口中不存在业务逻辑或 Provider 转换；
- MCP 输入或输出中不出现任何 Provider 类型；
- stdout 只包含协议流量；
- 所有外部输入与输出都经过运行时校验；
- Provider 与图像实现在测试中可替换；
- 任何偏离都在合并前记录到一份取代性 ADR 中。
