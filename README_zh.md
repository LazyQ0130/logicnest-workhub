<h1 align="center">
  <img src="public/logo.png" alt="逻栖工枢" width="96"><br>
  逻栖工枢
</h1>

<p align="center">
  <strong>面向 AI Agent、团队协作与授权运营的 Windows 桌面工作中枢。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> · 中文
</p>

逻栖工枢（LogicNest WorkHub）将 Agent 会话、本地项目、可复用技能、外部工具、通信渠道、定时任务和团队会议室整合到一个 Electron 桌面应用中。OpenClaw 是唯一的 Agent 运行时与网关；桌面产品层负责会话、权限、本地持久化、Artifacts、账户和产品界面。

> 本仓库基于网易有道开发的 [LobsterAI](https://github.com/netease-youdao/LobsterAI) 修改。上游 MIT 版权声明和许可条款完整保留在 [LICENSE](LICENSE) 中。

## 核心能力

- **桌面 Agent 工作区**：在权限控制下处理本地文件、项目、终端、浏览器和丰富的 Artifacts。
- **Agents、技能与 MCP**：配置专属 Agent、内置技能和 Model Context Protocol 服务，复用稳定工作流。
- **定时与远程工作**：创建定时任务，并将受支持的 IM 渠道绑定到指定 Agent。
- **会议室**：组织结构化的多 Agent 讨论，并保留相应会话状态。
- **本地优先的数据层**：在本地保存桌面会话与配置，Renderer 的特权访问统一经过 Electron preload bridge。
- **授权运营**：提供账户、激活、设备、会员、卡密、审计和运营中心能力，支持受控部署。

## 架构

| 目录 | 职责 |
| --- | --- |
| `src/renderer/` | React、Redux Toolkit、Tailwind、桌面 UI、Artifacts、设置、Agents、技能、MCP、会议室和激活流程 |
| `src/main/` | Electron 生命周期、IPC、SQLite、权限、日志、OpenClaw 启动、IM 网关、授权和本地服务 |
| `src/shared/` | 跨进程常量、类型、品牌数据、会议室契约和授权契约 |
| `src/scheduledTask/` | 定时任务策略、映射、迁移和测试 |
| `services/license-server/` | 授权 API、账户与设备状态、会员/卡密流程和审计记录 |
| `services/admin-web/` | 供授权管理员使用的 Web 运营中心 |
| `SKILLs/` | 随应用提供的可复用 Agent 技能 |

桌面应用启用 context isolation、关闭 Renderer 的 Node integration，并通过类型化 IPC 暴露特权操作。主进程依据产品本地设置生成 OpenClaw 配置并管理运行时状态。

## 环境要求

- Windows 开发环境
- Node.js `>=24.15.0 <25`
- npm
- 构建脚本所需的固定版本 OpenClaw 源码与运行时依赖

## 从源码运行

```bash
git clone https://github.com/LazyQ0130/logicnest-workhub.git
cd logicnest-workhub
npm install
```

首次开发运行时，构建并同步固定版本的 OpenClaw 运行时：

```bash
npm run electron:dev:openclaw
```

运行时就绪后，日常开发可使用：

```bash
npm run electron:dev
```

Renderer 开发服务器使用 `5175` 端口。

## 验证

```bash
# 全量 Renderer/Main 源码 Lint
npm run lint

# 官方 Vitest 测试，或指定测试范围
npm test
npm test -- meetingRoom

# Electron main/preload TypeScript 编译
npm run compile:electron

# 生产 Renderer 构建
npm run build
```

## 授权服务

授权服务和运营中心位于 `services/` 下的独立工作区。仓库提交的 `.env.example` 只能包含占位符。使用时应复制为本地 `.env`，为生产环境生成彼此独立的密钥，并且不得提交实际环境文件、签名材料、管理员初始密码、数据库、日志或导出的卡密数据。

常用开发命令：

```bash
npm run license:install
npm run license:test
npm run license:build

npm run admin:install
npm run admin:test
npm run admin:build
```

部署前请阅读[部署说明](docs/deployment.md)、[客户端激活说明](docs/client-activation.md)、[开发说明](docs/development.md)和[安全审计](docs/security-audit.md)。

## 打包

当前 Windows 打包入口：

```bash
npm run dist:win
```

正式发布必须使用受控的代码签名凭据，复核最终安装包内容，并保留全部必要的第三方许可声明。安装包、构建目录、运行时产物、数据库、日志和本地密钥均应排除在版本控制之外。

## 上游归属与第三方许可

逻栖工枢基于 [LobsterAI](https://github.com/netease-youdao/LobsterAI) 修改。LobsterAI 版权归 © 2026 NetEase Youdao 所有，并依据 MIT License 使用。上游原始版权声明和完整许可条款保留在 [LICENSE](LICENSE) 中；本项目的修改不会移除或替换该归属声明。

项目还使用或打包了 npm 依赖、Electron、Chromium、Node.js、OpenClaw 运行时、插件、图标、字体及其他适用各自许可的组件。详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [docs/third-party-licenses.md](docs/third-party-licenses.md)。正式发布必须根据最终 lockfile 和实际打包内容附带所有必要的通知与许可原文。MIT License 不授予上游或本项目名称、Logo 的商标权。

## 许可证

[MIT License](LICENSE)
