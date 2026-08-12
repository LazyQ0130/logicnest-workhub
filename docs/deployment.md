# 部署手册

## 组成

生产部署包含 MySQL 8、`services/license-server`、`services/admin-web` 和负责 TLS 的反向代理。桌面安装包通过 HTTPS 访问 `/api/v1`；后台与 API 推荐同源部署。

## 首次部署

1. 从 `services/license-server/.env.example` 创建未纳入版本控制的 `.env`。
2. 为 JWT、refresh、管理员会话、卡密、设备和 IP 分别生成独立随机密钥。
3. 生成 Ed25519 PKCS#8 私钥/SPKI 公钥；私钥只进入服务端 secret manager，桌面只嵌入公钥。
4. 配置独立、最小权限 MySQL 账户和持久化备份。
5. 设置精确 `ALLOWED_ORIGINS`、`REQUIRE_HTTPS=true`；若经受控代理转发，再设置 `TRUST_PROXY=true`。
6. 执行 `prisma migrate deploy` 和套餐 seed，使用一次性环境变量运行 `npm run admin:bootstrap`，首次登录后修改密码并移除 bootstrap 变量。
7. 构建管理后台，将 `/api/` 反向代理到授权服务，并在外层启用 TLS、HSTS 和访问日志脱敏。
8. 构建桌面端前设置生产 `LOGICNEST_LICENSE_API_URL` 与对应公钥，完成代码签名后发布。

仓库中的 `npm run dist:win` 当前显式设置 `LOGICNEST_UNSIGNED_BUILD=1`，用于非管理员开发机生成验收包。正式 CI 必须移除该标志，配置受控签名函数/证书，并在发布前验证 Authenticode 发布者、时间戳和文件哈希。

`services/license-server/docker-compose.yml` 可作为单机参考。它只把 API 绑定到回环地址，MySQL 不映射宿主机端口。命名卷是持久数据；升级、回滚和测试均不得删除生产卷。

## 运营中心部署一致性

`admin-web` 的 Dockerfile 先在构建阶段生成静态资源，再把完整 `dist` 复制到 Nginx。容器启动时，`/docker-entrypoint.d/40-verify-deployment.sh` 会执行构建产物校验；页面标题、三条关键运营中心文案或 `/healthz` 任一不一致时，容器启动失败。

重新发布时应显式重建并保留数据库卷：

```powershell
docker compose --env-file services/license-server/.env -f services/license-server/docker-compose.yml build --no-cache admin-web
docker compose --env-file services/license-server/.env -f services/license-server/docker-compose.yml up -d admin-web
npm run admin:smoke http://127.0.0.1:4175
```

冒烟命令从实际 HTTP 页面解析脚本资源，并校验当前标题、品牌文案和健康接口，不能以本地源码测试代替容器验证。

## 隔离授权 E2E

本机验收使用 `services/license-server/docker-compose.e2e.yml` 和独立 Compose 项目 `logicnest-license-e2e`。E2E MySQL、API、运营中心、命名卷和 Electron `userData` 均与现有开发/生产环境隔离。具体命令与安全边界见 [授权 E2E 使用说明](license-e2e.md)。禁止使用 `down -v` 或手工删除卷来重置验收环境。

## 网页访问默认策略

默认 `dangerouslyAllowPrivateNetwork=false`，仅允许 `localhost`、`127.0.0.1` 和 `::1` 回环页面，以保留本地开发预览。RFC1918、链路本地、IPv6 本地/ULA、云元数据地址以及重定向到这些目标的请求默认阻止。局域网访问只能由用户在“网页访问”设置中阅读风险说明后明确开启，不得通过部署配置静默启用。

注意当前固定版本对两类策略使用不同 schema：`browser.ssrfPolicy` 支持私网开关和主机白名单；`tools.web.fetch.ssrfPolicy` 只支持 RFC 2544/IPv6 ULA 假 IP 兼容标志。不得把浏览器策略对象直接复制到 `web_fetch`，否则 OpenClaw 会以配置无效拒绝启动。

## 备份与恢复

至少每日做一致性数据库备份，备份加密并定期执行隔离环境恢复演练。恢复后检查管理员、套餐、卡密摘要、会员、设备、令牌版本和审计日志的关联完整性。

## 发布检查

- 固定 lockfile 与 OpenClaw 版本，生成 SBOM/许可证清单。
- 运行桌面、API、后台测试与依赖审计。
- 验证安装、升级、卸载不会删除用户数据，且未请求管理员权限。
- 验证未授权时 Agent 运行时未启动；断网宽限不超过 72 小时和会员到期时间。
- 使用受信任 Windows 代码签名证书签名并验证安装包。当前仓库不包含任何生产证书或私钥。
