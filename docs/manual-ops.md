# Manual Ops — 需要人工操作的事项

> 创建于 2026-08-03。集中所有需要人工执行的步骤，按频率分类。
> Agent 在相关工作流中会引用此文档。
> HITL 检查点定义见 `docs/content-pipeline.md` 的「Human-in-the-Loop (HITL) 检查点」章节。

---

## HITL 人工确认检查点

> 管线设 1 个强制人工确认点。Agent 到达时必须暂停，等待用户确认后才继续。

| 检查点                  | 位置                           | 审阅内容                                         | 确认语              |
| ----------------------- | ------------------------------ | ------------------------------------------------ | ------------------- |
| **HITL** 视频成品审阅 | Stage 5 内部（验证后、发布前） | 视频成品 mp4 + verify-video.mjs 报告 + 文章 markdown + 场景概览 | 「视频 OK，发布」   |

**用户审阅要点**：

- 文章叙事逻辑、数据准确性、Widget 选择、「My Take」章节质量
- Hook 吸引力、叙事逻辑、数据准确性、场景数量和总时长、CTA 有效性
- 实际观看视频、TTS 语音自然度、字幕准确性、视觉动画流畅度、有无渲染问题

> HITL 确认后，Agent 依次执行：文章发布 → 源素材附件上传 → TikTok 发布（自动保存 URL 到文章）。详见 `docs/content-pipeline.md` Stage 5。

---

## 每次发布视频时

> **前置条件**：HITL 已通过（用户确认「视频 OK，发布」）。Agent 发布流程详见 `docs/content-pipeline.md` Stage 5。
> 以下为 TikTok App 中需要手动完成的操作。

| #   | 操作               | 说明                                     | 为什么                                  |
| --- | ------------------ | ---------------------------------------- | --------------------------------------- |
| 1   | **AIGC 标签**      | 发布界面打开 "AI-generated content"      | TikTok 要求标注 AI 内容，不标注会被降权 |
| 2   | **背景音乐**       | 使用 HITL 推荐的 BGM 或 TikTok trending sound，音量 5-12% | BGM 增加视频氛围，trending sound 算法加权更高 |
| 3   | **地理标签**       | 添加 China/US 位置标签                   | 本地内容算法优先推同区域用户            |
| 4   | **Pinned comment** | 发布后置顶含文章 URL 的评论              | 引导流量到网站                          |
| 5   | **回复评论**       | 发布后 1 小时内回复所有评论              | 首小时互动信号影响算法推荐              |
| 6   | **非高峰时段**     | 查看粉丝活跃时间，选低峰发布             | 竞争少，算法更容易推                    |

### BGM 两种方案

HITL 检查点时 Agent 会提供两个选项：

**选项 A — 混入视频（CC-BY BGM）**

Agent 从 `assets/bgm/` 池中自动选择一个 CC-BY 新闻 BGM，确认后通过 `mix-bgm.mjs` 混入视频。优点：可控、即刻起声、无版权风险。音量 12%。

**选项 B — TikTok trending sound（推荐）**

Agent 通过 `trending-sounds.mjs` 获取当前 TikTok trending sounds 并按内容关键词匹配，推荐用户在 TikTok App 内手动添加。优点：算法加权更高、无版权风险（TikTok 已授权）。音量 5-10%。

```bash
# Agent 在 HITL 时执行
node scripts/short-video/trending-sounds.mjs --content <dir>
```

> **为什么 trending sound 更好**：TikTok 算法对使用 trending sound 的视频有 discoverability 加权。混入视频的 BGM 不享受这个加权。所以如果 trending sound 中有匹配的，优先选 B。

### 发布后自动提示

`publish-tiktok.mjs` 发布成功后会：

1. 打印 24-48h 分析提醒
2. 写入 `output/pending-analysis.json`（记录待分析状态）

---

## 每次发布文章时

> **前置条件**：HITL 已通过（用户确认「视频 OK，发布」）。
> 文章发布由 Agent 自动执行（文章发布 → 源素材附件上传 → TikTok 发布 → 验证），详见 `docs/content-pipeline.md` Stage 5。

唯一需要人工操作的：如有新 widget，需在 Lovable 编辑器点击「Publish」部署（不要用 `npx wrangler deploy`）。

---

## 定期检查（每周）

> TikTok Analytics 数据通常需要 24-48h 才能在 dashboard 中看到。
> 完整 Analytics 工作流见 `docs/analytics-workflow.md`。

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

## 按需操作（低频率）

### 竞品参考视频下载

> 触发条件：用户主动发现值得模仿的视频，或 Analytics 数据发现模式后
> 建议参考（见 `docs/analytics-workflow.md` 数据驱动优化建议）。
> 预计频率：一两个月一次。

TikTok 视频无法通过 yt-dlp 下载（反爬拦截），也没有官方下载 API。需要
手动下载：

1. 在 Chrome 中打开目标 TikTok/YouTube 视频
2. 使用浏览器扩展（如 Video DownloadHelper）或直接保存视频文件
3. 将 `.mp4` 文件放到 `output/reference-videos/` 目录
4. 告知 Agent，Agent 运行关键帧提取 + vision 分析，输出 media 策略报告

> YouTube 视频可用 yt-dlp 自动下载，无需手动：
> `yt-dlp --cookies-from-browser chrome -f "best[height<=720]" -o "output/reference-videos/%(id)s.mp4" "<url>"`

详见 `docs/research/reference-video-extraction.md`。

---

## 文件参考

| 文件                           | 用途                                                 |
| ------------------------------ | ---------------------------------------------------- |
| `output/pending-analysis.json` | 待分析视频记录（publish-tiktok.mjs 自动写入）        |
| `output/analytics-export.json` | 标准化分析数据（fetch-tiktok-analytics.mjs 输出）    |
| `output/ab-test-results.json`  | A/B 测试追踪（ab-test-tracker.mjs）                  |
| `output/tiktok-caption.txt`    | TikTok 发布用的 caption（verify-video.mjs 自动生成） |
| `output/tiktok-metadata.json`  | TikTok 发布用的元数据（verify-video.mjs 自动生成）   |
| `output/reference-videos/`     | 用户手动下载的竞品参考视频（按需）                    |

## Design Decisions & References

| Decision | Rationale | Source |
|----------|-----------|--------|
| HITL 检查点设在视频成品审阅（发布前） | 文章+视频一旦发布难以撤回，在发布前设置唯一强制确认点 | `docs/content-pipeline.md` HITL 章节 |
| TikTok AIGC 标签必须手动开启 | TikTok App 发布界面无 API，Agent 无法自动标注 | TikTok 政策要求 |
| BGM 两方案并存（混入 vs trending sound） | trending sound 有算法加权但不可控，混入 BGM 可控但无加权 | `docs/research/tiktok-practical-guide-2026.md` |
| 竞品参考视频手动下载 | TikTok 视频无法 yt-dlp 下载，YouTube 可以 | `docs/research/reference-video-extraction.md` |
