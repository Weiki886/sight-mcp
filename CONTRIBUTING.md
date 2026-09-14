# 贡献指南

**语言 / Language：** 中文 · [English](CONTRIBUTING.en.md)

欢迎贡献。本项目由个人维护，流程从简，但以下约定需要遵守。

## 先建 Issue

任何改动先开 Issue，说明背景、目标与验收标准，获得确认后再动手。安全漏洞请走[安全政策](SECURITY.md)中的私密渠道，不要开公开 Issue。

## 开发环境

- Node.js 22 或更高版本；
- pnpm（版本见 `package.json` 的 `packageManager` 字段）；
- 使用 `pnpm install --frozen-lockfile` 安装依赖。

## 分支与提交

- 分支命名：`<type>/<issue>-<slug>`（英文），例如 `feat/42-clipboard-support`；
- 提交信息：英文 Conventional Commits，例如 `feat(mcp): add clipboard tool`；
- 短生命周期分支，合并后即删除。

## 提交前门禁

提交前必须通过完整质量门禁：

```sh
pnpm run ci
```

它涵盖格式、ESLint、类型检查、单元/契约/安全测试、构建、stdio 集成测试、打包内容检查、生产依赖审计、许可证与工作流安全检查。

## 双语文档

`docs/` 与根级公开文档中英成对维护：中文为主文档（`*.md`），英文使用 `.en.md`
后缀，标题下保留语种切换行。`pnpm run docs:check` 会校验切换链接、同语种闭环与死链。

## 安全边界

- 不提交任何凭据、API Key 或本地私有配置（例如 `.env`、个人 `AGENTS.md`）；
- 日志、错误信息与测试中不得出现真实密钥、真实用户图片或未脱敏的敏感数据；
- 涉及路径授权、凭据或 Provider 传输的改动，请在 PR 中明确标注风险。

## Pull Request

- 标题使用英文，正文按模板填写：问题、风险、改动、验证证据、兼容性、回滚；
- 关联 Issue（`Closes #n`），范围与 Issue 保持一致；
- CI 全绿之后由维护者合并。
