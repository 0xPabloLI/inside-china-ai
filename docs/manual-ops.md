# Manual Ops — 需要人工操作的事项

> 创建于 2026-08-03。集中所有需要人工执行的步骤，按频率分类。
> Agent 在相关工作流中会引用此文档。
> HITL 检查点定义见 `docs/content-pipeline.md` 的「Human-in-the-Loop (HITL) 检查点」章节。

---

## HITL 人工确认检查点

> 管线设 1 个强制人工确认点。Agent 到达时必须暂停，等待用户确认后才继续。

| 检查点                | 位置                           | 审阅内容                                                        | 确认语            |
| --------------------- | ------------------------------ | --------------------------------------------------------------- | ----------------- |
| **HITL** 视频成品审阅 | Stage 5 内部（验证后、发布前） | 视频成品 mp4 + verify-video.mjs 报告 + 文章 markdown + 场景概览 | 「视频 OK，发布」 |

**用户审阅要点**：

- 文章叙事逻辑、数据准确性、Widget 选择、「My Take」章节质量
- Hook 吸引力、叙事逻辑、数据准确性、场景数量和总时长、CTA 有效性
- 实际观看视频、TTS 语音自然度、字幕准确性、视觉动画流畅度、有无渲染问题

> HITL 确认后，Agent 依次执行：将已审阅的 article draft 公开发布 → 源素材附件上传 → TikTok 发布（manual-guide 档：用户按 checklist 在 App 内发布，Agent 提供 publish-tiktok.mjs 指南；发布后用 `set-tiktok-url.mjs` 回写 URL 到文章）。制作期间可使用 `publish-article.mjs --draft` 保存非公开文章；最终公开由本次唯一 HITL 控制。详见 `docs/content-pipeline.md` Stage 5。

---

## 每次发布视频时

> **前置条件**：HITL 已通过（用户确认「视频 OK，发布」）。Agent 发布流程详见 `docs/content-pipeline.md` Stage 5。
> 第 1–2 项由 Agent 在 `tiktok-upload-prep.mjs` 里自动完成（该脚本驱动 Studio 网页版，AIGC 标记失败即中止；发布前还会用浏览器出口国家做硬门禁，默认 `SG`）。第 3 项可选——历史成功的手动发布也没有填（用户 2026-11-01 确认），网页路径没有该控件；第 4–6 项仍需人工。

| #   | 操作               | 说明                                                                                                                                                 | 为什么                                                    |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | **AIGC 标签**      | Agent 自动开启（读 `profile.aiDisclosure.required`）；`--no-aigc` 仅用于无配音视频，且与 `--publish` 同用时会被拒，须 `--confirm-unlabeled` 显式承担 | TikTok 要求标注 AI 内容，不标注会被降权；标签发布后无法补 |
| 2   | **背景音乐**       | 由 Agent 在上传脚本里一次挂好，默认 `--volume-db -15`                                                                                                | 播报必须压过音乐；音量按实测标定，不按感觉                |
| 3   | **地理标签（可选）** | 默认不做——历史成功的手动发布也没有填（用户 2026-11-01 确认），CDP 网页路径没有该控件；要加时走 `--save-draft`，在手机 App 补 Location 再 Post | 本地内容算法优先推同区域用户；对本账号的增量未实测 |
| 4   | **Pinned comment** | 发布后置顶含文章 URL 的评论                                                                                                                          | 引导流量到网站                                            |
| 5   | **回复评论**       | 发布后 1 小时内回复所有评论                                                                                                                          | 首小时互动信号影响算法推荐                                |
| 6   | **非高峰时段**     | 查看粉丝活跃时间，选低峰发布                                                                                                                         | 竞争少，算法更容易推                                      |

> **AIGC 标记不可补**：TikTok 发布后无法再添加该标记。所以 `tiktok-upload-prep.mjs` 把它放在发布前的必经步骤里，开关没打开就中止，不会静默发布。2026-10-25 的首条 Unitree 视频就是因为这一步缺失而裸发。

### 背景音乐

**Agent 一条龙完成，不再问用户选哪首**（用户决定 2026-10-25）。HITL 确认「视频 OK」之后，Agent 在 `tiktok-upload-prep.mjs` 里同一次运行挂上 Breaking News (Voxie)、设好音量、打 AIGC 标记、点发布。

```bash
node scripts/short-video/tiktok-upload-prep.mjs \
  --video output/{id}/{id}-v…-short.mp4 --content {id} \
  --sound "Breaking News" --sound-owner Voxie --volume-db -15 --publish
```

**出口地理硬门禁（#964）**：`--publish` 前脚本在自动化浏览器里读取 Cloudflare trace 的出口国家，与 `--expect-region`（默认 `SG`）比对；不一致、探测超时或 `loc=XX` 直接阻断（2026-10-25 那条 0 播的 CDP 发布出口在东京 Zouter/AS205548）。发布点击前会再探测一次。改 VPN 节点后重跑；只有确实要从别的地区发布时才改 `--expect-region`。结束时脚本按 profile 的 `manualGuide.steps` 打印覆盖差：Location 记为「两条路都没做」，in-app editing 是 App 专有，置顶评论与首小时互动是发布后手机补做。

**音量红线**：滑杆读数与「相对播报的 dB」不是同一个量（实测滑杆 −20 dB = 音乐比播报低 22.2 dB，听感偏轻），所以用默认的 −15 dB，脚本会回读滑杆值并在偏差超过 1 dB 时中止。推导与测量方法见 `docs/research/music-under-voice-calibration-2026-10.md`。

> 旧行为（2026-10-24 及以前）：HITL 时给出 A/B/C 选项（选项 A 用 `mix-bgm.mjs` 混入 CC-BY BGM，选项 B 用 `trending-sounds.mjs` 推荐 TikTok trending sound）。**已废弃**——不要再在 HITL 里问配乐问题。
>
> `mix-bgm.mjs` 与 `trending-sounds.mjs` 仍可用，但只在用户点名要别的音乐、或需要非 TikTok 表面（本地混流）时才用。`trending-sounds.mjs` 的算法加权理由仍然成立，只是不再作为默认提问路径。

### 发布前的输入形态（#1013，2026-10-30 起）

首条 CDP 发布的视频 72 小时后仍 0 播放，而之前四条 App 手动发布的读数是 210 / 285 / 419 / 372。根因未定，但当时这条路径的**输入形态**是可测量的「机器人」：每一下点击只有 press/release（零 `mousemove`），整条 Caption 是一次合成 paste，所有等待都是固定毫秒。现在脚本默认按人类形态走：

| 行为       | 现在的做法                                                                                               | 显式退出          |
| ---------- | -------------------------------------------------------------------------------------------------------- | ----------------- |
| 鼠标轨迹   | 每次点击沿带侧向弯曲的 Bézier 移动，末段减速，冲过目标 0.4–2px 再回正                                    | —                 |
| 逐字输入   | 可信 `insertText`，一次一个字符（含 emoji），间隔 30–120ms，句读处偶发 300–900ms 停顿；换行按真 Enter 键 | `--paste-caption` |
| 等待抖动   | 全部走 `PUBLISH_PACING` / 具名常量带（`[base, spread]`，spread ≥ base 的 20%），无裸毫秒                 | —                 |
| 发布前审阅 | `--publish` 时先播预览 5–15s、暂停、确认时钟走过再停，判定写进日志                                       | `--skip-review`   |
| 会话预热   | 先在 For You 滚动 2–4 次、每次停留 2.3–4.7s（合计约 5–19s），再打开上传页                                | `--no-warmup`     |

结果写在 `output/{content}/publish/tiktok/publish-log.jsonl`（每步一行 JSON，含 `step: "review"` 与 `reviewed`）。运行时自检：`node scripts/short-video/human-input-selftest.mjs`（断言页面收到的每个事件都是 trusted、零 paste）。

> 逐字输入之后要强制 Draft.js 从自己的 ContentState 重渲染一次（打一个空格再退格），否则 DOM 里看着有字、保存下来是空的（2026-10-24 那次丢了 708/1223 字符）。这一步原来是不管空格有没有落地都发退格，于是页面吞掉空格时退格删掉的是**最后一个真字符**，读回来像「打字丢了一个字」，白白回退成一次 paste。现在退格以「实测到文本变了」为前置条件，空格被吞就重发（最多 2 次），两次都没落地就**不发退格**。
>
> 这条路径在日志里的读法：`step: "caption"` 的 `poke` 字段是探针健康度——`"ok"`、`"retried"`（重发过）、`"space-dropped"`（空格没落地、没发退格）、`"not-restored"`（退格删多了）；回退 paste 时该行是 `mode: "paste-fallback"`，带 `lostAt` 指明丢在哪一步：`typing`（打字循环漏键）、`poke`（重渲染探针）、`after-poke`（探针看起来正常，settle 之后文本仍不对——正是 Draft 用自己的状态覆盖 DOM 的那种失败）、`paste`（本次没打字）。`space-dropped` 时 DOM 文本不能作为证据（Draft 根本没重渲染），所以即使读起来对也**强制走带校验的 paste**。

> 输入必须落在前台标签页：后台标签的 CDP 输入派发会被节流（实测同一条 14 点轨迹前台 0.33s、后台 65s）。`Target.activateTarget` 返回 ok 不代表可见，窗口在别的 Space 或被遮挡时标签页仍是 `hidden`。
>
> 脚本不再要求人工切窗口，判据也从「标签页可见」换成了「输入派发是否真的快」——两者会不一致：2026-10-31 实测一个新窗口在检查时自报 `visible`、几秒后变回 `hidden`，可见性检查放行、紧接着的 wheel 就 3s 超时。`openVisibleSession` 现在派发 `mouseMoved` 量延迟（健康 3–13ms，节流约 5s）；**要连续两次都超时**才判为节流，因为刚建标签页的第一次派发要建合成器，机器同时在跑渲染时也可能单次超时，单次采样会把健康但慢的标签页误判并白白重载一次。判为节流后先重挂到新窗口；新窗口也慢就开 `Emulation.setFocusEmulationEnabled`（实测同一标签页 5018ms → 3ms）。
>
> 跑起来之后仍有自愈：`Input.*` 超时会开焦点模拟并重试该命令（每会话最多 3 次，含开会话时已经用过的那一次，因为导航可能把模拟状态清掉），仍失败才向上抛。**滚轮是例外**：CDP 的 ack 超时不会取消已发出的派发，节流解除后原来那一发仍可能落地，重试就会多滚一截，所以滚轮只开模拟、不重发，由 `wheelScroll` 按「少送多少补多少」走脚本滚动并标注 `mode: js-fallback`；补偿之后还会再读一次滚动位置，把迟到落地的那一截按「目标位置 − 当前位置」收敛回来（fixture 实测三轮分别多滚 163px / 185px / 131px，差值报在 `correctedPx`）。两处坑已就地处理：**滚动位置要读真正在滚的那个元素**——For You 页滚的是 `#column-list-container`，`window.scrollY` 恒为 0、`window.scrollBy` 也无效；而且该容器是虚拟列表，`scrollTop` 赋值后会被应用钉回 0（实测写 300 读回 0），所以脚本兜底在那里本来就不可能有效——现在会实测脚本滚动了多少（`scriptedPx`），没动就直接如实报 `scriptedPx: 0` 且不给 `correctedPx`，而不是报一个没发生的校正。用了这条路会在 stdout 与 `publish-log.jsonl` 里记 `focusEmulated: true`——开会话时的记 `stage: "open"` 行，运行中自愈的另有 `recovered: true, stage: "mid-run"` 一行（带触发的 CDP 方法与是否重试）。
>
> 注意它**不改变真实窗口状态**——是「闸门解除」而不是「窗口到前台了」，所以页面自身基于失焦的行为（例如 blur 处理）在这种模式下不会发生；页面能不能加载则完全取决于网络，代理断了照样失败。

### 发布后自动提示

`publish-tiktok.mjs --auto`（Publora API 档，TikTok 当前默认关闭——启用需逐平台授权，见 `docs/content-pipeline.md` Stage 5）发布成功后会：

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

> **TikTok 登录策略（2026-09-07 起）**：TikTok 登录一律用专用全新 profile Chrome 实例（指纹等效无痕，登录态可留存复用）——常规浏览器/常规 CDP profile 登录已被风控拦截，不再尝试。启动与 proxy 路由步骤见 `docs/analytics-workflow.md`「TikTok 专用登录实例（默认路线）」。

```
① 检查 pending-analysis.json
   │  新 session 时 agent 自动检查
   │  status ≠ "done" 且超过 48h → 提醒导出 CSV
   │  （status 已是 "done" 的记录不再提醒——防误报，2026-09-20 口径统一）
   │
② CDP 抓取（默认路径，无需手动 CSV）
   │  TikTok Studio Analytics + CSI 直接抓取
   │  → hashtag-effect-tracker.jsonl（用 hashtag-effect-tracker.mjs upsert 落库）+ analytics-conclusions.md
   │  （手动导 CSV 为 fallback：登录 analytics.tiktok.com → Content → Export）
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
> `yt-dlp --cookies-from-browser firefox -f "best[height<=720]" -o "output/reference-videos/%(id)s.mp4" "<url>"`
>
> 用 firefox 而不是 chrome：firefox 的 cookie 库是明文，chrome 的解密要过 Keychain，无人值守时会挂在授权窗口上（#328）。管线内一律走 `lib/ytdlp-guard.mjs` 的 `ytdlpCookieSource()`，它固定到实际在用的 profile。

详见 `docs/research/reference-video-extraction.md`。

---

## 文件参考

| 文件                                                      | 用途                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `output/pending-analysis.json`                            | 待分析视频记录（publish-tiktok.mjs 自动写入）                                   |
| `output/analytics-export.json`                            | 标准化分析数据（fetch-tiktok-analytics.mjs 输出）                               |
| `output/ab-test-results.json`                             | A/B 测试追踪（ab-test-tracker.mjs）                                             |
| `output/{pipelineId}/publish/tiktok/tiktok-caption.txt`   | TikTok 发布用的 caption（verify-video.mjs 自动生成，#219 T02 起按平台目录隔离） |
| `output/{pipelineId}/publish/tiktok/tiktok-metadata.json` | TikTok 发布用的元数据（verify-video.mjs 自动生成）                              |
| `output/reference-videos/`                                | 用户手动下载的竞品参考视频（按需）                                              |

> 不带 `--content` 单跑 `generate-caption.mjs` 时，发布包落在 `output/publish/tiktok/`（无 pipelineId 段的 standalone 路径）。

## Design Decisions & References

| Decision                                                | Rationale                                                        | Source                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| HITL 检查点设在视频成品审阅（发布前）                   | 文章+视频一旦发布难以撤回，在发布前设置唯一强制确认点            | `docs/content-pipeline.md` HITL 章节                     |
| TikTok AIGC 标签由 Agent 自动开启                       | 标记只能在发布前设置，故做成发布流程里的 fail-closed 步骤        | TikTok 政策要求                                          |
| BGM 默认在平台后台挂（`tiktok-upload-prep.mjs` 一条龙） | 用户决定 2026-10-25：确认后直接挂音乐+标 AIGC+发布，不再问选哪首 | `docs/research/music-under-voice-calibration-2026-10.md` |
| 竞品参考视频手动下载                                    | TikTok 视频无法 yt-dlp 下载，YouTube 可以                        | `docs/research/reference-video-extraction.md`            |
