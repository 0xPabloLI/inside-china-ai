# TikTok 发布设置指南

> 创建于 2026-08-02，更新于 2026-08-02。
> 对应 Roadmap ISSUE-01 + ISSUE-14。

---

## Part A: Publora 方案（已配置，正在使用）

> Publora 是第三方社交发布服务，使用他们已过审的 TikTok App。
> 免费层：15 条/月，3 个账号，50MB 视频。
> 已连接 @chinaainews，token 有效期 364 天。

### 配置状态

| 项目         | 状态                                                                                |
| ------------ | ----------------------------------------------------------------------------------- |
| Publora 账号 | ✅ 已注册 |
| Publora MCP  | ✅ 已配置 (`https://mcp.publora.com` + Bearer token)                                |
| TikTok 连接  | ✅ 已连接 (@chinaainews, platformId: `tiktok--000Kl6Oyj0RoTYJaS3zByCnVyhcTlRBHOy5`) |
| Token 状态   | ✅ valid, 364 天有效期                                                              |
| 免费层额度   | 15 条/月（你 3-5 条/周 = 12-20 条/月，基本够用）                                    |

### 发布流程（通过 Publora MCP）

```
1. create_post (创建草稿 + caption + hashtag + mediaUrls)
   → 如果有视频文件 URL: 一步到位创建 + 排期
   → 如果视频文件在本地: 先 create draft, 再 get_upload_url + upload + complete_media

2. update_post (status: "scheduled", scheduledTime: ISO 8601)
   → 排期发布

3. list_posts (查看已发布/排期帖子)
```

### CatPaw MCP 配置

文件：`~/Library/Application Support/CatPawAI/User/globalStorage/mt-idekit.mt-idekit-code/settings/mcopilot_mcp_settings.json`

```json
"publora": {
  "type": "http",
  "url": "https://mcp.publora.com",
  "headers": {
    "Authorization": "Bearer sk_msbpdajw_..."
  }
}
```

### 风险和注意

| 风险      | 说明                                                                           |
| --------- | ------------------------------------------------------------------------------ |
| 布尔反转  | allowComments/allowDuet/allowStitch 可能映射到 TikTok 的 disable_*（需要测试） |
| AIGC 标签 | API 可能不支持自动打 AIGC 标签，发布后可能需手动在 App 里补标                  |
| 频率限制  | 和其他 Publora 用户共享额度（15-20 条/天 App 级限制）                          |
| 处理延迟  | 上传后 30-120 秒处理                                                           |
| 服务依赖  | Publora 在线才能用                                                             |
| 隐私      | 视频经过 Publora 服务器（S3 presigned upload → TikTok）                        |

---

## Part B: 自己的 TikTok Developer App（稍后做）

> 当需要独立于第三方时再做。目前用 Publora 即可。
> 对应 GitHub Issue #14。

### 现有 App "Marshmallow" 状态

| 字段                 | 当前值                                          | 能改？                                   |
| -------------------- | ----------------------------------------------- | ---------------------------------------- |
| App name             | Marshmallow                                     | ✅ 可编辑                                |
| App ID               | 6981776535875356678                             | -                                        |
| Description          | social nft minting                              | ✅ 可编辑                                |
| Website URL          | https://www.marshmallow.gg                      | ✅ 可编辑（text input, not disabled）    |
| Terms of Service URL | Notion 链接                                     | ✅ 可编辑                                |
| Privacy Policy URL   | Notion 链接                                     | ✅ 可编辑                                |
| Category             | Entertainment                                   | ✅ 可编辑                                |
| **Products**         | Login Kit, Share Kit, Webhooks                  | ⚠️ **没有 Content Posting API**          |
| **Scopes**           | share.sound.create, user.info.basic, video.list | ⚠️ **没有 video.upload / video.publish** |
| 上线时间             | 2022-06-08                                      | -                                        |

### 要用这个 App 发布视频，需要

1. 添加 **Content Posting API** product
2. 添加 `video.upload` + `video.publish` scopes
3. 改 Website URL → `https://chinaainews.com`
4. 改 Description → China AI news publisher
5. 改 Terms/Privacy URL → chinaainews.com/terms 和 /privacy
6. 录 demo 视频（展示 chinaainews.com 上的 TikTok OAuth + 上传流程）
7. 提交审核（1-2 周）

### 或者：新建一个 App

如果不想改 Marshmallow（它是另一个项目的），可以在同一个开发者账号下新建一个 App：

1. developers.tiktok.com → Developer Portal → Connect an app
2. 填 App name: `China AI News Publisher`
3. 只选 Content Posting API（不选 Login Kit / Share Kit / Webhooks）
4. 只选 `video.upload` + `video.publish` + `user.info.basic` scopes
5. Website URL: `https://chinaainews.com`
6. 录 demo 视频过审

### 第三方 vs 自己 App 的区别

|            | Publora（现在）         | 自己的 App（审核后）  |
| ---------- | ----------------------- | --------------------- |
| 频率限制   | 和 Publora 用户共享     | 自己的额度 (15-20/天) |
| 隐私       | 视频经过 Publora 服务器 | 直接上传到 TikTok     |
| AIGC 标签  | API 可能不支持          | 同样的 API 限制       |
| Token 刷新 | Publora 处理            | 自己实现              |
| 费用       | 免费 15 条/月           | 免费                  |
| 依赖       | 依赖 Publora 在线       | 独立                  |
| 控制权     | 受 Publora 限制         | 完全可控              |

**结论**：对单账号、3-5 条/周、公开内容来说，差异很小。先用 Publora，后续需要时再切换到自己的 App。

---

## Part C: Postiz 开源 fallback

> Postiz 是开源社交发布工具（Docker 自部署）。
> 已下载到 `docs/refs/postiz-app/`。
> 注意：Postiz 自部署**也需要你自己的 TikTok App 凭据**（`TIKTOK_CLIENT_ID` + `TIKTOK_CLIENT_SECRET`），不解决 App 审核问题。

### Postiz 适用场景

- 你的 TikTok App 已过审 → 用 Postiz 自部署替代 Publora
- 需要跨平台排期（TikTok + YouTube + Instagram + X + LinkedIn）
- 不想依赖第三方服务

### Postiz 不适用场景

- 还没有过审的 TikTok App → 用 Publora 更简单
- 只发 TikTok → Publora 免费层够用

---

## 文件参考

- Publora API 客户端代码：`docs/refs/tiktok-skills/lib/publora_client.py`（sergebulaev 社区 skill）
- Postiz 开源仓库：`docs/refs/postiz-app/`（已 clone）
- Roadmap：`docs/video/video-automation-roadmap.md` ISSUE-01 + ISSUE-14
- GitHub Issue：https://github.com/0xPabloLI/inside-china-ai/issues/14
- TikTok 官方文档：https://developers.tiktok.com/doc/content-posting-api-get-started/
