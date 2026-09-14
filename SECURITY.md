# 安全政策

**语言 / Language：** 中文 · [English](SECURITY.en.md)

## 报告漏洞

请通过 GitHub 私密漏洞报告提交安全问题：
[Report a vulnerability](https://github.com/Weiki886/sight-mcp/security/advisories/new)

请不要在公开 Issue、Pull Request 或讨论区披露尚未修复的安全问题。

报告请尽量包含：

- 受影响的版本与运行环境（MCP 宿主、操作系统、Node.js 版本）；
- 复现步骤或概念验证；
- 潜在影响与攻击面评估。

## 安全敏感范围

本项目读取本地图片并发送到用户配置的视觉模型 Provider，以下区域属于安全敏感：

- 路径授权边界：`SIGHT_ALLOWED_ROOTS`、客户端工作区根目录、会话内授权缓存与符号链接防护；
- 凭据保护：macOS Keychain、环境变量，以及日志与错误输出中的 API Key 脱敏；
- 剪贴板内容的授权读取与临时文件清理；
- Provider 请求与响应中的隐私数据（图片像素与提示词）；
- 供应链：`sharp` 原生依赖、GitHub Actions 与 npm 发布链。

## 支持的版本

仅最新发布版本获得安全修复。npm 版本不可变，安全修复会以新的补丁或次版本发布，不会覆盖已发布版本。

## 响应说明

本项目由个人维护，不提供 SLA。维护者会尽力在 7 天内确认收到报告，并在评估严重度之后给出修复或缓解计划。

## 相关文档

- [威胁模型](docs/security/threat-model.md)
- [发布流程](docs/release/process.md)
