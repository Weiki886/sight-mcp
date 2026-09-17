# ADR 0004：移除内置 Provider profiles，改为通用 Provider 配置

**语言 / Language：** 中文 · [English](0004-generic-provider-configuration.en.md)

- 状态：已接受
- 接受日期：2026-09-17
- 日期：2026-09-17
- 决策者：Weiki886
- 相关：[Issue #63](https://github.com/Weiki886/sight-mcp/issues/63)、
  [ADR 0002](0002-macos-keychain-provider-profiles.md)、[配置规范](../specs/configuration.md)、
  [威胁模型](../security/threat-model.md)

## 背景

ADR 0002 引入了两个内置 Provider profiles（`qwen` 与
`deepseek`），把 API 根地址、模型、默认推理强度与 Keychain 账户原子绑定，以简化国内用户的接入。2026 年 9 月，`deepseek-v4-flash-vision-exp`
被上游下线，`deepseek` profile 直接失效。

这暴露了硬编码模型的结构性问题：模型的生命周期由供应商控制，任何一次上线、下线、更名都会产生一次「改代码、发版本」的维护成本，而且用户在模型失效期间没有自救手段。内置模型清单还会随时间失真——文档承诺的「经过审核的固定组合」无法跟上供应商的变化。

## 决策

自 v0.3.0 起，Sight MCP 不再内置任何 Provider 地址或模型，本 ADR 取代 ADR
0002 中的内置 profiles 设计（其 Keychain 存储与交互式凭据命令设计仍然保留）：

1. 端点与模型完全由环境变量决定：`SIGHT_PROVIDER_BASE_URL` 与 `SIGHT_PROVIDER_MODEL`
   均为必填，不再有默认值或内置组合。
2. 移除 `--provider` 参数与 profile 专属环境变量（`SIGHT_QWEN_API_KEY` /
   `SIGHT_DEEPSEEK_API_KEY`）。传入 `--provider` 会以状态码 `2` 退出并输出迁移指引。
3. API 密钥解析顺序固定为：`SIGHT_PROVIDER_API_KEY` →
   `SIGHT_PROVIDER_KEYCHAIN_ACCOUNT`（新增）指定的 macOS
   Keychain 条目。两者都未设置时按无鉴权端点处理；显式指定了 Keychain 账户但条目缺失或查询失败时，启动失败即关闭，不回退。
4. 凭据命令泛化为任意账户名：`credentials set|status|delete <account> [--yes]`。账户名由用户自取（1–64 个字符，限定字符集，经校验后才可用作 Keychain
   account）。Keychain 无法枚举条目，因此 `status` 必须显式给出账户名。Keychain
   service名（`dev.weiki886.sight-mcp.provider-api-key`）保持不变，既有条目继续可用。
5. 文档中的 qwen 配置仅作为示例出现，不构成兼容性承诺。

### 破坏性变更与迁移

这是一次破坏性变更，按配置规范的兼容性策略处理（0.x 阶段提供发布说明与迁移路径）：原 qwen
profile 用户显式设置 `SIGHT_PROVIDER_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1` 与
`SIGHT_PROVIDER_MODEL=qwen3.8-flash` 即可等价迁移；已存在的 `qwen` Keychain条目可通过
`SIGHT_PROVIDER_KEYCHAIN_ACCOUNT=qwen` 继续复用。

## 备选方案

- **仅下线 deepseek、保留 qwen
  profile**：改动最小，但硬编码模型的维护问题依旧存在，下一次上游变动还会重演同样的事故。
- **把 profiles 改为可扩展的内置清单**：内置清单越大，审核与失真问题越严重；与「任意 OpenAI 兼容端点」的既有通用模式相比没有提供新能力。
- **支持配置文件（TOML/YAML）**：引入了新的凭据发现与审计边界，与配置规范「不隐式加载配置文件」的既定决策冲突，需要独立提案。

## 后果

- 上游模型变动不再需要代码变更与发版；用户自行承担端点/模型选择的审核责任，README 与配置规范明确了这一边界。
- 通用性提升：任何 OpenAI 兼容视觉端点（本地或远程）仅凭环境变量即可接入。
- 既有通用模式用户（未使用 profile）完全不受影响；profile 用户需要一次文档化的显式迁移。
- 威胁模型的 CRED 系列控制保持不变：密钥解析顺序固定、Keychain 仅在显式命名账户时读取、失败即关闭、无自动回退。
