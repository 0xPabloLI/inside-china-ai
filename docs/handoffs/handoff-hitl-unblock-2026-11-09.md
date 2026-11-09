# Handoff: HITL 解阻包（2026-11-09）

> Created: 2026-11-09
> Status: 待用户拍板（gate 未解；本文不改任何票状态、label 或 roadmap gate）
> Scope: roadmap Step 4 ② `#320` / `#434`；③ `#1160` / `#733` / `#734` / `#735` / `#738` / `#739` / `#747`
> 决策入口: §3 决策表；选定后按 §6 映射执行
> 相关: `docs/issue-roadmap.md`（Round CLXI，④ 队首 `#1028`）、`#291`（Active Wayfinder Map）

## 1. 为什么现在做

- Round CLXI 的 ④ 队首已到 `#1028`，其后只剩 `#1022` / `#446`。按每轮一张计，约 3 轮后 ④ 清空。
- ② 与 ③ 不会随轮次自动解除：gate 存续期瀑布每轮逐张跳过，④ 清空后整个瀑布就没有可领票，roadmap 会停在 HITL 墙前。
- 本包只做一件事：把 9 张票压成 9 个可回答的问题，并给每个问题 2–3 个有成本/风险标注的选项。你不需要先读原票。

## 2. 怎么用（预计 30 分钟）

1. 只看 §3 决策表，在每行选 A / B / C，或写自己的选项。
2. 想追细节时点开对应卡片（§4 / §5）；每张卡都链回原票。
3. `#320` 的「做不做」也在表里选；「什么时候动手」单独约 20–30 分钟（§5.2）。
4. 你选定后，我按 §6 执行：改 label、补决策评论、更新 roadmap ③ 段、必要时开新票。

## 3. 决策表

| 票 | 要你拍的问题 | A · 现在做 | B · 暂缓 / 收窄 | C · 关闭或改路线 | 推荐默认 |
| --- | --- | --- | --- | --- | --- |
| `#1160` | 相对帧 SFX cue 契约现在写，还是等 `#735` 的逐帧证据格式定稿？ | 只写设计文档：相对帧表达式、cue sheet 存档格式、与 `scene-audio.mjs`/`#735` 的边界、fail-closed 判据。约 1 session，零产线改动。 | 维持暂缓，等 `#735` 定稿。成本 0；将来从零定义、cue 落点散在临时脚本里。 | 关闭并入 `#735`。成本 0；失去索引价值。 | **B**：`#735` 是这份契约的消费者，先定它才不返工。 |
| `#733` | 现在建镜头配方卡层吗？若建，语义拍是 scene 内子结构，还是 scene 之上的一层？ | 最小版：`recipes/<category>.md` + `library.json` 索引，不动 scene 结构。2–3 session，改 `scenes/` 与 `lib/layout-contracts.mjs`（🔴 串行带）。 | 只做设计：定 schema 与落点，不写代码。半个 session 量级。 | 暂缓到 `#739` 之后。成本 0。 | **C**：配方卡要装的正是 `#739` 的版式拓扑，且两票同属 `scenes/` 串行带。 |
| `#738` | 主角光现在建吗？「谁是主角」由 scene 显式声明，还是由已交付的 `focusAnalysis` / `protectedRegions` 自动判定？ | 现在做：`tokens.ts` 的 `MOTION`/`HOLD`/`CAMERA` + `visuals.tsx` 落点已现成。1–2 session，改 `visuals.tsx` + `scenes/*.tsx`（🔴 串行带）。 | 先只定判据：「一帧内重点 ≤1 + 8 帧灭灯」如何机检。成本小，不碰渲染。 | 关闭或并入 `#739`。两票出自同一份 `composition-and-light.md` 的相邻章节。 | **A**，但把主角判定源定为 scene 显式声明：票面三层光参数与灭灯时序已具体，自动判定误判会把光打到配角上。 |
| `#739` | 现在补信息图语法层吗？范围只要「尺寸三档 + 空场判据」，还是含四种版式拓扑？ | 只做尺寸三档 + 空场判据：落 `tokens.ts` 的 `TYPE` + 仿现有 gate 的机检。1 session，不改 scene 结构。 | 全量四拓扑 + 「多」用矩阵。3+ session，改 5 个 scene 文件（🔴 串行带）。 | 暂缓。成本 0。 | **A**：尺寸档与空场判据是唯一能独立机检、且不依赖其他票的部分。 |
| `#734` | 这张票要哪几项，现在做还是并入 `#228`？ | 只做①确定性渲染：给已有随机/时间源注入 seeded 源 + frame-identical 断言单测。半天量级，低风险，不碰渲染入口。 | ①②③全做：加分段母版（段边界/单进程光栅一致/音轨混入/帧数断言）+ CI 三闸。成本高；macOS runner 在 `#731` 交付时已 15 分钟超时，CI 时长预算要你先给。 | 暂缓，或关闭①②只留③；②与 `dormant` 的 `#228`（Remotion 增量渲染）明确重叠，归属未裁。 | **A + ②并入 `#228`**：①是纯工程不变量、零口味裁决；②在重叠未裁前做等于双份实现。 |
| `#735` | 你要独立终检流程，还是量化阈值门禁（后者要先标定竖屏阈值）？ | 最小闭环：基于 `still-frame.mjs` 写每镜 2 帧验收声明 + 3×4 QA 拼图 + 独立 subagent 带帧号报告。成本中，风险低，无阈值争议。 | 全量量化判据：加静止段/高饱和碎屑指数等阈值。需先用真实包标定竖屏阈值，属口味/权衡裁决。 | 暂缓：`#759` 已挡掉那类坏图，`#731` 的 hold/settle 已结构性消除静止段。 | **A**：终检流程是纯流程增量；量化阈值另开票等真实包标定。 |
| `#747` | 字幕 token 是否升为 ASS 与 Remotion 双路径的唯一源，以及要不要新增手法？ | 纯重构：把 `ass.mjs` 两色/字体/描边/间距抽到与 `tokens.ts` 对齐的单一源，视觉零变化。成本小，风险低。 | A + 新手法：scale / 发光 / 下划线 / 胶囊，需先裁决手法清单、ASS 可表达性与 `DESIGN.md` 品牌令牌。 | 暂缓，或关闭并入 `#731` follow-up。 | **A**：纯重构不产生视觉风险，却一次性解除后续字幕样式票的硬编码；手法扩展另立。 |
| `#320` | 现在做自建 wechat→RSS 吗？（这会改变项目「不使用账号/扫码会话」的边界） | 做：我预置 compose/registry/单测，你执行 `docker compose up -d` + 扫码，约 20–30 分钟；之后我验证 feed 并接线 source-health。 | 暂缓：加 `dormant`，写明触发条件（例如某个公众号来源确实无法用公开 feed 补齐）。 | 关闭：继续用现有 12 个公开 feed，不引入扫码会话。 | **B**，除非你确认要引入公众号来源；Docker/Colima 已就绪，人工成本已从「部署环境」降到「扫码 + 起容器」。 |
| `#434` | 远端核查现在做，还是先由我准备核查表？ | 你按 §5.3 清单核查约 20 分钟并关票（9 条已发布视频 + 2 处配置页，低风险、可改回）。 | 我先准备核查表与 9 条深链，你有空再确认。 | 若远端 surface 已不存在，直接按「已完成」关票。 | **A**：仓库侧域名已修完，剩余 20 分钟且只需改自己的评论/资料页；早关票可让 ② 段只剩 `#320`。 |

## 4. ③ 组 A：视觉与分镜语法

### 4.1 `#1160` SFX 钉帧表相对帧契约设计

- **现状**：已决的是「不引入产线、只做契约设计、暂不引入音效层」；未决的是契约本身一字未写。前提已核：`lib/timeline.mjs` 确无 `sfx` / cue sheet，`sceneTimeline()` 产出 `offsetFrames`。
- **要你拍什么**：这份相对帧 cue 契约是现在就要，还是等音效层有 A/B 证据后再写？
- **依赖 / 陈旧**：正文 `Parent map: #732` 已关闭（正文 write-once，评论已说明）；`#1108` 已 `dormant`；与 roadmap Tier 行一致。依赖 `#735` 的逐帧证据格式。

### 4.2 `#733` 镜头配方卡层 + 语义拍分镜

- **现状**：`scenes/` 仍是 10 个按叙事角色分的文件，无配方卡目录、无 `library.json`。正文 4 个 Open Questions 全未答：卡落哪个目录/schema、`library.json` 是否复用、语义拍是 scene 内子结构还是 scene 之上的一层、26 词语表是否重定。
- **要你拍什么**：现在建这层配方卡吗？若建，语义拍是 scene 内部子结构，还是 scene 之上的一层？
- **依赖 / 陈旧**：依赖 `#739`（版式拓扑）、`#529`（`dormant`，升档批准）、`#291`。与 `#738`/`#739` 同改 `scenes/`，一次只能做一张。

### 4.3 `#738` 主角光体系

- **现状**：票内零评论。`components/visuals.tsx` 的 `FrameGlow` 只有 `amber|blue` 两值，是全屏边框泛光，没有「跟主角」能力。三层光参数与「转移灭灯 8 帧」票面已给出具体数值。
- **要你拍什么**：主角光现在建吗？「谁是主角」由 scene 显式声明，还是由已交付的 `focusAnalysis` / `protectedRegions` 自动判定？
- **依赖 / 陈旧**：正文把边界指向 `#731`，但 `#731` 已闭且 `tokens.ts` 已交付 `MOTION`/`HOLD`/`CAMERA`；该选项已可落地。与 `#739` 出自同一份参考文档相邻章节，可考虑合并。

### 4.4 `#739` 数据/对比信息图语法层

- **现状**：票内零评论。`scenes/` 已有 Data/StatReveal/Contrast/Context/InfoCard 五者；`text-gate.tsx`、`annotation-collision-gate.tsx` 存在但与视觉构图无关。4 个 Open Questions：尺寸三档的竖屏阈值、四种版式拓扑落点、空场判据是否进 CI、与已交付 `#668` 版面契约的边界。
- **要你拍什么**：现在补信息图语法层吗？范围只要「尺寸三档 + 空场判据」，还是含四种版式拓扑？
- **依赖 / 陈旧**：非目标里的 `#731` 已闭；`#735` 仍 open 且同带 gate。改 `scenes/` 与 `#733`/`#738` 同属 🔴 串行组。

## 5. ③ 组 B 与 ② 人工执行

### 5.1 ③ 组 B：渲染工程、验收闸门与字幕 token

#### 5.1.1 `#734` 渲染工程：确定性渲染 + 分段渲染母版 + CI 三闸

- **现状**：1 条评论，零交付。代码核查把票面前提缩小了：`remotion/src/` 里 `Math.random()` 0 处，`Date.now()` 仅 2 处且都在 `scene-gate-fixture.tsx` 的测试自旋等待；全仓无 `mulberry32`。真痛点是 `rerender.mjs:115` 与 `render-only.mjs:196` 都走整片重渲。CI 已有 `quality` 与 `pixel-render`，但没有「全 demo 严格编译 + 冒烟渲染」闸。
- **要你拍什么**：这张票你要哪几项、现在做还是并入 `#228`？
- **选项**：
  - **A｜只做①确定性**：给已有随机/时间源注入 seeded 源 + frame-identical 断言单测。半天量级，低风险，不碰渲染入口。
  - **B｜①②③全做**：另需分段母版（段边界、段内单进程保光栅一致、音轨混入、帧数断言）+ CI 三闸。成本高；macOS runner 在 `#731` 交付时已 15 分钟超时被取消，CI 时长预算要你先给。
  - **C｜暂缓**：等出片基线稳定再做（符合 2026-10-25 裁决 A）。
  - **D｜关闭①②，只留③**：②与 `dormant` 的 `#228`（Remotion 增量渲染）明确重叠，票内 Open Question 3 自己就承认归属待对齐。
- **推荐默认**：A（或 A+③），把②并入 `#228`。①是纯工程不变量、零口味裁决；②在重叠未裁前做等于双份实现。
- **依赖 / 陈旧**：①的紧迫度被票面高估（当前无随机源）；②与 `#228` 重叠未裁决；roadmap `:182` 已记「②与 #228 归属待对齐」。

#### 5.1.2 `#735` 量化验收闸门

- **现状**：3 条评论，零实现。两条互补路径已在别处交付：`#758`（证据图确定性采集）与 `#759`（`final-media-gate` 四项机械门禁）均已闭票，`broken-media` / `missing-provenance` / `invalid-provenance` / `provenance-pixel-mismatch` / `composed-provenance` 已在 `lib/final-media-gate.mjs` 落地。2026-10-18「坏 banner 连过 5 轮」的根因已被 `#759` 堵住；`#731` 交付记录明确把逐帧违规检测留给本票。仍开的是：逐镜验收帧号声明、QA 拼图（`contact_sheet` 为 PolyForm，只能重写）、静止段/光栅抖动竖屏阈值重算、独立 subagent 终检流程。`still-frame.mjs` 已存在。
- **要你拍什么**：你要的是独立终检这道流程，还是一套量化阈值门禁（后者要先做竖屏标定）？
- **选项**：
  - **A｜最小闭环**：基于 `still-frame.mjs` 写每镜 2 帧验收声明 + 拼 3×4 图 + 独立 subagent 带帧号报告。成本中，风险低，无阈值争议。
  - **B｜全量量化判据**：加静止段/高饱和碎屑指数等阈值。需先用真实包标定竖屏阈值，属口味/权衡裁决。
  - **C｜暂缓**：`#759` 已挡掉那类坏图，`#731` 的 hold/settle 已结构性消除静止段。
  - **D｜拆分**：A 先入 Track 1B，B 另开票等标定证据。
- **推荐默认**：D（先 A）。终检流程是纯流程增量、不依赖阈值裁决；量化阈值在没有真实包标定前落地只会制造误报。
- **依赖 / 陈旧**：票面「无逐镜静帧核对」仍真，但「靠人肉发现」已部分被 `#759`+`#731` 削弱，通读正文会重复开票；`#731` 交付记录是最强依赖。

#### 5.1.3 `#747` 字幕视觉 token 层

- **现状**：零评论、零交付，是组内最薄的一张。`lib/subtitles/ass.mjs:23-24` 两色写死，`:96` 用 `kt`/`kf` 标签；位置契约在 `lib/safe-zones.mjs:191` 的 `SUBTITLE_LANE`。前提已部分陈旧：`#731`（2026-11-05 闭票，PR #1138）已交付 `tokens.ts`（COLOR/TYPE/MOTION/HOLD/CAMERA 单一真值）与 `StaggerWords`（55ms），所以「无 token 层」不成立，真实缺口是 token 源未覆盖 libass/ASS 烧录侧。票内非目标已把动效原语归 `#731`（已闭）。
- **要你拍什么**：字幕 token 是否升为跨 ASS 与 Remotion 双路径的唯一源，以及要不要新增手法（scale / 发光 / 下划线 / 胶囊）？
- **选项**：
  - **A｜纯重构**：把 `ass.mjs` 两色 + 字体 + 描边 + 间距抽到与 `tokens.ts` 对齐的单一源，视觉零变化。成本小，风险低，依赖无。
  - **B｜A + 新手法**：需先裁决手法清单与 ASS 可表达性（胶囊需绘图标签或底框），并过 `DESIGN.md` 品牌令牌。
  - **C｜暂缓**：`#733/#738/#739` 未落地前字幕 token 无消费场景。
  - **D｜关闭并入 `#731` follow-up**。
- **推荐默认**：A。纯重构不产生视觉风险，却一次性解除后续所有字幕样式票的硬编码；手法扩展属品牌裁决，宜另立。
- **依赖 / 陈旧**：`#731` 已闭，票面「无 token 层」需按 `tokens.ts` 现状改口径；非目标里的 `#731` 已完成。

### 5.2 `#320` 自建 wechat→RSS 实例（人工动手）

- **票面**：OPEN，`enhancement` / `ready-for-human` / `P2`，2026-11-08 已解除陈旧认领，当前无 assignee。
- **真正剩下的**：Agent 写 compose + registry + 单测；你起容器、扫码、登记公众号；之后 Agent 验证 feed 并接 source-health。
- **前置已满足**（不用再装）：Docker 29.2.1、Colima 运行中（arch `aarch64`）、Docker Compose 5.0.2。
- **人工步骤**（约 20–30 分钟，前提 compose 已写好）：
  1. 优先用次要微信号；没有次要号就用主号 + 下列限流。
  2. `docker compose up -d`（清单由我先写进仓库；当前没有这个目录，具体路径在动手前定）。
  3. 打开服务 Web UI → 扫码登录。**这一步只能你本人手机确认**。
  4. 登记「动察Beating」为公众号，生成 feed，记下 feed URL 与 hash 路径。
  5. 验证任一条：`curl -s <feed-url> | head -40` 含 `<item>` 且 `<pubDate>` 可解析；最新条目距今 ≤ 14 天；跑一次 `search-sources` 后 `source-health.json` 里该源无连续零结果 streak。
  6. 限流写进容器 env：列表探测 1–2h 一次、日请求 < 200、超限熔断告警而非重试。
  7. 回滚：`docker compose down -v` → 删除或 quarantine registry 新条目 → 动察Beating 退回 Google CDP 轨（`source-registry.mjs:2328` 原条目保留不删）。
- **风险**：中。最坏情形是个号临时限流（通常可恢复），只影响动察Beating 单源；12 个公开 feed 主轨不受影响。
- **我能先做的**：compose（arm64 镜像 + 持久化 volume + 限流 env）、`source-registry.mjs:2404` 的 `createWechatRssSource` 工厂接入、tracking 字段按 `docs/archive/spec-wechat2rss-source-tracking.md`、source-health 年龄探针、curl smoke + `publishedAt` 断言、`docs/tools-catalog.md` 准入条目。
- **必须先裁决的边界**：`docs/research/wechat-rss-tracking-mechanisms.md` 写明「当前项目不使用账号、扫码会话或私有抓取器；只消费公开 Wechat2RSS Feed」，而 `#320` 正是要引入扫码会话。若做 `#320`，该文档边界段与「registry 换轨」的定位要一起改写；若不做，保持现边界。

### 5.3 `#434` 错误域名远端核查（人工核查）

- **票面**：OPEN，`bug` / `ready-for-human` / `P2`，无 assignee，最后活动 2026-10-04。仓库侧修复已由 PR #435（merge `2e79b466`，`48092cdd` + `ca00f111`）交付；只剩远端核查与域名归属裁决。
- **面 A · TikTok 账号资料页「网站」**：编辑资料 → 网站 → 期望 `https://chinaai.news`（`docs/tiktok/tiktok-profile-setup.md:44`）。粉丝 < 1000 时该字段锁定不可编辑，记「锁定」即为该项关闭依据。
- **面 B · TikTok Developer 应用三个 URL**：Website URL / Terms of Service URL / Privacy Policy URL = `https://chinaai.news` / `/terms` / `/privacy`（`docs/tiktok/tiktok-developer-setup.md:81-83`、`:93-95`、`:107`）。
- **面 C · 9 条已发布视频的置顶评论**：逐条检查是否出现 `chinaainews.com`；命中则编辑置顶评论为 `https://chinaai.news/posts/<slug>`，未命中记「无链接」。

| videoId | 发布日 | 标题（截断） |
| --- | --- | --- |
| 7691045312206474517 | 2026-09-30 | DeepSeek's desktop app was sitting on its own download server…（票内点名的出问题那条） |
| 7683933255170559253 | 2026-09-11 | BREAKING: China's DeepSeek V4.1 Flash beat the old Pro… |
| 7683963293676981525 | 2026-09-10 | OPEN SOURCE: China's 1.3 billion world model runs real-time |
| 7681262631520357652 | 2026-09-03 | Didi's new Robotaxi R2 driverless passenger service |
| 7680981075354602773 | 2026-09-03 | China's Zhipu AI just disclosed GLM-6.0 |
| 7679644897619561748 | 2026-08-30 | 6 billion active parameters just beat Claude at coding |
| 7678131003038240021 | 2026-08-26 | BREAKING: 382 million users |
| 7675814117906664724 | 2026-08-20 | BREAKING: A robot stock opened up 629 percent |
| 7671330202265439508 | 2026-08-08 | #creatorsearchinsights #seedance25 #chinaai |

- **关闭判据**：A 与 B 实测为 `chinaai.news`（或 A 记为字段锁定）；C 全部命中项已订正或确认无错链；Open Questions 的 `chinaainews.com` 归属裁决已落一条决定记录。
- **风险**：低。只读核查 + 编辑自己的评论，改错可再改回，不涉及发布新内容。
- **我能先做的**：9 条深链清单（`https://www.tiktok.com/@chinaainews/video/<id>`）、核查表与截图位、关票交付记录。仓库侧已核实：活跃配置全部正确；只剩 5 处非活跃引用（测试夹具/历史叙述），不需要再改。
- **陈旧前提**：正文「13 个文件 / 5 个内容包 / 3 个测试断言」是创建时快照；自 2026-10-13 起置顶评论只出 commentHook、`metadata.articleUrl` 留空（`docs/content-pipeline.md:569`），所以新包不再生成链接，面 C 只影响历史视频。roadmap `:172` 记 `P1·W1D`，票 label 是 `P2`，口径不一致但不影响人工动作。

### 5.4 ③ 组 gate 记录现状

| 票 | 票内 gate 记录 | 备注 |
| --- | --- | --- |
| `#1160` | 有：评论 `issuecomment-6702951049` | 显式 gate，解除条件写清 |
| `#733` | 有：评论 `6385990979` / `6704132063` | 随 ③ 整组 gate |
| `#734` | 无；仅 roadmap Tier 行 | 只读票会误判为可领 |
| `#735` | 无 gate 评论；有 3 条业务评论 | 同上 |
| `#738` | 无；票内零评论 | 风险最高 |
| `#739` | 无；票内零评论 | 风险最高 |
| `#747` | 无；票内零评论 | 风险最高 |

`docs/issue-roadmap.md:94` 把 ③ 整组写成带 `blocked-on: evidence` / 「待用户范围批准」**标记**，但实测票上没有该 label；gate 只存在于评论或 roadmap Tier 行。本包不据此改票；建议下一轮 roadmap 把「标记」改为「gate 记录（评论 / Tier 行）」，并给零评论票补一条纯信息 gate 登记评论（不改 write-once 正文）。

## 6. 决策后的执行映射

| 你的选择 | 我做什么 | 票 / roadmap 变化 |
| --- | --- | --- |
| **A · 现在做** | 在对应票补一条「用户已圈定范围」评论；把 state label 从 `ready-for-human` 改为 `ready-for-agent`；更新 roadmap ③ 行的 gate 状态。 | 票进入下一轮瀑布的可领队列；范围以你的原话为准，不由我扩写。 |
| **B · 暂缓 / 收窄** | 若整张暂缓：加 `dormant`，在评论写明触发条件；若只是收窄：保留 `ready-for-human`，把范围与不做项写进评论。 | roadmap ③ 行标 `dormant` 或「限定范围待做」；不再每轮重复评估。 |
| **C · 关闭 / 改路线** | `wontfix` 关闭并写明理由；若改路线，先给你一份新票草案，你确认后再开新票。 | 票从 ③ 段移除；若开新票，新票按正常 triage 入表。 |
| **`#320` 动手** | 我先预置 Docker/Colima 检查、compose 草案、feed 验证命令与回滚步骤；你执行部署 + 扫码；之后我验证 feed、写交付记录。 | `#320` 闭票；② 段队首推进。 |
| **`#434` 核查** | 我准备核查表（remote surface、期望值、截图位）；你确认后我关票并写交付记录。 | `#434` 闭票；② 段只剩 `#320`。 |

远程写入（issue 评论、label、关闭）需要你的授权；你选定后我会先列出将要执行的具体命令，再执行。

## 7. 边界

- 本文不改任何票状态、label 或 roadmap gate；决策前 ③ 组仍是 `ready-for-human`。
- 按 wayfinder 契约，HITL 票只能由真人交流解决，Agent 不代拍板；本文的「推荐默认」只是建议。
- 决策落库走 issue 评论（write-once 正文不动）；本文在决策执行完后按 `docs/DOCS-INDEX.md` 生命周期归档。
