# 第三方许可说明

逻栖工枢基于 LobsterAI 修改。LobsterAI 的 MIT License 原文保留在仓库根目录 `LICENSE` 并随安装包分发。修改不移除或替换上游版权声明。

本项目的 npm 依赖、OpenClaw 运行时、Electron、Chromium、Node.js、图标/字体和文档处理组件分别适用其自身许可证。发布方必须以最终 lockfile 和实际打包内容生成完整清单，保留要求随附的许可证与通知，并在每次依赖或运行时升级后更新。

## 受管理的 SheetJS CE 依赖

为避免运行时联网下载并确保安装可复现，表格解析器使用仓库内固定的官方发行包：

- 组件：SheetJS Community Edition（`xlsx`）
- 版本：`0.20.3`
- 官方来源：`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
- 仓库路径：`vendor/xlsx-0.20.3.tgz`
- SHA-256：`8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`
- 许可证：Apache License 2.0；许可证全文包含在官方 tarball 的 `package/LICENSE` 中

`package.json` 使用精确的 `file:vendor/xlsx-0.20.3.tgz` 引用，`package-lock.json` 固定文件完整性。更新此文件前必须重新核对官方来源、版本、SHA-256 和许可证，并重新执行文档解析安全回归。

品牌名称和 Logo 不因软件的 MIT License 而获得授权；Logo 仅按项目权利人的明确授权用于本产品。
