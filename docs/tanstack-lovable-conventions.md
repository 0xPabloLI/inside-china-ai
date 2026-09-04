# TanStack Start + Lovable Cloud 可发布约定

> 本文件记录让 **China AI News** 能够稳定发布到 Lovable Cloud 的栈级约定。所有本地 AI 助手、外部开发者或未来维护者都应遵循。

## 1. 项目身份

China AI News — 英文内容/博客平台（文章 + 邮件订阅 + 短视频管线）。技术栈与定位见 `AGENTS.md` → Project；本文件只记录栈级发布约定。

## 2. 路由约定

- 使用 **TanStack Start 文件路由**，路由文件放在 `src/routes/`。
- 根布局在 `src/routes/__root.tsx`，必须渲染 `<Outlet />`。
- 管理员页面放在 `src/routes/_authenticated/` 路径下，由 `src/routes/_authenticated/route.tsx` 统一鉴权。
- 公开 API / Webhook 放在 `src/routes/api/public/*`，该前缀会绕过发布站点的认证。
- 不要引入 `react-router-dom`、`BrowserRouter`、Next.js/Remix 路由模式。
- 不要直接编辑生成的 `src/routeTree.gen.ts`。

## 3. 后端逻辑：Server Functions

- 应用内部后端逻辑使用 `createServerFn`（来自 `@tanstack/react-start`）。
- 客户端调用时使用 `useServerFn`。
- 需要登录的函数加 `.middleware([requireSupabaseAuth])`。
- 不要在公开路由的 `loader` 中调用需要登录的 server function（SSR/prerender 时没有 bearer token）。
- 不要把 `src/server/` 里的模块导入到客户端；客户端可导入的 server function 放在 `src/lib/*.functions.ts`。
- 不要在 server function 模块顶层读取 `process.env`；只在 `.handler()` 内部读取。
- 不要在 server function 中返回 `Response`、流、SDK 客户端等复杂对象；返回普通 DTO。

## 4. 环境变量与 Secrets

| 类型         | 位置                            | 用途                                                                  | 风险                                      |
| ------------ | ------------------------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| 公共变量     | `.env` 中 `VITE_*`              | 前端运行时需要，如 `VITE_TIKTOK_CLIENT_KEY`、`VITE_SUPABASE_URL`      | 会随代码同步到 GitHub，**不能放敏感密钥** |
| 后端 Secrets | Lovable Secrets / `process.env` | 后端 server function 中使用，如 `TIKTOK_CLIENT_KEY`、`OPENAI_API_KEY` | 不会提交到仓库，仅运行时注入              |

- `.env` 文件会被 GitHub 同步，因此只放公开可泄露的值。
- 任何需要保密或具备写权限的 key，都通过 Lovable Secrets 管理，在后端代码中读取。
- 修改 Secret 后需要重新发布应用才能在生产环境生效。

## 5. 数据库与迁移

- 所有 schema 变更通过 `supabase/migrations/` 中的迁移文件完成。
- 每个 `public` 表的 `CREATE TABLE` 后必须紧跟 `GRANT` 语句，再启用 RLS、再创建 policy。
- 默认授权块：

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
GRANT ALL ON public.<table> TO service_role;
-- 仅当 policy 允许 anon 读取时才加：
-- GRANT SELECT ON public.<table> TO anon;
```

- 角色必须放在独立的 `public.user_roles` 表，不能存在 `profiles` 表中。
- 使用 `public.has_role(_user_id, _role)` 函数做权限判断，RLS policy 中调用它。
- 不要修改 `auth`、`storage`、`realtime`、`supabase_functions`、`vault` 等系统 schema。

## 6. 认证与权限

- 仅管理员需要登录；普通访客不登录。
- 登录入口对访客不可见；管理员通过 `/auth` 或隐藏的入口登录。
- 支持 Google OAuth 和 Magic Link（无密码）。
- 所有管理员页面走 `_authenticated` 布局 + `isAdmin` 双重校验。
- `isAdmin` 通过 `context.supabase.rpc('has_role', { _user_id: userId, _role: 'admin' })` 判断。

## 7. 存储

- 附件存储桶保持 **private**，通过 RLS policy 控制访问。
- 匿名用户只能访问与已发布文章关联的附件；管理员拥有完整读写权限。
- 不要在 `.env` 或前端暴露 Service Role Key。
- 后端如需绕过 RLS，使用 `supabaseAdmin`，但必须在验证调用者权限后动态导入 `@/integrations/supabase/client.server`。

## 8. 邮件

- 发信域名使用 `notify.chinaai.news`，需在 Lovable Cloud → Emails 中验证。
- 邮件模板放在 `src/lib/email-templates/`，From 统一为 `China AI News <noreply@chinaai.news>`。
- 邮件事件（退订、弹跳、投诉）通过 `src/routes/lovable/email/events.ts` 处理并同步到 `subscribers` 表。
- 一键退订链接由 Lovable 邮件基础设施生成，退订后该邮箱会被自动加入抑制列表。

## 9. 外部 API 与 Webhook

- 外部服务回调、定时任务、公开 API 使用 `src/routes/api/public/*`。
- 必须在 handler 内验证签名/secret（如 `x-webhook-signature`），再处理数据。
- 不要从 `/api/public/*` 返回 PII 或敏感数据。

## 10. SEO 与元数据

- 每个内容路由（包括 `src/routes/index.tsx`）都要有独立的 `head()`，包含 title、description、og:title、og:description、og:type、twitter:card。
- 仅当路由有绝对 HTTPS 封面图时，才设置 `og:image` 和 `twitter:image`。
- 提供动态 `sitemap.xml` 和 `robots.txt`。
- 图片必须加 `alt`；标题层级保持语义化。
- 使用 JSON-LD 结构化数据（Organization、Article、ItemList、FAQPage 等）。

## 11. 部署与发布

- **GitHub 同步 ≠ 部署**：推送到 GitHub 不会自动部署；必须通过 Lovable 编辑器点击 **Publish / Update** 才会上线。
- 后端改动（迁移、server function、API route）在发布时自动部署。
- 前端改动需要在发布对话框中点击 **Update** 才会生效。
- 修改 Secret 后必须重新发布，生产环境才能读到新值。
- 发布前执行本文 §13 的检查清单；关键页面还必须在本地 dev server 通过浏览器验证。

## 12. Stack 约束

- TypeScript 使用 functional React components/hooks；2-space indentation；组件和类型使用 `PascalCase`，变量和函数使用 `camelCase`。
- Server function / SSR：仅用浏览器兼容 API；Node-only 包（`child_process`、`sharp`、`puppeteer`、`canvas`）仅在后端脚本中使用。
- 模块顶层：保持纯函数——`Math.random()`、`crypto.randomUUID()`、文件 I/O、浏览器全局变量放在 handler 内部。
- `VITE_*` 前缀 = 公开 key；后端 secret 不加 `VITE_` 前缀，通过 Lovable Secrets 管理。
- `.server.ts` 文件仅可在 server function / API route 中导入。
- Server function 调用走 `useServerFn`；如需 raw HTTP，创建 server route。
- Storage bucket 保持 private + RLS 控制访问。
- React Query 数据用于初始化组件 state 时，必须在数据就绪后再挂载组件，或在 `useEffect` 中显式同步；`useState` initializer 只在首次挂载执行，不能依赖稍后返回的 query 数据自动重算。

## 13. 快速检查清单（每次发布前）

- [ ] 没有新增 `public` 表缺少 `GRANT`
- [ ] 没有新增需要登录的 server function 被放在公开 `loader` 中
- [ ] 没有在前端 `.env` 中泄露敏感 key
- [ ] 邮件模板 From 为 China AI News
- [ ] 所有新路由都有独立 `head()`
- [ ] affected tests 与 `npm test` 全绿
- [ ] `npm run lint && npx tsc --noEmit && npm run build` 全绿
