# Issue Roadmap — Open Issues 依赖关系与执行顺序

> **本文件是放置与依赖索引，不是台账**（2026-09-24 Round J 结构精简，296KB → 约 35KB）：每票一行，只回答「在哪条 Wave / 哪层 Tier / 与谁冲突」。
> 票的实时状态与标签以 `gh issue list --state open` 为准，**本文件不缓存状态**；交付叙事与证据的唯一权威源是 **issue 评论**（`gh issue view <N> --comments`）。
> 历史叙事与已闭票行 → [`archive/roadmap-tables-archive-2026-09-24.md`](archive/roadmap-tables-archive-2026-09-24.md)；更早逐轮盘点 → [`archive/roadmap-inventory-history-2026-09-23.md`](archive/roadmap-inventory-history-2026-09-23.md)。
> **维护规则**：新票分流后加一行；**闭票即删行**（交付记录写进闭票评论）；每轮盘点只改「当前状态」的 Last inventory 一行。

## 当前状态

> **Last inventory**: 2026-10-11（**Round XX**：#421 交付闭票（PR #561，squash `ab3a699e`）——TTS 全量缓存命中跳过 forced alignment：`generateTTSWithEngine` 的命中 early return（`registry.mjs:259-261`）绕过对齐尾声，`subtitle-timing.json` 从不落盘，出片静默无字幕。修法：抽 `finalizeTtsResults()` 使两条出口统一汇合（Scene 顺序合并 + 对齐尾声；#198 签名缓存命中即免费复用；#232/#423 语义保留）；新 `assertSubtitleTiming()` 覆盖五个出片入口（main 4.5 / render-only 3.5 / rerender / rerender-full / realign-render）渲染前 fail-closed（缺文件/损坏/签名过期/0 cues；纯视觉 N/A）；render-only 补 normalize 链确保签名同源；新 `lib/scene-audio.mjs` 优先 tts-meta sidecar 解析场景音频（遗留 mp3 与当前 wav 并存不再选旧 take/误报 stale），并约束 sidecar 路径必须在 audioDir 内（Semgrep file-sourced join 的真实修复）。验证：TDD 17 项（RED 基线在案）、真机冒烟 A 四场景（全命中补对齐 11.1s / 缓存复用 / 签名丢失 realign / 音频变化 ACOUSTIC_HARD_BLOCK）、render-only CLI 冒烟 B（删 timing→exit 1 无渲染；恢复→Gate1 PASS + 63.2s 成片；alibaba-ai-megabet 负面对照证明 normalize 链必要）、短视频全量 199 文件 4049 通过 0 失败、lint/tsc/语法干净、CI（Lint/typecheck/test + Semgrep×2 + Socket）全绿。遗留：digital-human 探测未并入 scene-audio（judgement call）；rerender 系列 hardcode v41-flash（既有）。frontier 更新为 #422 → #394。用户待办：`pending-analysis.json` 已超 48h，需导出 Analytics CSV。）；2026-10-11（**Round XIX**：#548 交付闭票（PR #554，squash `c019626b`）——TTS Quality Gate digit+unit 合并形匹配缺口（expected `720 P` vs heard `720p`，正确音频被 `TTS_ACOUSTIC_HARD_BLOCK`）。heard 侧镜像 #239：`splitDigitUnitToken` 与 `splitDigitUnits` 共用由 `UNIT_SPOKEN` 派生的白名单交替表（无第二份单位表），`buildExpandedAsrTokenSet` 为 `720p` 生成 `720`+`p` 别名（锚定整 token：`0x12a/10x/H100/B200/$1.4B` 不拆、`7200p` 不满足 `720`、`720k` 不生成 `p`），similarity 与 critical/tail 三处共同消费。验证：新测试 red→green（保存日志逐字 fixture：修前 missing `[720]`、修后 issues `[]`）；真机冒烟（保存 `scene-3.wav` + 真 whisper-cli large-v3-turbo）复现同形转写后通过（similarity 88.5%）；15 套相关 206/206、短视频全量 4039（仅 worktree 媒体缺失 2 文件环境失败、isolated rerun 绿）、CI Lint/typecheck/test + Semgrep×2 + Socket + droid-review 全绿；交付记录已落票（`delivery-record-missing` 自动摘除）。环境基线补充：新 worktree 还需同步 gitignored `voice-samples/`（否则 `infra-paths`/`tts-kaggle-batch` 假失败），已入 test-env-baseline。遗留：`buildExpandedAsrTokenSet` 三分支出现第四类别名时抽共享 alias extractor（judgement call）。frontier 更新为 #421（TTS seam 已解锁）。用户待办：`pending-analysis.json` 已超 48h，需导出 Analytics CSV。）；2026-10-11（**Round XVIII**：#555 新开并分流 P2·W1C——Python 测试套件未纳入 CI 且无单一可靠 runner。`ci.yml` 的 quality job 只跑 Vitest，`scripts/short-video/__tests__/*.py` 15 个文件从未在任何 workflow 执行（`test_claim_prompt.py` 的 `/100` 断言因此在 main 上一直红到 2026-10-11 手工修，`e6a0a198`）。更深一层：套件混三种 runner 风格，实测逐文件直接执行 8/15 跑 0 测试（7 个静默 exit 0 + `test_broll_warmup` `unittest.main` 收集 0 个、exit 5），`python3 -m pytest` 收集期撞模块级 `sys.exit` → INTERNALERROR abort。与 #466 同族（CI 绿灯 ≠ 检查了声称的东西）但轴不同（#466 是 skills/shared 私有子模块 → 技能层 `.test.mjs`），可并行；同改 `ci.yml` 须与 #447 协调。）；2026-10-11（**Round XVII**：#423 交付闭票（PR #551，squash `5473f149`）——TTS 候选/approved 缓存信任边界，失败/硬阻断路径不再作废已付费 GPU 产物。approved（`scene-N.tts-meta.json`）绑音频 sha256 digest + `SCENE_META_VERSION`，只有它跳过 GPU；盘上未最终验收的 take 记 candidate（旧格式 meta、质检失败、ASR 不可用、`TTS_SKIP_QUALITY_GATE=1`、中止 run 的存活 take），下轮本地 ASR 复检后原子晋级，硬阻断语义不变。registry：gate 块 `finally` 在所有退出路径结算本 run 每个 take；自愈 reroll 与 pacing 补偿轮改写 per-run staging（新增 `lib/tts/staging.mjs`），只有被接受的 take 晋级、失败 take 不可能覆盖既有音频；首轮直写 `audio/`（引擎身份从该路径派生）；`deriveContentIdFromOutputDir` 剥 staging 段（否则每轮推新 Kaggle kernel）；pacing 跳过已达/高于计划速度的通过 take。下游 `digital-human.mjs`/`avatar-frame-audit.mjs` 接受候选 sidecar 作时长来源。验证：真实素材冒烟（`deepseek-harness-desktop` 10 段已付费 Kaggle take）零 GPU 复检 → 8 段晋级、2 段真实截断 fail-closed，源包 51 文件逐字节未变；短视频套件 176 文件 3703 通过；全量 227 文件 4541 通过（3 条 jsdom 缺失 fork 错误与 main 同基线）；CI Lint/typecheck/test + 两条 Semgrep + Socket 全绿；droid-review 报 2 个 P2（reroll staging 泄漏、skip-gate 部分运行丢 take）已修（`5c9d2ff7`）并变异校验具判别力。环境基线提醒：新 worktree 需 symlink `remotion/node_modules` + 复制 `scripts/short-video/assets` 下 gitignored 媒体，否则 render 套件与 `tts-kaggle-batch` 假失败；push 直连 github.com:443 超时，走本地代理。遗留：`generateTTSWithEngine` 变长待拆分（Divergent Change）；存量合格 take 首次运行判候选做一次本地复检（设计内一次性成本）。frontier 更新为 #548 → #421（TTS seam 串行）。用户待办：`pending-analysis.json` 已超 48h，需导出 Analytics CSV。）
> **frontier**：W1A **#422**（Hook logo row 可用宽度与真实几何；先建真实 render 失败基线）；✅ **#421** 已交付闭票（2026-10-11，PR #561：`finalizeTtsResults()` 统一汇合 + 五入口渲染边界 fail-closed + `scene-audio` sidecar 解析）；✅ **#548** 已交付闭票（2026-10-11，PR #554：digit+unit 合并形别名，TTS seam 已解锁）；✅ **#423** 已交付闭票（2026-10-11，PR #551）。✅ 真实Kaggle TTS跑已解锁（**#231** 2026-10-09交付闭票：py3.13重钉版 + 离线wheelhouse挂载，在线/离线双路径真机取证；挂载冻结校验已由 **#521** 收口，PR #522）。W2B **#424**修crash优先于W1C **#447**正确性gate，两票同一owner或串行；W1D **#426**可独立推进。W3C原主链 **#391 → #334** 保留，#463布局决策不作为整链硬阻塞；#425/#357/#358/#547快赢可穿插。**待人工裁决**：#429最终链接失败政策、#430 Widget门禁、#431跨轨回检边界、#463素材布局、#466跨仓CI访问、#469站点经验治理、#519描述范围/缺素材政策、#541人工标注/实验预算；#535保留低紧迫度准入待证，#291/#216既有HITL仍保留。**#414 生产落地已裁决并落地**（2026-10-09：四档 → `buildWindowPlan()`，见 [`keyframe-extraction-research.md` §18.2](research/keyframe-extraction-research.md)）；**#391 的生产侧裁决已落地**（2026-10-10：引擎统一 Qwen 原生 + A1 转写，PR #543 关 #542；帧网格/分窗在生产退役、装载层零生产调用者，见同文件 §Q41㉕）——#391 余下部分只有判据研究与观测基建。开工前重新读取评论、状态、assignee与依赖API。
>
> 近轮一句话档案：**Round XII**（#521 交付闭票，PR #522：Kaggle wheelhouse 冻结集与 git 绑定——manifest 记名 + 字节数、kernel 装前校验、构建侧 fail-closed；先证伪 clone 墙钟与版本钉两条遗留，真机 5/5 PASS、10/10 变异被抓）；**Round XI**（#231 交付闭票——TTS 环境固化：py3.13 重钉版 + `cosyvoice3-wheels` 离线 wheelhouse，在线 633s / 离线 512s 双路径真机取证，4 个缺陷只有真机暴露；票面「省 ~10min」证伪为 ~2min）；**Round X**（#420 交付闭票——Kaggle 下载身份/新鲜度门：per-call staging + requestId 回写 summary + 晋级前身份/完整性校验，真 CLI 复现「跳过仍 exit 0」，PR #513）；**Round W**（#502 收口——pre-push osv 门禁经 #498 豁免机制恢复放行（实测 push 无需 --no-verify），cloud-gpu-options.md 历史 Modal token 泄露（public 2026-08-19 起）经用户轮换+旧 token 删除收口，历史清洗刻意拒绝）；**Round V**（#346 交付闭票——两层根因 + runPageGates seam 登录门先行，PR #501）；**Round U**（REST 全量复核 90 张 open 票、25 张评审评论/标签补齐，#466–#469 新增入排）；**Round T**（#414/#415/#417交付闭票，PR #436/#439；装载层官方单元QA无增益、音频价值在转写文本通道，详情见三票评论）；**Round S**（#391 裁决深化——判据研究先行与观测基建前置）；**Round R**（#360 收尾 minors 清账 PR #388 + #391 拆帧实验基建落地 PR #392/#395 + #397 补立 block #396）；**Round Q**（#360 长视频预处理 A+ 分期交付，真实冒烟 2.34×，质量审查 C1 修复，S8 语义修正回流 spec）；**Round P**（#361 PR #378 落地收口：3 findings 修复 + coverage 棘轮补测，按常设授权合并）；**Round O**（#319 Tier 1 安全攻坚收口：4 项 High/Critical 1 修 3 证伪 PR #380 合并；自主合并常设授权固化 git-workflow §7）；**Round N**（全量 62 票 open issues 分流清零、`needs-triage` 归零；W3C 认知底座组 #361→#360→#334 串行确立；W1C/W2B 分流归位）；**Round M**（全模态选型 handoff 定稿方案 C 主干，#351 解耦交付，#360 分流）；**Round L**（素材策略统一化组票 #354/#355/#356/#357 落位）；**Round K**（#297 交付 fail-closed 单模式落地闭票，legacy 删除）；**Round J**（#333 收口 / #269 母票闭票 / 结构精简）。全文见 [`archive/roadmap-tables-archive-2026-09-24.md`](archive/roadmap-tables-archive-2026-09-24.md) 与 issues/269 评论。

---

## Dominant & Satellite Issue Hierarchy（主导与卫星 Issue 层级）

在 Phase / Wave → Task → Issue 三层架构中，**Dominant Issue（主导 Issue / 锚点 Issue，标有 🎯）** 负责**定标准、定架构、立契约、设 Gate 或承接 Wayfinder Map**；**Satellite Issues（卫星 Issue / 子任务）** 围绕它展开并向其交付。下表保留已交付锚点作为架构来源；open排期以Wave/Tier表为准，新增票不另造总图或硬依赖。

| Phase                                                | Dominant Issue (🎯 主导票)                                                                                                                                                                                                               | Satellite Issues (挂靠卫星票)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 架构定位与统领关系                                                                                                                                                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 1: 管线可靠性与安全闭环**                    | ✅ **#271** TTS Quality Gate 语义分流与出片阻断 (P1, 已闭票)<br>✅ **#272** Avatar 唇同步时长一致性 Gate (P1, 已闭票)<br>✅ **#270** TTS instruct 标准机制级化 (P2, 已闭票)                                                              | → **#319** (OCR 审查安全攻坚, P1——Tier 1 收口 2026-09-26，余 Medium/Low 批次)<br>→ **#279** (语速整体上探与耦合, P2)<br>→ **#278** (Hook 文案句式规范, P2)<br>→ **#325** (lib unused exports 清理 + knip ignore 移除, P3)<br>→ **#327** (统一本地模型存放至 ~/models/, P3)<br>→ **#273** (并行经验与 CDP 并发锁, P2)<br>→ **#274** (Z-Image-Turbo 许可排查, P3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | #271 + #272 + #270 均已交付（Fail-closed 语义分流 + avatar 片段时长一致性 + instruct 单一来源三层门控）；新增 W1C 工程卫生与安全加固，#319 主导核心安全漏洞修复。 |
| **Phase 2: 检索体系与运行环境固化**                  | ✅ **#292** search-sources 体系性重审与通用/专用分流 (P1, 已闭票——grilling 裁决收口)<br>✅ **#287** 管线入口统一加载 .env.local (P1, 已闭票)<br>✅ **#309** 62 源用途定链审计 (P1, 已闭票——两条契约定链执行全部交付 `bc34f67`+`d0f2ea0`) | ✅ **#307** (Bigsong 直连 + Grok promptTemplate, P2, 已闭票)<br>✅ **#306** (brief-builder 测试日期衰减, P2 bug, 已闭票)<br>✅ **#311** (claim 脚本 @me assign 静默失败, P2 bug, 已闭票)<br>→ **#344** (SearXNG 覆盖面审计收敛, P2)<br>→ **#347** (package-lock 同步, P2 bug——PR #371)<br>→ **#353** (selector-health 运行时告警与去重开票, P2)<br>→ **#358** (reddit 403 判据修复 + SearXNG 候选, P2 bug)<br>→ **#328** (yt-dlp cookie 提取短超时与免 cookie 兜底, P2 bug)<br>→ **#329** (ffmpeg 代理契约断言, P2 bug)<br>→ **#320** (自建 wechat→RSS 实例, P2 [HITL])<br>→ **#312** (coverr 下载链失效, P2 bug)<br>→ **#313** (youtube bot-check 验证 Chrome cookie, P2 bug)<br>→ **#315** (交付记录门禁软提醒闭环与复检机制, P2)<br>→ **#305** (pool 静默零结果 A/B, P2——并入统一 source-health)<br>→ **#275** (全链路不自载缺陷, 由 #287 闭环)<br>→ **#285** (needsAuth 403 探针放宽, P2)<br>→ **#284** (Route C 循环引用消除, P2)<br>→ **#276** (web-deep-research 路由接入, P2)<br>→ **#286** (trend 模式相关性护栏, P2——裁决并入 #309 新闻参数)<br>→ **#281** (Search Pool 引擎可用性复测, P2)<br>✅ **#269** (死源自动修复 Phase 2, P2——已闭票 2026-09-24，交付审计见票评)<br>✅ **#231** (TTS 环境固化真机验收, P3——已闭票 2026-10-09：py3.13 重钉版 + 离线 wheelhouse，双路径真机取证)<br>→ **#318** (SearXNG 引擎数据, P3 挂起归入 #344)<br>→ **#352** (transformers 5.x 评估, P3 挂起)<br>→ **#326** (本地 ML 栈升级, P3 挂起)<br>→ **#348** (colima 替代品调研, P3 挂起) | #292 主导搜索链路宏观分流架构（已闭票，grilling 七项裁决落 #309/#307/#269/#310）；#287 主导环境变量单一入口加载契约，闭环 #275；#344 主导 SearXNG 精简审计收敛。 |
| **Phase 3: 视觉设计系统与媒体素材重构**              | 🎯 **#291** 短视频模板视觉设计体系重做 (P1, `wayfinder:map`)<br>🎯 **#310** 素材库体系——统一素材库 + 文字描述索引 + 收获率 log (P2, 吸收 **#288**/**#301**)<br>✅ **#298** B-roll T2V 画质选型（已闭）<br>✅ **#361** 方案 C 全模态引擎（已闭） | ✅ **#360** (长视频预处理, P2——已闭票：分级分段分析 + offset schema/渲染；跨 Scene 绑定并入 **#355**)<br>→ **#391** (拆帧策略——uniform/scene 可切换 + 真模型 bench 矩阵, P2)<br>→ **#397** (Phase 2 焦点产出消费方——布局解析缺口, P2)<br>→ **#396** (focus 内核 Haar→YuNet 候选, P3——被 #397 block)<br>→ **#334** (VLM Prompt 优化：Fit/claim 冗余/Reason, P2)<br>→ **#463** (素材语义与布局契约, P2——输入 #291)<br>✅ **#351** (vlm 缓存 key 解耦, P2 bug, 已闭票)<br>✅ **#375** (B-roll spawn env 默认值断言覆盖, P2 bug, 已闭票)<br>→ **#300** (外部赛道爆款解构基准, P2)<br>→ **#302** (外部开源 Repo 逐个深度追踪, P2)<br>→ **#301** (实拍库存视频优先策略改造, P2——并入 **#310**/**#355**)<br>→ **#314** (douyin/xhs 视频素材源 + CDP 新闻源视频能力重构, P2)<br>→ **#299** (Hook 前 3 秒专属视觉策略, P2)<br>→ **#289** (Scene->Prompt->Video 适配层, P2)<br>→ **#293** (Stage 0 素材预获取与缺口回流, P2)<br>✅ **#297** (素材匹配 Fail-closed 留空, P1, 已闭票)<br>→ **#354** (认领供给泛化——voiceover 派生 assetNeed+searchHints, P2——吸收 **#295**)<br>→ **#355** (统一素材兜底链——通用递降链替代五值策略, P2——承接 **#301** 链裁决)<br>→ **#356** (无主供给退役/认领化, P3——依赖 #354)<br>→ **#357/#425** (既有媒体 zoom/超分 opt-out 修复, P2 bug)<br>→ **#294** (VLM borderline 二度校验, P2)<br>→ **#295** (写稿 scene-data 概念泛化, P2——并入 **#354**)<br>→ **#253** (行业坐标系+hook 版式, P2)<br>→ **#304** (T2I 工具横评, P3)<br>→ **#529** (视频 skill 180 repo 吸收进产线——执行期跟踪, P3<br>🛰 卫星票挂 **#302**；catalog 完整收录已交付 PR #530) | #291 为视觉重做总指挥与 S3 Map，以 #300/#302 为输入；#310 主导素材库与索引；#298/#361 已交付的选型与认知底座作为后续输入，不再排 open 期；#354 负责认领供给泛化；#355 确立通用素材兜底链；#463 与 #397 协调布局/保护区消费。 |
| **Phase 4: 多平台发布通道与中文内容生态 (最终阶段)** | 🎯 **#296** 中文多平台发布架构 (P2, `wayfinder:map`)<br>🎯 **#268** 中文内容轨首包产出 (P2)                                                                                                                                              | → **#216** (视频号人工扫码 5 项实测, P2)<br>→ **#217** (管线适配视频号发布包, P2)<br>→ **#218** (视频号 CDP 自动化发布, P2)<br>→ **#220** (抖音发布通道落地, P2)<br>→ **#223** (小红书图文频道立项, P2)<br>→ **#206** (Auto-Redbook 试点, P3)<br>→ **#208** (降级图文帖路径, P3)<br>→ **#210** (TikTok 官方 API 发布, P3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | #296 为全渠道发布总图与 S3 Map，主导自研 vs Relay 架构决策；#268 产出合规中文样片物料，作为 #216 扫码实测的必要物料。                                                                                                    |

---

---

## Duplicate & Absorption Notes

| Issue                                       | Absorbed by                                  | Status & Action                                                                                                                    |
| ------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **#283** (fallback 链语义重审)              | **#292** (search-sources 体系性重审)         | ✅ **CLOSED (Duplicate)**：全部议题由上游大盘票 #292 完整覆盖吸收。                                                                |
| **#290** (Wan1.3B 文字数字视频效果差)       | **#298** (B-roll T2V 模型画质评测升级)       | ✅ **CLOSED (Duplicate)**：文字与数字测试集并入 #298 评测矩阵统一推进。                                                            |
| **#275** (search-sources 不自载 .env.local) | **#287** (入口统一加载 .env.local)           | ✅ **CLOSED (Delivered)**：#287 落地（`lib/load-env.mjs` + 三入口），联动闭票。                                                    |
| **#247** (Hook bigNumber 缺乏上下文)        | **#253** (行业知识层 Ontology + hook 版式库) | ⏩ **Dormant**：待 #253 交付后覆盖关闭。                                                                                           |
| **#288** (媒体素材补全与 RAG 兜底 Catalog)  | **#310** (素材库体系)                        | ⏩ **并入**：2026-09-15 grilling 裁决——实体图库与官方肖像由 #310「统一素材库 + 文字描述索引」承接。待 #310 交付后覆盖关闭。        |
| **#301** (实拍库存视频优先策略改造)         | **#310** / **#355**                          | ⏩ **并入**：库存视频供给切片归 #310，优先级链架构裁决归 #355（2026-09-24 提案）。待 #310/#355 交付后覆盖关闭。                    |
| **#286** (trend 模式相关性护栏盲区)         | **#309** (62 源用途定链审计)                 | ⏩ **并入**：2026-09-15 grilling 裁决——相关性护栏并入 #309 新闻参数（publishedAt 两档 + 7 天窗）一并落地。待 #309 交付后覆盖关闭。 |
| **#295** (写稿 scene-data 概念泛化)         | **#354** (认领供给泛化)                      | ⏩ **并入**：2026-09-24 提案裁决——searchHints 映射机制倒置为 voiceover 派生的默认环节（triage 方案 1 原样继承）。待 #354 交付后覆盖关闭。 |
| **#280** (search-sources 不自载 .env.local) | **#275**                                     | ✅ **CLOSED (Duplicate)**                                                                                                          |
| **#282** (search-pool skill 跨 repo 同步)   | —                                            | ✅ **CLOSED (Superseded)**：已由前序 commit 同步闭环。                                                                             |
| **#318** (SearXNG 全量引擎启用)             | **#344** (SearXNG 覆盖面审计收敛)            | ⏩ **并入/挂起**：作为 #344 精简审计的引擎支持矩阵输入数据，不单独推进实施。                                                        |
| **#326** (本地 ML 栈安全升级)               | **#352** (transformers 5.x 升级链)           | ⏩ **协同挂起**：本地不可达 CVE 已 dismiss，待上游（whisperx、huggingface_hub <1.0）解除版本约束后联动评估。                        |

---

---

## Execution Waves（执行波次总表）

每行只列 **open 票**（状态看 tracker，不看本表）；已闭 Wave 的结论在「并行/依赖」列留一行，细节见 archive。

| Wave | 主题 | 涉及目录 | open 票 | 并行 / 依赖 |
| --- | --- | --- | --- | --- |
| **W1A** | 既有门控与产物可靠性续补 | `lib/tts/` `main.mjs` `render-only.mjs` `HookScene.tsx` | #422 #394 | #271/#272已交付；#420 已交付闭票（2026-10-09，产物身份/新鲜度）；#423 已交付闭票（2026-10-11，PR #551：候选/approved 信任边界）；#548 已交付闭票（2026-10-11，PR #554：digit+unit 合并形别名，TTS seam 解锁）；#421 已交付闭票（2026-10-11，PR #561：`finalizeTtsResults()` 全命中补齐对齐 + 五入口渲染边界 fail-closed + `scene-audio` sidecar 解析）；#394先收窄范围 |
| **W1B** | 参数标准化与听感 | `lib/tts/` `docs/content-pipeline.md` | #279 #278（HITL）｜D：#228 | #270 已交付（instruct 单一来源） |
| **W1C** | 工程卫生、安全与状态治理 | `src/` `scripts/` `docs/` `eslint.config.js` `.github/workflows/` | #319（🎯P1）#325 #327 #404 #447 #462 #466 #555 | #447全量正确性gate先协调#424；#404迁移与#462身份契约待收口，#466跨仓访问HITL；#555（Python测试入CI）与#466同族（CI绿灯≠检查了声称的东西）但轴不同，可并行；具体并行看冲突矩阵 |
| **W1D** | 内容包一致性与发布契约 | `scripts/article/` `lib/platforms/` `docs/content-pipeline.md` `src/components/widgets/` | #426 #429 #430 #431 #434 | #426幂等恢复可独立；保留#95双轨，#429/#430/#431先裁决；#434只余远端人工核查 |
| **W2A** | 搜源可用性摸底与环境底座 | `skills/search-pool/` `main.mjs` `lib/load-env.mjs` | — | ✅ 完成（#287/#281 闭票），解锁 W2B |
| **W2B** | 搜源架构重审与修复闭环 | `search-sources.mjs` `lib/source-*.mjs` `lib/search-pool.mjs` `skills/shared/` | #424（P1）#344 #347 #353 #358 #390 #405 #416 #457 #467 #468 #469 #320（HITL）#328 #329｜D：#286 #318 #322 #326 #348 #352 | #424先修crash、#447防回归；#416先分辨上游缺日期；#457先定指标/预算后试点，#467不等族表重测；#390/#405/#468需范围/契约收口，#469治理HITL；#344仍为收敛主导；#346 已交付闭票（2026-10-07）；#231 已交付闭票（2026-10-09，TTS 环境固化） |
| **W3A** | 视觉与竞品深度调研（调研先行） | `docs/research/` `lib/b-roll/` | #291（🎯map）#300 #302 #529 #304 | #298画质选型已交付闭票；#529为#302卫星票、执行期逐条HITL；🟢 只读调研可并行，视觉重设计先收口#291 |
| **W3B** | 媒体底座与素材体系 | `asset-sourcer.mjs` `lib/media-track.mjs` `knowledge/media-catalog.json` `lib/b-roll/` | #310（🎯）#293 #314 #354 #355 #356 #357 #425 #547 #535｜D：#288 #301 | #310 吸收 #288/#301；#297 fail-closed 已闭票；#355 承接 #301 链裁决；#354 吸收 #295；#425尊重既有upscale:false契约；#547修下载前后pre-filter语义；#535低紧迫度准入待证、不默认付费，裁判评估归#541 |
| **W3C** | 画面适配与智能写稿 | `scene-data.mjs` `lib/visual-analyzer.mjs` `vlm_analyzer.py` `NarrativeScene.tsx` | #391（🎯判据研究）#334 #541 #540 #519 #397 #396 #463 #289 #299 #294 #253 #244 #256 #263（多为 HITL）｜D：#295 | #351/#361/#360及#415/#417已交付；#391→#334主链保留；#541图片量化证据输入#334，标注/预算先定；#540研究分用途；#519延展已有契约输入#291；#463与#397保护区消费协调；#396仍被#397 block |
| **W4A** | 平台架构调研与中文首包 | 视频号后台 `docs/research/` `content/` | #296（🎯map）#268 #216（HITL）｜D：#210 | 真机实测先行 |
| **W4B** | 发布包适配与自动发布 | `lib/platforms/` | D：#217 #218 #220 #223 #206 #208 #222 | 🔴 硬前置：等 #216 实测数据 + 用户立项授权 |

### Execution Semantics（三层执行语义规范）

三层结构各司其职，紧密联动：

1. **Wave（波次）**：**执行摘要与全局推进顺序**。基于技术依赖、业务里程碑与「调研先行」原则合成。新 session 启动时，**首先查看当前最早未完成的 Wave**。
2. **Tier（分级）**：**完整 Issue 资产库的权威价值位置**。按对生产力与内容质量的实质推动力划分（Tier 1 核心底线 > Tier 2 能力增强 > Tier 3 工具合规 > Dormant 冻结）。同一 Wave 内选票时，**Tier 1 绝对优先于 Tier 2/3**。
3. **Conflict Risk Matrix（并发风险矩阵）**：**多 session 或跨 issue 并行的唯一终审裁决来源**。Wave 表中的并行说明仅为业务初筛；任何具体代码编写前，**必须核对文件级冲突矩阵**。

---

---

## Detailed Phase Roadmaps（阶段执行分解）

### Phase 1: 管线可靠性与核心安全门控 (Pipeline Stability & Core Guardrails)

- **阶段目标**：杜绝坏 take 静默出片，解决 TTS 与 Avatar 唇同步时长一致性，消除参数隐患，建立坚不可摧的生产安全底线。
- **划分波次**：
  - **Wave 1A（既有门控续补）**：✅ #271/#272原交付保留；✅ **#548**（digit+unit 合并形匹配误报）已交付闭票（2026-10-11，PR #554：白名单单源派生 + heard 侧镜像别名，不改硬阻断）；✅ **#420**（Kaggle产物身份/新鲜度）已交付闭票（2026-10-09，PR #513：per-call staging + requestId 回写 summary + 晋级前身份/完整性门）→ ✅ **#423**（候选/approved 缓存信任边界）已交付闭票（2026-10-11，PR #551：approved 绑音频 digest + 验收版本，候选本地复检后原子晋级，硬阻断语义不变）；✅ **#421**（全命中仍完成字幕对齐）已交付闭票（2026-10-11，PR #561：`finalizeTtsResults()` 统一汇合 + 五入口 `assertSubtitleTiming()` 渲染前 fail-closed + `lib/scene-audio.mjs` sidecar 解析，含 audioDir 内约束）；**#422**修既有logo row几何，先真渲染复现；**#394**收窄环境/preflight范围，下载/SVE/模板项与已有票去重。✅ 真实 Kaggle TTS 跑已解锁（2026-10-09 **#231** 交付闭票：镜像 py3.13 重钉版 + `cosyvoice3-wheels` 离线 wheelhouse 挂载，在线/离线双路径真机取证）。
  - **Wave 1B（标准化与语速规范，✅ Dominant 已交付）**：✅ **#270**（TTS instruct 单一来源 `lib/tts/instruct.mjs` + manifest 抛错 / preflight 覆盖检查 / gate 签名告警三层门控，实测基线 9/9 发散已收口）+ **#279**（语速整体微调 + narrative 耦合，下一 frontier，`ready-for-human`）+ **#278**（Hook 文案具象化对比规范，`ready-for-human`）+ **#273**（CDP 并发锁与经验沉淀）+ ✅ **#274**（Z-Image-Turbo 许可核查，已交付：裁定误标、维持现状）。
  - **Wave 1C（工程卫生、安全与状态治理）**：#319余Medium/Low批次、#325导出清理、#327模型目录保留；新增 **#447**（六条正确性规则与全量correctness-only gate，先协调#424）、**#404**（已批准catalog拆分，补bootstrap/缺失处理）、**#462**（run身份与中间产物/审核绑定，不默认清理）、**#466**（私有技能CI覆盖，访问方式HITL；计时基线可独立）、**#555**（Python测试套件入CI：15个`scripts/short-video/__tests__/*.py`从未在任何workflow执行；且套件无单一可靠runner——实测8/15文件直接执行跑0测试、pytest收集期被模块级`sys.exit` abort；与#466同族不同轴，可并行）。
  - **Wave 1D（内容包一致性与发布契约）**：**#426**按slug幂等重试/确认写入；**#429**公开后最终实际出链readiness、失败政策HITL；**#430**Widget适用性/复用/无可用项门禁HITL；**#431**保持#95并行双轨，补事实汇合与修改后版本回检；**#434**仓库代码已交付，仅剩账号资料/历史评论人工核查。本波次不等W4中文渠道。

---

### Phase 2: 检索体系与运行环境固化 (Search & Retrieval Architecture)

- **阶段目标**：理顺检索降级链，消除环境变量自载缺陷与 Agent 路由循环引用，固化跨平台运行环境。
- **划分波次**：
  - **Wave 2A（【调研先行】探针摸底与环境底座，✅ 本波次完成）**：✅ **#281**（Search Pool 引擎可用性复测：Serper 可用并修复 `parseArticles` 映射 bug、Brave TUN 故障未复现，绕行方法留档）+ ✅ **#287**（管线入口顶层统一加载 `.env.local`，彻底闭环 **#275**，已闭票）。
  - **Wave 2B（搜源分流架构与去环落地）**：✅ **#292**（专用源直连平台 MCP vs 通用源 L3 Pool 分流总图，吸收 **#283**，已闭票——grilling 七项裁决收口，执行移交 #309/#307/#269/#310）+ **#309**（62 源用途定链审计，✅ `bc34f67` + `d0f2ea0` 交付，已闭票）+ **#307**（Bigsong 直连 + Grok promptTemplate，✅ commit `2f97be9` 交付，已闭票）+ **#306**（brief-builder 测试日期衰减基线修复，✅ commit `f7e2731` 交付）+ **#305**（pool 静默零结果 A/B 告警与 streak，C 项 CI 自动开票待授权）+ ✅ **#285**（needsAuth 403 探针放宽，`47fbeaf` / `c957bdc` 交付，已闭票 2026-09-20）+ ✅ **#313**（youtube bot-check Chrome cookie 通道，`9760bda` 交付，已闭票 2026-09-20）+ ✅ **#284**（Route C 循环引用消除，`4c8e92c` + `0340949` 交付 2026-09-20，已推 main `3cdbec9..b13120d`）+ ✅ **#276**（web-deep-research 接入 Search Pool，stale premise 收口闭票 2026-09-21——方案被 #307 用户签字推翻）+ ✅ **#324**（ffmpeg 下载段系统代理 hand-off，`a94f1f3` + `a996821` + `3321cb2` + `4a318a2` 交付 2026-09-21，已推 main `6050db5..4a318a2`）+ **#344**（SearXNG 覆盖面审计与精简收敛）+ ✅ **#346**（detectAntiBot 抢跑时序调整为 loginCheck 先行——2026-10-07 交付闭票，两层根因 + 共享 seam，PR #501）+ **#347**（package-lock.json 脱同步，挂接 PR #371）+ **#353**（selector-health 即时告警与去重自动开票）+ **#358**（reddit 403 判据修复与 SearXNG 候选）+ **#328**（yt-dlp cookie 提取 15s 短超时与免 cookie 兜底）+ **#329**（ffmpeg 代理契约断言）+ **#320**（自建 wechat→RSS 实例，`ready-for-human`）+ **#286**（trend 模式相关性护栏）+ **#269**（死源自动修复 Phase 2）+ ✅ **#231**（TTS 环境固化——2026-10-09 交付闭票：py3.13 重钉版 + `cosyvoice3-wheels` 离线 wheelhouse，真机在线/离线双路径取证）+ ⏩ **#318**（挂起作为参考数据）+ ⏩ **#326** / **#352**（挂起追踪上游）+ ⏩ **#348**（colima 替代挂起）。

  - **Wave 2B（本轮新增切片）**：**#424**优先修paid过滤crash，与#447单owner协同；**#416**先取raw/normalized证据；**#457**先收口测量/预算，**#467**仅改当前扇出并发、**#468**仅改来源诊断/限流契约，不重复测量或变更降级链；**#390**候选覆盖、**#405**下载接口边界与**#469**站点经验治理分别收口，通用方法在所属shared仓交付。

---

### Phase 3: 视觉设计系统与媒体素材重构 (Visual Redesign & Media Pipeline)

- **阶段目标**：重构短视频视觉体系达到顶尖商业新闻质感，引入实拍库存优先与实体 Catalog，升级 B-roll 生成模型画质。
- **划分波次**：
  - **Wave 3A（【深度调研先行，基准确立】）**：
    - **#300**：CDP 抓取头部竞品解构音视频分镜与节奏基准，产出分析报告；
    - **#302**：深度学习吸收外部开源项目（MoneyPrinterTurbo 等）在分镜和调度上的成熟经验；
    - ✅ **#298（已闭）**：画质选型与本地生产端口已交付（吸收 **#290** 文字测试集）：FastMetal-5B-QAD 胜出（claim gate 85.0 vs 1.3B 83.75，四维画质76/80 vs73/80，M2 Pro峰值11.42 GiB）+ `mlx_wan22_batch.py` 与runner tier体系。不再领取本票；后续候选/云端评估按剩余open票与硬件路由重新核需求及授权；
    - 🎯 **#291**：汇总调研成果，确立 S3 视觉重做 Wayfinder Map。
  - **Wave 3B（媒体底座与素材兜底）**：🎯 **#310**（素材库体系统一——统一素材库 + 文字描述索引 + **收获率搜索 log（第一交付物，可先行）** + 素材关键词体系；**吸收 #288 + #301**）+ ✅ **#297**（素材匹配 Fail-closed 留空绝不硬塞无关图，已闭票 `a4ce959`，E2 `1b68276` 删 legacy 模式）+ ✅ **#375**（B-roll spawn env 默认值断言覆盖，已闭票）+ **#293**（Stage 0 素材预获取与缺口回流）+ **#354**（认领供给泛化——voiceover 派生 assetNeed+searchHints，字段降级为覆盖；吸收 #295）+ **#355**（统一素材兜底链——通用递降链替代五值 mediaStrategy，承接 #301 票评 2026-09-14 媒体优先级链，生成形态预算选择 + 每内容生成上限护栏）+ **#356**（无主供给退役/认领化——兜底池死供给清理，依赖 #354）+ **#357**（视频默认 zoom 退场快修——双重运动/入场裁切/cropFocus 失配，bug）+ **#425**（media-track尊重显式upscale:false，不改既有安全网）。
  - **Wave 3C（画面适配与智能生成）**：**#289**（专属 aiVideo.prompt 适配层）+ **#299**（Hook 前 3 秒专属视觉）+ **#294**（VLM borderline 二度校验）+ **#463**（素材用途/密度/保护区与布局契约，输入#291；变体字段不静默丢失）+ ⏩ **#295**（写稿 scene-data 概念泛化，已并入 #354 待覆盖关闭）+ **#253**（行业坐标系与版式库）+ **#244**/**#256**/**#263**（策略与创意 HITL）。
  - **Wave 3C（VLM 认知底座组，2026-09-25 新增）**：✅ **#351**（vlm 缓存 key 模型解耦——`vlm-model.json` 单一真值源，已闭票交付）→ ✅ **#361**（方案 C 全模态引擎接入——MiniCPM-o 4.5 + emotion2vec+ 轻量插件，PR #378 已合并 `021d7c43`，裁决与防线见 `docs/research/handoff-omni-vlm-20260925.md`）→ ✅ **#360**（长视频预处理——A+ 分期交付：分级分段分析 + `videoStartOffsetMs` schema/渲染/校验；跨 Scene 绑定并入 #355）→ **#391**（拆帧策略——uniform/scene 可切换 + 真模型 bench 矩阵 18/18，PR #392/#395 已合并；差判据研究与默认切换裁决——判据研究先行，contact-sheet 后置，handoff 在主库 `.scratch/keyframe-bench/HANDOFF.md`）→ **#397**（Phase 2 焦点产出消费方——布局解析缺口补立，block #396）→ **#334**（VLM Prompt 优化与 token 预算削减）→ **#294**（borderline 二度校验，复用方案 C 音视频对齐）。

  - **Wave 3C（ASR独立评估）**：✅ **#418** 已交付闭票（2026-10-09，PR #526）——复用 #415 安全门/#417 loader 与已有公平计时，补齐四格矩阵与**词级差异率**（ctx-off 口径 0%–52.6%，同模型 ≠ 同输出）；裁决**保留 whisper.cpp**（每次新进程 MLX 更慢），三条路径收敛、WhisperX 保持 dormant、wav2vec2 未动；缺失自检落 **Step 0.3 硬门禁** + ggml 完整性校验。

---

### Phase 4: 多平台发布通道与中文内容生态 (Multi-Platform Publishing - 最终阶段)

- **阶段目标**：在内核稳定与画质达标后，打通国内主流短视频发布渠道（视频号、抖音、小红书），完成首发中文包与实测闭环。
- **划分波次**：
  - **Wave 4A（【平台架构调研与真机实测先行】）**：
    - 🎯 **#296**：调研自研 CDP 与 AiToEarn Relay 混合调度架构（S3 Wayfinder Map）；
    - 🎯 **#268**：产出首个 zh-CN 旁白中文短视频样片物料；
    - **#216**：用户用样片在微信视频号人工扫码实测 5 项关键技术参数（200MB、封面、AI 声明等）。
  - **Wave 4B（发布包适配与渠道接入）**：依据 #216 实测结论解锁 **#217**（视频号发布包适配）→ **#218**（CDP 自动化发布沙盒）→ **#220**（抖音发布通道）→ **#223**（小红书图文频道）→ **#206**/**#208**/**#210**（扩展通道）。

---

---

## Execution Tiers（open 票放置）

只列 open 票；每票一行。状态标签看 tracker；叙事与证据看票评论。**排位不等于实施就绪**：需要补证据/范围或人工裁决的票也可先定位Tier/Wave，只有tracker状态允许且评论/assignee/依赖复查通过才领取。

### Tier 1 — 核心阻断与出片质量基线（优先攻坚）

| # | 标题 | Phase·Wave | 备注 |
| --- | --- | --- | --- |
| #422 | Hook logo row可用宽度与真实几何 | P1·W1A | 820本身合法；先建真实render失败基线，保留Safe Zones |
| #426 | Article按slug幂等重试与写后确认 | P1·W1D | 响应丢失重查；保留draft/HITL/作者/首发时间 |
| #429 | 最终实际出链readiness | P1·W1D | 公开后校验；失败阻断/无链接降级HITL，不误拦草稿 |
| #424 | search-sources paid过滤const赋值crash | P2·W2B | 唯一owner；先修crash再#447，离线覆盖参数矩阵 |
| #291 | 短视频模板视觉设计体系重做 | P3·W3A | 🎯 wayfinder:map（HITL） |
| #216 | 视频号人工发布试点（实测 5 项规格） | P4·W4A | HITL；W4B 硬前置 |

### Tier 2 — 架构深化与能力增强（稳步推进）

| # | 标题 | Phase·Wave | 备注 |
| --- | --- | --- | --- |
| #394 | 环境/preflight范围收窄 | P1·W1A | 下载项随#420交付（2026-10-09）、SVE归#293、模板扩展协调#291/#463；先收口范围 |
| #279 | 语速整体上探 + narrative 速度耦合 | P1·W1B | HITL |
| #278 | Hook 文案句式规范（#244 后续） | P1·W1B | HITL |
| #319 | OCR 审查 Medium/Low 批次治理 | P1·W1C | security；Tier 1 已收口 2026-09-26（1 修 3 证伪，PR #380），余 15+ Medium/Low 留票批次 |
| #325 | lib unused exports 清理 + 移除 knip ignore | P1·W1C | enhancement；scripts/short-video/lib/** 范围收割 |
| #327 | 统一本地模型存放位置（~/.cosyvoice3-mlx-model → ~/models/） | P1·W1C | enhancement；平滑迁移 fallback |
| #447 | JS正确性规则与全量gate | P1·W1C | 六条规则明确；config-only覆盖，shared覆盖另归#466 |
| #462 | run身份、状态与产物/审核绑定 | P1·W1C | 既有final/profile有版本；迁移/索引契约先定，不默认清理 |
| #466 | 私有shared技能CI覆盖与计时基线 | P1·W1C | 跨仓访问HITL；B项可独立，不造已知缺凭据红PR |
| #555 | Python测试套件未纳入CI且无单一可靠runner | P2·W1C | enhancement；8/15文件直接执行跑0测试、pytest收集期abort；runner选型决定在实现时 |
| #430 | Widget适用性与无可复用分支 | P1·W1D | 门禁/开发归属HITL；保留历史快照，不以统一年龄判失效 |
| #431 | 保持双轨的事实汇合与修改回检 | P1·W1D | 不改#95并行裁决；共享事实/语义回检边界HITL |
| #434 | 域名修复后的远端人工核查 | P1·W1D | PR#435代码已交付；账号资料/历史评论未验证，不重修代码 |
| #344 | SearXNG 覆盖面审计（registry ↔ SearXNG 对照精简收敛） | P2·W2B | 🎯 Dominant；收敛审计，吸收 #318 引擎数据 |
| #347 | package-lock.json 与 package.json 脱同步 | P2·W2B | bug；挂接 PR #371 |
| #353 | selector-health 运行时告警与去重自动开票 | P2·W2B | enhancement；运行态即时告警 + 去重开票 |
| #358 | reddit_search 403 判据修复 + SearXNG 路由候选 | P2·W2B | bug；authRequired:false 误判修正 |
| #328 | yt-dlp chrome cookie node-spawn 挂起 | P2·W2B | bug；15s 短超时 + 免 cookie 兜底重试 |
| #329 | yt-dlp 代理 hand-off 残余覆盖（#324 后续） | P2·W2B | bug；ffmpeg env 契约断言 + SOCKS-only 声明 |
| #416 | Serper日期覆盖告警根因分辨 | P2·W2B | raw/normalized对照；上游无日期不等于parser drift |
| #457 | 搜索正交性测量契约与预算 | P2·W2B | URL/域/稿源分层；离线先行，预算批准→试点→确认后铺满 |
| #320 | 自建 wechat→RSS 实例（动察Beating 登记） | P2·W2B | proposal；HITL 环境搭建与扫码登录 |
| #300 | 头部竞品短视频分镜解构基准 | P3·W3A | feeding #291 |
| #302 | 外部开源 Repo 深度学习吸收追踪 | P3·W3A | documentation；🎯 主导 #529 |
| #529 | 视频 skill 180 repo 研究结论吸收进产线（执行期跟踪） | P3·W3A | 🛰 satellite: **#302**；research 与 catalog 收录已交付（PR #408/#528/#530），票内留 R2/R3/R6/R8 待批 + R4/R5/R7 触发条件挂账；R7 数字人口子与逐条升档需人工裁决 |
| #310 | 素材库体系（统一素材库+索引+收获率 log） | P3·W3B | 🎯 Dominant；吸收 #288/#301 |
| #293 | Stage 0 素材预获取 + 缺口回流 | P3·W3B | |
| #314 | douyin/xhs 视频素材源（发现入口 + 白名单） | P3·W3B | 2026-09-19 裁决：CDP 新闻源摘除 videos 声明 |
| #354 | 认领供给泛化（voiceover 派生 assetNeed+searchHints） | P3·W3B | 吸收 #295 |
| #355 | 统一素材兜底链（通用递降链替代五值策略） | P3·W3B | 承接 #301 票评 2026-09-14 链裁决；#360 跨 Scene 绑定归此（offset 字段已就位） |
| #357 | 视频默认 zoom 退场快修（双重运动+入场裁切） | P2·W3B | bug；tracker 权威标签 P2，快赢可穿插 |
| #425 | media-track尊重upscale:false | P3·W3B | 既有明确opt-out；与main/媒体赋值改动串行 |
| #547 | Pexels视频署名被误当内容信号 | P3·W3B | P2 bug；覆盖下载前20/下载后30两门及旧cache，不以署名/搜索词刷分，不降低relevance门 |
| #535 | 云端生图provider准入与缓存身份 | P3·W3B | P3低紧迫度；本地效果用户认可，endpoint/计费/许可/预算待证；裁判实验归#541，不默认付费fallback |
| #334 | VLM Prompt 优化（Fit/claim 冗余 token 预算削减/Reason） | P3·W3C | enhancement；Prompt 精简与测试集回归 |
| #541 | 图片relevance稳定性/范式/阈值实验 | P3·W3C | P2；Qwen当前基线，真实人工GT/holdout/预算先定；pairwise不替绝对门，双缓存绕过；输入#334 |
| #540 | whisper 重复循环的业界处置（VAD 门控/解码参数/检测判据/下游处置） | P3·W3C | P2研究；cpp ctx-off生产基线、检测/改写分开；fullText无时间戳，VLM与TTS处置分用途；不改生产默认 |
| #519 | 版式能力可查询视图与一致性 | P3·W3C | P2；延展REMOTION_SLOT_MAP/素材门/Safe Zones，不另建DSL；范围/null政策先裁决，输入#291、消费方#463/#355/#397 |
| #391 | 拆帧策略裁决（uniform/scene 可切换 + bench 矩阵已出） | P2·W3C | 🎯 frontier；判据研究与观测基建（双层几何/生产字段判据 + contact-sheet 观测先行 + 纳管 #397 人脸/焦点防遮挡约束；解耦 query；仅 wayfinder 后置）；handoff 在主库 `.scratch/keyframe-bench/HANDOFF.md` |
| #463 | 素材语义与Narrative布局契约 | P3·W3C | 输入#291；保护区消费归#397，不只按video/image选版 |
| #397 | Phase 2 焦点产出消费方（布局解析缺口——focusAnalysis/protectedRegions 今日无自动读者） | P2·W3C | block #396；布局节点归 #291 wayfinder 地图 |
| #396 | focus 内核切换 Haar→YuNet 候选（评估通过：人脸一致/少误报/3.7×） | P3·W3C | dormant——被 #397 block；产出有消费方后才有价值 |
| #289 | Scene 数据与生成画面适配 | P3·W3C | |
| #299 | Hook 前 3 秒专属视觉策略 | P3·W3C | HITL |
| #294 | VLM asset relevance 复杂系统设计 | P3·W3C | |
| #253 | 行业知识层 Ontology + hook 版式库 | P3·W3C | HITL |
| #244 | Hook scene emotion 不足 | P3·W3C | HITL |
| #256 | 数字人决策权变更 + 白/黑名单重审 | P3·W3C | HITL |
| #263 | TikTok 成片时长目标重审 | P3·W3C | HITL |
| #296 | 中文多平台发布架构（AiToEarn 调研） | P4·W4A | 🎯 wayfinder:map |
| #268 | 中文内容轨首包产出 | P4·W4A | #216 前置物料 |

### Tier 3 — 低重要性 / 工具链与合规排查

| # | 标题 | Phase·Wave | 备注 |
| --- | --- | --- | --- |
| #404 | tools-catalog已批准拆分的可移植性 | P1·W1C | bootstrap/缺失处理/深链接验收先收口，项目门禁留本仓 |
| #390 | 模型候选池覆盖检查 | P2·W2B | 热榜/org/新品取并集；通用方法归shared，不重开模型选型 |
| #405 | 下载CLI失败清单与guard集成 | P2·W2B | 已有串行bench/native batch；全长/生产clip契约分开 |
| #467 | cached-search扇出async并发 | P2·W2B | 一族一次、稳定顺序、失败隔离；barrier/事件证明重叠 |
| #468 | 垂直源错误/限流与身份契约 | P2·W2B | 核当前provider规则；mailto因果过时，不加代理/fallback猜测 |
| #469 | 站点经验所有权/隐私/持久化 | P2·W2B | HITL；现有读取已含存在条件，不自动推送loaded经验 |
| #304 | T2I 生成工具横评（mflux 协议适配度） | P3·W3A | 只读调研 |
| #356 | 无主供给退役/认领化（兜底池死供给） | P3·W3B | 依赖 #354 |

### Dormant — 触发条件未满足（暂缓占用排期）

| # | 标题 | Phase | 备注 |
| --- | --- | --- | --- |
| #286 | trend 模式关键词相关性护栏盲区 | P2 | 并入 #309 已交付，待覆盖关闭 |
| #318 | SearXNG 全量引擎启用 + 逐引擎 fallback | P2 | 作为参考数据归入 #344 精简审计，不单独实施 |
| #322 | needsAuth 源零结果差异化计数语义 | P2 | |
| #326 | 本地 ML 栈安全升级 | P2 | CVE 本地不可达已 dismiss，随 #352 挂起跟踪上游 |
| #348 | colima 替代品调研（OrbStack 等） | P2 | 替代收益微弱，挂起 |
| #352 | transformers 5.x 升级链评估 | P2 | CVE 本地不可达已 dismiss，挂起跟踪上游 whisperx/hub 约束 |
| #228 | 管线提速二期（batch/daemon/并行） | P1 | |
| #21 | 多模态 RAG（图像/视频检索） | P3 | |
| #157 | B-roll 高质量模型横评 | P3 | 收窄保留：FastMetal 同族已由 #298 交付选型；余非 FastMetal 候选（Wan2.2 TPP / LTX-Video 2.x / Helios）待准入 gate 后再评 |
| #158 | B-roll ComfyUI / MCP 迭代式后端 | P3 | |
| #224 | 数字人半身像支持 | P3 | |
| #230 | 字幕短 cue 两行版式合并 | P3 | |
| #288 | 媒体素材补全 catalog 进 RAG 兜底 | P3 | 并入 #310，待覆盖关闭 |
| #301 | 实拍库存视频优先策略 | P3 | 并入 #310（供给）+ #355（链裁决），待覆盖关闭 |
| #295 | assetNeed 泛化：claim→搜索概念 | P3 | 并入 #354（2026-09-24 提案），待覆盖关闭 |
| #247 | Hook scene bigNumber 缺乏上下文 | P2 | 待 #253 交付后覆盖关闭 |
| #217 | 管线适配视频号发布包 | P4 | |
| #218 | 视频号 CDP 自动化发布路线 | P4 | |
| #220 | 抖音发布通道落地 | P4 | |
| #222 | 抽象短视频引擎为独立 repo | P4 | |
| #223 | 小红书图文频道立项 | P4 | |
| #206 | Auto-Redbook 试点 | P4 | |
| #208 | 降级图文帖路径 | P4 | |
| #210 | TikTok Content Posting API 调研 | P4 | |

---

## Triage Inbox（待分流队列）

按 [`triage-labels.md`](agents/triage-labels.md) 定 Phase / Wave / Tier / P后放入Tier表；**只有完成范围/证据/决策分流才转换state**，不能为清零机械摘`needs-triage`。尚不能定位的票只留Inbox，已定位但未就绪者不重复列行。历史台账→[`archive/roadmap-tables-archive-2026-09-24.md`](archive/roadmap-tables-archive-2026-09-24.md)。

> **Round XVI（2026-10-11）**：新增#519/#535/#541已定位Tier/Wave并补P；#529/#540/#547/#548复核归位。定位不等于ready，未决事项仍受tracker状态门控；本Inbox仍只剩#406未定Phase/Wave/Tier。#451 Dependency Dashboard是管理票，排除业务排期。

| # | 标题 | 已带标签 | 待分流内容 |
| --- | --- | --- | --- |
| #406 | OCR pre-push 审查从未生效（hook 落在被 `core.hooksPath` 屏蔽的 `.git/hooks/`） | `enhancement` / `needs-triage` / **P3**（用户 2026-09-28 指示：优先级最低） | Phase·Wave·Tier 未定。票面两件事待裁：① OCR 进入工作流的形态（push 门禁 / Agent 主动步骤 / 保持手动）；② 「hook 是否真被执行」要不要做成代码门禁。候选归属组：Phase 1 W1C 工程卫生（与 #319/#325/#327 同组），仅提示不作分类。证据实测冻结于 2026-09-28，pickup 前先复核。 |

---

## Conflict Risk Matrix（文件并发风险矩阵）

同时修改同一文件的 issue **严禁并行，必须串行执行**。只列仍有 open 票的文件组；已全部闭票的历史行 → archive。seam 约定不随闭票失效。

| 文件 / 模块 | open 票 | 风险与串行规则 |
| --- | --- | --- |
| `scripts/short-video/main.mjs`<br>`render-only.mjs` `lib/media-track.mjs`<br>`lib/render-remotion.mjs` `lib/assemble.mjs` `verify-video.mjs` | #293 #394 #425 #462（D：#228） | 🔴 生命周期、字幕准备、媒体赋值、run选择与共享staging严格串行；run目录不等于并发安全，#425既有opt-out修复不扩成布局重设计；#421 已交付（2026-10-11，PR #561：字幕准备边界 fail-closed 已入四个入口 + main） |
| `scripts/short-video/search-sources.mjs`<br>`lib/source-registry.mjs` | #424 #314 #344 #358 #547 | 🔴 核心搜源调度；#424 paid过滤只一owner，与#447协调，不能两个session同修1124行；#547归一化署名语义与registry修改串行；其余保持source-health seam契约 |
| `lib/source-url-heal.mjs`<br>`source-url-sweep.mjs`<br>`source-url-discover.mjs` | #358 | 🟡 判据改动加在 `isFailureVerdict()` / `needsCdpSecondOpinion()` seam 上（#358 reddit 403 判据修复）；sweep/discover 是只读消费者，可与 registry 并行；产物落 gitignored `output/` |
| `lib/source-health.mjs`<br>`lib/search-pool.mjs` `pool-canary.mjs`<br>`__tests__/fixtures/pool-contracts/` | #353 #416 #457（D：#286 #322） | 🟡 事实信号/采集provenance/日期诊断串行；source-health保持既有fail-open，freshness缺日期仍fail-closed，不能混用两种门禁；#346 已交付闭票（实落 cdp-client/source-registry/selector-health/search-sources） |
| `lib/video-downloaders.mjs`<br>`lib/ytdlp-guard.mjs` `bench/keyframe/download_videomme.sh` | #314 #328 #329 #405 | 🟡 下载/guard seam串行；bench全长与生产clip契约分开，原生retry×外层retry受总预算约束 |
| `asset-sourcer.mjs` | #294 #299 #354 #355 #356 #357 #547 #541（D：#301） | 🟡 素材匹配评分流水线，串行；#547两道pre-filter与#541评分消费/阈值涉及同seam；#297 fail-closed 已闭票；#357 联动 `MediaBackground.tsx` |
| `lib/visual-analyzer.mjs`<br>`vlm_analyzer.py` `video_loader.py`<br>`lib/video-understand.mjs` `lib/asr-analyzer.mjs`<br>`lib/asr-repetition-guard.mjs` `asr_repetition_guard.py` `lib/vlm-cache.mjs` | #391 #334 #541 #540 | 🟡 引擎/prompt/ASR/loader/cache契约代码修改串行；#540/#541先交研究，不自动改生产；#351/#361/#360/#415/#417已交付不再领取；asr-analyzer 网关无生产转写消费者 |
| `knowledge/media-catalog.json`<br>`asset-gaps.json` | #310 #293 #294 #299 | 🟡 #310 为 W3B Dominant；收获率 log 与其余低耦合可先行 |
| `lib/b-roll/` | #289 #304 #355 #535 #541 | 🟡 #298已交付选型作为输入；#289定prompt、#355预算、#535 provider/缓存身份、#541 gate与winner消费代码修改串行；只读调研/标注可并行，不复用旧winner冒充重测 |
| `src/` / `scripts/` 安全核心模块 | #319 | 🔴 compile-series.mjs / digital-human.mjs / auth-middleware.ts / keyword-tracking 安全修复，独立加固 |
| `lib/tts/registry.mjs` `cache.mjs`<br>`cosyvoice3-kaggle-cuda.mjs` `post-process.mjs`<br>`quality-gate.mjs` `lib/normalize-tts-text.mjs` `kaggle/cosyvoice3_cuda_kernel.py` | #394 #462 #279 #540（D：#228） | 🔴 #421 已交付（2026-10-11，PR #561：`finalizeTtsResults()` 统一汇合 + #198 签名缓存复用，seam 契约不变）；#540若改共享转写须保留TTS infra/acoustic边界；#420/#423/#548已交付（#423 交付：`lib/tts/staging.mjs` 新增、cache 三态计划；#548 交付：digit+unit 合并形别名、白名单单源派生、15 类覆盖）；#279 pacing仍硬阻断，Step0.3门禁不变；instruct文案只动单一来源 |
| `remotion/src/scenes/HookScene.tsx`<br>`NarrativeScene.tsx` `ShortVideo.tsx`<br>`lib/text-slots.mjs` `lib/scene-rules.mjs` `lib/text-geometry.mjs` | #291 #422 #463 #397 #355 #357 #519 | 🔴 layout/字段/预算/preflight/render契约串行；#519描述/一致性不抢#291视觉与#463布局政策；#422只修既有几何；#397负责保护区消费，#396检测内核不是布局实施 |
| `scripts/article/lib/publish-utils.mjs`<br>`scripts/article/publish-article.mjs` | #426 | 🟡 按slug GET→POST/PATCH幂等确认；不盲重放POST，不泄露cause/请求内容 |
| `lib/caption-utils.mjs` `lib/publish-utils.mjs`<br>`lib/platforms/generate-publish-package.mjs` `publish-tiktok.mjs` | #429 #462（D：#217 #218 #220 #223） | 🔴 最终实际出链、公开后readiness、run绑定/receipt串行；#434只剩远端核查，不再改模板域名 |
| `docs/content-pipeline.md` `article-production-guide.md`<br>`analytics-workflow.md` `src/components/widgets/` | #394 #430 #431 #462 #463（D：#230） | 🔴 流程/审核/布局文档串行；保持#95双轨与HITL。共享Widget数据修改须核所有历史Post引用，不代替用户裁决新政策 |
| `eslint.config.js` `.github/workflows/ci.yml`<br>`vitest.config.ts` `docs/conventions/test-env-baseline.md` | #447 #466 #555 | 🔴 父仓correctness gate与私有技能覆盖分界明确；#466凭据HITL不阻塞#447父仓方案，计时基线不靠skip/改阈值换绿；#555新增Python测试步骤会改`ci.yml`，与#447同文件须协调 |
| `skills/shared/web-access/scripts/cached-search.mjs`<br>`vertical-search.mjs` `web-deep-research/SKILL.md`<br>`web-access/SKILL.md` `references/site-patterns/` | #390 #457 #467 #468 #469 | 🔴 shared仓与真实运行副本同步，父仓仅指针；#457测量、#467并发、#468诊断各有owner，同文件串行，loaded在飞经验不自动入库 |
| `docs/tools-catalog.md` `adr/0021-tool-catalog-split.md`<br>`docs/DOCS-INDEX.md` `scripts/lint-doc-hierarchy.mjs` | #404 #390 #457 #469 | 🟡 catalog迁移/指针协调串行；实际迁移归#404，其他票不代搬文档，不丢项目准入/归因/历史决策 |

---

## Design Decisions

### 1. 深度调研与基准先行（Research-First 驱动）

- **决策背景**：在复杂的多模态管线演进中，若未摸清竞品分镜节奏、外部开源经验及模型真实生成画质，直接动手修改业务代码会导致频繁推倒重来。
- **裁定规范**：
  - 视觉升级线（Phase 3）：重设计先在 **Wave 3A** 完成 **#300/#302**调研，结合已交付 **#298**画质选型，凝练为 **#291** S3 Map后再改模板/视觉契约。**保持既有契约的bug fix不等于视觉重设计**：#422既有几何、#425显式opt-out等可先行，但仍须真实失败基线与相应验证；一旦改变品牌尺寸/布局政策就回#291裁决。
  - 多平台发布线（Phase 4）：必须先在 **Wave 4A** 完成 **#296**（调度架构调研）与 **#216**（微信视频号 5 项核心技术规格人工扫码实测），摸清真机限制与封号风控线后，方可解锁 Wave 4B 的自动化发布脚本。
  - 检索体系（Phase 2）：必须先在 **Wave 2A** 完成 **#281**（单引擎连通性与 DNS 摸底），再推进 Wave 2B 的搜源分流大盘改造。

### 2. Wave-Tier 双维协同架构

- **决策背景**：单维度的列表无法同时兼顾“时序推进次序（When to do）”与“业务价值高低（Why it matters）”。
- **裁定规范**：
  - **Wave 为全局推进时序**：按前置依赖与调研门控组织；新故障可续补已交付Wave（本轮W1A），不抹掉既有交付，也不把后来P1故障放在后续调研之后。跨Wave软顺序显式记录（本轮#424→#447），不等同原生blocking edge。
  - **Tier 为业务价值与出片保障分层**：Tier 1 聚焦阻断脏数据与出片硬底线，Tier 2 聚焦能力提升，Tier 3 聚焦工具排查。同 Wave 内选票严格遵循 Tier 1 > Tier 2 > Tier 3。
  - **Conflict Risk Matrix 为最终裁决**：任何跨票并行必须以文件冲突矩阵为准。

### 3. Dominant Issue (🎯) 统领与契约设立

- **决策背景**：单 session 逐票推进时，若无阶段性标准锚点，卫星任务容易各行其是。
- **裁定规范**：每个阶段设立 Dominant Issue 作为质量门禁或架构总图（如 #271 出片门控、#292 搜源分流、#291 视觉 Map、#296 发布 Map），卫星票必须向其交付具体切片并遵循其设立的接口契约。

### 4. Fail-Closed 门控底线优先于功能扩充

- **决策背景**：此前偶发 TTS 失败 take 或音画失步依然出片的问题，以及素材搜索在无匹配时强塞无关图片的降级行为。
- **裁定规范**：
  - TTS 出片门控（#271，已交付闭票）：失败按族分流后一律 fail-closed——**pacing 类**（音素正确、仅实测 WPM 偏低）先经 #252 补差，补差仍低于下限 → `TTS_PACING_FLOOR_BLOCK`；**acoustic 类**（截断/漏词/相似度低/无音频）禁入补差环、重抽 ≤2 次后 → `TTS_ACOUSTIC_HARD_BLOCK`。两类硬阻断均不受 strict/non-strict 影响（仅 gate 未分类的失败保留旧非 strict 语义），唯一逃生门 `TTS_SKIP_QUALITY_GATE=1`。用户裁决记录见 issue #271 交付记录。
  - 音频与视觉同步（#272，已交付）：avatar 片段时长 < 该 scene **当前** TTS 音频时长 → 阻断出片（`main.mjs` Step 2.5 与渲染 staging 双门控，单实现 `lib/avatar-guard.mjs`），杜绝唇同步 stale 流入渲染流水线。
  - 素材匹配（#297）：素材搜索无高置信度结果时严格 fail-closed 留空，交由下游 B-roll 生成或纯版式卡片承接，绝不强塞无关图片。

### 5. 统一环境加载入口，杜绝库模块自载

- **决策背景**：#275 暴露出库文件（如 `search-sources.mjs`）假定调用方未加载 `.env.local` 而缺乏必要环境变量的问题。
- **裁定规范**：采纳 #287 设计，由管线入口顶层（`main.mjs`, CLI 等）统一单次加载 `.env.local`，所有底层库模块严禁自载，消除隐式依赖与加载竞争。

### 6. 通用/专用源分流与平台保真链（#292，2026-09-15 终版裁决）

- **决策背景**：#292 重审发现 x_search 链条语义分裂——通用 pool 插进平台保真链中间，命中结果非 X 内容却挂 x_search 标签并抢占更高质量的 Bigsong 推文（smoke 实证）。
- **裁定规范**（用户裁决，2026-09-15）：
  - **平台保真链**：平台专用源（x_search/xhs/sogou_weixin/weibo_hot/bilibili 等）全链只用平台忠实层——x_search = `CDP → googleSiteFallback(site:x.com) → Bigsong 直连`，**不进通用 pool**；triage 规则 1 精神优先于 #65 的七源字面名单（该名单写于 #90 平台化之前，已过时）。googleSiteFallback 的死层根因（capabilities 遮蔽）已修复（#292，`f3d10ba`），真实 smoke 首次提取成功。
  - **pool 资格**：仅 `mcpFallback.toolName === "web_search"` 的 6 个通用源（youtube/arxiv/github/threads/google/mcp_grok_search）；pool（Serper > Brave > Tavily > Jina）先于 Grok MCP 兜底。
  - **Bigsong ≡ mcp-search-bridge 后端**（用户裁定，#90 实证：same upstream/system prompt/env，minus subprocess）；程序化抓取优先直连 API，MCP 协议保留给大模型/Agent 消费方——推广转换见 #307。
  - **不变量**：仅 x_search 携带 apiFallback（registry 级测试锁死）；apiFallback = 平台 Bigsong 桥专属槽位。

---

---

## 历史轮次下沉说明

- [`archive/roadmap-tables-archive-2026-09-24.md`](archive/roadmap-tables-archive-2026-09-24.md) —— 2026-09-24 结构精简前的全量版本：Execution Waves / Execution Tiers / Triage Inbox 三表的历史叙事行、已闭票行与历轮 Round 结论（Round A–J）。
- [`archive/roadmap-inventory-history-2026-09-23.md`](archive/roadmap-inventory-history-2026-09-23.md) —— 逐 session 盘点条目（2026-08 至 2026-09-23 Round E，78 行）。
- 交付细节的唯一权威源始终是 **issue 评论**（`gh issue view <N> --comments`）；archive 文件只作追溯，不作为现状依据。
