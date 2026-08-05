# 开发说明

## 环境

- Windows 10/11 x64（首发目标）
- Node.js `>=24.15.0 <25`
- npm、Git for Windows
- 授权服务集成测试需要独立 MySQL 8 测试库

## 桌面端

```powershell
npm install
npm run compile:electron
npm run build
npm test
npm run electron:dev:openclaw
```

开发时将 `LOGICNEST_LICENSE_API_URL` 指向授权服务，例如 `http://127.0.0.1:8787/api/v1`，并将 `LOGICNEST_LICENSE_PUBLIC_KEY_PEM` 设置为与服务端签发密钥对应的 Ed25519 公钥。生产版本必须使用 HTTPS。

## 授权服务

```powershell
npm install --prefix services/license-server
npm run db:generate --prefix services/license-server
npm test --prefix services/license-server
npm run build --prefix services/license-server
```

真实数据库测试仅使用专用测试数据库：设置 `TEST_DATABASE_URL`、执行迁移，然后运行 `npm run test:mysql --prefix services/license-server`。不要连接或重置生产库。

## 管理后台

```powershell
npm install --prefix services/admin-web
npm test --prefix services/admin-web
npm run build --prefix services/admin-web
```

## 品牌资产

`npm run brand:assets` 先校验正式 Logo 的固定 SHA-256，再仅执行等比缩放、白边补齐和技术格式转换。不得替换、裁切、抠图、改色或重绘源图。
