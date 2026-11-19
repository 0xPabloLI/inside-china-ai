# Qwen4-Max 视频 HITL 审阅包

- 内容包：`scripts/short-video/content/qwen4-max-release`
- 成片：`scripts/short-video/output/qwen4-max-release/qwen-qwen4-max-release-v2026-11-19T06-44-02-short.mp4`
- 规格：1080×1920，9:16，30fps，79.0s，6.1MB
- Hook 封面：`QWEN4-MAX` + `-62%` + `TASK COST VS QWEN3.8-MAX` 从第 0 帧起可见；数字表达下降，副标题给出对比基线（subject/numberLabel 常驻，不再等入场）
- Hook 封面截图：`scripts/short-video/output/qwen4-max-release/qa/hook-cover-final.png`
- 当前阶段：HITL 审阅。未写文章、未发布 TikTok、未建 Studio 草稿。

## 1. MRL-3 结果

`node scripts/short-video/verify-video.mjs --tiktok --content qwen4-max-release`：

- 64 PASS / 3 WARN / 0 FAIL / 10 MANUAL
- 机械扫描：static worst 65f、subtitle-lane debris 10.2% — pass；帧分析 69 PASS / 2 WARN / 0 FAIL
- 平台发布包约束：TikTok caption 714 chars ≤ 2,200；hashtags 5 个
- 生成期字幕软警告：10 条 `cps > 20`，最高 28.9 CPS；未进入最终 FAIL

三条 WARN：

1. **时长 79.0s > 70s 建议线**。在 TikTok 10min 硬限制内，但超过本项目默认的 70s 最佳带。可选择保留 79s，或压到 70s / 拆两段。
2. **Hook 为纯文字**：`media: null` 是主动选择，避免第一帧被素材稀释。
3. **BGM 电平读数**：本地测量到 -28.3 dBFS 床底，但本轮未启用 BGM；发布时若挂平台音乐，按默认 `--volume-db -15` 回读校验。

## 2. 场景概览

| # | 场景 | 时长 | 版式 | 素材 | 口播主张 |
|---|---|---|---|---|---|
| 1 | hook | 5.04s | hero-center | 纯文字 | 阿里新旗舰把单任务成本从上代砍近三分之二 |
| 2 | spec | 7.46s | media-bottom-bar + 证据卡 | `qwen4max-launch.jpg` | 2.4T 总参数，每 token 仅激活 71B，另有 328B N-gram |
| 3 | architecture | 5.43s | media-bottom-bar + 证据卡 | `qwen4max-architecture.jpg` | 每四层中三层 GDN 压缩、一层 QSA 搜索 |
| 4 | context-window | 7.09s | stat-reveal | 无 | 1M context，原生视觉，长文档/截图单窗处理 |
| 5 | work360 | 12.68s | media-bottom-bar + 证据卡 | `qwen4max-work360-resampled.jpg` | Work360 覆盖 721 岗位，52.69 vs 47.74，+10% |
| 6 | agent-bench | 8.29s | stat-reveal | 无 | CodeArena WebDev 第 6；Agents' Last Exam 46.7 |
| 7 | industrial | 8.43s | media-bottom-bar + 证据卡 | `qwen4max-industrial-resampled.jpg` | 汽车零件编程 475min → 24min，95% 降幅 |
| 8 | live-delivery | 5.35s | stacked-cards | 无 | 先交付可用 v1，再迭代；插件开源 |
| 9 | caveat | 7.66s | stacked-cards | 无 | 数字为阿里自报；Max 闭源，小尺寸 Qwen4 承诺开源 |
| 10 | cta | 6.39s | hero-center | 无 | 成本降 62%，问题是谁拿到功劳 |

## 3. 本轮相对 Step 0 的口播微调

只改 TTS 可识别性和词数，不改数字、结论、归属：

- S2：`Qwen4-Max` → `Qwen 4 Max`（仅口播/字幕；屏幕品牌仍是 `QWEN4-MAX`）
- S5：`Alibaba's own Work360 test` → `Alibaba reported its own Work360 test`；`Qwen4-Max` → `Qwen 4 Max`；删 `that` 以守住 175 词
- S6：`scores 46.7.` → `scores 46.7 on that test.`（让 `seven` 不再落在 ASR 尾词检查上）
- S9：`Qwen4-Max` → `Qwen 4 Max`；`Smaller Qwen4 models are promised open` → `Smaller Qwen 4 models promised open`
- S1 口播未改（仍说 near two-thirds / last model）；屏幕 hook 已改为 `-62%` + `TASK COST VS QWEN3.8-MAX`，四轴自评结论不变（result-first，14 词，约 5.1s）

## 4. 跨轨一致性回检

`跨轨回检：SKIP | 视频 | 文章未写（本轮用户只要视频） | 重审版本：scene-data 2026-11-19T03-19-55`

- 没有文章 draft 可比；视频内部数字与官方博客/模型页一致。
- 官方美元口径：$4.43 → $1.67，62%；未使用中文稿的 58% 人民币口径。
- 置顶评论沿用 `metadata.commentHook`，`articleUrl` 为空，不带链接。

## 5. TikTok 发布包（HITL 后使用，不自动发布）

**Caption**

```text
Alibaba's new flagship just cut task cost by nearly two-thirds from its last model.
Qwen 4 Max is a 2.4-trillion-parameter model.
The trick is the attention stack: three of every four layers compress history, and the fourth searches it.
It reads a million tokens and sees images natively.
Alibaba reported its own Work360 test covers 721 job types.
On CodeArena's front-end leaderboard it ranks sixth.
In car-parts manufacturing, programming one workpiece fell from 475 minutes to 24.
It does not wait for a perfect answer.
Two caveats: these numbers are Alibaba's own, and Qwen 4 Max is closed.
The price of finishing a task just fell by 62%.
Follow for more China AI news.

#chinaai #qwen #alibaba #ai #technews
```

**Pinned Comment**

```text
Alibaba says Qwen4-Max cuts task cost by 62%. Would you trust a 2.4T model to finish a real job?
```

发布包文件：

- `scripts/short-video/output/qwen4-max-release/publish/tiktok/tiktok-caption.txt`
- `scripts/short-video/output/qwen4-max-release/publish/tiktok/tiktok-pinned-comment.txt`
- `scripts/short-video/output/qwen4-max-release/publish/tiktok/tiktok-metadata.json`

## 6. QA 独立复核包

- 包：`scripts/short-video/output/qwen4-max-release/qa/review-request.md`
- 声明：`scripts/short-video/output/qwen4-max-release/qa/acceptance-frames.json`
- 联系表：`scripts/short-video/output/qwen4-max-release/qa/sheets/sheet-01.jpg`、`sheet-02.jpg`
- 机械扫描：static worst 65f（scene 5，limit 120f）；subtitle-lane debris peak 10.2%（warn 15%）— pass
- 独立 review 尚未执行：`qa-final-review.mjs --report` 要求 reviewer 不是实现者，需另一个上下文来完成；HITL 可先由用户看片。
- 素材修复记录：S5/S7 原始图短边 <720px，默认 Real-ESRGAN 对线稿会丢 tile，生成过只含中部的 `-upscaled.jpg`。已改为 `upscale: "resample"`（Lanczos），并强制 `mode: "card"` 以保留完整海报/图表；新版为 `-resampled.jpg`。

## 7. 审阅要点

- 实际观看：TTS 语音、字幕、节奏、转场、是否有渲染问题
- Hook 前 3 秒 muted 是否仍然成立
- 三个数字口径：2.4T / 71B、52.69 vs 47.74、475 → 24
- 79s 是否接受；若不接受，选择压到 70s 或拆两段
- Caveat 是否足够清楚：Work360 为阿里自报、Max 闭源
- 审阅通过后，再决定是否走 `tiktok-upload-prep.mjs` 准备 Studio 草稿；公开点击仍由用户完成。
