# 授权 E2E 使用说明

本流程仅供本机开发和验收。它使用独立 Compose 项目、独立 MySQL 卷、独立服务端口和独立 Electron `userData`，不会连接、清理或复用现有开发数据库和真实桌面数据。

## 安全边界

- 测试账号、管理员凭据、完整卡密、测试设备指纹和签名材料只保存在 `services/license-server/.dev-secrets/e2e-state.env`。
- `.dev-secrets` 已由 Git 忽略；脚本和报告只输出步骤名、计数与状态，不输出秘密值。
- 设备指纹注入必须同时满足 development/test、显式 `LOGICNEST_QA_E2E=1` 及未打包运行；packaged/production 中强制失效。
- 停止脚本执行 Compose `stop`，不执行 `down -v`，不删除数据库卷。需要重新开始时应初始化新批次，而不是清理既有数据。

## 命令

```powershell
npm run license:e2e:init
npm run license:e2e:up
npm run license:e2e:run
npm run license:e2e:desktop
npm run license:e2e:stop
```

- `license:e2e:init`：创建或更新 Git 忽略的本机 QA 状态，并分配独立测试批次。
- `license:e2e:up`：构建并启动 E2E MySQL、授权服务和运营中心。
- `license:e2e:client`：按隔离配置启动交互式桌面客户端。
- `license:e2e:run`：执行真实授权 API 和运营权限闭环。
- `license:e2e:desktop`：自动恢复 Electron 原生模块 ABI，使用生产渲染构建完成真实激活、自动重启及 10 次生命周期检查。
- `license:e2e:stop`：停止 E2E 服务但保留数据库卷和 QA 状态。

默认隔离端口为授权 API `18787`、运营中心 `14175`、MySQL `13316`；如本机冲突，可在 Git 忽略的 QA 环境文件中改用未占用端口。

## 通过标准

API E2E 必须覆盖注册、重复注册、错误/正确登录、无会员隔离、卡密校验与兑换、一码一机、封停/恢复/解绑、撤销、过期、离线、退出、500、令牌失效、重复提交及三种管理员角色。桌面 E2E 还必须确认 OpenClaw 只在授权态初始化，并扫描新增日志中的 EPIPE、渲染崩溃、ESM `require()` 回退、ANSI 控制符和 10 MiB 上限。
