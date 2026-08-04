# Manual Ops — 需要人工操作的事项

> 创建于 2026-08-03。集中所有需要人工执行的步骤，按频率分类。
> Agent 在相关工作流中会引用此文档。
> HITL 检查点定义见 `docs/content-pipeline.md` 的「Human-in-the-Loop (HITL) 检查点」章节。

---

## HITL 人工确认检查点

> 管线设 3 个强制人工确认点。Agent 到达时必须暂停，等待用户确认后才继续。

| 检查点                  | 位置                           | 审阅内容                                         | 确认语              |
| ----------------------- | ------------------------------ | ------------------------------------------------ | ------------------- |
| **HITL-1** 文章审阅     | Stage 1 完成后                 | 文章全文（frontmatter + markdown + widget 标记） | 「文章 OK，继续」   |
| **HITL-2** 视频脚本审阅 | Stage 3 完成后                 | scene-data.mjs（场景脚本、voiceover、视觉描述）  | 「脚本 OK，做视频」 |
| **HITL-3** 视频成品审阅 | Stage 5 内部（验证后、发布前） | 视频成品 mp4 + verify-video.mjs 报告             | 「视频 OK，发布」   |

**用户审阅要点**：

- **HITL-1**：叙事逻辑、数据准确性、Widget 选择、「My Take」章节质量
- **HITL-2**：Hook 吸引力、叙事逻辑、数据准确性、场景数量和总时长、CTA 有效性
- **HITL-3**：实际观看视频、TTS 语音自然度、字幕准确性、视觉动画流畅度、有无渲染问题

---

## 每次发布视频时

> **前置条件**：HITL-3 已通过 + `publish-tiktok.mjs` 已执行（视频已发布到 TikTok）。
> 视频通过 `verify-video.mjs` 检查 → 用户确认 → 脚本发布后，在 TikTok App 中需要手动完成的操作。

| #   | 操作               | 说明                                     | 为什么                                  |
| --- | ------------------ | ---------------------------------------- | --------------------------------------- |
| 1   | **AIGC 标签**      | 发布界面打开 "AI-generated content"      | TikTok 要求标注 AI 内容，不标注会被降权 |
| 2   | **趋势音频**       | 从 TikTok 音频库选热门音乐，音量设 5-10% | 趋势音频提升发现率                      |
| 3   | **地理标签**       | 添加 China/US 位置标签                   | 本地内容算法优先推同区域用户            |
| 4   | **Pinned comment** | 发布后置顶含文章 URL 的评论              | 引导流量到网站                          |
| 5   | **回复评论**       | 发布后 1 小时内回复所有评论              | 首小时互动信号影响算法推荐              |
| 6   | **非高峰时段**     | 查看粉丝活跃时间，选低峰发布             | 竞争少，算法更容易推                    |

### 发布后自动提示

`publish-tiktok.mjs` 发布成功后会：

1. 打印 24-48h 分析提醒
2. 写入 `output/pending-analysis.json`（记录待分析状态）

---

## 每次发布文章时

> **前置条件**：HITL-1 已通过（文章已审阅确认）。

| #   | 操作               | 说明                                                                                                                                                           |
| --- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **检查 widget**    | 确认文中引用的 widget 已注册且已部署。如有新 widget，先部署再发布。                                                                                       |
| 2   | **部署新 widget**  | 1. `npm run build` 构建（包括 widget 代码）<br>2. 访问 Lovable 编辑器 → 点击「Publish」部署。<br>**注意**：不要直接用 `npx wrangler deploy`，会丢失 Lovable 注入的环境变量。 |
| 3   | **运行发布脚本**   | `node scripts/article/publish-article.mjs --file <path>`                                                                                                       |
| 4   | **上传源文件附件** | `node scripts/article/upload-attachments.mjs --post <slug> --files <path1> [path2 ...]`。所有引用的原始素材（PDF、报告等）必须上传。可用 `--list` 查看已有附件 |
| 5   | **验证**           | 访问 `/posts/{slug}` 确认文章显示正常，widget 渲染正确，attachments 列表完整                                                                                   |

### 发布脚本用法

```bash
# 发布文章
node scripts/article/publish-article.mjs --file articles/my-article.md

# 保存为草稿（不发布）
node scripts/article/publish-article.mjs --file articles/my-article.md --draft

# 上传源文件附件（发布后执行）
node scripts/article/upload-attachments.mjs --post my-article --files docs/refs/source-materials/source.pdf

# 上传多个文件
node scripts/article/upload-attachments.mjs --post my-article --files source1.pdf source2.csv report.docx

# 查看已有附件
node scripts/article/upload-attachments.mjs --post my-article --list
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

| 文件                           | 用途                                                 |
| ------------------------------ | ---------------------------------------------------- |
| `output/pending-analysis.json` | 待分析视频记录（publish-tiktok.mjs 自动写入）        |
| `output/analytics-export.json` | 标准化分析数据（fetch-tiktok-analytics.mjs 输出）    |
| `output/ab-test-results.json`  | A/B 测试追踪（ab-test-tracker.mjs）                  |
| `output/tiktok-caption.txt`    | TikTok 发布用的 caption（verify-video.mjs 自动生成） |
| `output/tiktok-metadata.json`  | TikTok 发布用的元数据（verify-video.mjs 自动生成）   |
