# 安全审计报告

审计日期：2026-08-05
范围：桌面主进程/预加载/渲染器、授权服务、管理后台、技能配置、打包配置和网络默认值。

## 已落实控制

- 授权门禁先于 OpenClaw、IM、技能、代理和定时任务启动；失效时主动停止相关服务。
- access token 短期有效，refresh token 单次轮换并检测重放；桌面使用 `safeStorage` 加密。
- 离线凭证使用 Ed25519，绑定受众、用户、设备、授权版本和到期时间；宽限上限 72 小时。
- 密码 Argon2id；卡密、设备、refresh token 和 IP 仅保存独立 HMAC/摘要；日志配置敏感字段脱敏。
- 管理端使用 HttpOnly session、精确 Origin、CSRF、角色权限、首次改密、登录锁定和审计日志。
- 卡密由 CSPRNG 生成，完整值仅返回一次；事务、行锁和唯一约束保证一码一账号一设备。
- Electron 保持 context isolation、关闭 renderer Node integration；新增能力只经受限 IPC 暴露。
- 上游遥测、广告、更新、市场和远程 Kits 默认关闭；技能默认拒绝；NSIS 不提权、不修改 Defender。
- 正式 Logo 原图 SHA-256 固定，派生图仅做等比缩放、白边和格式转换。

## 发现与处置

1. 上游存在运营域名与遥测调用：已将有效端点关闭，并在渲染器遥测函数硬返回。
2. 上游市场可下载远程内容：MCP/技能市场返回空，远程技能升级/下载失败关闭。
3. 托管邮件通道依赖上游 WebSocket：首发 UI 隐藏，主进程连接检查明确返回不支持。
4. 安装脚本曾包含提权/安全软件例外：已替换为普通用户安装，不创建 Defender 排除项。
5. 通用代理可能形成 SSRF：加入协议、URL 凭据、私网/链路本地/本地域名校验，并避免记录请求/响应正文。

## 残余风险

- 2026-08-05 修复前审计：桌面根依赖 20 项（7 moderate、12 high、1 critical）；授权服务 0 项；管理后台 2 项 high。
- 本轮固定 Electron `40.10.6`，迁移 electron-builder `26.15.3`、Vite `8.2.0`、esbuild `0.28.1` 及配套 Vite 插件，并以官方 SheetJS CE `0.20.3` 取代 npm registry 的 `xlsx@0.18.5`。桌面根依赖降为 8 项（6 moderate、2 high、0 critical）。
- 桌面根项目剩余 2 项 high 均位于应用实际依赖的内置 `npm@11.19.0`：`brace-expansion` 与 `ip-address`。两者都是 npm 发布包的 `inBundle` 内容，标准 overrides 不生效，`npm audit fix --dry-run` 也明确报告无法自动替换。`npm@10.9.9` 虽包含较新的 `tar`，但实测审计反而增至 30 项（7 moderate、22 high、1 critical），因此不采用降级；在 npm 发布包含安全传递依赖的 11.x 版本前，根项目 high 门禁继续失败。
- 管理后台精确固定 `react-router-dom@7.18.2`。后台是普通 BrowserRouter SPA，不使用 SSR、React Server Components 或 `unstable_*` RSC API，当前公告路径不可达；但 npm 仍报告 `react-router`/`react-router-dom` 2 项 high。曾验证用户建议的 `7.11.0`，该版本当前又命中覆盖 `6.0.0` 至 `7.17.x` 的多项 high 公告，风险更大，因此未采用。等待安全的 7.x 补丁或另立专项迁移到可用的安全主版本前，管理后台 high 门禁继续失败。
- `pptx-preview@1.0.7` 的 moderate 来自其图表路径使用的 `echarts@5.6.0` 与 ID 生成路径使用的 `uuid@10`。不盲目降级到 `1.0.0`，也不以未验证的跨主版本 override 替换；保持为后续 PPTX 兼容专项。
- 桌面根项目另外 4 项 moderate 位于内置 npm 的 `tar`、`undici` 与聚合 npm 公告。npm 是插件、Skill、MCP 和 OpenClaw 修复流程的运行时依赖，不能移除；随安全 npm 版本一并处理。
- OpenClaw 及其插件是高权限供应链边界。构建脚本和最终运行时需要固定版本、哈希、SBOM、许可证与恶意代码复核。
- 用户主动配置的模型、IM、MCP、技能或命令可能向第三方发送数据或执行高风险操作，不属于默认关闭能力的保证范围。
- 已生成的 NSIS 是明确未签名的开发验收包。尚未在真实 MySQL、生产 TLS、Windows 签名证书和干净 Windows 虚拟机上完成端到端发布验收；这些是上线阻断项。

## 上线复测

使用独立测试数据验证注册、登录、一码并发兑换、跨账号/设备拒绝、refresh 重放、封停/解绑、72 小时离线边界、时钟回拨、CSRF/Origin、限流、日志脱敏、安装升级卸载和断网启动。对最终安装包执行病毒扫描、签名验证、SBOM/许可证扫描和网络抓包。
