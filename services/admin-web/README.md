# 逻栖工枢管理后台

这是 LogicNest WorkHub 的独立 React + Vite + TypeScript + Ant Design 管理后台 MVP。前端只负责管理界面，不在浏览器保存管理员密钥、完整卡密或会话令牌。

## 已实现模块

- 管理员登录、同源 HttpOnly session、CSRF 令牌、首次强制改密和基于角色的路由权限。
- 仪表盘：注册用户、有效会员、今日新增、在线设备、即将到期五项统计。
- 用户搜索/筛选、详情、封停/恢复、重置密码、解除设备绑定。
- 套餐创建、编辑、启停和删除（有关联数据时由服务端拒绝删除）。
- 卡密批量生成（单批 1–1000）、当次 CSV 下载、批次/套餐/状态筛选和吊销。
- 设备筛选、在线状态、封停/解封、解绑和强制会话失效。
- 审计日志筛选与脱敏展示。

## 开发

需要 Node.js `>=24.15.0 <25`。

```bash
npm install
copy .env.example .env
npm run dev
```

默认开发地址为 `http://127.0.0.1:4175`。授权服务固定使用本机 `8787` 端口，`.env.example` 中的 `VITE_DEV_API_PROXY_TARGET` 可直接使用；生产构建使用同源 `/api/v1/admin`。

```bash
npm test
npm run build
npm run preview
```

## API 约定

API 基址由 `VITE_ADMIN_API_BASE_URL` 指定，默认 `/api/v1/admin`。前端使用 `fetch(..., { credentials: 'include' })`，依赖服务端设置的 HttpOnly `ln_admin_session` cookie。服务端同时返回 `csrfToken` 或 `x-csrf-token` 响应头；所有写请求自动携带 `x-csrf-token`。

认证接口：

- `POST /auth/login`：`{ username, password }` → `{ admin, csrfToken }`
- `GET /auth/me`：返回当前管理员和新的 CSRF 令牌
- `POST /auth/change-password`：`{ currentPassword, newPassword }`
- `POST /auth/logout`

业务接口使用服务端提供的分页结构 `{ items, total, page, pageSize }`。错误结构为 `{ error: { code, message, requestId, details? } }`，界面会将请求 ID 保留在错误对象中供排查。

## Docker / Nginx

镜像采用两阶段构建，静态文件由 Nginx 提供，`/api/` 默认反向代理到 Compose 服务名 `license-server:8787`。部署时请在外层网络或 Compose 中提供该服务，并在 TLS 终止层设置安全 cookie 和严格的 `Origin`。

```bash
docker build --build-arg VITE_ADMIN_API_BASE_URL=/api/v1/admin -t logicnest-admin-web .
docker run --rm -p 8080:80 logicnest-admin-web
```

生产环境不要把密码、数据库连接串、CSRF 密钥或其他秘密写入 `VITE_*` 变量；这些值属于 API 服务端配置。

## 品牌资产

品牌值集中在 `src/brand.ts`。界面加载 `public/logicnest-logo-reference.jpg`，该文件与甲方确认原图的 SHA-256 均为 `889F72F82384C0363084E8E3D06BF1B9D2DDB14A9F9867833525058B04EA5C92`；缺失时显示“逻”文字兜底。后台不会裁切、重绘、改色或生成 Logo 变体。

## 安全边界

- 不把完整手机号、卡密、访问令牌或原始设备标识写入前端日志。
- 生成结果关闭后不持久化完整卡密；CSV 只在当次响应中下载。
- Nginx 示例包含基础安全响应头和 CSP；生产部署仍需配置 HTTPS、严格 Origin 校验、登录限流及服务端审计。
- 前端权限路由只用于体验和越权提示，真正的鉴权、CSRF 校验和操作授权必须由 API 服务端执行。
