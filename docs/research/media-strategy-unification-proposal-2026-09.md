# 素材策略统一化提案：通用兜底链 + 认领供给泛化（讨论稿 v2）

> 状态：**讨论稿**，待用户评审。按 `docs/agents/proposal-review.md` §6 结构编写。
> 起草：2026-09-24，Session `20260924-asset-failclosed-f15a37`（#297 交付后讨论）。
> 性质：设计提案，**不含代码改动**；评审通过后走开票 + wayfinder 分组。
> 变更：v2（2026-09-24）——用户裁决采购环节视频优先；生成形态改为预算决定；新增 D6 视频动效矩阵（zoom-on-video 双重运动问题）。

## 0. 一句话

把「每个场景手工声明 assetNeed + 五选一 mediaStrategy」的分散决策，改为「**默认即完整**」：所有 media-eligible 场景自动获得认领供给（voiceover 派生），所有场景走同一条通用素材兜底链；两个字段降级为**可选覆盖**。

## 1. 已验证事实（因果依据）

| #   | 事实                                                                                                                                                                                                                                                                                                               | 证据                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | #297 + E2 后，分配是单模式：认领绑定 + VLM `relevanceScore` ≥ 阈值是唯一准入；无认领绑定一律 fail-closed 留空                                                                                                                                                                                                      | `lib/asset-sourcer.mjs` `assignAssetsToScenes`（JSDoc + 认领绑定块 + fail-closed 推送）；`DEFAULT_RELEVANCE_THRESHOLD = 60` 导出               |
| F2  | 兜底池搜索组从构造上无主（`claimSceneId: null`），其结果在 F1 下**永远不可分配**，但仍在搜索/下载                                                                                                                                                                                                                  | `lib/asset-sourcer.mjs:222`（`buildQueryGroups` 推入 `{ keywords, claimSceneId: null }`）                                                      |
| F3  | 缓存趋势图像进入后备池，同样无主、同样不可分配                                                                                                                                                                                                                                                                     | #297 会话核实；同 F2 路径                                                                                                                      |
| F4  | mediaStrategy 是五值 per-scene 字符串；**缺省 `"asset"` = 落空后静默复用他场景媒体**，scene-rules 自身将「未显式声明」列为检查警告                                                                                                                                                                                 | `lib/scene-rules.mjs:1616-1622`（`MEDIA_STRATEGIES`）+ 1767-1771（警告文案）                                                                   |
| F5  | 兜底链**今天不存在**：`asset-then-broll` 落空只降到生成视频，没有「视频→图→版式」的递降链                                                                                                                                                                                                                          | `lib/scene-rules.mjs` 策略清单 + `lib/b-roll-orchestrator.mjs`（`shouldSourceStock` / `scenesRequiringGeneration` 按策略分流，无数字预算护栏） |
| F6  | 动效已是自动的：认领分配中 image → `ken-burns`，video → `zoom`，hook → `ken-burns` + overlay 0.5                                                                                                                                                                                                                   | `lib/asset-sourcer.mjs` 分配块 + `__tests__/asset-sourcer.test.mjs` 动效断言                                                                   |
| F7  | `assetNeed` 是写稿阶段手工声明（Stage 3 写 scene-data.mjs 时），非自动推断；存量内容（如 qwen4-preview）整文件无此字段                                                                                                                                                                                             | `docs/content-pipeline.md` Step 8；归档 `archive/spec-asset-relevance-refactor.md` D1；实测 scene-data                                         |
| F8  | 排除采购的场景类型是设计内固定项：`NO_MEDIA_TYPES`（cta、data、stat-reveal）+ `media: null` + CSS-only 布局（无 assetNeed 时）                                                                                                                                                                                     | `lib/claim-keywords.mjs:36-44`（`skipsMediaSourcing`）                                                                                         |
| F9  | 现有相关票：#295 = niche claim→可搜索概念映射（searchHints），**不是**「给所有场景生成 assetNeed」；#301 = stock-video-first 路线改造（含「视频 vs 图片优先级」「对 video 放宽过滤阈值」等开放决策）；#293 = Stage 0 预取；#294 = VLM borderline 二度校验；#298 = T2V 画质评测升级；#310 = 统一素材库 + 收获率 log | GitHub 票面（2026-09-24 读取）                                                                                                                 |

## 2. 用户意图（本 session 决策记录）

1. 「每个 scene 其实都希望有视频或图片」→ 应有一套**统一的 fallback 路径**。
2. 「比如优先放图片，再加一些动效」→ 静图 + 动效（ken-burns）可能优于生成视频，位次待裁决。
3. 「如果所有 thing 都需要 assetNeed 和 media strategy，那其实这两个都不需要了」→ 字段应降级为**默认派生 + 可选覆盖**。
4. 授权起草本提案；倾向「几个 issue 组成一组，后面再 wayfinder」。
5. **v2 裁决：采购环节视频优先**——「视频优先」指实拍素材视频优先（与 #301 MPT 结论同向）；生成环节**不固定位次，由速度/预算决定形态**（T2I 快路径为默认，T2V 按预算与场景语义）。
6. **v2 质疑：视频默认配 zoom 可疑**——视频自带镜头运动，容器级 zoom 是双重运动且入场丢画面（见 D6）。

## 3. 设计裁决点（评审时逐条拍板）

### D1 — 通用兜底链的阶梯序

讨论稿候选链（每 media-eligible 场景，从上到下首个可用者胜出）：

```
1. 认领采购（VLM 门控）—— 实拍视频优先，实拍图片次之（图片自带 ken-burns 动效）
2. 素材库复用（#310 统一素材库 + 收获率 log）
3. 生成 —— 形态由速度/预算决定（不固定位次）：
   默认快路径 T2I + ken-burns（6 维 prompt）；预算与场景语义允许时 T2V（8 维 prompt）
4. 纯版式（CSS 卡片——合法结果，不是失败）
```

- **D1a（已裁决，v2）**：采购环节内视频优先——用户 2026-09-24 拍板，与 #301 的 MPT 证据同向。开放子项：per-visualType 微调（data/stat-reveal 类版图场景是否也视频优先；hook 已有专属 gates）。
- **D1b（v2 重构）**：生成级不再是「T2V 先于 T2I」的固定位次，而是**预算驱动的形态选择**——D5 的预算机制同时充当形态选择器。T2V 保留给抽象/动态概念且预算允许的场景。
- **D6（新增，见下）**：动效呈现规则从「per-类型默认」改为「per-素材内容」。

### D6 — 视频动效矩阵（v2 新增，用户质疑触发）

已验证事实（代码）：

- 分配端动画矩阵 `lib/asset-sourcer.mjs:921`：`hook → ken-burns；非 hook 视频 → zoom；非 hook 图片 → ken-burns`。
- 渲染端 `remotion/src/components/MediaBackground.tsx` zoom 预设 = **容器级缩放**：入场 1.3 → 1.0，出场 1.0 → 1.15。

对视频的三重问题：

1. **双重运动**——素材自带镜头运动之上再叠 30% 整体缩放；
2. **入场丢画面**——fit=cover 已裁一次，入场 1.3 倍时只看到裁后画面的 ~77%；
3. **cropFocus 失配**——VLM 焦点分析按静止裁切优化，zoom 让裁切窗逐帧漂移，分析失效。hook 视频的 ken-burns（全程 1.0→1.12 缓推 + 平移）同理，幅度较小。

候选方向：动画按**素材内容**选择——运动感强的 footage → `none`；静止感 footage（固定机位/慢镜头）→ 轻推；`zoom` 戏剧入场留给少数声明场景。判断「素材是否自带运动」可用 VLM 分析已有信号（描述/subjects）或 ffmpeg 运动向量，裁决时定。

### D2 — assetNeed 从「手工声明」降级为「派生默认 + 可选覆盖」

- 派生机制：voiceover → LLM 生成 assetNeed（一句话英文视觉描述）+ searchHints（#295 的映射机制倒置为默认环节），HITL 可改写。
- 触发时机两选一（裁决）：写稿时（scene-data 生成期，人可审）vs 采购时（sourcer 遇到无 assetNeed 场景即时派生，零写稿负担）。
- 存量内容：backfill 脚本一次性补 vs 按需派生（裁决）。

### D3 — mediaStrategy 从「五选一」降级为「默认链 + 可选覆盖」

- 默认 = D1 的链，场景不再需要声明。
- 保留显式覆盖的合法用例：`b-roll`（该场景必须生成）、`ai-image`（必须静图）等作为**覆盖值**而非策略本身。
- scene-rules 的警告从「未声明 mediaStrategy」改为「覆盖值与场景语义冲突」类检查。

### D4 — 无主供给退役或认领化

- F2/F3 的死供给二选一：随 D2 落地，兜底池搜索结果**获得认领**（按概念就近绑定场景并走 VLM）或**停止无主搜索**（省网络/算力）。
- 缓存趋势图同理：要么进认领路径重新过 VLM，要么退出供应。

### D5 — 生成预算护栏（通用链的前置条件，v2 升级为形态选择器）

- 通用链下生成从「显式声明」变「失败隐含」→ 必须配**每内容生成上限** + HITL 确认点，防止采购失败静默烧 GPU（AGENTS.md 硬件路由阶梯仍是前置）。
- `shouldSourceStock` 现只做策略门控，无数字预算——需要新增。
- **v2**：预算机制同时充当**生成形态选择器**——预算余量充足且场景语义适合动态 → T2V；否则 T2I + ken-burns 快路径。形态选择从「写稿人声明」变为「预算 + 场景语义自动裁决」，写稿侧只剩覆盖权。

## 4. 推荐方案：issue 组（wayfinder 后置）

| 票                        | 内容                                                                                               | 关系                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A（新）认领供给泛化**   | voiceover → assetNeed + searchHints 派生；字段降级为覆盖；存量内容策略                             | 吸收 **#295**；关联 #293（Stage 0 预取接供给）                                                                                                                        |
| **B（新）统一素材兜底链** | 通用递降链替代五值策略；采购视频优先（D1a 已裁决）+ 生成形态预算选择（D1b/D5）+ 视频动效矩阵（D6） | 衔接 **#301**（pixabay-video 源、对 video 放宽阈值、全屏 vs overlay 作为呈现规则输入）、**#310**（复用阶梯级）、#299（hook 专属策略）、#294（VLM 二度校验强化采购级） |
| **C（新）无主供给退役**   | 兜底池/缓存趋势图认领化或退役                                                                      | #297 直接后续；依赖 A 的派生机制                                                                                                                                      |

被否决/搁置的替代方案：

- **分配端给无主素材补跑 VLM（N×M 匹配）**：相关性是 `<图, 场景>` 关系属性，无主素材无问题可问；组合爆炸且是在分配端重造匹配机制（#297 会话已论证）。
- **维持五值策略现状**：F4 的静默复用坏默认 + F5 无递降链，用户裁决方向明确反对。
- **立即删兜底池**：在 A/C 落地前删除断供存量内容的搜索报告能力，过渡风险未评估——留 C 处理。

## 5. 修改影响面（仅当提案通过并开票后逐步落地）

- 代码：`lib/asset-sourcer.mjs`（搜索/分配/兜底池）、`lib/claim-keywords.mjs`（claims 构造 + skipsMediaSourcing）、`lib/scene-rules.mjs`（策略校验）、`lib/b-roll-orchestrator.mjs`（预算护栏 + 工作单）、scene-data schema、写稿 prompt/模板、`lib/apply-media-patch.mjs` 消费方。
- 文档：`docs/content-pipeline.md` Step 8、`docs/video-script-writing-guide.md`（assetNeed 约定）、`docs/video-production-runbook.md`（B-roll 节）、`docs/media-asset-management.md`。
- 测试：asset-sourcer 三套件（本 session 迁移后的认领绑定夹具是基线）、scene-rules、b-roll-orchestrator、存量内容回归（qwen4-preview）。
- 最坏后果：存量无 assetNeed 内容在 A 未落地前**采购路径为零**（现状即如此，仅靠生成策略兜底）——C 的过渡设计需覆盖。

## 6. 验证计划

1. 分配端：红绿 TDD（认领绑定夹具已是现成基线）。
2. 派生质量：抽样 N 个场景 voiceover → 派生 assetNeed，HITL 评审命中率（D2 假设检验）。
3. 链行为：真实数据 smoke（qwen4-preview scene-data）三形状扩展为全链形状（采购命中/复用命中/T2V/T2I/版式）。
4. 预算护栏：注入式测试（超限 → 拒绝生成 → 版式兜底）。
5. 观感裁决：#298 评测框架复用做「实拍视频 vs 图片+ken-burns vs 生成视频」对比样张。

## 7. 假设（未验证）与未解决风险

**假设**：voiceover 信息量足以派生高质量 assetNeed（未验证，见验证计划 2）；ken-burns 静图与生成视频的观感权衡（未验证，D1a 裁决依赖）。

**风险**：

1. 通用链让每内容生成时长不可预估 → D5 护栏是**前置条件**，不可砍。
2. LLM 派生 assetNeed 幻觉 → HITL 把关 + searchHints 只放宽不过窄。
3. ~~D1a 方向冲突~~ → v2 已裁决（采购视频优先）；遗留的 per-visualType 微调与 D6 动效矩阵仍需 #298 评测框架出数据。
4. 存量内容过渡期断供 → C 的迁移设计。
5. 五字段退役是 schema 破坏性变更 → 覆盖语义须向后兼容旧 scene-data。
6. D6 若将视频默认改为 `none`，静态感 footage 可能显得呆板 → 「素材运动感」判定信号（VLM/ffmpeg 运动向量）的可靠性需验证。
