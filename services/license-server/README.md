# LogicNest WorkHub License Server

独立的 Node 24 + TypeScript + Fastify + Prisma/MySQL 8 授权服务。代码只
保存手机号规范化值、Argon2id 密码摘要、卡密 HMAC 摘要、设备 HMAC 摘要和
令牌摘要；密码、完整卡密、refresh token、原始硬件标识和完整 IP 不写入日志或
数据库。

## 快速开始

仓库根目录提供了不会输出秘密值的本地初始化与 Compose 命令：

```powershell
npm run license:dev:init
npm run license:dev:up
```

初始化会生成 Git 忽略的随机数据库密码、独立 HMAC/JWT secret、Ed25519
开发密钥、管理员初始凭据和客户端开发环境。Compose 会启动隔离的 MySQL、
`license-server:8787` 与管理后台 `http://127.0.0.1:4175`；授权服务容器启动时
依次执行 Prisma migration、套餐 seed 和管理员初始化。不要使用
`docker compose down -v`，本地 named volume 需要保留。

```powershell
cd services/license-server
Copy-Item .env.example .env
# 编辑 .env，至少填写 DATABASE_URL、六个独立随机 secret 和 Ed25519 密钥。
npm install
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

开发环境可以直接运行 `docker compose up -d mysql`，但部署环境应使用独立的
数据库凭据和外部 secret manager。`docker-compose.yml` 中的 named volume 是
持久数据，不应在升级时删除。

### 生成 Ed25519 密钥

服务端需要 PKCS#8 private DER 和 SPKI public DER 的 base64 值：

```bash
openssl genpkey -algorithm Ed25519 -out license-private.pem
openssl pkey -in license-private.pem -pubout -out license-public.pem
openssl pkcs8 -topk8 -nocrypt -in license-private.pem -outform DER | base64 -w0
openssl pkey -pubin -in license-public.pem -outform DER | base64 -w0
```

将两行结果分别放入 `LICENSE_JWS_PRIVATE_KEY_B64` 和
`LICENSE_JWS_PUBLIC_KEY_B64`。生产环境 `REQUIRE_HTTPS` 会自动开启；若在反向
代理后运行，设置 `TRUST_PROXY=true`，并只信任受控代理注入的
`X-Forwarded-Proto`。

初始管理员不使用 `admin/admin`。推荐一次性执行：

```powershell
$env:ADMIN_BOOTSTRAP_USERNAME = 'owner'
$env:ADMIN_BOOTSTRAP_PASSWORD = 'a-long-random-password'
npm run admin:bootstrap
```

首次登录必须修改密码；完成后从部署环境移除 bootstrap 变量。

## API 概览

所有错误统一为：

```json
{"error":{"code":"...","message":"...","requestId":"...","details":{}}}
```

响应带 `X-Request-Id`、`Cache-Control: no-store` 及安全 headers。客户端请求可
不带 `Origin`；管理端浏览器请求必须使用 `ALLOWED_ORIGINS` 中的精确 origin。

### 客户端（`/api/v1`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/register` | `{phone,password,confirmPassword}`；手机号默认 +86 |
| POST | `/auth/login` | 返回短期 JWT 和一次性轮换 refresh token；可附 `deviceFingerprint` |
| POST | `/auth/refresh` | `{refreshToken}`；旧 token 立即撤销，重复使用会撤销整个 family |
| POST | `/auth/logout` | 撤销当前 refresh token |
| GET | `/auth/me` | 当前账号、会员和设备 |
| POST | `/license/redeem` | `{licenseKey,deviceFingerprint,clientVersion?}` |
| POST | `/license/heartbeat` | `{deviceFingerprint,clientVersion?}`；默认五分钟一次 |
| GET | `/license/status` | 当前授权状态 |
| GET | `/license/public-key` | 离线 JWS 公钥、key id 和宽限配置 |

卡密格式为 `LQGX-XXXX-XXXX-XXXX-XXXX`，使用 CSPRNG 生成。批量卡密服务端
只保存 HMAC-SHA256 摘要和末四位；完整卡密只在管理端生成响应及当次 CSV 中出现。
数据库事务在卡密行上使用 `SELECT ... FOR UPDATE` 并采用 Serializable 隔离：
同一账号/设备的重复提交返回同一授权结果，不延长有效期；跨账号或跨设备明确
拒绝。默认预置 DAY（1 天）、MONTH（30 天）、YEAR（365 天）。

心跳成功返回 Ed25519 签名的离线 JWS。JWS 的 `offlineUntil` 不会超过实际
会员到期时间和配置的宽限期（最大 72 小时）；客户端应校验签名、设备 id、授权
版本、服务端时间和本地单调时钟，禁止通过回拨时间无限延长授权。

### 管理端（`/api/v1/admin`）

登录设置 HttpOnly `ln_admin_session` 和可读 `ln_admin_csrf` cookie。所有
mutation 同时要求精确 `Origin` 和 `x-csrf-token`（与 cookie/session 摘要匹配）。
角色为 `SUPER_ADMIN`、`OPERATOR`、`AUDITOR`；首次改密前除 `me`、改密、登出
外的操作均返回 `ADMIN_PASSWORD_CHANGE_REQUIRED`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST/GET | `/auth/login`, `/auth/me` | 管理员会话 |
| POST | `/auth/change-password`, `/auth/logout` | 改密、撤销会话 |
| GET | `/dashboard` | 注册、有效会员、今日新增、在线设备、七日到期 |
| GET/PATCH/POST | `/users`, `/users/:id/status`, `/users/:id/reset-password` | 用户查询、封停/启用、重置密码 |
| POST | `/users/:id/unbind-device` | 解绑并使设备会话失效 |
| GET/POST/PATCH/DELETE | `/plans`、`/plans/:id` | 套餐 CRUD/启停；有引用时不能删除 |
| GET/POST/PATCH | `/license-keys`、`/license-keys/batches`、`/license-keys/:id/status` | 卡密分页、批量（≤1000）、吊销 |
| GET/PATCH/POST | `/devices`、`/devices/:id/status`、`/devices/:id/unbind` | 设备封停/解封/解绑 |
| POST | `/devices/:id/invalidate-sessions` | 强制令牌失效 |
| GET | `/audit-logs` | 脱敏分页审计日志 |

批量生成返回 `{batch,keys,csv}`；后续列表永远不会返回完整卡密。

## 安全控制清单

- Zod 环境配置校验：生产必须明确 allowlist、HTTPS 和独立 secret；离线宽限上限 72 小时。
- Argon2id（约 19 MiB、2 次迭代、单并行度）密码摘要；管理员登录五次失败锁定 15 分钟。
- HS256 短期访问 JWT（默认 15 分钟）+ HMAC 摘要 opaque refresh token 旋转和重放检测。
- 卡密和设备指纹采用独立 HMAC key；日志 redaction 覆盖密码、卡密、token、cookie、手机号和设备指纹。
- Helmet、精确 CORS、Origin/CSRF、全局与路由级限流、请求 ID、HTTPS 检查和审计日志。
- 用户、设备、授权状态变化会递增 token/授权版本并撤销 refresh token；下一次心跳即失效。
- MySQL 行锁 + Serializable 兑换事务，数据库唯一约束保证一码一账号一设备。
- Docker 运行时使用非 root 用户；只通过 nginx/受控负载均衡终止 TLS。

## 测试与构建

```powershell
npm run typecheck
npm test
npm run build
```

`tests/mysql.integration.test.ts` 在设置 `TEST_DATABASE_URL` 并已执行迁移时
运行真实 MySQL API 流程；未提供测试数据库时会安全跳过，不会连接生产库。单元
和 Fastify 注入测试无需数据库，覆盖手机号规范化、密码规则、卡密 CSPRNG/HMAC、
JWT/Ed25519 JWS、限流、安全 headers、Origin/CSRF、错误 requestId 及关键管理
路由。CI 应把测试数据库放在独立容器/网络中，并在测试后销毁该测试资源；不要
删除或重置任何现有容器和卷。

## 数据库迁移

迁移位于 `prisma/migrations/202608020001_init/migration.sql`。生产只运行
`prisma migrate deploy`，不运行 `migrate reset`。MySQL 账户应仅授予该数据库
所需权限，备份和恢复由部署平台负责。
