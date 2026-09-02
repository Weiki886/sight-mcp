# v0.1.0 发布流程

**语言 / Language：** 中文 · [English](process.en.md)

- 状态：已于 2026-09-02 发布；`v0.1.0` 标签与 GitHub Release 均已完成
- 负责人：仓库维护者
- 相关：[Issue #6](https://github.com/Weiki886/sight-mcp/issues/6)、[v0.1.0 发布说明](v0.1.0.md)、[Host 冒烟流程](host-smoke.md)、[已验收的本地冒烟记录](smoke-record-v0.1.0-rc.md)、[profile 冒烟记录](profile-smoke-record-2026-09-01.md)

本手册把可复现的准备工作与不可逆的 npm 发布、Git 打标签、GitHub
Release 步骤分开。产物通过 Host 冒烟之后，任何发布操作者都不得重新构建 tarball。

## 候选产物构建

CI 的 `release-candidate` 作业在两个受支持 Node 版本的质量作业都通过之后，在 Node.js
22 上运行。它执行：

```sh
pnpm release:candidate -- --output "$RUNNER_TEMP/sight-mcp-candidate"
```

该命令只构建一次、只执行一次
`pnpm pack`，计算 SHA-256，把同一个归档安装到空的临时目录，通过官方 MCP 客户端调用其打包后的 CLI，并生成 npm 产出的 CycloneDX
SBOM。上传的产物只包含：

- `weiki-sight-mcp-0.1.0.tgz`；
- 含源码 commit 与摘要的 `release-manifest.json`；
- 含脱敏场景结果的 `clean-install-smoke.json`；
- `sight-mcp-0.1.0.sbom.cdx.json`。

推送到 `main` 时会下载完全相同的工作流产物，并创建 GitHub 构建来源证明。证明作业是唯一拥有
`id-token: write` 和 `attestations: write` 的作业，且从不在 pull request 上运行。

## 必需的审批证据

发布之前，维护者必须针对同一个摘要核验以下全部内容：

1. CI 质量作业在 Node.js 22 与 24 上均通过。
2. 候选清单中的 `source.commit` 是经过评审的 `main` commit。
3. 本地 SHA-256 与 `artifact.sha256` 一致。
4. `gh attestation verify weiki-sight-mcp-0.1.0.tgz --repo Weiki886/sight-mcp` 成功。
5. CycloneDX SBOM 标识出 `@weiki/sight-mcp@0.1.0` 及其已安装的生产依赖树。
6. 该摘要对应的 Claude Code 与 Codex Host 记录均通过。若候选产物包含 Issue
   #16，还必须有针对该摘要的 Qwen/DeepSeek 实测 profile 记录通过，且不得把凭据放进 Host 配置或命令行参数。
7. `pnpm audit --prod --audit-level high`、生产许可证门禁、包白名单、工作流安全门禁以及仓库密钥扫描均已复核。
8. 在已认证状态下证明 npm 身份与 scope 包归属：

   ```sh
   npm whoami
   npm access list packages @weiki --json
   npm view @weiki/sight-mcp name version --json
   npm publish weiki-sight-mcp-0.1.0.tgz --dry-run --access public
   ```

   首次发布时 registry 查询预期返回 `E404`，但必须由 `npm whoami` 与 scope 权限证明操作者控制
   `@weiki`。仅凭未认证状态下的 `E404` 不构成证据。

9. npm 账号已开启 2FA 或配置了可信发布者。若使用 GitHub 可信发布，公开包与仓库的映射必须完全一致，npm 会据此生成包来源证明。
10. 在复核完以上各项后，由人工显式批准 npm 发布、打标签和 GitHub Release。

2026-08-31 准备阶段时，包在 registry 返回 `E404`，这台工作机未登录 npm，`@weiki`
scope 无法被证明，因此即便候选工程可以合并，发布仍处于阻塞状态。2026-09-02 维护者解决了身份问题并发布了
`@weiki/sight-mcp@0.1.0`，随后完成 `v0.1.0` 标签与 GitHub
Release；scope 归属现已由线上账号签名的包本身证明。

## 批准后的发布顺序

1. 下载已完成证明的 `main` 候选产物；不要重新执行 `pnpm pack`。
2. 重新计算 SHA-256 并核验 GitHub 来源证明。
3. 通过已批准的 npm 身份/可信发布者路径发布这个确切的 `.tgz`。
4. 核验
   `npm view @weiki/sight-mcp@0.1.0 dist.integrity dist.tarball`，并做一次干净的 registry 安装加发现调用。
5. 在清单所指的源码 commit 上创建已签名/已验证的 `v0.1.0` 标签。
6. 基于该标签、使用[已准备好的发布说明](v0.1.0.md)创建 GitHub
   Release，附上完全相同的 tarball、清单、SBOM 和校验说明，然后逐一检查所有公开链接。
7. 只有在 npm、GitHub Release 与发布后冒烟全部成功之后，才关闭 Issue #6 与里程碑。

本项目遵循 npm 的[可信发布指南](https://docs.npmjs.com/trusted-publishers/)以及 GitHub 的[产物证明指南](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)。

## 回滚与向前修复

发布之前，直接否决候选产物，并在经过评审的 commit 上向前修复。发布之后，绝不覆盖或复用 `0.1.0`：

1. 停止推广受影响产物并记录影响范围；
2. 仅在维护者明确批准的前提下执行 `npm deprecate @weiki/sight-mcp@0.1.0 "<简明原因与安全版本>"`；
3. 准备一个经过评审的补丁版本，带上新的摘要、SBOM、证明以及两个 Host 的记录；
4. 发布补丁版本，并按需更新 GitHub 安全公告/发布说明。

删除 Git 标签或 GitHub Release 并不会移除 npm 上的产物，也不算回滚。
