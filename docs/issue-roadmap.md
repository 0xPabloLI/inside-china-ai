# Issue Roadmap — Open Issues 依赖关系与执行顺序

> **本文件是放置与依赖索引，不是台账**（2026-09-24 Round J 结构精简 296KB → 约 35KB；2026-10-22 二次下沉，见「历史轮次下沉说明」——35KB 是当时的目标，今天本文件的主体就是 open 票行本身）：每票一行，只回答「在哪条 Wave / 哪层 Tier / 与谁冲突」。
> 票的实时状态与标签以 `gh issue list --state open` 为准，**本文件不缓存状态**；交付叙事与证据的唯一权威源是 **issue 评论**（`gh issue view <N> --comments`）。
> 历史叙事与已闭票行 → [`archive/roadmap-inventory-history-2026-10-22.md`](archive/roadmap-inventory-history-2026-10-22.md)；更早（2026-09-24 精简前三表全量、2026-08 起逐轮盘点）→ [`archive/roadmap-tables-archive-2026-09-24.md`](archive/roadmap-tables-archive-2026-09-24.md)、[`archive/roadmap-inventory-history-2026-09-23.md`](archive/roadmap-inventory-history-2026-09-23.md)。
> **维护规则**：新票分流后加一行；**闭票即删行**（交付记录写进闭票评论）；每轮盘点只改「当前状态」的 Last inventory 一行，且**该行只保留当前轮**——收尾时把上一轮整段追加进 `archive/roadmap-inventory-history-2026-10-22.md`（一句话档案保留最近 4 轮，溢出同法下沉）。表内行同理：**已闭票句子**（`✅` 交付记录）随闭票下沉，行内只留 open 票、串行规则与 seam 约定。这两条纪律是本文件不再长回 200KB+ 的机制。

## 当前状态

> **Last inventory**: 2026-10-24（**Round XCVI：`#529` 执行期清单逐条处置 + 画面描述合同落地**——11 条待批清单按用户四决全部处置：R2/R3/R8 中 7 条路由到既有 owner 票（R2①③ / R3①②③ / R8①；R2④ 无动作，留 R5 对照输入），不新增 `mediaStrategy` 取值、不新增 dead-air 检查（2026-10-10 证据门槛未满足）；R6②「画面理解合同」落地 `docs/video-script-writing-guide.md`（含 Stage 3 步骤 6 入口指针 + L2 研究清单勾销），R6③ 挂 runbook 下次改动、R6① 挂外部长视频立项；R1 建表项随 `#300` 关闭终止；R4/R5/R7 触发门不变。`#529` 从 `ready-for-human` 转 `dormant`（触发账本），Track 3 HITL frontier 推进至 **`#723`**。PR #929 squash `35e09578`；droid-review 3 条（读者入口 / L2 指针与全称 / 票归属措辞）全修并 resolve；`lint:docs` 0 新增引用、`git diff --check` 净、CI 全绿。**enabling fix：写稿侧自检落地，无成片产出 diff**。frontier：Track 3 HITL 队首 **`#723`**；Track 2 `#291` AFK 空；Track 1B **`#778`**。）
> **frontier（三轨制，默认跨轨单入口瀑布见 `### Execution Semantics`）**：
>
> - **Track 1A · 产线快赢段（`ready-for-agent`，保持既有契约、跨 Wave 提权）**：**段内队列为空**（`#818 → #846 → #817` 全数闭票；段内无其余符合判据的 `ready-for-agent` 票，Round LXXXV 复算同）——上一张 **`#846`**（W1C · `apply-media-patch.mjs` 的 `[^}]*?` scene 定位正则致 26 包 231 场景中 18 个失败、`--force` 无保护抹除 `evidence: true`、`formatMediaBlock` 重复实现漏掉 5 个 `MEDIA_FIELD_KEYS`、CLI 拒绝 `schemaVersion` 信封——已改为括号平衡扫描 + Evidence 覆盖显式决定 + 单源 `formatMediaObject`）已于 2026-10-22 交付闭票（PR #875，squash `18624d71`，Round LXXXIII）；再上一张 **`#818`**（W1A · Step 6 `subtitle-alignment` 空转——候选 1 确认、候选 2 独立排除、候选 3 潜伏缺陷另开 `#870`；该类别移出自动重试并 fail-fast，修复未跑成时不再复验未变/半应用产物）已于 2026-10-22 交付闭票（PR #869，squash `96013fc5`，Round LXXXI）；再上一张 **`#827`**（alignment-guards trim 回读透传 `keyEntities`）已于 2026-10-22 交付闭票（PR #863，squash `d2378bd9`，Round LXXIX）；**`#820`**（F5 兜底后重跑 pacing 补偿阶梯）已于 2026-10-22 交付闭票（PR #859，squash `ac96dd51`，Round LXXVIII）；再上一张 **`#758`**（证据图确定性采集路径）于 2026-10-22 经 Step 2「配图相关性」判据取走并交付闭票（PR #850，squash `58480889`）；此前 **`#762`**（Round LXXI，PR #839）与 **`#760`**（Round LXXII，PR #840，squash `bb26a352`）已于 2026-10-21/22 交付闭票；**`#759`** 亦于 2026-10-21 交付闭票（PR #831，squash `2338517f`，Round LXX）。`#689`/`#753`/`#704`/`#764`/`#786`/`#547` 均已闭票。`#649` 已闭票，`#396` 解锁入候选待准入；同源的 **`#836`**（preflight 媒体字段 schema，防止 `evidnce` 类拼写静默失去强制）亦于 2026-10-22 交付闭票（PR #847，squash `bd79301e`）。
> - **Track 2 · Active Wayfinder 破冰/连续锁轨（同一时间仅激活 1 张 `wayfinder:map`）**：当前激活 **`#291`**（W3A 短视频模板视觉设计体系重做，Tier 1；原生子票 `#300/#302/#529/#289`（#299 已于 2026-10-20 闭票，Round LXIII）；Round LXV 回填关联票 `#762/#760` 均已交付闭票（Round LXXI/LXXII，PR #839/#840；`#759` 亦于 Round LXX，PR #831），保持既有契约经 Step 2 Track 1A 提权消化；与 `#763/#757/#752`（均已交付闭票——`#763` 于 2026-10-24 PR #926，squash `25533acc`，Round XCV；`#688` 已于 2026-10-23 交付闭票 PR #901，Round XC；**`#752`** 已于 2026-10-24 交付闭票 PR #912，Round XCI；**`#757`** 已于 2026-10-24 交付闭票 PR #916，squash `d3983f29`，Round XCII；**`#761`** 已于 2026-10-24 交付闭票 PR #919，squash `4845d3be`，Round XCIII）），**当前 AFK frontier = 空**——`#289` 已于 2026-10-18T03:29:30Z 交付闭票（PR #755 合并）、`#300`/`#302` 同闭，余下 `#529` 已转 `dormant`（触发账本，2026-10-24 Round XCVI）；E 段实施票 **`#746` 已于 2026-10-18 交付闭票（Round LVII，实现提交 `51706f32`）**，`#747`（字幕视觉 token 层）与 `#731`（动效 token 体系，HITL）待领**（`#302` 已于 2026-10-18 交付闭票——A–E 五维调研全部交付，E 段三条可吸收范式落实施票 `#746`/`#747`、动效原语并入 `#731`，交付记录在票内评论、结论落 `docs/research/repo-survey-tracking.md`；`#300` 已于 2026-10-17 交付闭票，结论 gist 在母图 `#291`；`#668` 已全图收口闭票；余下 `#529` 已转 `dormant`（触发账本，2026-10-24 Round XCVI；#299 已于 2026-10-20 闭票））。**✅ `#300` 在途占用已释放（2026-10-17 收口）**：阶段 2 占用的 `lib/video-downloaders.mjs`（Conflict Risk Matrix 冲突组 `#314/#329/#405`）与 `lib/video-understand.mjs`（冲突组 `#334/#541/#540`）两处 seam 已合并交付，他票可直接领取。**📊 `#302` 分段进度（2026-10-18）**：A ✅（→ 子票 #301）；**B ✅（`locomotion-pro/locomotion` 无许可 · `av/remotion-bits` MIT）、C ✅（`Vincentwei1021/anything2explainer` PolyForm 非商用）、D ✅（`Vincentwei1021/video-shotcraft` Apache-2.0 Tier A · `Vincentwei1021/video-talkcraft` PolyForm 非商用 Tier B）与 E ✅（`vshukla7/remotion-captions-themes` MIT · `Fats403/remotion-captions-kit` MIT 均可吸收，`iart-ai` skill packs MIT 只吸规则）已交付合并（PR #713 / #716 / #727 / #742）**，B/C/D/E 结论已回填 `#291`；**五维调研全部完成；`#302` 已于 2026-10-18 交付闭票，E 段实施票落 `#746`/`#747`，frontier 推进至 `#289`**。
> - **Track 3 · 独立 HITL 拍板轨（`ready-for-human` 单票决策）**：队首为 P3 的 **`#723`**（W1C · 调研结论下游回填强制项）；`#529`（W3C · 视频 skill 180 repo 吸收进产线）已于 2026-10-24 转 `dormant`（触发账本——11 条批准类全部处置，仅余 R4/R5/R7 触发项）；**`#763`**（63 项检查三分类审计）已于 2026-10-24 交付闭票（PR #926，squash `25533acc`，Round XCV）（**`#761`** 已于 2026-10-24 交付闭票——文本优先版式媒体职责与证据路由（contrast 接线背景媒体 + `Text-first layout media routing` 门禁），PR #919，squash `4845d3be`，Round XCIII；**`#757`** 已于 2026-10-24 交付闭票——T2V 模型专属 prompt 模板 3-family 表 + 未接线渲染器，PR #916，squash `d3983f29`，Round XCII；`#752` 已于 2026-10-24 交付闭票——Hook 评审端三轴判据与正反范例库，PR #912，Round XCI；`#299` 已于 2026-10-20 交付闭票——Hook 前 3 秒媒体策展契约 PR #798，Round LXIII；`#278` 已于 2026-10-20 交付闭票——Stage 3 hook 文案句式规范 PR #795，Round LXII；`#279` 已于 2026-10-19 交付闭票——研究 + HITL 裁决 + 实施票 #786，Round LX；`#429` 已于 2026-10-19 交付闭票——PR #783，Round LIX；`#848` 已于 2026-10-22 交付闭票——deepseek-v41-flash-1017 包证据卡布局 + 三张 legacy 证据图按原始捕获路径迁移 PR #856，squash `811e844c`，Round LXXVII）。
> - **Track 1B · 工程卫生与整理段（`ready-for-agent`）**：**`#344`**（W2B · SearXNG 覆盖面审计，P2·Tier 2）已于 2026-10-23 交付闭票（PR #887，squash `27e60278`，Round LXXXVII）。**`#707`**（W1C · 策展 `assets/` 根目录 5 个平铺副本清理，P3·Tier 3）已于 2026-10-23 交付闭票（PR #885，squash `48f299d2`，Round LXXXVI）。W1C 段清空；**`#779`**（W2B · asset-sourcer 产出基线断言，P2）已于 2026-10-23 交付闭票（PR #892，merge `fbee7ed6`，Round LXXXIX）。按 Tier 2 表顺序下一张为 **`#778`**（source-registry 契约 fixture）→ **`#353`**（selector-health 运行时告警）→ **`#358`**（reddit 403 判据）→ **`#329`**（yt-dlp 代理残余覆盖）。**`#327`**（W1C · 默认模型目录统一，P3）已于 2026-10-22 交付闭票（PR #854，squash `427e3e39`，Round LXXVI）。**`#782`**（W1C · AGENTS.md 规则 6 placement 门禁与 pre-commit 提醒，P2）已于 2026-10-22 交付闭票（PR #844，squash `2b701572`，Round LXXIII）。**`#566`**（W1C · 场景音频解析双实现统一，P3）已于 2026-10-21 交付闭票（PR #834，Round LXIX）。上一张 **`#623`** 已于 2026-10-20 交付闭票（PR #801，squash `f016be07`，Round LXIV）。
>
近轮一句话档案：**Round XCVI**（`#529` 执行期清单处置——11 条批准类全部处置：R2①③/R3①②③/R8① 路由 owner 票（#733/#731/#735/#734/#732），R2④ 无动作，R6②「画面理解合同」落 `video-script-writing-guide.md` + Stage 3 入口指针，R6③ 挂 runbook 下次改动、R6① 挂外部长视频立项；dead-air 不新增（证据门槛未满足）；`#529` 转 `dormant` 触发账本；PR #929 squash `35e09578`；droid 3 条全修 resolve；enabling fix 无产出 diff；frontier：Track 3 HITL `#723`、Track 1B `#778`） **Round XCV**（`#763` 交付闭票——MRL-2 分层：47 个注册检查拆为 30 类机检门 + 18 项编辑建议（17 函数 + 头像策略）；`editorial` 第四返回桶不进退出码；`checkLayoutField` 仅 narrative 强制 `layout`（7 旧包 58 个假 FAIL 清零）；`checkSemanticConsistency` 词边界匹配并删除需实体作用域的 `up/down` 等；通过项按类别折叠（didi 80→48 行）；droid 5 条全修 resolve；4696 tests、CI 全绿；PR #926 squash `25533acc`；frontier：Track 3 HITL `#529`、Track 1B `#778`） **Round XCIV**（`#922` triage 入表（triage-only，无交付）——#757 follow-up「per-family T2V 模板接进 b-roll 生成路径」：`prompt-templates.mjs` 已并入主干但无调用方 → Tier 2 · `P3·W3B` · `P2 enhancement` · `ready-for-agent`；六条验收取自研究笔记 §5；与 #355（预算）/#535（provider·缓存身份）/#541（gate 消费）同属 `lib/b-roll/` 串行带；无代码改动；frontier 不变：Track 3 HITL `#763`、Track 1B `#778`） **Round XCIII**（`#761` 交付闭票——文本优先版式媒体职责：HITL 两决（混合路线＝contrast 接线 `MediaBackground` + `contentDir`，两版式只承载氛围背景，证据路由 `media-window` / `media.mode:"fullscreen"`，不新增纵向窗口、不碰 #688；存量 fail-closed + 作者三选一，不迁移）；新 preflight `Text-first layout media routing` 对 `assetNeed` / `media.evidence:true` 判 FAIL、`fullscreen` 豁免；quality improvement——didi s5/s7 官方产品图首次上屏；droid 1 条 P1（CI 环境门）修并 resolve；219 scene-rules tests、4689 全绿；PR #919 squash `4845d3be`；frontier：Track 3 HITL `#763`、Track 1B `#778`）

---

## Dominant & Satellite Issue Hierarchy（主导与卫星 Issue 层级）

在 Phase / Wave → Task → Issue 三层架构中，**Dominant Issue（主导 Issue / 锚点 Issue，标有 🎯）** 负责**定标准、定架构、立契约、设 Gate 或承接 Wayfinder Map**；**Satellite Issues（卫星 Issue / 子任务）** 围绕它展开并向其交付。下表保留已交付锚点作为架构来源；open排期以Wave/Tier表为准，新增票不另造总图或硬依赖。

| Phase | Dominant Issue (🎯 主导票) | Satellite Issues (挂靠卫星票) | 架构定位与统领关系 |
|---|---|---|---|
| **Phase 1: 管线可靠性与安全闭环** | —（主导票 `#271`/`#272`/`#270` 均已闭票，交付细节见 archive） | → **#723** (调研结论下游回填强制项, P3 [HITL])<br>→ **#273** (并行经验与 CDP 并发锁, P2)<br>→ **#274** (Z-Image-Turbo 许可排查, P3) | #271 + #272 + #270 + #629 均已交付（Fail-closed 语义分流 + 尾裁切二次 ASR 读回 + avatar 片段时长一致性 + instruct 单一来源三层门控）；Round LXV 新增的 `#753`/`#704`/`#764` 已于 2026-10-20/21 交付闭票（#704 PR #819）；`#689`（品牌词切分）、`#820`（兜底后 pacing 补偿重跑）与 **`#827`**（trim 回读透传 `keyEntities`）亦已交付闭票（PR #825 / PR #859 / PR #863）；Round LXXX 完成 4 张新票源码核验与方案分流（**`#864`** 入 P1·W1C Tier 1，**`#818`** / **`#817`** 入 P1·W1A Tier 2，**`#846`** 入 P1·W1C Tier 2），**`#817`** 已于 Round LXXXIV 闭票（PR #879，squash `c077d5ed`），Track 1A 队列清空，Track 1B W1C 段清空，下一张 **`#779`**（`#864` 交付记录见 archive §表内已闭票叙述）。 |
| **Phase 2: 检索体系与运行环境固化** | <br> | <br>→ **#779** (asset-sourcer 每源产出基线断言与跌破告警, P2——🛰 **#310** 关联)<br>→ **#778** (source-registry 契约 fixture 冻结外部响应体, P2——🛰 **#310** 关联)<br>→ **#353** (selector-health 运行时告警与去重开票, P2)<br>→ **#358** (reddit 403 判据修复 + SearXNG 候选, P2 bug)<br>→ **#329** (ffmpeg 代理契约断言, P2 bug)<br>→ **#320** (自建 wechat→RSS 实例, P2 [HITL])<br>→ **#312** (coverr 下载链失效, P2 bug)<br>→ **#313** (youtube bot-check 验证 Chrome cookie, P2 bug)<br>→ **#315** (交付记录门禁软提醒闭环与复检机制, P2)<br>→ **#305** (pool 静默零结果 A/B, P2——并入统一 source-health)<br>→ **#275** (全链路不自载缺陷, 由 #287 闭环)<br>→ **#285** (needsAuth 403 探针放宽, P2)<br>→ **#284** (Route C 循环引用消除, P2)<br>→ **#276** (web-deep-research 路由接入, P2)<br>→ **#281** (Search Pool 引擎可用性复测, P2)<br>→ **#318** (SearXNG 引擎数据, P3 挂起；#344 已闭票，不单独实施)<br>→ **#352** (transformers 5.x 评估, P3 挂起)<br>→ **#326** (本地 ML 栈升级, P3 挂起)<br>→ **#348** (colima 替代品调研, P3 挂起) | #292 主导搜索链路宏观分流架构（已闭票，grilling 七项裁决落 #309/#307/#269/#310）；#287 主导环境变量单一入口加载契约，闭环 #275；✅ #344 已于 2026-10-23 交付闭票（PR #887，squash `27e60278`）；#636 收敛面已核；与 #314 协同；Round LXV 新增 `#779`（产出基线断言）与 `#778`（响应体契约 fixture）与 `#310` 搜索收获率 log 形成发现层闭环。 |
| **Phase 3: 视觉设计系统与媒体素材重构** | <br>🎯 **#291** 短视频模板视觉设计体系重做 (P1, `wayfinder:map`，当前激活 Active Wayfinder，AFK frontier = 空（`#302`/`#289` 均已闭票；E 段实施票 **#746** 已于 2026-10-18 交付闭票、#747 待领，`#529` 已转 `dormant` 触发账本（#299 已于 2026-10-20 闭票））；Round LXV 新增回填关联票 `#762/#760/#759` 与 `#763/#757/#752`（均已交付闭票——`#763` 于 2026-10-24 PR #926，squash `25533acc`，Round XCV；`#688` 已于 2026-10-23 交付闭票 PR #901，Round XC；**`#752`** 已于 2026-10-24 交付闭票 PR #912，Round XCI；**`#757`** 已于 2026-10-24 交付闭票 PR #916，squash `d3983f29`，Round XCII；**`#761`** 已于 2026-10-24 交付闭票 PR #919，squash `4845d3be`，Round XCIII）)<br>🎯 **#310** 素材库体系——统一素材库 + 文字描述索引 + 收获率 log (P2, `wayfinder:map`, 吸收 **#288**/**#301**, 原生子票 #354/#293/#547/#541/#294/#355/#356/#635（已交付）；Round LXV 回填关联票 `#779/#778`<br> | ✅ **#360** (长视频预处理, P2——已闭票：分级分段分析 + offset schema/渲染；跨 Scene 绑定并入 **#355**)<br>→ **#396** (focus 内核 Haar→YuNet 候选, P3——#397 已闭票解锁待准入)<br>→ **#334** (VLM Prompt 优化：Fit/claim 冗余/Reason, P2)<br>✅ **#302** (外部开源 Repo 逐个深度追踪, P2——**已交付闭票 2026-10-18**：A–E 五维调研全部交付，E 段可吸收范式落实施票 **#746**（字幕分页/句末判据）/**#747**（字幕视觉 token 层）)<br>→ **#301** (实拍库存视频优先策略改造, P2——并入 **#310**/**#355**)<br>→ **#314** (douyin/xhs 视频素材源 + CDP 新闻源视频能力重构, P2)<br>→ ✅ **#758**（证据图采集确定性路径——per-pack `evidence-captures.json` + `capture-evidence-shot.mjs`，PR #850 已闭票——🛰 **#310** 关联）<br>→ **#762** (checkLoopClose 兼容 string[] dataPoints 与回声校验, P2 bug——🛰 **#291** 关联)<br>→ **#760** (checkNarrativeMediaWarning 复用 skipsMediaSourcing, P2 bug——🛰 **#291** 关联)<br>→ **#759** (final-media-gate 四项机械门禁, P2——🛰 **#291** 关联)<br>→ ✅ **#763** (63 项检查三分类审计, P2 [HITL]——2026-10-24 交付闭票 PR #926，squash `25533acc`，Round XCV——🛰 **#291** 关联)<br>→ ✅ **#761** (contrast/hero-center 与 narrative/stacked-cards 素材承载路由, P2 [HITL]——2026-10-24 交付闭票 PR #919，squash `4845d3be`，Round XCIII——🛰 **#291** 关联)<br>→ ✅ **#757** (#289 follow-up: T2V 模型专属 prompt 模板, P2 [HITL]——2026-10-24 交付闭票 PR #916，squash `d3983f29`，Round XCII——🛰 **#291** 关联)<br>→ ✅ **#752** (#278 评审端：Hook 合格判据与范例库, P2 [HITL]——2026-10-24 交付闭票 PR #912，squash `cf13c13f`，Round XCI——🛰 **#291** 关联)<br>→ **#293** (Stage 0 素材预获取与缺口回流, P2)<br>→ **#354** (认领供给泛化——voiceover 派生 assetNeed+searchHints, P2——吸收 **#295**)<br>→ ✅ **#635** (claimToKeywords 短语化——裸单字仅锚点可留 + 镜头构图/风格/泛用词表过滤, P2——🛰 **#310** 子票，已交付闭票 PR #676)<br>→ **#355** (统一素材兜底链——通用递降链替代五值策略, P2——承接 **#301** 链裁决)<br>→ **#356** (无主供给退役/认领化, P3——依赖 #354)<br>→ **#294** (VLM borderline 二度校验, P2)<br>→ **#295** (写稿 scene-data 概念泛化, P2——并入 **#354**)<br>→ **#253** (行业坐标系+hook 版式, P2)<br>→ **#304** (T2I 工具横评, P3)<br>→ **#529** (视频 skill 180 repo 吸收进产线——执行期跟踪, P3 `dormant`<br>🛰 卫星票挂 **#291**；catalog 完整收录已交付 PR #530；11 条批准类已于 2026-10-24 处置) | #291 为视觉重做总指挥与 S3 Map（原生子票 #300/#302/#529/#289（#299 已闭票）：`#300` 已交付闭票 2026-10-17、结论已回填本图，`#302` A–E 段全部交付（PR #713/#716/#727/#742）并已于 2026-10-18 交付闭票，E 段实施票 **#746**（字幕分页/句末判据，已于 2026-10-18 交付闭票）/ **#747**（字幕视觉 token 层）、动效原语并入 **#731**，下一段 frontier = **空（`#289` Scene 数据与生成画面适配已于 2026-10-18 交付闭票 PR #755，余 `#529` 已转 `dormant` 触发账本（Round XCVI；#299 已于 2026-10-20 闭票））**；Round LXV 回填关联票 `#762/#760/#759` 与 `#763/#757/#752`（`#763` 已于 2026-10-24 交付闭票 PR #926，Round XCV；`#688` 已于 2026-10-23 交付闭票 PR #901，Round XC；**`#757`** 已于 2026-10-24 交付闭票 PR #916，squash `d3983f29`，Round XCII；**`#752`** 已于 2026-10-24 交付闭票 PR #912，Round XCI；**`#761`** 已于 2026-10-24 交付闭票 PR #919，squash `4845d3be`，Round XCIII））；#310 主导素材库与相关性四阶段总图（`wayfinder:map`，原生子票 #354/#293/#547/#541/#294/#355/#356/#635（已交付），Round LXV 回填 `#779/#778`）；#298/#361/#391 已交付的选型与认知底座作为后续输入，不再排 open 期；✅ **#668** 版面系统契约化子图（原生 5 子票 #519/#463/#663/#624/#397 全部交付闭票，合成 S2 Specification 完结收口，解锁 #396 并解除 Mid-Map Lock）——#291 管视觉体系（配色/字体/动效），#668 只管版面契约，两图并行不合并。 |
| **Phase 4: 多平台发布通道与中文内容生态 (最终阶段)** | 🎯 **#296** 中文多平台发布架构 (P2, `wayfinder:map`)<br>🎯 **#268** 中文内容轨首包产出 (P2) | → **#216** (视频号人工扫码 5 项实测, P2)<br>→ **#217** (管线适配视频号发布包, P2)<br>→ **#218** (视频号 CDP 自动化发布, P2)<br>→ **#220** (抖音发布通道落地, P2)<br>→ **#223** (小红书图文频道立项, P2)<br>→ **#206** (Auto-Redbook 试点, P3)<br>→ **#208** (降级图文帖路径, P3)<br>→ **#210** (TikTok 官方 API 发布, P3) | #296 为全渠道发布总图与 S3 Map，主导自研 vs Relay 架构决策；#268 产出合规中文样片物料，作为 #216 扫码实测的必要物料。 |

---

## Duplicate & Absorption Notes

| Issue | Absorbed by | Status & Action |
|---|---|---|
| **#283** (fallback 链语义重审) | **#292** (search-sources 体系性重审) | ✅ **CLOSED (Duplicate)**：全部议题由上游大盘票 #292 完整覆盖吸收。 |
| **#290** (Wan1.3B 文字数字视频效果差) | **#298** (B-roll T2V 模型画质评测升级) | ✅ **CLOSED (Duplicate)**：文字与数字测试集并入 #298 评测矩阵统一推进。 |
| **#275** (search-sources 不自载 .env.local) | **#287** (入口统一加载 .env.local) | ✅ **CLOSED (Delivered)**：#287 落地（`lib/load-env.mjs` + 三入口），联动闭票。 |
| **#247** (Hook bigNumber 缺乏上下文) | **#253** (行业知识层 Ontology + hook 版式库) | ⏩ **Dormant**：待 #253 交付后覆盖关闭。 |
| **#288** (媒体素材补全与 RAG 兜底 Catalog) | **#310** (素材库体系) | ⏩ **并入**：2026-09-15 grilling 裁决——实体图库与官方肖像由 #310「统一素材库 + 文字描述索引」承接。待 #310 交付后覆盖关闭。 |
| **#301** (实拍库存视频优先策略改造) | **#310** / **#355** | ⏩ **并入**：库存视频供给切片归 #310，优先级链架构裁决归 #355（2026-09-24 提案）。待 #310/#355 交付后覆盖关闭。 |
| **#286** (trend 模式相关性护栏盲区) | **#309** (62 源用途定链审计) | ✅ **CLOSED (Delivered via #309)**：相关性护栏并入 #309 新闻参数（publishedAt 两档 + 7 天窗），随 `bc34f67` + `d0f2ea0` 交付后于 2026-10-15 覆盖关闭。 |
| **#637** (pipeline-status.json 单文件覆盖) | **#462** (run 身份与产物/审核绑定) | ✅ **CLOSED (Duplicate)**：与 #462 同源（`pixelle-video-research-2026-10-01.md:120`），零 JS 读写点核实与 Stage 1/2 分期方案已并入 #462 票评。 |
| **#295** (写稿 scene-data 概念泛化) | **#354** (认领供给泛化) | ⏩ **并入**：2026-09-24 提案裁决——searchHints 映射机制倒置为 voiceover 派生的默认环节（triage 方案 1 原样继承）。待 #354 交付后覆盖关闭。 |
| **#280** (search-sources 不自载 .env.local) | **#275** | ✅ **CLOSED (Duplicate)** |
| **#282** (search-pool skill 跨 repo 同步) | — | ✅ **CLOSED (Superseded)**：已由前序 commit 同步闭环。 |
| **#318** (SearXNG 全量引擎启用) | **#344** (SearXNG 覆盖面审计收敛) | ⏩ **并入/挂起**：作为 #344 精简审计的引擎支持矩阵输入；#344 已于 2026-10-23 交付闭票（PR #887），#318 仍挂起、不单独推进。 |
| **#326** (本地 ML 栈安全升级) | **#352** (transformers 5.x 升级链) | ⏩ **协同挂起**：本地不可达 CVE 已 dismiss，待上游（whisperx、huggingface_hub <1.0）解除版本约束后联动评估。 |

---

## Execution Waves（执行波次总表）

每行只列 **open 票**（状态看 tracker，不看本表）；已闭 Wave 的结论在「并行/依赖」列留一行，细节见 archive。

| Wave | 主题 | 涉及目录 | open 票 | 并行 / 依赖 |
|---|---|---|---|---|
| **W1A** | 既有门控与产物可靠性续补 | `lib/tts/` `main.mjs` `render-only.mjs` `HookScene.tsx` | —（波内清空） | Round LXXXI **#818** 已交付闭票（PR #869，squash `96013fc5`）；Round LXXXIV **#817** 已交付闭票（PR #879，squash `c077d5ed`：双轨字幕第 4 不变量轴词数守恒门禁），波内 open 票清零；#420/#423/#548/#421 均已交付闭票 |
| **W1B** | 参数标准化与听感 | `lib/tts/` `docs/content-pipeline.md` | D：#228 | #270 已交付（instruct 单一来源） |
| **W1C** | 工程卫生、安全与状态治理 | `src/` `scripts/` `docs/` `eslint.config.js` `.github/workflows/` | #404 #462 #466 #650 #723 | ✅ **#782** 已交付闭票（2026-10-22，PR #844 squash `2b701572`，Round LXXIII：AGENTS.md 规则 6 placement 门禁与提醒）；Round LXV 新增 **`#723`**（调研结论下游回填强制项，`ready-for-human`）；✅ **`#707`** 已交付闭票（2026-10-23，PR #885 squash `48f299d2`）；#404迁移与#462身份契约待收口，#466/#650/#723 为 `ready-for-human`；具体并行看冲突矩阵 |
| **W1D** | 内容包一致性与发布契约 | `scripts/article/` `lib/platforms/` `docs/content-pipeline.md` `src/components/widgets/` | #430 #431 #434 | ✅ #426 已交付闭票（2026-10-12，PR #589：按 slug 幂等重试/确认写入）；保留#95双轨，#430/#431先裁决；#434只余远端人工核查 |
| **W2A** | 搜源可用性摸底与环境底座 | `skills/search-pool/` `main.mjs` `lib/load-env.mjs` | — | ✅ 完成（#287/#281 闭票），解锁 W2B |
| **W2B** | 搜源架构重审与修复闭环 | `search-sources.mjs` `lib/source-*.mjs` `lib/search-pool.mjs` `skills/shared/` | #353 #358 #390 #405 #416 #457 #467 #468 #469 #778 #320（HITL）#329｜D：#318 #322 #326 #348 #352 | Round LXV 新增 **`#779`**（产出基线断言）与 **`#778`**（契约 fixture 冻结外部响应体）并回填 `#310`；✅ #344 已于 2026-10-23 交付闭票（PR #887）；✅ **`#779`** 已于 2026-10-23 交付闭票（PR #892，merge `fbee7ed6`，Round LXXXIX）；#416先分辨上游缺日期；#457先定指标/预算后试点，#467不等族表重测；#390/#405/#468需范围/契约收口，#469治理HITL |
| **W3A** | 视觉与竞品深度调研（调研先行） | `docs/research/` `lib/b-roll/` | #291（🎯map）#748 #749 #304｜D：#529 | #298画质选型已交付闭票；✅ **#300** 已交付闭票（2026-10-17，结论回填 #291）；✅ **#302** 已交付闭票（2026-10-18，A–E 五维调研全部交付；E 段实施票 #746/#747、动效原语并入 #731）；#291 原生子票 `#300/#302/#529/#289` 已全挂接（#300/#302/#289 已闭、#299 于 2026-10-20 闭票，AFK frontier = 空；E 段实施票 #746 亦已于 2026-10-18 闭票，余 #747 待领）；#529 改挂 **#291** 卫星票，2026-10-24 转 `dormant` 触发账本（11 条批准类已处置）；🟢 只读调研可并行，视觉重设计先收口#291 |
| **W3B** | 媒体底座与素材体系 | `asset-sourcer.mjs` `lib/claim-keywords.mjs` `lib/media-track.mjs` `knowledge/media-catalog.json` `lib/b-roll/` | #310（🎯map）#293 #314 #354 #355 #356 #535 #922｜D：#288 #301 | **#310** 升格挂载 `wayfinder:map`（吸收 #288/#301，原生子票 `#354/#293/#541/#294/#355/#356（open）/#547/#635（已交付）`；Round LXV 回填关联票 **`#758`** 已于 2026-10-22 交付闭票（PR #850；证据图采集确定性路径，配方为 `evidence-captures.json`，非 sidecar），`#848` 已于 2026-10-22 交付闭票（PR #856，Round LXXVII：证据卡布局 + 三张 legacy 证据图按原始捕获路径迁移）；`#779` 已于 2026-10-23 交付闭票（PR #892，Round LXXXIX），`#778` 仍 open）；#297 fail-closed 已闭票；#355 承接 #301 链裁决（**#357** 的「按素材运动感自动选动效」完整设计仍归此票，2026-10-16 只做了默认值快修）；#354 吸收 #295，且与 **#635** 的严格串行随其 2026-10-15 交付解除；#535低紧迫度准入待证、不默认付费，裁判评估归#541 |
| **W3C** | 画面适配与智能写稿 | `scene-data.mjs` `lib/visual-analyzer.mjs` `vlm_analyzer.py` `NarrativeScene.tsx` `lib/crop-decision.mjs` | #334 #541 #540 #396 #294 #253 #256 #263 #731 #732 #733 #734 #735 #738 #739 #747 | Round LXV 新增 **`#762`**（`checkLoopClose` 兼容 `string[]` `dataPoints`）、**`#760`**（`checkNarrativeMediaWarning` 复用 `skipsMediaSourcing`）、**`#759`**（`final-media-gate` 四项机械门禁）入 Track 1A，**`#763`**（63 项检查三分类审计，✅ 2026-10-24 交付闭票 PR #926，Round XCV）、✅ **`#761`**（`contrast/hero-center` 与 `narrative/stacked-cards` 素材承载路由，2026-10-24 交付闭票 PR #919，squash `4845d3be`，Round XCIII）、**`#757`**（T2V 模型专属 prompt 模板，✅ 2026-10-24 交付闭票 PR #916，squash `d3983f29`，Round XCII）、**`#688`**（全版式字号强制上调幅度）入 Track 3 HITL 并全部回填 `#291`（✅ 2026-10-23 交付闭票 PR #901，Round XC；**`#752`** Hook 评审端判据与范例库 ✅ 2026-10-24 交付闭票 PR #912，Round XCI）；#351/#361/#360及#414/#415/#417/#418已交付；#541图片量化证据输入#334；#540研究分用途；#396（YuNet 内核评估）随 #397 闭票已解除阻塞待准入 |
| **W4A** | 平台架构调研与中文首包 | 视频号后台 `docs/research/` `content/` | #296（🎯map）#268 #216（HITL）｜D：#210 | #296 原生子票 `#268/#216/#217/#218/#220/#223/#206/#208` 已挂接；真机实测先行 |
| **W4B** | 发布包适配与自动发布 | `lib/platforms/` | D：#217 #218 #220 #223 #206 #208 #222 | 🔴 硬前置：等 #216 实测数据 + 用户立项授权 |

### Execution Semantics（三层结构与三轨 Frontier 拣选规范）

#### 1. 三层结构职责

1. **Wave（波次）**：按前置依赖、业务里程碑与「调研先行」组织的阶段拓扑。**保持既有契约的出片质量 bug 可跨 Wave 提权进入 Track 1A**，无需等待前序 Wave 的工程整理票清空。
2. **Tier（分级）**：Issue 的业务价值位置（Tier 1 出片底线 > Tier 2 能力增强 > Tier 3 工具合规 > Dormant 冻结）。同轨同段内选票遵循 **Tier 1 > Tier 2 > Tier 3**。
3. **Conflict Risk Matrix（并发风险矩阵）**：多 session 并行的终审依据。任何代码编写前必须核对文件级冲突矩阵，同组文件严格串行。

#### 2. 单 Session 拣选步骤（三轨 Frontier 与跨轨单入口瀑布）

每个 session 处理 1 张 issue（one issue = one fresh context）。领取前通过 `scripts/claim-issue.sh <N>` 读全量评论并完成分配断言。

- **分支 A — 用户显式指定轨道**：
  - 指定「自动施工 / 修 bug」→ 认领 **Track 1A → Track 1B** 队首未分配、未阻塞票；
  - 指定「Wayfinder / 架构图」→ 认领 **Track 2（Active Wayfinder Map）** 当前未阻塞子票 frontier；
  - 指定「HITL / 拍板」→ 认领 **Track 3（独立 HITL）** 队首票。
- **分支 B — 用户未指定轨道（如「挑下一个 roadmap 任务」）：按以下四步瀑布顺次检索，命中第一张 `state=open`、未分配（unassigned）、阻塞边已全闭的 issue 即停下认领**：
  1. **Step 1 · 在途 Active Wayfinder 锁轨（Mid-Map Lock）**：检查当前唯一激活的 `Active Wayfinder Map`。若该图**已开局在途**（名下原生 `sub_issues` 已有 ≥1 张 `closed` 且尚余 `open` 子票），立即认领该图当前未阻塞的下一张子票 frontier。前序 Active Wayfinder **`#668`**（版面契约）名下全部 5 张子票（`#519/#463/#663/#624/#397`）已于 Round LI 全部交付闭票并合成 S2 Spec 闭票收口，Mid-Map Lock 状态解除。新激活 Active Wayfinder 为 **`#291`**（W3A 视觉设计体系重做）：其子票 **`#300`** 已于 2026-10-17 交付闭票、余下子票仍 open，故**本图已开局在途，Step 1 锁轨自本轮起成立**——未指定轨道时本应直接认领本图当前未阻塞子票 frontier，但 **Round LVII–LXV 复算均得「空」**：`#289` 已于 2026-10-18T03:29:30Z 交付闭票（PR #755 合并），`#300`/`#302` 亦已闭，余 `#529` 已转 `dormant`（触发账本，非 AFK；#299 已于 2026-10-20 闭票），故 Step 1 本轮无 AFK 子票可领，瀑布落入 Step 2。
  2. **Step 2 · Track 1A 产线快赢段（`ready-for-agent` 出片质量与运行兜底 bug）**：若 Active Wayfinder Map 尚未开局（0 张子票 closed）、已全图收口或当前 AFK 子票为空，按序认领保持既有契约、单 session 可闭环且直接修复成片画质、配图相关性或运行中断的跨 Wave 快赢票（**Round LXXXIV 复算：Track 1A 段内队列清空——`#817` 已于本轮交付闭票**（PR #879，squash `c077d5ed`：双轨字幕第 4 不变量轴词数守恒门禁，全仓 333 个有声场景 333/333 零误报）；Round LXXXV 复算同（段内无新符合判据的 `ready-for-agent` 票，本段仍空）；上一张 **`#846`**（`apply-media-patch` 结构感知重写 + `--force` Evidence 显式决定 + 单源 formatter，26 包 231 场景 0 失败）已于 2026-10-22 交付闭票（PR #875，squash `18624d71`，Round LXXXIII）；再上一张 **`#818`**（Step 6 `subtitle-alignment` 空转，移出自动重试并 fail-fast）已于 2026-10-22 交付闭票（PR #869，squash `96013fc5`，Round LXXXI）；再上一张 **`#827`**（alignment-guards trim 回读透传 `keyEntities`）已于 2026-10-22 交付闭票（PR #863，squash `d2378bd9`，Round LXXIX），再上一张 **`#820`**（F5 兜底后重跑 pacing 补偿阶梯）已于上一轮（Round LXXVIII）交付闭票（PR #859，squash `ac96dd51`）；`#758` 经本判据（配图相关性）于 2026-10-22 取走并交付闭票（PR #850，squash `58480889`）；此前 `#689`/`#762`/`#760`/`#759`/`#758` 均已交付闭票（#689 PR #825、#762 PR #839、#760 PR #840 squash `bb26a352`、#759 PR #831、#758 PR #850）；`#779`（发现层观测告警）已于 2026-10-23 交付闭票（PR #892，Round LXXXIX）、`#778` 属契约 fixture（`#848` 已于 2026-10-22 交付闭票，PR #856，Round LXXVII）；上一段 **`#786`** 于 2026-10-19 交付闭票（PR #790，squash `c0f16705`），再上一段 `#547` 于 2026-10-18 交付闭票（PR #769，squash `7aa22595`），`#649`/`#635`/`#636`/`#581`/`#357`/`#425` 均已闭票；#396 解锁待准入评估）。
  3. **Step 3 · Track 2 Active Wayfinder 破冰启动**：当 Step 2 的 Track 1A 产线快赢段全部闭票（或均已被并行 session 认领）时，自动认领当前唯一 `Active Wayfinder Map` 的首张 frontier 子票。**`#668`** 收口后，当前唯一激活的 Active Wayfinder Map 为 **`#291`**（W3A 短视频模板视觉设计体系重做，Tier 1；原生子票 `#300/#302/#529/#289`（#299 已于 2026-10-20 闭票）），当前首张未阻塞 AFK 子票 frontier 为 **「空」（`#289` 已于 2026-10-18 交付闭票 PR #755；`#300` 已于 2026-10-17 交付闭票；`#302` 已于 2026-10-18 交付闭票——A–E 五维调研全部完成，E 段实施票 `#746` 于 2026-10-18 交付闭票、`#747` 落位、动效原语并入 `#731`；余下 `#529` 已转 `dormant`（触发账本，不属 HITL 队首）；Round LXV 回填 `#291` 的 `#762/#760/#759` 均已交付闭票（Round LXXI/LXXII/LXX），`#763` 已于 2026-10-24 交付闭票 PR #926（Round XCV）（`#761` 已于 2026-10-24 交付闭票 PR #919，squash `4845d3be`，Round XCIII；`#688` 已于 2026-10-23 交付闭票 PR #901，Round XC；`#752` 已于 2026-10-24 交付闭票 PR #912，Round XCI））**。同一时间仅激活 1 张 Wayfinder Map；当前 Map 收口前不开启 `#310` 或 `#296`。
  4. **Step 4 · Track 3 独立 HITL 拍板轨 → Track 1B 工程卫生段**：上述三步均无待领票时，先按序认领独立 HITL 决策票（**`#763`** 已于 2026-10-24 交付闭票 PR #926，Round XCV（`#761` 已于 2026-10-24 交付闭票 PR #919，squash `4845d3be`，Round XCIII；`#757` 已于 2026-10-24 交付闭票 PR #916，squash `d3983f29`，Round XCII；`#752` 已于 2026-10-24 交付闭票 PR #912，Round XCI；`#688` 已于 2026-10-23 交付闭票 PR #901，squash `793eaf85`，Round XC）；P3：**`#723`**（`#529` 已于 2026-10-24 转 `dormant` 触发账本，不占 HITL 队首）；`#299`/`#429`/`#279`/`#278` 均已闭票；`#848` 已于 2026-10-22 交付闭票 PR #856，Round LXXVII），最后认领不影响当期出片质量的工程卫生与低优整理票（Track 1B W1C 段已清空；`#344` 已于 2026-10-23 交付闭票（PR #887，squash `27e60278`，Round LXXXVII）；按 Tier 2 表顺序队首为 **`#778`**（P2·W2B · source-registry 契约 fixture）→ `#353` → `#358` → `#329` 及后续调研/工具票；`#779` 已于 2026-10-23 交付闭票（PR #892，merge `fbee7ed6`，Round LXXXIX）；`#707` 已于 2026-10-23 交付闭票（PR #885，squash `48f299d2`，Round LXXXVI），`#782` 已于 2026-10-22 交付闭票（PR #844，squash `2b701572`，Round LXXIII），`#623` 已于 2026-10-20 交付闭票 PR #801，`#566` 已于 2026-10-21 交付闭票 PR #834，`#693` 已于 2026-10-20 关闭、标签 `delivery-record-missing` 待补登）。**Round LXXX 已将前轮 4 张新开 `needs-triage` 票全量分流入轨：`#818`/`#846`/`#817` 入 Step 2 Track 1A（Tier 2 · P1·W1A/W1C），`#864` 入本段 Track 1B 队首（Tier 1 · P1·W1C），未定位新票清零。**

**完成判据**：每次闭票同步 `docs/issue-roadmap.md` 时，必须按上述四步重新计算并刷新 `## 当前状态` 顶部的三轨 `frontier` 行；若在途 Wayfinder 子票闭票，必须同步将 Track 2 frontier 推进至刚解锁的下一张子票。

---

## Detailed Phase Roadmaps（阶段执行分解）

### Phase 1: 管线可靠性与核心安全门控 (Pipeline Stability & Core Guardrails)

- **阶段目标**：杜绝坏 take 静默出片，解决 TTS 与 Avatar 唇同步时长一致性，消除参数隐患，建立坚不可摧的生产安全底线。
- **划分波次**：
 - **Wave 1A（既有门控续补）**：Round LXXXI **`#818`** 已交付闭票（PR #869，squash `96013fc5`：Step 6 `subtitle-alignment` 坏死分支清理与 fail-fast）；波内 open 票清零 —— Round LXXXIV **`#817`** 已交付闭票（PR #879，squash `c077d5ed`：双轨字幕第 4 不变量轴词数守恒门禁，兼容 Rule 2 多词 `original` 如 `"GPT 5.5"` 与独立标点 `—` 后全仓 333 有声场景零误报通过）；Round LXV 新增 **`#753`**（P1 队首：实证 `6ddc0cf5`/`788a4c02` 后 `normalizeTtsText` 的 `\b` 连字符切分仍致 `V3.2-Speciale`/`2-3x`/`10-20%` 双轨还原破裂，改用非连字符边界 `(?<![\w-])...(?![\w-%])` + 完整复合 token 记录 + `verifyDualTrackRestoration` 硬门禁）、**`#704`**（CosyVoice3-MLX 确定性 `mx.random.seed` + `mx.metal.clear_cache()` + `TTS_ACOUSTIC_HARD_BLOCK` 时 per-scene 自动回退 `f5-mlx`）、**`#689`**（TTS Quality Gate 尾词截断 `buildExpandedAsrTokenSet` 相邻 2/3-token 拼接 + `BRAND_ASR_ALIASES` 与音近容差）、**`#764`**（将 `main.mjs:262-276` 内联 focus 探针抽为 `probeFocusDependencies` 校验 `hasattr(cv2, 'saliency')` 并升级为显著告警 + `requirements-focus.txt` 钉死 `<5.0.0`）——四张均已交付闭票（#753 PR #814；#704 PR #819；#689 PR #825；#764 2026-10-20）；其 follow-up **`#820`**（F5 兜底后重跑 pacing 补偿阶梯）与 **`#827`**（trim 回读透传 `keyEntities`）亦已于 2026-10-22 交付闭票（PR #859 squash `ac96dd51` / PR #863 squash `d2378bd9`，Round LXXVIII/LXXIX）；✅ **#421**（全命中仍完成字幕对齐）已交付闭票（2026-10-11，PR #561）；**#576**（claim-led revealText fit-bottom，P2）已交付闭票（2026-10-12，PR #578）；✅ 真实 Kaggle TTS 跑已解锁（2026-10-09 **#231** 交付闭票）。
 - **Wave 1B（标准化与语速规范，✅ Dominant 已交付）**：
  - **Wave 1C（工程卫生、安全与状态治理）**：✅ **#319 已交付闭票**（PR #380 / #608 / #618 / #630）、✅ **#325** 已交付闭票（2026-10-14 PR #645）、✅ **#623** 已交付闭票（2026-10-20，PR #801 squash `f016be07`）、✅ **#782** 已交付闭票（2026-10-22，PR #844 squash `2b701572`：`lint-doc-hierarchy.mjs` 增补 `checkAllowedPlacement` + `.githooks/pre-commit` 扩展至 `AGENTS.md`/`CLAUDE.md`/`SKILL.md`，Round LXXIII）、✅ **#327** 已交付闭票（2026-10-22，PR #854 squash `427e3e39`：默认模型目录迁移到 `~/models/cosyvoice3-mlx`，旧路径兼容回退；未移动用户模型文件，Round LXXVI）；Round LXV 新增 **`#723`**（调研结论下游回填强制项，`ready-for-human`）、✅ **`#707`** 已交付闭票（2026-10-23，PR #885 squash `48f299d2`：4 份平铺副本删除、`scene-10.mp4` 迁入 `assets/dh-fixtures/`、手制 Qwen 图 force-add 进两个内容包）、✅ **`#693`** 已于 2026-10-20 关闭（`scene-gate-fixture.tsx:418` 唯一引用处改绑已入库 `assets/dh-fixtures/portrait-small.jpg`；交付记录待补登，标签 `delivery-record-missing`）；以及 **#404**（已批准catalog拆分，补bootstrap/缺失处理）、**#462**（run身份与中间产物/审核绑定，已吸收重复票 **#637**，Stage 1 先迁零 JS 读写的 `pipeline-status.json` 至 `content/{slug}/`）、**#466**（私有技能CI覆盖，访问方式HITL；计时基线可独立）、✅ **#555** 已交付闭票（2026-10-14 PR #641）、✅ **#566** 已交付闭票（2026-10-21，PR #834：digital-human ↔ scene-audio 场景音频解析双实现漂移统一）、✅ **#649** 已交付闭票（2026-10-16，PR #698 `e2d9aa9d`）、**#650**（扫描器产出三态分流契约，6 项裁决建议已落评，`ready-for-human`）。
 - **Wave 1D（内容包一致性与发布契约）**：**#430**Widget适用性/复用/无可用项门禁HITL；**#431**保持#95并行双轨，补事实汇合与修改后版本回检；**#434**仓库代码已交付，仅剩账号资料/历史评论人工核查。本波次不等W4中文渠道。

---

### Phase 2: 检索体系与运行环境固化 (Search & Retrieval Architecture)

- **阶段目标**：理顺检索降级链，消除环境变量自载缺陷与 Agent 路由循环引用，固化跨平台运行环境。
- **划分波次**：
 - **Wave 2A（【调研先行】探针摸底与环境底座，✅ 本波次完成）**：
  - **Wave 2B（搜源分流架构与去环落地）**：✅ **#292**（专用源直连平台 MCP vs 通用源 L3 Pool 分流总图，吸收 **#283**，已闭票——grilling 七项裁决收口，执行移交 #309/#307/#269/#310）+ **#309**（62 源用途定链审计，✅ `bc34f67` + `d0f2ea0` 交付，已闭票）+ **#307**（Bigsong 直连 + Grok promptTemplate，✅ commit `2f97be9` 交付，已闭票）+ **#306**（brief-builder 测试日期衰减基线修复，✅ commit `f7e2731` 交付）+ **#305**（pool 静默零结果 A/B 告警与 streak，C 项 CI 自动开票待授权）+ ✅ **#285**（needsAuth 403 探针放宽，`47fbeaf` / `c957bdc` 交付，已闭票 2026-09-20）+ ✅ **#313**（youtube bot-check Chrome cookie 通道，`9760bda` 交付，已闭票 2026-09-20）+ ✅ **#284**（Route C 循环引用消除，`4c8e92c` + `0340949` 交付 2026-09-20，已推 main `3cdbec9..b13120d`）+ ✅ **#276**（web-deep-research 接入 Search Pool，stale premise 收口闭票 2026-09-21——方案被 #307 用户签字推翻）+ ✅ **#324**（ffmpeg 下载段系统代理 hand-off，`a94f1f3` + `a996821` + `3321cb2` + `4a318a2` 交付 2026-09-21，已推 main `6050db5..4a318a2`）+ ✅ **#344**（SearXNG 覆盖面审计与精简收敛——2026-10-23 交付闭票，PR #887）+ ✅ **#636**（`bing_news` 收敛 articles-only 与失败报告改名归因——2026-10-15 交付闭票，PR #681）+ ✅ **#346**（detectAntiBot 抢跑时序调整为 loginCheck 先行——2026-10-07 交付闭票，两层根因 + 共享 seam，PR #501）+ ✅ **#347**（package-lock.json 同步 + CI `npm ci` 门禁，PR #371 `2536c0f9` 已交付闭票）+ **#353**（selector-health 即时告警与去重自动开票）+ **#358**（reddit 403 判据修复与 SearXNG 候选）+ ✅ **#328**（yt-dlp Firefox 通道与 argv 化，PR #640 `0a45432e` 已交付闭票）+ **#329**（ffmpeg 代理契约断言）+ **#320**（自建 wechat→RSS 实例，`ready-for-human`）+ ✅ **#286**（trend 模式相关性护栏，已随 #309 交付覆盖闭票）+ **#269**（死源自动修复 Phase 2）+ ✅ **#231**（TTS 环境固化——2026-10-09 交付闭票：py3.13 重钉版 + `cosyvoice3-wheels` 离线 wheelhouse，真机在线/离线双路径取证）+ ⏩ **#318**（挂起作为参考数据）+ ⏩ **#326** / **#352**（挂起追踪上游）+ ⏩ **#348**（colima 替代挂起）。

 - **Wave 2B（本轮新增切片）**：Round LXV 新增 **`#779`**（`asset-sourcer` 每源产出基线断言与跌破告警，以 `source-registry.mjs` capabilities 为 SSOT，回填 `#310`；✅ 已于 2026-10-23 交付闭票 PR #892，Round LXXXIX）与 **`#778`**（`source-registry.mjs` 8 个 `parseResponse` 契约 fixture 测试，冻结外部响应体并在漂移时点名失效源，回填 `#310`）；**#416**先取raw/normalized证据；**#457**先收口测量/预算，**#467**仅改当前扇出并发、**#468**仅改来源诊断/限流契约，不重复测量或变更降级链；**#390**候选覆盖、**#405**下载接口边界与**#469**站点经验治理分别收口，通用方法在所属shared仓交付。

---

### Phase 3: 视觉设计系统与媒体素材重构 (Visual Redesign & Media Pipeline)

- **阶段目标**：重构短视频视觉体系达到顶尖商业新闻质感，引入实拍库存优先与实体 Catalog，升级 B-roll 生成模型画质。
- **划分波次**：
  - **Wave 3A（【深度调研先行，基准确立】）**：
    - ✅ **#300（已闭 2026-10-17）**：CDP 抓取头部竞品解构音视频分镜与节奏基准，产出分析报告；阶段 1–3 全交付（PR #719/#724/#725），英文赛道 35 条落盘，结论 gist 已回填 #291；
    - ✅ **#302（已闭 2026-10-18）**：外部开源项目深度吸收——A–E 五维调研全部交付（PR #713 / #716 / #727 / #742，结论已回填 #291），E 段可吸收范式落实施票 **#746**（字幕分页器与缩写感知句末判据升级）/**#747**（字幕视觉 token 层与逐词强调手法）、场景文本动效原语并入 **#731**；**C/D 段可吸收范式已落为实施票（D：#731/#733/#734/#735/#732；C：#738/#739）（2026-10-18，去重后回填 #291 收敛记录）**；
    - ✅ **#298（已闭）**：画质选型与本地生产端口已交付（吸收 **#290** 文字测试集）：FastMetal-5B-QAD 胜出（claim gate 85.0 vs 1.3B 83.75，四维画质76/80 vs73/80，M2 Pro峰值11.42 GiB）+ `mlx_wan22_batch.py` 与runner tier体系。不再领取本票；后续候选/云端评估按剩余open票与硬件路由重新核需求及授权；
    - 🎯 **#291**：汇总调研成果，确立 S3 视觉重做 Wayfinder Map（原生子票 **#289**（已闭）/**#299**（已闭） + C/D/E 段落票 **#731**/**#732**/**#733**/**#734**/**#735**/**#738**/**#739**/**#746**（已闭）/**#747** + Round LXV 回填关联票 **#762**/**#760**/**#759**（均已闭票，Round LXXI/LXXII/LXX）与 **#763**/**#757**/**#752**（**#763** 已于 2026-10-24 交付闭票 PR #926，Round XCV；**#761** 已于 2026-10-24 交付闭票 PR #919，squash `4845d3be`，Round XCIII；**#757** 已于 2026-10-24 交付闭票 PR #916，squash `d3983f29`，Round XCII；**#752** 已于 2026-10-24 交付闭票 PR #912，Round XCI；**#688** 已交付闭票 2026-10-23，PR #901，Round XC））。
  - **Wave 3B（媒体底座与素材兜底）**：🎯 **#310**（`wayfinder:map`：素材库体系统一——统一素材库 + 文字描述索引 + **收获率搜索 log（第一交付物，可先行）** + 素材关键词体系；**吸收 #288 + #301**，原生子票 `#354/#293/#547/#541/#294/#355/#356/#635（已交付）`，Round LXV 回填关联票 **`#758`** 已于 2026-10-22 交付闭票（PR #850，squash `58480889`；per-pack `evidence-captures.json` + `capture-evidence-shot.mjs`，provenance 落 scene-data 而非 sidecar）；`#848` 已于 2026-10-22 交付闭票（PR #856，Round LXXVII：证据卡布局 + 三张 legacy 证据图按原始捕获路径迁移）；`#779` 已于 2026-10-23 交付闭票（PR #892，Round LXXXIX），`#778` 仍 open）+ ✅ **#297**（素材匹配 Fail-closed 留空绝不硬塞无关图，已闭票 `a4ce959`，E2 `1b68276` 删 legacy 模式）+ ✅ **#375**（B-roll spawn env 默认值断言覆盖，已闭票）+ **#293**（Stage 0 素材预获取与缺口回流）+ **#354**（认领供给泛化——voiceover 派生 assetNeed+searchHints，字段降级为覆盖；吸收 #295）+ ✅ **#635**（`claimToKeywords` 短语化——裸单字仅锚点可留 + 镜头构图/风格/泛用词表过滤，已交付闭票 PR #676）+ **#355**（统一素材兜底链——通用递降链替代五值 mediaStrategy，承接 #301 票评 2026-09-14 媒体优先级链，生成形态预算选择 + 每内容生成上限护栏）+ **#356**（无主供给退役/认领化——兜底池死供给清理，依赖 #354）+ ✅ **#357**（视频默认容器 zoom 退场快修——✅ 2026-10-16 交付闭票，PR #690 `d66a57dd`）+ ✅ **#425**（media-track 尊重显式 upscale:false，已交付闭票 PR #694 `477739ac`）。
  - **Wave 3C（画面适配与智能生成）**：Round LXV 新增 **`#762`**（`checkLoopClose` 兼容 `string[]` `dataPoints` 与首拍锚点回声校验，已闭票 Round LXXI PR #839）、**`#760`**（`checkNarrativeMediaWarning` 复用 `skipsMediaSourcing` 消除恒噪，已闭票 Round LXXII PR #840）、**`#759`**（`final-media-gate` 增补尺寸/裁切边界/宽幅证据图防截断/来源四项机械门禁，已闭票 PR #831）入 Track 1A，**`#763`**（`scene-rules.mjs` 63 项检查三分类审计，✅ 2026-10-24 交付闭票 PR #926，Round XCV）、✅ **`#761`**（`contrast/hero-center` 与 `narrative/stacked-cards` 证据素材承载路由，2026-10-24 交付闭票 PR #919，squash `4845d3be`，Round XCIII）、**`#757`**（`#289` follow-up：T2V 模型专属 prompt 模板——`wan2.2`/`wan2.1` 在产线 + `seedance` 候选，✅ 2026-10-24 交付闭票 PR #916，squash `d3983f29`，Round XCII）、**`#752`**（`#278` 评审端：Hook 3 轴评审判据与正反范例库，✅ 2026-10-24 交付闭票 PR #912，Round XCI）、**`#688`**（全版式字号强制上调幅度两档方案裁决）入 Track 3 HITL 并回填 `#291`（✅ 2026-10-23 交付闭票 PR #901，Round XC）；✅ **#668**（版面系统契约化子图——5 张原生子票 `#519/#463/#663/#624/#397` 全部交付闭票，合成 S2 Spec 闭票收口，与 #291 并行不合并）+ ✅ **#289**（专属 aiVideo.prompt 适配层，已交付闭票 2026-10-18 PR #755）+ ✅ **#299**（Hook 前 3 秒媒体策展契约，已交付闭票 2026-10-20 PR #798）+ **#294**（VLM borderline 二度校验）+ ⏩ **#295**（写稿 scene-data 概念泛化，已并入 #354 待覆盖关闭）+ **#253**（行业坐标系与版式库）+ ✅ **#244**（Hook scene emotion 已交付闭票，文案拆 #278）+ **#256**/**#263**（策略与创意 HITL）+ 🛰 **#291** 视觉体系卫星组（**#731**–**#735** / **#738** / **#739** / ✅ **#746**（已闭票 Round LVII） / **#747**）。
  - **Wave 3C（VLM 认知底座组，2026-09-25 新增）**：✅ **#351**（vlm 缓存 key 模型解耦——`vlm-model.json` 单一真值源，已闭票交付）→ ✅ **#361**（方案 C 全模态引擎接入——MiniCPM-o 4.5 + emotion2vec+ 轻量插件，PR #378 已合并 `021d7c43`，裁决与防线见 `docs/research/handoff-omni-vlm-20260925.md`）→ ✅ **#360**（长视频预处理——A+ 分期交付：分级分段分析 + `videoStartOffsetMs` schema/渲染/校验；跨 Scene 绑定并入 #355）→ ✅ **#391**（拆帧策略——22 方法 bench 矩阵 PR #392/#395/#419 + 四子票 `#414/#415/#417/#418` 全闭 + 生产统一 Qwen3-VL 原生采样 PR #543，已闭票）→ ✅ **#397**（Phase 2 焦点产出消费方——布局解析缺口，已交付闭票，解锁 #396）→ **#334**（VLM Prompt 优化与 token 预算削减）→ **#294**（borderline 二度校验，复用方案 C 音视频对齐）。

 - **Wave 3C（ASR独立评估）**：

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

## Execution Tiers（open 票放置）

只列 open 票；每票一行。状态标签看 tracker；叙事与证据看票评论。**排位不等于实施就绪**：需要补证据/范围或人工裁决的票也可先定位Tier/Wave，只有tracker状态允许且评论/assignee/依赖复查通过才领取。

### Tier 1 — 核心阻断与出片质量基线（优先攻坚）

| # | 标题 | Phase·Wave | 备注 |
|---|---|---|---|
| #291 | 短视频模板视觉设计体系重做 | P3·W3A | 🎯 wayfinder:map（HITL） |
| #216 | 视频号人工发布试点（实测 5 项规格） | P4·W4A | HITL；W4B 硬前置 |

### Tier 2 — 架构深化与能力增强（稳步推进）

| # | 标题 | Phase·Wave | 备注 |
|---|---|---|---|
| #462 | run身份、状态与产物/审核绑定 | P1·W1C | 吸收重复票 #637；Stage 1 先迁零 JS 读写的 `pipeline-status.json` 至 `content/{slug}/`，Stage 2 再做 JS 产物 runId 化与索引契约 |
| #466 | 私有shared技能CI覆盖与计时基线 | P1·W1C | 跨仓访问HITL；B项可独立，不造已知缺凭据红PR |
| #430 | Widget适用性与无可复用分支 | P1·W1D | 门禁/开发归属HITL；保留历史快照，不以统一年龄判失效 |
| #431 | 保持双轨的事实汇合与修改回检 | P1·W1D | 不改#95并行裁决；共享事实/语义回检边界HITL |
| #434 | 域名修复后的远端人工核查 | P1·W1D | PR#435代码已交付；账号资料/历史评论未验证，不重修代码 |
| #778 | test(source-registry): 契约 fixture 测试——冻结外部源响应体，格式漂移时 CI 点名失效源 | P2·W2B | P2 enhancement；ready-for-agent；🛰 关联 **#310**；覆盖 `source-registry.mjs` 8 个 `parseResponse` 与 `progressive-search.mjs` 正向断言及漂移负向断言 |
| #353 | selector-health 运行时告警与去重自动开票 | P2·W2B | enhancement；运行态即时告警 + 去重开票 |
| #358 | reddit_search 403 判据修复 + SearXNG 路由候选 | P2·W2B | bug；authRequired:false 误判修正 |
| #329 | yt-dlp 代理 hand-off 残余覆盖（#324 后续） | P2·W2B | bug；ffmpeg env 契约断言 + SOCKS-only 声明 |
| #416 | Serper日期覆盖告警根因分辨 | P2·W2B | raw/normalized对照；上游无日期不等于parser drift |
| #457 | 搜索正交性测量契约与预算 | P2·W2B | URL/域/稿源分层；离线先行，预算批准→试点→确认后铺满 |
| #320 | 自建 wechat→RSS 实例（动察Beating 登记） | P2·W2B | proposal；HITL 环境搭建与扫码登录 |
| #748 | 竞品取样账号校验（handle 同人 + 赛道归属）与已落盘 5 条非赛道样本处置 | P3·W3A | P2；ready-for-human；🛰 承接 **#300** §10.1「门槛必须加内容主题校验」未执行项；HITL 拍板口径与处置 |
| #749 | 时间轴第二实测源（镜头切点替代 ASR 段跨度插值） | P3·W3A | P3；ready-for-agent；🛰 承接 **#730** 遗留；复核 §10.1 的 6 条塌缩记录，可复算入口 `competitor-benchmarks-timing-health.mjs` |
| #310 | 素材库体系（统一素材库+索引+收获率 log） | P3·W3B | 🎯 wayfinder:map；吸收 #288/#301，原生子票 #354/#293/#541/#294/#355/#356（open）/#547/#635（已交付）；关联 #779（已于 2026-10-23 交付闭票 PR #892）/#778；#848 为旧包重捕获 |
| #293 | Stage 0 素材预获取 + 缺口回流 | P3·W3B | 🛰 **#310** 子票 |
| #314 | douyin/xhs 视频素材源（发现入口 + 白名单） | P3·W3B | 2026-09-19 裁决：CDP 新闻源摘除 videos 声明 |
| #354 | 认领供给泛化（voiceover 派生 assetNeed+searchHints） | P3·W3B | 🛰 **#310** 子票；吸收 #295（与 #635 的串行随其 2026-10-15 交付解除） |
| #355 | 统一素材兜底链（通用递降链替代五值策略） | P3·W3B | 🛰 **#310** 子票；承接 #301 票评 2026-09-14 链裁决；#360 跨 Scene 绑定归此（offset 字段已就位） |
| #535 | 云端生图provider准入与缓存身份 | P3·W3B | P3低紧迫度；本地效果用户认可，endpoint/计费/许可/预算待证；裁判实验归#541，不默认付费fallback |
| #922 | #757 follow-up：per-family T2V 模板接进 b-roll 生成路径 | P3·W3B | P2 enhancement；ready-for-agent；🛰 承接 **#757**（模板层已闭 PR #916，`prompt-templates.mjs` 未接线）；与 #355/#535/#541 同属 `lib/b-roll/` 串行带；接线点与缓存迁移灰度见票内 Open Questions |
| #334 | VLM Prompt 优化（Fit/claim 冗余 token 预算削减/Reason） | P3·W3C | enhancement；Prompt 精简与测试集回归 |
| #541 | 图片relevance稳定性/范式/阈值实验 | P3·W3C | P2；🛰 **#310** 子票；Qwen当前基线，真实人工GT/holdout/预算先定；pairwise不替绝对门，双缓存绕过；输入#334 |
| #540 | whisper 重复循环的业界处置（VAD 门控/解码参数/检测判据/下游处置） | P3·W3C | P2研究；cpp ctx-off生产基线、检测/改写分开；fullText无时间戳，VLM与TTS处置分用途；不改生产默认 |
| #396 | focus 内核切换 Haar→YuNet 候选（评估通过：人脸一致/少误报/3.7×） | P3·W3C | #397 已交付闭票解除阻塞，待准入评估；产出已有消费方契约 |
| #731 | 视觉语言与动效 token 体系（品牌→动效推导 + 正交 style-token 层 + 反 PPT 相机/停留预算） | P3·W3C | HITL；🛰 **#291** 子票（B 段 spring presets/正交 token 层并入；C 段持续动作/落位停留见票内评论） |
| #733 | 镜头配方卡层 + 语义拍分镜（shotcraft 配方卡 + library.json 单一真值；SHOTBOOK 语义词表） | P3·W3C | HITL；🛰 **#291** 子票（与 #529 R2 边界对齐） |
| #734 | 渲染工程：确定性渲染 + 分段渲染母版制 + CI 三闸 | P3·W3C | 🛰 **#291** 子票（②与 #228 归属待对齐） |
| #735 | 量化验收闸门：逐镜静帧 + QA 拼图 + 独立 subagent 终检 | P3·W3C | 🛰 **#291** 子票（C 段三闸门判据见票内评论） |
| #732 | 口播与音频契约：voice_trim 预剪 + SFX 相对帧 + BGM 布尔 prop | P3·W3C | 🛰 **#291** 子票（对齐 #566/#230/#279） |
| #739 | 数据/对比信息图语法层：尺寸三档 + 空场判据 + 四种版式拓扑 + 「多」用矩阵 | P3·W3C | HITL；🛰 **#291** 子票（竖屏阈值重算；边界 #731/#735/#668） |
| #738 | 主角光体系：三层光 + 主角必带光 + 一帧内重点 ≤1 + 转移灭灯时序 | P3·W3C | HITL；🛰 **#291** 子票（边界 #731/#735；主角判定复用 #397/#668 契约） |
| #747 | 字幕视觉 token 层与逐词强调手法扩展 | P3·W3C | HITL；🛰 **#291** 子票（E 段交付 2026-10-18；边界 #746/#731；ass.mjs 两色硬编码 + 无字幕 token 源） |
| #294 | VLM asset relevance 复杂系统设计 | P3·W3C | 🛰 **#310** 子票 |
| #253 | 行业知识层 Ontology + hook 版式库 | P3·W3C | HITL |
| #256 | 数字人决策权变更 + 白/黑名单重审 | P3·W3C | HITL |
| #263 | TikTok 成片时长目标重审 | P3·W3C | HITL |
| #296 | 中文多平台发布架构（AiToEarn 调研） | P4·W4A | 🎯 wayfinder:map |
| #268 | 中文内容轨首包产出 | P4·W4A | #216 前置物料 |

### Tier 3 — 低重要性 / 工具链与合规排查

| # | 标题 | Phase·Wave | 备注 |
|---|---|---|---|
| #404 | tools-catalog已批准拆分的可移植性 | P1·W1C | bootstrap/缺失处理/深链接验收先收口，项目门禁留本仓 |
| #723 | tracker: 调研结论无下游回填强制项——只落文档与自身评论，Map 票/roadmap 长期不知情 | P1·W1C | P3 enhancement；ready-for-human；`implementation-workflow.md` / `issue-tracker.md` / `.agents/skills/triage/SKILL.md` 三处接入下游影响面回填强制项 |
| #390 | 模型候选池覆盖检查 | P2·W2B | 热榜/org/新品取并集；通用方法归shared，不重开模型选型 |
| #405 | 下载CLI失败清单与guard集成 | P2·W2B | 已有串行bench/native batch；全长/生产clip契约分开 |
| #467 | cached-search扇出async并发 | P2·W2B | 一族一次、稳定顺序、失败隔离；barrier/事件证明重叠 |
| #468 | 垂直源错误/限流与身份契约 | P2·W2B | 核当前provider规则；mailto因果过时，不加代理/fallback猜测 |
| #469 | 站点经验所有权/隐私/持久化 | P2·W2B | HITL；现有读取已含存在条件，不自动推送loaded经验 |
| #304 | T2I 生成工具横评（mflux 协议适配度） | P3·W3A | 只读调研 |
| #356 | 无主供给退役/认领化（兜底池死供给） | P3·W3B | 🛰 **#310** 子票；依赖 #354 |
| #650 | 扫描器产出无分流契约：报告/裁决/覆盖三态混装 | P3·W1C | #319 长期账本的机制收口；6 个 open question 具体裁决建议已落评（转 `ready-for-human`）；与 #406 已交付的接入形态耦合 |

### Dormant — 触发条件未满足（暂缓占用排期）

| # | 标题 | Phase | 备注 |
|---|---|---|---|
| #529 | 视频 skill 180 repo 研究结论吸收进产线（执行期跟踪） | P3 | 🛰 satellite: **#291**（原 #302 已于 2026-10-18 闭票，改挂）；研究 + catalog 收录已交付（PR #408/#528/#530）；**触发账本**：R4 collage / R5 发布 receipt / R7 数字人口子，触发条件均未满足；11 条批准类已于 2026-10-24 逐条处置（R2①③/R3①②③/R8① 路由 owner 票 #733/#731/#735/#734/#732，R2④ 无动作，R6② 落地写稿指南），见票内执行期处置记录 |
| #318 | SearXNG 全量引擎启用 + 逐引擎 fallback | P2 | 作为参考数据归入 #344 精简审计（#344 已于 2026-10-23 闭票），不单独实施 |
| #322 | needsAuth 源零结果差异化计数语义 | P2 |  |
| #326 | 本地 ML 栈安全升级 | P2 | CVE 本地不可达已 dismiss，随 #352 挂起跟踪上游 |
| #348 | colima 替代品调研（OrbStack 等） | P2 | 替代收益微弱，挂起 |
| #352 | transformers 5.x 升级链评估 | P2 | CVE 本地不可达已 dismiss，挂起跟踪上游 whisperx/hub 约束 |
| #228 | 管线提速二期（batch/daemon/并行） | P1 |  |
| #21 | 多模态 RAG（图像/视频检索） | P3 |  |
| #157 | B-roll 高质量模型横评 | P3 | 收窄保留：FastMetal 同族已由 #298 交付选型；余非 FastMetal 候选（Wan2.2 TPP / LTX-Video 2.x / Helios）待准入 gate 后再评 |
| #158 | B-roll ComfyUI / MCP 迭代式后端 | P3 |  |
| #224 | 数字人半身像支持 | P3 |  |
| #230 | 字幕短 cue 两行版式合并 | P3 |  |
| #288 | 媒体素材补全 catalog 进 RAG 兜底 | P3 | 并入 #310，待覆盖关闭 |
| #301 | 实拍库存视频优先策略 | P3 | 并入 #310（供给）+ #355（链裁决），待覆盖关闭 |
| #295 | assetNeed 泛化：claim→搜索概念 | P3 | 并入 #354（2026-09-24 提案），待覆盖关闭 |
| #247 | Hook scene bigNumber 缺乏上下文 | P2 | 待 #253 交付后覆盖关闭 |
| #217 | 管线适配视频号发布包 | P4 |  |
| #218 | 视频号 CDP 自动化发布路线 | P4 |  |
| #220 | 抖音发布通道落地 | P4 |  |
| #222 | 抽象短视频引擎为独立 repo | P4 |  |
| #223 | 小红书图文频道立项 | P4 |  |
| #206 | Auto-Redbook 试点 | P4 |  |
| #208 | 降级图文帖路径 | P4 |  |
| #210 | TikTok Content Posting API 调研 | P4 |  |

---

## Triage Inbox（待分流队列）

按 [`triage-labels.md`](agents/triage-labels.md) 定 Phase / Wave / Tier / P后放入Tier表；**只有完成范围/证据/决策分流才转换state**，不能为清零机械摘`needs-triage`。尚不能定位的票只留Inbox，已定位但未就绪者不重复列行。历史台账→[`archive/roadmap-tables-archive-2026-09-24.md`](archive/roadmap-tables-archive-2026-09-24.md)。

> **Round XVI（2026-10-11）**：新增#519/#535/#541已定位Tier/Wave并补P；#529/#540/#547/#548复核归位。定位不等于ready，未决事项仍受tracker状态门控；本Inbox仍只剩#406未定Phase/Wave/Tier。#451 Dependency Dashboard是管理票，排除业务排期。

> **Round XXXVIII（2026-10-14）**：#406 分流完成并交付（形态 = Agent 主动步骤；hook 存活门禁 `npm run lint:hooks` 落地），#650 已定位 → Tier 3 · P3·W1C。**Inbox 表清空**——已定位未就绪的票只在 Tier 表，不在此重复列行（`needs-triage` 标签队列按 `gh issue list --label needs-triage` 实时查）。

> **Round XXXIX（2026-10-15）**：#668 定位 → Tier 2 · P3·W3C（🎯 `wayfinder:map`，原生子票 #463/#519/#663/#397）；新票 #663 随图定位 → Tier 2 · P3·W3C（🛰 #668 子票，被 #519 原生阻塞）。两票的范围/降级政策待 grilling 裁决，状态标签按 tracker 实时查、不机械摘。**Inbox 仍空**——已定位未就绪的票只在 Tier 表。

> **Round XL（2026-10-15）**：新票 `#623`（Tier 2 · P1·W1C · `ready-for-agent`）、`#636`（Tier 2 · P2·W2B · `ready-for-agent`）、`#635`（Tier 2 · P3·W3B · `ready-for-agent`，🛰 #310 子票）、`#624`（Tier 2 · P3·W3C · `ready-for-human`，🛰 #668 子票）完成源码核验与方案评审入表；重复票 `#637` 并入 `#462` 关闭；`#581` 实测 CLI 后转 `ready-for-agent`、`#650` 补 6 项裁决建议后转 `ready-for-human`。**Inbox 仍空**。

> **Round LXV（2026-10-20）**：19 张新开/待分流票完成全量源码核验、技术方案审查/补齐与落标入表——`#753`（Tier 1 · P1·W1A · `ready-for-agent` P1 队首）、`#704`/`#689`/`#764`（Tier 2 · P1·W1A · `ready-for-agent` P2）、`#782`（Tier 2 · P1·W1C · `ready-for-agent` P2）、`#779`/`#778`（Tier 2 · P2·W2B · `ready-for-agent` P2，回填 `#310`）、`#758`（Tier 2 · P3·W3B · `ready-for-agent` P2，回填 `#310`）、`#762`/`#760`/`#759`（Tier 2 · P3·W3C · `ready-for-agent` P2，回填 `#291`）、`#763`/`#761`/`#757`/`#752`/`#688`（Tier 2 · P3·W3C · `ready-for-human` P2，回填 `#291`）、`#723`（Tier 3 · P1·W1C · `ready-for-human` P3）、`#707`/`#693`（Tier 3 · P1·W1C · `ready-for-agent` P3）；清理 Tier 表已闭票行（`#302`/`#668`/`#663`/`#624`/`#463`/`#397`/`#289`/`#746`）。全仓 `needs-triage` = 0、`comments-unread` = 0，**Inbox 仍空**。

> **Round LXVI（2026-10-21）**：#704 CosyVoice3-MLX 出片稳定性 + F5 本地兜底交付闭票——PR #819 squash `c756f80c`；真实 A/B（fallback disabled 60.0s `TTS_ACOUSTIC_HARD_BLOCK` → enabled F5 4.82s / 162 WPM / 100%），per-scene entropy seed + clear cache（旧实现同批 scene 2/3 同为 9.48s/同一转写），兜底只修失败场景、全体 take 225 WPM 否决（含 cached approved take）、F5 key/provenance、`TTS_DISABLE_LOCAL_FALLBACK` 开关；后继 #820（兜底不重跑 pacing 补偿阶梯）。frontier：Track 1A #689 → #762 → #760 → #759；HITL #688；Track 1B #782。

> **Round LXVIII（2026-10-21 triage）**：**#816**（restore 回写吞前导符号，`$700M` → `700M`）完成分流 → Tier 1 · 优先级 P2 · W1A · `ready-for-agent`；真实包审计（26 包 / 116 场）发现 10 例前缀丢失（5 `$` + 5 `(`），修复后前缀类 0；#817/#818 本轮未分流，未入表。本票为用户显式指定，优先于 Track 1A 当前队首（#762 → #760 → #759），不改变 frontier 排位。

> **Round LXXXI（2026-10-22）**：`#818` 交付闭票（PR #869，squash `96013fc5`），其 Tier 2 行已删；本票副产品 **`#870`**（`verifyWithRetry` 的修复路径返回值被调用方丢弃——复验对象与修复产物可脱钩，当前潜伏）新开为 `bug`·`needs-triage`，**尚未定位 Phase/Wave/Tier**，按 tracker 实时查。Inbox 其余既有待分流票不变。

> **Round LXXX（2026-10-22 triage）**：4 张新开/待分流票完成全量源码核验、26 个真实 `scene-data.mjs` 内容包（231 场景）语料实测、技术方案审查/补齐与落标入表——**`#864`**（Tier 1 · `P1·W1C` · `P1 bug` · `ready-for-agent`，入 Track 1B 队首）、**`#818`**（Tier 2 · `P1·W1A` · `P2 bug` · `ready-for-agent`，入 Track 1A 队首）、**`#846`**（Tier 2 · `P1·W1C` · `P2 bug` · `ready-for-agent`，入 Track 1A）、**`#817`**（Tier 2 · `P1·W1A` · `P2 enhancement` · `ready-for-agent`，入 Track 1A）；同步清理 `#818`/`#817` 的 `comments-unread` 标签。本批 4 张新票 `needs-triage` = 0、`comments-unread` = 0，**Inbox 未定位队列仍空**。

> **Round XCIV（2026-10-24 triage）**：**`#922`**（#757 follow-up：per-family T2V 模板接进 b-roll 生成路径）完成分流 → Tier 2 · `P3·W3B` · `P2 enhancement` · `ready-for-agent`。验收口径取自 `docs/research/t2v-model-prompt-templates.md` §5 的四项接线待办（档位→familyId、negative 双路径不可互换、超预算报错、VLM gate 分离）；与 #355（预算）/ #535（provider·缓存身份）/ #541（gate 消费）同属 `lib/b-roll/` 串行带。本票不改变 frontier（Track 3 HITL 仍 `#763`，Track 1B 仍 `#778`）。

---

## Conflict Risk Matrix（文件并发风险矩阵）

同时修改同一文件的 issue **严禁并行，必须串行执行**。只列仍有 open 票的文件组；已全部闭票的历史行 → archive。seam 约定不随闭票失效。

| 文件 / 模块 | open 票 | 风险与串行规则 |
|---|---|---|
| `scripts/short-video/main.mjs`<br>`render-only.mjs` `lib/media-track.mjs`<br>`lib/render-remotion.mjs` `lib/assemble.mjs` `verify-video.mjs`<br>`lib/final-media-gate.mjs` `lib/verify-retry.mjs` `lib/requirements-focus.txt` | #293 #462（D：#228） | 🔴 生命周期、字幕准备、媒体赋值、run选择与共享staging严格串行（#818 已交付闭票，其对 main.mjs:561-589 与 verify-retry 的修改已入主干）； |
| `scripts/short-video/search-sources.mjs`<br>`lib/source-registry.mjs` | #314 #358 #778 | 🔴 核心搜源调度；**#778** 冻结 `source-registry.mjs` 8 个 `parseResponse` 契约 fixture；✅ **#779** 已于 2026-10-23 交付闭票（PR #892，merge `fbee7ed6`，Round LXXXIX——曾读取 capabilities 作为产出基线 SSOT）；✅ **#344** 已于 2026-10-23 交付闭票（PR #887，squash `27e60278`） |
| `lib/source-url-heal.mjs`<br>`source-url-sweep.mjs`<br>`source-url-discover.mjs` | #358 | 🟡 判据改动加在 `isFailureVerdict()` / `needsCdpSecondOpinion()` seam 上（#358 reddit 403 判据修复）；sweep/discover 是只读消费者，可与 registry 并行；产物落 gitignored `output/` |
| `lib/source-health.mjs`<br>`lib/search-pool.mjs` `pool-canary.mjs`<br>`__tests__/fixtures/pool-contracts/` | #353 #416 #457（D：#322） | 🟡 事实信号/采集provenance/日期诊断串行；source-health保持既有fail-open，freshness缺日期仍fail-closed，不能混用两种门禁；#346 已交付闭票 |
| `lib/video-downloaders.mjs`<br>`lib/ytdlp-guard.mjs` `bench/keyframe/download_videomme.sh` | #314 #329 #405 | 🟡 下载/guard seam串行； |
| `asset-sourcer.mjs`<br>`lib/claim-keywords.mjs`<br>`capture-evidence-shot.mjs` | #294 #354 #355 #356 #541（D：#301） | 🟡 素材匹配评分与关键词流水线，串行；✅ **#779**（每源产出基线断言）已于 2026-10-23 交付闭票（PR #892，Round LXXXIX），**#354** 改 `lib/claim-keywords.mjs` 与 `asset-sourcer.mjs:2384`（**#635** 已交付，原严格串行解除）； |
| `lib/visual-analyzer.mjs`<br>`vlm_analyzer.py` `video_loader.py`<br>`lib/video-understand.mjs` `lib/asr-analyzer.mjs`<br>`lib/asr-repetition-guard.mjs` `asr_repetition_guard.py` `lib/vlm-cache.mjs` | #334 #541 #540 | 🟡 引擎/prompt/ASR/loader/cache契约代码修改串行；#540/#541先交研究，不自动改生产； |
| `knowledge/media-catalog.json`<br>`asset-gaps.json` `scripts/short-video/assets/`<br>`content/{dh-pilot-qwen4,qwen4-preview}/scene-data.mjs` | #310 #293 #294 | 🟡 #310 为 W3B Dominant（`wayfinder:map`）；收获率 log 与其余低耦合可先行 |
| `lib/b-roll/` | #304 #355 #535 #541 #922 | 🟡 #298已交付选型、✅ #757 已交付 per-model 模板（`lib/b-roll/prompt-templates.mjs`，未接线）、#922 为接线票（改 `runner.mjs`/`prompt-injection.mjs`，与 #355预算、#535 provider/缓存身份、#541 gate与winner消费代码修改串行）；只读调研/标注可并行，不复用旧winner冒充重测 |
| `src/` / `scripts/` 安全核心模块 | — | 🔴 compile-series.mjs / digital-human.mjs / auth-middleware.ts / keyword-tracking 安全修复，独立加固；✅ **#566** 场景音频解析统一（digital-human.mjs + lib/scene-audio.mjs）已于 2026-10-21 交付闭票（PR #834），串行要求解除——✅ #319 已交付闭票（PR #630：M/L 批次 127 条裁决，修复面未触 digital-human.mjs，串行要求随之解除） |
| `lib/tts/registry.mjs` `cache.mjs`<br>`cosyvoice3-kaggle-cuda.mjs` `cosyvoice3-mlx.mjs` `cosyvoice3_mlx_batch_tts.py`<br>`post-process.mjs` `quality-gate.mjs`<br>`lib/normalize-tts-text.mjs` `lib/subtitles/restore-tokens.mjs` `lib/subtitles/dual-track.mjs` `kaggle/cosyvoice3_cuda_kernel.py` | #732 #462 #540（D：#228） | 🔴 **#817** 已于 Round LXXXIV 交付闭票（PR #879，squash `c077d5ed`）：`lib/subtitles/dual-track.mjs` 现含静态/动态两条词数守恒轴（按 `wordTokens` 校验，兼容 Rule 2 多词 `original` 如 `"GPT 5.5"` 与独立标点 `—`），与 #753 已交付的非连字符边界/完整复合 token 映射同 seam；后续改 `dual-track.mjs` / `normalize-tts-text.mjs` 须保留这两条守恒轴；#540若改共享转写须保留TTS infra/acoustic边界 |
| `remotion/src/scenes/HookScene.tsx` `ContrastScene.tsx`<br>`NarrativeScene.tsx` `ShortVideo.tsx` `scene-gate-fixture.tsx`<br>`remotion/src/components/MediaBackground.tsx`<br>`lib/text-slots.mjs` `lib/scene-rules.mjs` `lib/text-geometry.mjs`<br>`lib/crop-decision.mjs` `apply-media-patch.mjs` `review-media-patch.mjs` `lib/media-patch-format.mjs` | #291 #731 #733 #734 #735 #738 #739 #747 #355 | 🔴 layout/字段/预算/preflight/render/裁切补丁契约串行；✅ **#763** 已于 2026-10-24 交付闭票（PR #926，squash `25533acc`，Round XCV）——`lib/scene-rules.mjs` 的机检分层与两条规则改写已入主干，`scene-rules.mjs` 的串行要求随之解除；✅ **#761** 已于 2026-10-24 交付闭票（PR #919，squash `4845d3be`，Round XCIII）——`ContrastScene.tsx` 媒体接线与 `scene-rules.mjs` 新门禁已入主干，原有串行要求解除；#396 解锁待准入（**#688** 已改完 `lib/text-slots.mjs` 预算与全版式字号，2026-10-23 交付闭票 PR #901，Round XC） |
| `lib/caption-utils.mjs` `lib/publish-utils.mjs`<br>`lib/platforms/generate-publish-package.mjs` `publish-tiktok.mjs` | #462（D：#217 #218 #220 #223） | 🔴 最终实际出链、公开后readiness、run绑定/receipt串行；#434只剩远端核查，不再改模板域名 |
| `docs/content-pipeline.md` `article-production-guide.md`<br>`analytics-workflow.md` `src/components/widgets/` | #430 #431 #462 | 🔴 流程/审核/布局文档串行；保持#95双轨与HITL（**#752** Stage 3 Hook 评审端三轴判据与正反范例库已于 2026-10-24 交付闭票，PR #912，Round XCI；**#761** Stage 3 版式↔素材职责规范落 `docs/video-script-writing-guide.md`，2026-10-24 交付闭票 PR #919，Round XCIII） |
| `eslint.config.js` `.github/workflows/ci.yml`<br>`vitest.config.ts` `docs/conventions/test-env-baseline.md` | #466 | 🔴 父仓方案与私有技能覆盖的分界明确；#466凭据HITL不阻塞父仓方案，计时基线不靠skip/改阈值换绿 |
| `skills/shared/web-access/scripts/cached-search.mjs`<br>`vertical-search.mjs` `web-deep-research/SKILL.md`<br>`web-access/SKILL.md` `references/site-patterns/` | #390 #457 #467 #468 #469 | 🔴 shared仓与真实运行副本同步，父仓仅指针；#457测量、#467并发、#468诊断各有owner，同文件串行，loaded在飞经验不自动入库 |
| `docs/tools-catalog.md` `adr/0021-tool-catalog-split.md`<br>`docs/DOCS-INDEX.md` `scripts/lint-doc-hierarchy.mjs`<br>`.githooks/pre-commit` `scripts/session-launcher.sh` `scripts/check-hook-liveness.mjs`<br>`docs/agents/implementation-workflow.md` `docs/agents/issue-tracker.md` | #723 #404 #390 #457 #469 | 🟡 catalog迁移/指针协调、session/hook 门禁与 Agent 治理串行；本行 session/hook seam 已随 `#864` 闭票释放（Round LXXXV，交付记录见 archive）；✅ **#782**（改 `scripts/lint-doc-hierarchy.mjs` 与 `.githooks/pre-commit`）已于 2026-10-22 交付闭票（PR #844 squash `2b701572`），**#723** 改 `docs/agents/implementation-workflow.md` 与 `docs/agents/issue-tracker.md`；实际 catalog 迁移归#404，其他票不代搬文档 |

---

## Design Decisions

### 1. 深度调研与基准先行（Research-First 驱动）

- **决策背景**：在复杂的多模态管线演进中，若未摸清竞品分镜节奏、外部开源经验及模型真实生成画质，直接动手修改业务代码会导致频繁推倒重来。
- **裁定规范**：
  - 视觉升级线（Phase 3）：重设计先在 **Wave 3A** 完成 **#302** 调研（✅ **#300** 调研已于 2026-10-17、**#302** 五维调研已于 2026-10-18 交付闭票，E 段落实施票 #746（已于 2026-10-18 交付闭票 Round LVII）/#747），结合已交付 **#298**画质选型，凝练为 **#291** S3 Map后再改模板/视觉契约。**保持既有契约的bug fix不等于视觉重设计**：#422既有几何、#425显式opt-out等可先行，但仍须真实失败基线与相应验证；一旦改变品牌尺寸/布局政策就回#291裁决。
  - 多平台发布线（Phase 4）：必须先在 **Wave 4A** 完成 **#296**（调度架构调研）与 **#216**（微信视频号 5 项核心技术规格人工扫码实测），摸清真机限制与封号风控线后，方可解锁 Wave 4B 的自动化发布脚本。
  - 检索体系（Phase 2）：必须先在 **Wave 2A** 完成 **#281**（单引擎连通性与 DNS 摸底），再推进 Wave 2B 的搜源分流大盘改造。

### 2. Wave-Tier 双维协同与三轨 Frontier 机制

- **决策背景**：单维度的列表无法同时兼顾「时序推进次序（When to do）」与「业务价值高低（Why it matters）」；同时，单轨按「最早未完成 Wave」机械挑 `ready-for-agent` 会让 W1C 低紧迫度工程整理票长期霸占队首，导致 Phase 2/3 的真实出片画质 bug 与需要人工拍板的 Wayfinder Map 永远排不到队（Round XXXI–XL 复盘教训）。
- **裁定规范**（具体拣选步骤单一真值源见 `### Execution Semantics`）：
  - **三轨分离与跨 Wave 痛点提权**：将日常领取拆为 **Track 1A（产线快赢 bug）**、**Track 2（Active Wayfinder 连续锁轨）**、**Track 3（独立 HITL 拍板）** 与 **Track 1B（工程整理）**。保持既有契约的出片质量 bug 跨 Wave 提权进 Track 1A，工程整理退居 Track 1B 尾部。
  - **Active Wayfinder 在途锁轨（Mid-Map Lock）**：同一时间仅激活 1 张 Wayfinder Map；一旦该图首张子票完成即进入在途锁轨态，后续 session 连续认领其新解锁的下一张子票直至全图收口转 S2 Spec，避免半途切换造成上下文断裂与零线上产出。

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

## 历史轮次下沉说明

- [`archive/roadmap-tables-archive-2026-09-24.md`](archive/roadmap-tables-archive-2026-09-24.md) —— 2026-09-24 结构精简前的全量版本：Execution Waves / Execution Tiers / Triage Inbox 三表的历史叙事行、已闭票行与历轮 Round 结论（Round A–J）。
- [`archive/roadmap-inventory-history-2026-10-22.md`](archive/roadmap-inventory-history-2026-10-22.md) —— 2026-10-22 二次下沉：Round LXXX → LV 的逐轮盘点、Round LXXVII → J 的一句话档案、2026-10-15/16 的已闭票行，以及各表行内被替换掉的已闭票叙述（按所属表分节）。
- [`archive/roadmap-inventory-history-2026-09-23.md`](archive/roadmap-inventory-history-2026-09-23.md) —— 逐 session 盘点条目（2026-08 至 2026-09-23 Round E，78 行）。
- 交付细节的唯一权威源始终是 **issue 评论**（`gh issue view <N> --comments`）；archive 文件只作追溯，不作为现状依据。
