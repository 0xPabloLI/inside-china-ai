# Spec: 数字人生成管线整合（#214）

> Status: active · 2026-09-07 · Planning scale S2 · Risk R3（`scripts/short-video/` 核心管线、跨 step 契约、用户可见生产路径）
> 依据：grill 定案 10 项（本 session）+ 调研 `docs/research/dh-avatar-layout-best-practices.md`（13 源）+ 视觉模板 worktree `prototype/dh-layout-templates`
> 模型事实基线：`docs/research/digital-human-test-progress.md`（2026-09-04/05 定案）

## Problem Statement

短视频管线目前无法出现「主持人」：所有 scene 由素材图/视频 + CSS 版面 + TTS 配音构成，没有可说话的人物形象。用户希望部分 scene（先 hook/CTA）由本人真人形象的数字人出镜讲述，同时背景素材照常播放、Remotion 文字照常叠加，且数字人不遮挡任何关键内容（平台 UI 死区、烧录字幕、CTA、主素材重点区）。

## Solution

在 scene-data 新增可选的 `scene.avatar` 前景层声明。管线在 TTS 完成后、渲染前提供独立生成步骤：扫描包内 avatar 声明 → dry-run 计划（scene 清单/分段/预估成本）→ 用户批准 → Kaggle 免费 GPU 生成 talking-head 片段（驱动音频 = 该 scene 已生成的 TTS 音频切片）→ dh-upscale 超分 → 路径回写 `scene.avatar.videoPath` → Remotion 以右中竖形卡片前景层渲染。默认模型 EchoMimicV3 Flash v51（Kaggle T4，624×816，2x 超分 ≈1248×1632）；Modal A100 SoulX-FlashTalk 14B 为质量升级档，按包由用户授权启用。

## User Stories

1. As a 内容创作者, I want 在 scene-data 里用一个可选声明指定「这个 scene 由数字人出镜」, so that 我按 scene 粒度控制数字人使用而不影响其他 scene。
2. As a 内容创作者, I want 数字人由我的真人照片驱动, so that 出镜形象是我本人、无肖像权风险。
3. As a 内容创作者, I want 数字人讲的话就是现有 TTS 配音, so that 声音品牌与字幕对齐链完全不变。
4. As a 内容创作者, I want 生成前看到 dry-run 计划（哪些 scene、分几段、预估时长/成本）并批准, so that GPU 成本与耗时由我逐包控制。
5. As a 内容创作者, I want 默认走 Kaggle 免费 T4, so that 不产生费用；需要更高质量时再显式授权 Modal 质量档。
6. As a 内容创作者, I want 数字人以右中竖形卡片叠在最上层但不侵入平台 UI 死区/字幕带/CTA 区, so that TikTok 界面不遮人脸、人脸不遮关键信息。
7. As a 内容创作者, I want 数字人段内允许切出素材满屏, so that AI 面孔不连续出镜过久（多源支持的定性方向 + ≤3-5s 构图节奏；"3 秒"精确数字为单源传言，见 dh-presenter-usage-strategy-research.md Key Finding #1），留存不受损。
8. As a 内容创作者, I want 生成失败时可从断点恢复而不重跑全部段落, so that Kaggle 会话中断不浪费已完成段落。
9. As a 内容创作者, I want 数字人 scene 的帧审计包含「卡片位置合规（safe zone）+ 唇动存在 + 音画同步」检查, so that 坏帧不进入发布链。
10. As a Agent(管线执行者), I want scene-data 校验对未知 avatar 字段 fail-closed, so that 拼错的声明在 TTS 前就被拦截而不是渲染时才发现。
11. As a Agent(管线执行者), I want 生成步骤作为独立 CLI 存在且主流程只消费已生成的 avatar 文件, so that HITL 批准自然发生在两次调用之间，主流程可全自动重跑。
12. As a Agent(管线执行者), I want 远端生成任务记录进 remote-tasks 状态机, so that 与既有 Kaggle/Modal 任务共用同一套恢复/收割机制。
13. As a 运营者, I want 每包的生成耗时/平台/费用记入包内 report, so that 成本可核算（对齐 #214 scope 成本口径）。
14. As a 内容创作者, I want 不声明 avatar 的包行为与现状完全一致, so that 零回归。

## Implementation Decisions

1. **契约形态（grill 定案 3）**：`scene.media` 背景语义不动；新增 `scene.avatar = { videoPath, position, scale? }` 独立前景层。`videoPath` 由生成步骤回写；声明态只需 `avatar: {}`（或 `avatar: { intent: true }` 语义占位——tickets 阶段定稿最小 schema）。position 默认 `right-card`（变体 1′）。
2. **版面（grill 定案 4 / 调研裁决）**：右中竖形卡片 ≈420×550px @1080×1920，右缘 ≥180px（TikTok action rail 死区）、底缘在底部死区（≈400px）与烧录字幕带之上，与字幕带的 gap 在 safe-zones 体系中显式声明；卡片圆角+阴影，z 序在文字层之上、平台 UI 之下（平台 UI 由平台叠加，管线无需处理）。
3. **模型档（grill 定案 5）**：默认 EchoMimicV3 Flash v51（Kaggle T4，`scripts/kaggle/echomimicv3-test/echomimicv3_inference.py` v25/v51 配置，~14min/3.24s 段）；质量档 SoulX-FlashTalk 14B（Modal A100，$0.20/5.2s 段）仅在用户对包显式授权时启用。GPU 路由遵守 AGENTS.md 硬门槛——MLX/MPS 已有不可用实测记录（LongCat q4 / V-Express），Kaggle 免费 T4 为默认满足门槛。
4. **音频驱动（grill 定案 2）**：数字人生成的输入音频 = 该 scene 的 TTS 产物（现有 M4A→WAV 链）；scene 音频超出生成模型单段上限（如 EchoMimicV3 ~3.24s/段）时按既有音频对齐信息静音边界切段，段落拼接由 ffmpeg concat（帧数/时间戳严格顺序）。
5. **生成编排**：新独立 CLI（计划/批准/执行三态）：`plan` 输出 dry-run 计划文件；`run --plan` 经用户批准后执行——远端任务走 `run-gpu`（Kaggle kernel）+ `remote-task` 状态机（断点恢复沿用 `--resume` 机制）；产物经 `upscaleDigitalHuman()` 超分后回写 `scene.avatar.videoPath`。生成耗时/平台/费用落包内 report。
6. **主流程接线**：Remotion 渲染前若 `scene.avatar.videoPath` 存在且文件存在 → 拷贝进 `remotion/public/`（同 media 路径改写机制）并启用卡片层；缺失/损坏 → fail-closed 报错（不静默降级为无数字人，因为用户已为该 scene 付费生成）。
7. **段内切出（grill 定案 8）**：`scene.avatar.present?: [{from, to}]` 声明在屏区间（省略 = 满段在屏）；切出区间素材满屏。tickets 阶段验证 Remotion 序列裁切即可实现，不引入新渲染机制。
8. ** HITL（grill 定案 6）**：双重门 = 生成前 plan 批准（必须，天然人审）+ 生成后帧审计自动检查（卡片 safe-zone 合规、唇动存在、音画同步）。无硬 cap。三道关卡统一建立在渲染帧逐像素**时间标准差**上（10Hz 抽样、270px 工作分辨率，`lib/avatar-frame-audit.mjs`）：
   - **safe-zone**：强运动阈值（std>25）+ 连通域追溯——卡片被裁切在声明矩形内，其内容只能以连通的强运动延伸越界；无连通关系的背景动画（实测 std≤31）不触发（首版弱阈值全图判定被真实 E2E 的动画渐变背景误报，已由 dh-pilot-qwen4 scene 10 实测校准）。
   - **唇动**：嘴部区域时间标准差 ≥5.0。帧差均值在真实模型输出上不可分（实测 5.2 < 合成 fixture 标定的 6.0 下限），而时间标准差 35.6 vs 噪声 ≤3（约 10× 分离度）。
   - **音画同步**：TTS 能量包络与唇动序列的**首次起始点对齐**（±0.15s）。互相关在真实内容上被稀疏头部运动尖峰削平（峰 0.305 vs 滞后 0 处 0.280），起始点对齐同数据测得 +33ms。
9. **形象资产**：用户本人照片，路径进包配置（不入 git 的私有资产目录按 media-asset-management 约定落位）。

## Modified Files Impact（R3 必备）

| 文件/区域 | 变更 | 风险 |
| --- | --- | --- |
| `scripts/short-video/lib/scene-rules.mjs` | avatar schema 校验进 `runAllSceneDataChecks`（fail-closed：未知 avatar 子字段、videoPath 类型合法性、present 区间合法性；videoPath **文件存在性**归渲染期/main.mjs 插桩——scene-rules 保持纯函数） | 共享校验面，MRL-2/preflight 消费——新检查必须对无 avatar 包零影响（已验证：qwen4-preview 聚合结果逐字节不变） |
| `scripts/short-video/lib/safe-zones.mjs` | 新增 avatar 卡片矩形常量与「不侵入」断言 helper（复用现有 SAFE_ZONES 推导，不改既有常量） | 只增不改；既有 right-rail/subtitle-gap 消费方不受影响 |
| `scripts/short-video/lib/digital-human.mjs`（新） | 生成编排：plan/run/resume、切段、调 run-gpu、超分、回写、report | 新模块；失败不得污染 scene-data（回写仅在全段成功后） |
| `scripts/short-video/lib/render-remotion.mjs` | avatar 视频拷贝进 public + videoPath 相对化（镜像现有 media 机制） | 渲染前共享步骤；无 avatar 包路径零变化 |
| `scripts/short-video/remotion/src/`（新 AvatarCard 组件 + CtaScene 挂载点） | 前景卡片层渲染 + present 区间序列裁切 | Remotion 渲染面；无 avatar 时组件返回 null |
| `scripts/short-video/main.mjs` | 仅插桩：avatar 文件存在性校验（fail-closed）+ 计数日志；生成不在 main.mjs 内触发 | 主流程最小侵入 |
| `scripts/short-video/content/_test-fixtures` | avatar 声明 fixture（合法/非法/present 区间） | 测试基建 |

## Behavioral Scenarios（R3 必备）

1. 包无任何 avatar 声明 → 全管线行为与现状逐字节等价（校验、TTS、sourcing、渲染、审计零变化）。
2. scene 声明 avatar 但未生成（无 videoPath）→ preflight 校验 WARN 提示「待生成」，生成 CLI plan 可见；渲染期仍无文件 → FAIL（fail-closed），错误信息含补救命令。
3. plan → 未批准 → 不发生任何远端调用与文件写入。
4. Kaggle kernel 中断 → remote-tasks 记录断点，resume 只重跑未完成段落，已完成段不重新计费。
5. 生成成功但超分失败 → scene-data 不回写，包保持「待生成」态，错误含 dh-upscale stderr。
6. avatar 卡片与字幕带/CTA 区重叠（position 非法值或未来模板改动）→ 帧审计 FAIL，指明侵入的 safe zone 名称。
7. present 区间越界（from/to 超出 scene 时长）→ scene-rules 校验 FAIL。
8. 质量档（Modal）未授权却在 plan 中出现 → plan 拒绝执行并提示授权开关。

## Testing Decisions

- 只测外部行为：schema 校验的接受/拒绝矩阵、plan 文件内容、resume 幂等、回写原子性、safe-zone 断言判定、Remotion 组件对 avatar 存在/缺失的输出。
- 先例：scene-rules 校验测试（`runAllSceneDataChecks` 既有测试面）、dh-upscale 5/5 单测 + 真机 smoke、remote-task 45/45、render 探针（official-fit-render 先例——真实 Chromium 帧证据）。
- R3 失败基线（实现前实测修正）：scene-rules 当前对 `avatar` 字段**不可见**（fail-open——聚合结果逐字节不变），并非早先假设的「被既有校验拒绝」；template contract 只校验 `texts`。真实 red 起点 = 声明无校验（未知键被静默忽略），`checkAvatarContract`（票 01）据此建立 fail-closed。渲染层对未知字段的行为在票 02 实测。
- Kaggle 真机验证沿用 `docs/video-production-runbook.md` preflight + 真实数据命令；mock 层只覆盖编排逻辑。
- 帧审计：ffmpeg 合成 fixture 30 用例确定性覆盖（无网络、无模型输出；dynamic 卡片用时空亮度振荡，std≈32>强运动阈值——testsrc2 大部分区域仅弱动态，作 fixture 会静默漏检）；真实 E2E（dh-pilot-qwen4 scene 10，动画渐变背景 + 真模型卡片）三关通过：presence 70.4% / 唇动 std 35.6 / onset 偏移 +0.000s。

## Out of Scope

- 全屏 anchor 质量档的常规化（Modal FlashTalk 仅留授权开关，不做默认路径）
- Avatar matting/抠像（数字人融进背景场景）
- 文章配图/公众号数字人、直播、实时流式
- 多数字人对话 scene
- AI 虚拟形象生成（T2I 选型，#155 域）
- 唇形精修/后期配音替换

## Further Notes

- 选型与平台测试证据链：`docs/research/digital-human-test-progress.md`（20 条模型横评、平台矩阵、已否决项 Hallo3/LeapTalk/LongCat/V-Express）。
- 使用时机策略证据链（2026-09-08 deep research，85 源）：`docs/research/dh-presenter-usage-strategy-research.md`。核心结论：数字人定位=品牌符号/解读框架呈现者（非拟真记者）；声明白名单=CTA/payoff/程式化数据时刻，黑名单=hook 前 3 秒/高情感段/突发新闻；TTS 音色是第一杠杆、形象是第二杠杆；"3 秒法"精确数字为单源传言已降级。脚本 Agent 执行细则在 `docs/video-script-writing-guide.md`「数字人（scene.avatar）使用策略」节。
- 版面证据链：`docs/research/dh-avatar-layout-best-practices.md`；视觉模板：worktree `prototype/dh-layout-templates`（`prototype/` 分支，定案后可清）。
- 生成音频切段需要 scene 音频时长/静音边界信息——TTS 链已产 duration 与对齐数据，tickets T1 先核实其精度是否满足切段（不足则段边界放宽到标点静音处）。
- 成本口径：Kaggle 免费（0 美元，耗 30h/周配额） vs Modal 质量档 $0.20/5.2s 段；report 记录平台+耗时+费用三字段。
