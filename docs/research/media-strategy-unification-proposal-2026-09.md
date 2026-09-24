# 素材策略统一化提案：通用兜底链 + 认领供给泛化（讨论稿 v1）

> 状态：**讨论稿**，待用户评审。按 `docs/agents/proposal-review.md` §6 结构编写。
> 起草：2026-09-24，Session `20260924-asset-failclosed-f15a37`（#297 交付后讨论）。
> 性质：设计提案，**不含代码改动**；评审通过后走开票 + wayfinder 分组。

## 0. 一句话

把「每个场景手工声明 assetNeed + 五选一 mediaStrategy」的分散决策，改为「**默认即完整**」：所有 media-eligible 场景自动获得认领供给（voiceover 派生），所有场景走同一条通用素材兜底链；两个字段降级为**可选覆盖**。

## 1. 已验证事实（因果依据）

| # | 事实 | 证据 |
|---|------|------|
| F1 | #297 + E2 后，分配是单模式：认领绑定 + VLM `relevanceScore` ≥ 阈值是唯一准入；无认领绑定一律 fail-closed 留空 | `lib/asset-sourcer.mjs` `assignAssetsToScenes`（JSDoc + 认领绑定块 + fail-closed 推送）；`DEFAULT_RELEVANCE_THRESHOLD = 60` 导出 |
| F2 | 兜底池搜索组从构造上无主（`claimSceneId: null`），其结果在 F1 下**永远不可分配**，但仍在搜索/下载 | `lib/asset-sourcer.mjs:222`（`buildQueryGroups` 推入 `{ keywords, claimSceneId: null }`） |
| F3 | 缓存趋势图像进入后备池，同样无主、同样不可分配 | #297 会话核实；同 F2 路径 |
| F4 | mediaStrategy 是五值 per-scene 字符串；**缺省 `"asset"` = 落空后静默复用他场景媒体**，scene-rules 自身将「未显式声明」列为检查警告 | `lib/scene-rules.mjs:1616-1622`（`MEDIA_STRATEGIES`）+ 1767-1771（警告文案） |
| F5 | 兜底链**今天不存在**：`asset-then-broll` 落空只降到生成视频，没有「视频→图→版式」的递降链 | `lib/scene-rules.mjs` 策略清单 + `lib/b-roll-orchestrator.mjs`（`shouldSourceStock` / `scenesRequiringGeneration` 按策略分流，无数字预算护栏） |
| F6 | 动效已是自动的：认领分配中 image → `ken-burns`，video → `zoom`，hook → `ken-burns` + overlay 0.5 | `lib/asset-sourcer.mjs` 分配块 + `__tests__/asset-sourcer.test.mjs` 动效断言 |
| F7 | `assetNeed` 是写稿阶段手工声明（Stage 3 写 scene-data.mjs 时），非自动推断；存量内容（如 qwen4-preview）整文件无此字段 | `docs/content-pipeline.md` Step 8；归档 `archive/spec-asset-relevance-refactor.md` D1；实测 scene-data |
| F8 | 排除采购的场景类型是设计内固定项：`NO_MEDIA_TYPES`（cta、data、stat-reveal）+ `media: null` + CSS-only 布局（无 assetNeed 时） | `lib/claim-keywords.mjs:36-44`（`skipsMediaSourcing`） |
| F9 | 现有相关票：#295 = niche claim→可搜索概念映射（searchHints），**不是**「给所有场景生成 assetNeed」；#301 = stock-video-first 路线改造（含「视频 vs 图片优先级」「对 video 放宽过滤阈值」等开放决策）；#293 = Stage 0 预取；#294 = VLM borderline 二度校验；#298 = T2V 画质评测升级；#310 = 统一素材库 + 收获率 log | GitHub 票面（2026-09-24 读取） |

## 2. 用户意图（本 session 决策记录）

1. 「每个 scene 其实都希望有视频或图片」→ 应有一套**统一的 fallback 路径**。
2. 「比如优先放图片，再加一些动效」→ 静图 + 动效（ken-burns）可能优于生成视频，位次待裁决。
3. 「如果所有 thing 都需要 assetNeed 和 media strategy，那其实这两个都不需要了」→ 字段应降级为**默认派生 + 可选覆盖**。
4. 授权起草本提案；倾向「几个 issue 组成一组，后面再 wayfinder」。

## 3. 设计裁决点（评审时逐条拍板）

### D1 — 通用兜底链的阶梯序

讨论稿候选链（每 media-eligible 场景，从上到下首个可用者胜出）：

```
1. 认领采购（VLM 门控；实拍优先——形态权重见 D1a）
2. 素材库复用（#310 统一素材库 + 收获率 log）
3. 生成——按内容适配分流：
   a. 抽象/动态概念 → T2V（Wan1.3B，8 维 prompt）
   b. 数据/架构/图表 → T2I + ken-burns（6 维 prompt）
4. 纯版式（CSS 卡片——合法结果，不是失败）
```

- **D1a（开放）**：采购环节内「视频 vs 图片」的优先序。张力：#301 的 MPT 对比结论倾向实拍视频拼接路线（全片视频感）；用户直觉「图片 + ken-burns 动效」观感稳、成本低。可能结论不是全局序而是 **per-visualType 序**（hook 要动感、narrative 可视频、data 要版图）。裁决输入 = #301 的 MPT 证据 + #298 画质评测框架可复用做 A/B。
- **D1b（开放）**：动效是否算独立阶梯级。F6 表明动效已是素材的自动属性（图必 ken-burns、视频必 zoom），「图片+动效」不是一个独立供应源，而是采购/生成结果的呈现形态——倾向不单列，写进链的呈现规则。

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

### D5 — 生成预算护栏（通用链的前置条件）

- 通用链下生成从「显式声明」变「失败隐含」→ 必须配**每内容生成上限** + HITL 确认点，防止采购失败静默烧 GPU（AGENTS.md 硬件路由阶梯仍是前置）。
- `shouldSourceStock` 现只做策略门控，无数字预算——需要新增。

## 4. 推荐方案：issue 组（wayfinder 后置）

| 票 | 内容 | 关系 |
|----|------|------|
| **A（新）认领供给泛化** | voiceover → assetNeed + searchHints 派生；字段降级为覆盖；存量内容策略 | 吸收 **#295**；关联 #293（Stage 0 预取接供给） |
| **B（新）统一素材兜底链** | 通用递降链替代五值策略；D1/D1a 裁决；预算护栏（D5） | 衔接 **#301**（视频优先/阈值/全屏 vs overlay 作为 D1a 输入）、**#310**（复用阶梯级）、#299（hook 专属策略）、#294（VLM 二度校验强化采购级） |
| **C（新）无主供给退役** | 兜底池/缓存趋势图认领化或退役 | #297 直接后续；依赖 A 的派生机制 |

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
3. D1a 方向冲突（#301 视频拼接路线 vs 图片优先直觉）→ 需评测数据裁决，避免拍脑袋。
4. 存量内容过渡期断供 → C 的迁移设计。
5. 五字段退役是 schema 破坏性变更 → 覆盖语义须向后兼容旧 scene-data。
