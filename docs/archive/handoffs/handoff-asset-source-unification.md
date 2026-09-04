# Handoff: 素材源统一命名 + 重复获取问题

> **给接手 Agent**：本 session 发现了两套素材源系统存在命名不一致和重复获取问题。请在此 session 基础上做代码重构。
> **建议 Skills**: `grill-with-docs` → `to-spec` → `to-tickets` → `implement`（Substantial workflow）

## 背景

项目有两套素材源系统：

- **多媒体素材源**（`scripts/short-video/lib/asset-sourcer.mjs`）— 22 个来源，搜图片/视频/音频
- **文字素材源**（`scripts/short-video/lib/trend-sources.mjs`）— 16 个来源，搜文章标题/URL

两套系统各自独立运行，没有统一的 source registry。

## 问题 1：命名不一致

| 来源       | asset-sourcer.mjs | trend-sources.mjs                        | 问题                                       |
| ---------- | ----------------- | ---------------------------------------- | ------------------------------------------ |
| 小红书     | `xiaohongshu`     | `xhs`                                    | **不一致**                                 |
| 微博       | `weibo`           | `weibo_hot`                              | **语义混淆**（一个下载媒体，一个获取热搜） |
| 微信公众号 | 无                | `sogou_weixin` + `wechat_dongchabeating` | **旧名未清理**                             |
| 机器之心   | `jiqizhixin`      | `jiqizhixin`                             | ✅ 一致                                    |
| IT之家     | `ithome`          | `ithome`                                 | ✅ 一致                                    |
| B站        | `bilibili`        | `bilibili`                               | ✅ 一致                                    |
| 抖音       | `douyin`          | `douyin`                                 | ✅ 一致                                    |

## 问题 2：重复获取

同一个来源（如 `ithome`、`jiqizhixin`、`bilibili`、`douyin`）在两个文件中都有定义：

- `asset-sourcer.mjs` 中的 `CDP_SOURCES` 定义了从 IT之家/机器之心提取图片的脚本
- `trend-sources.mjs` 中的 `NEWS_SOURCES` 定义了从 IT之家/机器之心提取文章标题的脚本

这意味着如果同一个 session 中既做趋势发现又做素材搜索，会重复打开同一个网站的 CDP tab。

## 建议方案

### 方向 1：统一 Source Registry

创建 `scripts/short-video/lib/source-registry.mjs` 作为 single source of truth：

```javascript
// 每个来源只定义一次
export const SOURCES = {
  ithome: {
    name: "ithome",
    label: "IT之家",
    labelEn: "iThome",
    platform: "ithome",
    url: (keyword) => `https://www.ithome.com/search?word=${encodeURIComponent(keyword)}`,
    // 多用途脚本
    purposes: {
      media: {/* CDP extract script for images */},
      trend: {/* CDP extract script for article titles */},
    },
    attribution: {
      text: () => `图片来源: IT之家 (ithome.com)`,
      license: "News copyright",
      logoRequired: false,
    },
  },
  // ...
};
```

### 方向 2：去重缓存

在 CDP 层面加 URL 级别的去重缓存——如果同一个 URL 已被某个 purpose 打开过，复用 tab 而不是新开。

## 影响面

需要修改的文件：

1. `scripts/short-video/lib/asset-sourcer.mjs` — `CDP_SOURCES` 数组
2. `scripts/short-video/lib/trend-sources.mjs` — `NEWS_SOURCES` + `SELF_MEDIA_SOURCES` 数组
3. `scripts/short-video/lib/discover-trends.mjs` — 消费 `trend-sources.mjs`
4. `scripts/short-video/lib/asset-sourcer.mjs` 的测试文件
5. `scripts/short-video/lib/trend-sources.mjs` 的测试文件（如有）
6. `docs/research/asset-source-quick-reference.md` — 更新命名表

## 已有文档参考

- `docs/research/asset-source-quick-reference.md` — 完整的来源速查表（多媒体+文字）
- `docs/research/media-asset-strategy.md` §7 — Cookie & Platform Access Status（含所有替代方案测试结果）
- `scripts/short-video/lib/asset-sourcer.mjs` — `SOURCE_ATTRIBUTIONS` 对象（20 个来源的 attribution 配置）
- `scripts/short-video/lib/trend-sources.mjs` — `ALL_SOURCES` 数组（16 个来源定义）

## 安全审计状态

本 session 已对所有三方方案做了安全审计（详见 Q1 答复）。关键结论：

- **RedNote-MCP**: 用 Playwright 浏览器自动化，cookie 存 `~/.mcp/rednote/cookies.json`，无网络外传。安全。
- **weibo-downloader-skill**: 纯 Python + requests，访客 cookie 系统，无网络外传。安全。
- **bilibili-api-python**: 直接调 B站官方 API，无中间服务器。安全。
- **Douyin_TikTok_Download_API**: a_bogus 签名实现使用 SM3（国密算法），代码源自 TikTokDownloader（GPL v3），需注意许可证兼容性。本地部署安全。
- **chubbyskills**: 抖音转录用 `iesdouyin.com/share/video/` 端点 + 移动端 UA，**无需 cookie/登录**，无水印。安全。
