# Analytics Workflow — TikTok 数据分析独立工作流

> 创建于 2026-08-16（从 `docs/content-pipeline.md` Stage 6 独立出来）。
> Analytics 是跨视频、跨时间的独立工作流，不绑定单次 Content Pipeline 周期。
> 手工操作清单见 `docs/manual-ops.md` 的「定期检查」部分。

---

## 为什么独立

Content Pipeline 是"写文章 → 做视频 → 发布"的单次周期（1-2 天）。
Analytics 是"发布后 48h → 导出 CSV → 分析 → 优化建议"的周级别循环。
两者周期不同、触发条件不同，混在一起容易误以为"做完一条视频紧接着做
analytics"，但实际上 analytics 需要等数据沉淀。

---

## 常规流程（每周）

```
① 检查 pending-analysis.json
   │  新 session 时 agent 被动检查
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

脚本使用模糊匹配解析列名，即使 TikTok 版本更新导致列名略有变化也能处理。

---

## 数据驱动优化建议

当 analytics 数据积累到一定量后，Agent 在分析完 CSV 数据时可以做以下
判断：

### 数据量门槛

- **>10 个已发布视频**且有完整 analytics 数据时，Agent 开始做跨视频
 对比分析
- **<10 个**时只做单视频数据录入，不做模式分析（样本太小不可靠）

### Agent 能做的事

Agent 从 analytics JSON 中提取模式，例如：

- 哪类场景（hook / data / narrative / cta）的完播率最高/最低
- 视频时长与完播率的相关性
- 发布时间与播放量的相关性
- A/B 测试变量（有无 BGM、不同 hook 类型等）的对比结果

### Agent 不能做的事

- **搜索和推荐具体竞品视频**——TikTok 搜索受地区限制（HK 代理被拒绝
  访问），且 TikTok 搜索结果按平台算法排序，不是按"和你内容类似的竞品"
  排序。Agent 无法准确找到"值得模仿的竞品视频"
- **判断哪个竞品视频值得模仿**——这需要人看完视频后的主观判断

### 当数据发现模式后

Agent 输出类似这样的分析报告：

> "你的 narrative 场景平均完播率 65%，data 场景只有 42%。可能 data 场景
> 的视觉呈现需要优化。建议你在刷 TikTok 时留意别人怎么做数据展示的
> scene。"

然后由 **用户自己决定**是否去找竞品视频参考。如果用户找到了，手动下载
后交给 Agent 分析（见下方）。

---

## 竞品参考视频分析（用户触发，非 Agent 搜索）

> TikTok 视频无法通过 yt-dlp 下载（反爬拦截），也没有官方下载 API。
> 详见 `docs/research/reference-video-extraction.md`。
> YouTube/Bilibili 可用 yt-dlp 自动下载。

### 触发方式

**用户主动触发**：在刷 TikTok/YouTube 时发现值得模仿的视觉风格，手动
下载视频后交给 Agent 分析。频率：约一两个月一次。

### 操作步骤

1. 用户在 Chrome 中手动下载参考视频（浏览器扩展或直接保存）
2. 将 `.mp4` 文件放到 `output/reference-videos/` 目录
3. 告知 Agent
4. Agent 执行：
   - ffmpeg 关键帧提取（1fps → ~60 帧用于 60s 视频）
   - Vision model 分析每帧（GPT-4o / Claude Vision / Qwen-VL）
   - 输出 media 策略报告 JSON，映射到 `MediaField` schema

### Agent 输出格式

```json
[
  { "scene": 1, "mediaType": "video", "animation": "zoom", "overlay": 0.7 },
  { "scene": 2, "mediaType": "image", "animation": "slide", "overlay": 0.5 }
]
```

> 此管线尚未实现。Issue 29 Part B 覆盖此内容。

---

## 文件参考

| 文件 | 用途 |
|------|------|
| `output/pending-analysis.json` | 待分析视频记录（publish-tiktok.mjs 自动写入） |
| `output/analytics-export.json` | 标准化分析数据（fetch-tiktok-analytics.mjs 输出） |
| `output/ab-test-results.json` | A/B 测试追踪（ab-test-tracker.mjs） |
| `output/reference-videos/` | 用户手动下载的竞品参考视频（按需） |

## 相关文档

- `docs/manual-ops.md` — 定期检查（每周）操作清单
- `docs/research/reference-video-extraction.md` — 视频下载可行性调研 + 竞品分析完整 spec
- `docs/content-pipeline.md` Stage 5 — 发布后自动写 `pending-analysis.json`
- `docs/research/multi-video-splitting-best-practices.md` — 留存模式研究

## Design Decisions & References

| Decision | Rationale | Source |
|----------|-----------|--------|
| Analytics 独立为单独工作流 | 发布后需等 48h 数据沉淀，与 1-2 天的 Content Pipeline 周期不同频 | 独立判断 |
| 数据量门槛 >10 视频才开始模式分析 | <10 样本太小，模式不可靠 | 独立判断 |
| 竞品参考视频由用户手动下载 | TikTok 搜索受地区限制，yt-dlp 无法下载 TikTok 视频 | `docs/research/reference-video-extraction.md` |
| Vision model 逐帧分析参考视频 | 60s 视频提取 ~60 帧（1fps），足以捕捉视觉风格变化 | 独立判断 |
