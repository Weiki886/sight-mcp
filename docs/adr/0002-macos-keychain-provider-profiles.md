# ADR 0002：macOS Keychain 凭据与固定 Provider profiles

**语言 / Language：** 中文 · [English](0002-macos-keychain-provider-profiles.en.md)

- 状态：已接受
- 接受日期：2026-09-01
- 日期：2026-09-01
- 决策者：Weiki886
- 相关：[Issue #16](https://github.com/Weiki886/sight-mcp/issues/16)、
  [ADR 0001](0001-runtime-and-architecture.md)、[威胁模型](../security/threat-model.md)

## 背景

ADR 0001 有意把进程环境变量作为 Provider 凭据的唯一来源。这条边界可移植、可审计，但会让本地的 Claude
Code 或 Codex 安装变得别扭：用户必须在每次启动宿主前导出密钥，或者把它放进明文的宿主配置或 `.env`
文件里。而仓库里的 `.env` 尤其容易被复制、备份、记录进日志或误提交。

Sight
MCP 有两个有文档记录的远程视觉目标。它们的密钥不可互换，且某个密钥绝不能被悄悄配到另一个 Provider 的端点或模型上。因此，解决方案既需要凭据存储，也需要一个显式的、启动时完成的 Provider 选择。

## 决策

### 固定 profiles

新增
`--provider qwen|deepseek`。选定某个 profile 后，Provider 的 API 根地址、模型与默认推理强度会作为一个经过审核的整体被固定下来：

| Profile    | API 根地址                                          | 模型                           | 推理强度 |
| ---------- | --------------------------------------------------- | ------------------------------ | -------- |
| `qwen`     | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.8-flash`                | `low`    |
| `deepseek` | `https://api.deepseek.com`                          | `deepseek-v4-flash-vision-exp` | `low`    |

工具本身无法选择或更改 profile。切换 profile 需要修改服务启动参数并重启 MCP 宿主。不存在任何自动回退。

选定 profile 后，凭据的优先级为：

1. `SIGHT_PROVIDER_API_KEY`，用于显式的单进程覆盖；
2. 所选 profile 对应的 `SIGHT_QWEN_API_KEY` 或 `SIGHT_DEEPSEEK_API_KEY`；
3. 所选 profile 对应的 macOS Keychain 条目。

只会读取所选 Provider 的专属变量或 Keychain 账户。原有的「不带参数 + 环境变量」配置方式保持向后兼容。`SIGHT_PROVIDER_REASONING_EFFORT`
可以显式覆盖 profile 的默认推理强度；但在 profile 生效期间，固定的端点与模型不可被覆盖。

### 凭据存储

在 macOS 上，每个密钥以 generic-password 条目形式存储：

- service 为 `dev.weiki886.sight-mcp.provider-api-key`；
- account 为 `qwen` 或 `deepseek`。

对外提供以下管理命令：

```text
sight-mcp credentials set qwen|deepseek
sight-mcp credentials status [qwen|deepseek]
sight-mcp credentials delete qwen|deepseek [--yes]
```

使用系统内置的绝对路径可执行文件
`/usr/bin/security`；不调用 shell，也不引入原生凭据依赖。`credentials set`
要求交互式终端，并把仅用于提示输入的 `-w` 选项放在 `add-generic-password`
的最后。密钥直接输入给系统命令：在整个配置过程中，它不会成为 Sight
MCP 的命令行参数、shell 历史记录条目，也不会成为 Node.js 中的字符串。

运行时查询使用精确的 service/account 匹配。子进程不经过 shell，有 15 秒截止时间，只捕获所请求密钥的有界 stdout，丢弃系统 stderr，并把失败映射为脱敏后的应用错误。状态检查绝不请求输出密钥内容。删除操作精确针对单个 service/account，且除非显式加上
`--yes`，否则需要确认。

Keychain 是由 `--provider` 激活的可选来源；Sight
MCP 依然不会在仓库或当前目录中搜索密钥。在非 macOS 系统上，原有的环境变量模式与 profile 专属环境变量仍然可用。Keychain 缺失、锁定或不可用时会失败即关闭，绝不会触发切换到其它凭据或 Provider 的回退。

## 影响

### 正面

- 在 macOS 上，日常启动宿主不再需要明文 API 密钥，也不需要启动前的导出步骤。
- Provider、端点、模型与凭据账户作为一个显式 profile 被整体选定。
- 配置过程避免把密钥留在 shell 历史、进程参数、日志或仓库文件中。
- 实现借助操作系统能力完成，没有引入原生插件或生产依赖包。
- 通用 OpenAI 兼容端点与非 macOS 安装保持既有的环境变量接口。

### 负面

- v0.1.0 中原生安全存储仅限 macOS；其它平台仍需环境变量注入或本地免认证端点。
- 系统可能会依据本地策略，在配置或运行时弹出 Keychain 访问提示。
- 内置 profile 有意做得不如通用模式灵活，且当 Provider 变更其公开端点或模型标识时必须更新。
- 同一用户下被攻陷的进程，仍有可能请求到可访问的 Keychain 条目。

## 已否决的备选方案

- 仓库内或自动加载的
  `.env`：静态存储为明文，容易被复制、备份、记录或提交；按当前目录自动发现的行为也令人意外。
- 把密钥直接写进 `.mcp.json` 或 `config.toml`：会暴露给宿主配置、诊断信息、备份以及意外分享。
- 启动器 shell 脚本：减少了输入量，但把凭据注入与 shell 历史风险留给了用户自行维护的代码。
- 加密的项目文件：应用同样需要存储或获取解密密钥，等于把原来的密钥管理问题重新制造了一遍。
- `keytar` 或其它原生插件：在第二个操作系统后端尚不具备充分理由之前，就先付出打包与供应链成本。
- 自动 Provider 回退：可能把图片泄露给未被选中的运营方，并放大费用。

## 合规检查

实现满足以下条件时即符合本 ADR：

- profile 解析封闭于 `qwen` 与 `deepseek`，非法输入在 MCP 启动前即失败；
- 固定的端点/模型映射与凭据优先级都有直接测试覆盖；
- Keychain 子进程参数使用精确的 service/account 值、`shell: false`、有界输出、有界时长与脱敏失败；
- 交互式配置不包含密钥参数，状态检查不读取密钥输出；
- 删除操作需要确认或 `--yes`，且不能使用通配目标；
- 「不带参数 + 环境变量」配置方式与「stdout 仅协议流量」行为保持兼容；
- 文档包含迁移说明、非 macOS 回退方案与删除指引。
