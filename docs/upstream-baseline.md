# 上游基线

## 固定版本

- 上游仓库：`https://github.com/netease-youdao/LobsterAI.git`
- 固定提交：`8a809de79188944fc934cb574fbcc43c8e29ee1a`
- 提交日期：2026-07-31
- 拉取与核验日期：2026-08-02
- OpenClaw 固定版本：`v2026.6.1`（由根目录 `package.json` 的 `openclaw` 配置控制）
- 产品开发分支：`feat/logicnest-workhub`

上游代码、根目录 `package.json` 和当前源代码是实现事实来源。任何旧文档中的 `yd_cowork` 或可切换运行时描述均不作为本版本设计依据。

## 基线验证

首次安装依赖后，`npm run build` 与 `npm run compile:electron` 通过。`npm test` 共通过 2810 项、跳过 8 项，4 项失败；失败来自 Windows 非管理员环境创建符号链接的 `EPERM` 以及两项以 POSIX 路径分隔符为前提的测试，并非本次业务代码断言失败。该结果作为后续回归对照，详见 `acceptance-record.md`。

## 变更边界

本版本在 LobsterAI 集成层实现品牌、授权门禁、安全默认值和本地技能白名单；OpenClaw 仍是唯一 Agent 运行时。没有重新引入已移除的 `yd_cowork`。
