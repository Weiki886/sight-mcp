# v0.1.0 供应链评审

**语言 / Language：** 中文 · [English](supply-chain-review.en.md)

- 评审日期：2026-08-31
- 范围：Issue #6 中的发布准备工作
- 结论：候选自动化流程通过验收；npm 身份已证明，v0.1.0 已于 2026-09-02 发布

## 包边界

- 分发身份只有 `@weiki/sight-mcp`；相关命令绝不会安装无关的无 scope 包 `sight-mcp`。
- 元数据为版本 `0.1.0`、MIT、public 访问、Node.js 22+、精确的仓库 URL，并启用了来源证明。`private`
  字段缺省，因此经批准的发布在技术上可行。
- tarball 白名单只允许 `LICENSE`、`README.md`、脱敏后的 `package.json` 和 `dist/`。
- `dist/cli.js` 必须保留 Node shebang 与可执行权限。
- 外部的 JavaScript/声明文件 source map 会被包含以便诊断，但内嵌的
  `sourcesContent`、TypeScript 源文件、绝对路径和个人路径会被拒绝。
- 干净安装、CLI 发现/调用、SHA-256 清单与 CycloneDX 生成，全部基于同一个 tarball。

## 工作流边界

- 工作流默认权限为 `contents: read`。
- Pull request 从不使用 `pull_request_target`、`workflow_run`、仓库 secret、OIDC 或写权限。
- 只有 `main` 推送触发的证明作业才获得 `id-token: write` 与 `attestations: write`。
- 所有 Action 都固定到经过评审的完整 commit SHA。新增的发布相关 Action 均从其官方仓库解析得到：
  - `pnpm/action-setup` v6.0.10 — `0977fd99725f1db4007ccb2928dbb4e90d06cc86`；
  - `actions/upload-artifact` v7.0.1 — `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`；
  - `actions/download-artifact` v8.0.1 — `3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c`；
  - `actions/attest-build-provenance` v4.2.2 — `4d101475d8b20a2381f78447822ac1eab6504dd8`。
- 候选产物保留 14 天，并以源码 commit 命名。

## 依赖、许可证与漏洞

生产许可证门禁只接受从锁定安装中实际观察到、且已评审的集合：MIT、Apache-2.0、ISC 与 LGPL-3.0-or-later。其中的 LGPL 组件是
`sharp` 使用的平台 libvips 包，它仍是独立依赖而非项目源码。不同平台的 SBOM 可能包含不同的
`@img/sharp-*` 包，因此必须基于实际的候选安装来生成。

`pnpm audit --prod --audit-level high`
是本地与 CI 的必需门禁。SBOM 是漏洞评审的补充而非替代。源码构建的依赖版本由 `pnpm-lock.yaml`
锁定；发布 SBOM 记录的是 tarball 在 npm 干净安装后的实际依赖树。

## 仓库管控与已知缺口

评审时 GitHub 密钥扫描与推送保护已启用。Dependabot 安全更新处于关闭状态，`main`
也没有仓库层面强制的分支保护/规则集。本次交付仍然依靠 PR 评审以及合并前实际观察到的 CI，但维护者应把仓库级必需检查与依赖更新作为一项独立的治理改动启用。这些缺口不构成绕过发布审批清单的理由。

npm registry 对 `@weiki/sight-mcp` 的查询返回 `E404`，但这台工作机未登录 npm，npm 也无法确认对
`@weiki`
的访问权限。因此这里只记录"包名不存在"这一事实；在发布手册中的认证检查通过之前，不接受归属/可发布性的结论。
