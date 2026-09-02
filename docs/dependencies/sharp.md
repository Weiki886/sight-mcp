# Sharp 依赖评审

**语言 / Language：** 中文 · [English](sharp.en.md)

- 包名：`sharp`
- 评审版本：0.35.4
- 运行期职责：在内存中解码并归一化白名单内的 PNG、JPEG、WebP 图像字节
- 直接许可证：Apache-2.0
- 原生组件：预编译的 libvips 二进制及其传递依赖库，平台相关的许可义务以上游发行说明为准
- 评审日期：2026-08-30
- 相关威胁：[威胁模型](../security/threat-model.md)中的 `IMG-04`

## 决策

接受 Sharp
0.35.4 作为生产环境的直接依赖。它提供了显式的输入像素/通道上限、遇警告即失败的解码策略、方向归一化、有界缩放、在不保留元数据时默认剥离元数据，以及确定性的 JPEG/PNG 重编码。若在本仓库中自行实现并维护等价的原生编解码器，安全与可移植性负担会更重。

进入 Sharp 之前，输入会先按文件签名白名单限定为 PNG、JPEG 或 WebP，且解码出的格式必须与签名一致。SVG、GIF、TIFF、PDF、HEIF、原始像素、文件系统路径、URL 以及多页输入都不被图像流水线边界接受。Sharp 收到的是有界的内存字节，并配合
`failOn: "warning"`、像素/通道上限、`unlimited: false`、顺序读取和单页请求。进程级的 Sharp 操作缓存被禁用。每张通过的图片都会被重新编码，源元数据不会保留。

## 安全与维护

项目 lockfile 固定了已安装的依赖图，而 `package.json`
允许兼容的补丁/次要版本更新以便 CI 复核。生产依赖审计是 `pnpm run ci`
的一部分。Sharp 公布的安全策略只支持最新发布线。安全公告 GHSA-f88m-g3jw-g9cj 影响 0.35.0 之前的版本，在本次评审的 0.35.4 线上已修复。

原生解码本身仍是攻击面，并且在当前原生操作返回之前会持续占用 CPU。Sharp 或其内置 libvips 的安全更新必须按高优先级依赖评审处理。CI 与发布测试需要覆盖 Node
22+、受支持的目标操作系统、畸形输入、包安装流程以及生产审计输出。

## 升级与回滚

升级前需评审发行说明、许可证变更、安全公告、受支持平台、原生二进制来源，以及元数据、方向、限额和输出编码等行为。随后重新生成 lockfile 并跑完整的质量门禁。

发布之前，回滚方式是把依赖变更与流水线变更一起还原。npm 发布之后不要替换已有产物：应废弃受影响版本、发布经过评审的补丁版本，并保留公告与产物证据。

## 上游参考

- [构造函数与输入安全选项](https://sharp.pixelplumbing.com/api-constructor/)
- [缩放行为](https://sharp.pixelplumbing.com/api-resize/)
- [安全策略](https://github.com/lovell/sharp/security)
- [GHSA-f88m-g3jw-g9cj](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj)
