# Manual Ops — 需要人工操作的事项

> 创建于 2026-08-03。集中所有需要人工执行的步骤，按频率分类。
> Agent 在相关工作流中会引用此文档。

---

## 每次发布视频时

> 视频通过 `verify-video.mjs` 检查后，在 TikTok 发布界面需要手动完成的操作。

| # | 操作 | 说明 | 为什么 |
|---|------|------|--------|
| 1 | **AIGC 标签** | 发布界面打开 "AI-generated content" | TikTok 要求标注 AI 内容，不标注会被降权 |
| 2 | **趋势音频** | 从 TikTok 音频库选热门音乐，音量设 5-10% | 趋势音频提升发现率 |
| 3 | **地理标签** | 添加 China/US 位置标签 | 本地内容算法优先推同区域用户 |
| 4 | **Pinned comment** | 发布后置顶含文章 URL 的评论 | 引导流量到网站 |
| 5 | **回复评论** | 发布后 1 小时内回复所有评论 | 首小时互动信号影响算法推荐 |
| 6 | **非高峰时段** | 查看粉丝活跃时间，选低峰发布 | 竞争少，算法更容易推 |

### 发布后自动提示

`publish-tiktok.mjs` 发布成功后会：
1. 打印 24-48h 分析提醒
2. 写入 `output/pending-analysis.json`（记录待分析状态）

---

## 每次发布文章时

| # | 操作 | 说明 |
|---|------|------|
| 1 | **审阅文章** | Agent 生成 frontmatter markdown 后，人工审阅内容 |
| 2 | **检查 widget** | 确认文中引用的 widget 已注册且已部署 |
| 3 | **部署新 widget** | 如有新 widget，需 `npm run build` + 部署后再发布文章 |
| 4 | **运行发布脚本** | `node scripts/article/publish-article.mjs --file <path>` |
| 5 | **验证** | 访问 `/posts/{slug}` 确认文章显示正常，widget 渲染正确 |

### 发布脚本用法

```bash
# 发布文章
node scripts/article/publish-article.mjs --file articles/my-article.md

# 保存为草稿（不发布）
node scripts/article/publish-article.mjs --file articles/my-article.md --draft
```

---

## 定期检查（每周）

> TikTok Analytics 数据通常需要 24-48h 才能在 dashboard 中看到。

### Analytics 闭环

```
① 检查 pending-analysis.json
   │  新 session 时 agent 自动检查
   │  超过 48h → 提醒导出 CSV
   │
② 导出 TikTok Analytics CSV
   │  登录 https://analytics.tiktok.com
   │  → Content → 选时间范围 → Export
   │
③ 运行分析脚本
   │  node scripts/short-video/fetch-tiktok-analytics.mjs --csv <csv-path>
   │  → 输出 output/analytics-export.json
   │
④ 录入 A/B 测试
   │  node scripts/short-video/ab-test-tracker.mjs --result output/analytics-export.json
   │
⑤ 标记完成
      Agent 将 pending-analysis.json 的 status 改为 "done"
```

### CSV 导出说明

1. 用你的 TikTok 账号登录 `analytics.tiktok.com`（不需要开发者账号）
2. 进入 Content 页面
3. 选择时间范围（如最近 7 天）
4. 点击 Export 下载 CSV
5. CSV 包含：视频标题、发布时间、播放量、完成率、分享、收藏、评论、点赞

脚本使用模糊匹配解析列名，所以即使 TikTok 版本更新导致列名略有变化也能处理。

---

## 文件参考

| 文件 | 用途 |
|------|------|
| `output/pending-analysis.json` | 待分析视频记录（publish-tiktok.mjs 自动写入） |
| `output/analytics-export.json` | 标准化分析数据（fetch-tiktok-analytics.mjs 输出） |
| `output/ab-test-results.json` | A/B 测试追踪（ab-test-tracker.mjs） |
| `output/tiktok-caption.txt` | TikTok 发布用的 caption（verify-video.mjs 自动生成） |
| `output/tiktok-metadata.json` | TikTok 发布用的元数据（verify-video.mjs 自动生成） |
