# Spec: #289 scene→prompt→video 适配层（声明 prompt 写作协议 + 质量闸）

> 2026-10-18 · R3（`scripts/short-video/` 核心管线）· 主导 #291 · 前置 #298 已闭（FastMetal-5B-QAD 为默认档）· #166 layer 2 注入层已落地

## 1. 问题

用户判断（#289 正文）：scene-data 是为文章叙事设计的（hook/narrative/data/contrast/quote/cta + 文案与结构化字段），短视频每个 scene 需要的是一段**具体画面**。中间缺一个「scene → video prompt」的适配/综合层，导致画面与 scene 意图脱节。

已核实的具体缺口（#289 评论 2026-09-25 量化证据）：

- `content/anthropic-distillation-7labs/` pt1–pt4 共 40 个 scene，`aiVideo.prompt` 只有 **10 条 distinct** 字符串（4× 复用）；同文件内 `pt1/scene-data.mjs:108` 与 `:124` 逐字相同。
- 典型薄写法（subject-only）：`futuristic AI data center with glowing server racks, cinematic vertical`，在 pt1:14 / pt2:16 / pt3:15 逐字复用。
- 债务潜伏未触发：该系列 40/40 全命中资产（无 `b-roll-report.json`），故无机器信号暴露薄写与复用。

**为什么现在没有约束**：declared prompt 由 Stage-3 agent 写，但无写作契约（`docs/video-script-writing-guide.md` 只规定 `narrativeRole`/`assetNeed`/`mediaStrategy`，L283-292，**无** declared prompt 协议）；唯一机器检查 `checkBrollPromptDimensions`（[scene-rules.mjs](file:///Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/lib/scene-rules.mjs#L1843-L1867)）warn-only 只扫阿拉伯数字，注释明确声明其余 7 维交给 agent。

## 2. 目标

补齐「scene → video prompt」适配层，让 declared prompt **可写、可查**：

1. **可写**：Stage-3 写作协议（文档）——按 `visualType` 给出 declared prompt 的维度模板与反模式清单，复用 `VISUAL_TYPE_DIMENSION_DEFAULTS` 作单一事实来源。
2. **可查**：声明 prompt 质量闸（代码）——把 warn-only 检查扩为三判据，在不改变 exit code 的前提下把「薄写 / 跨 scene 逐字复用」变成机器信号。

## 3. 已决定边界（不可违反）

- **注入层归属不变**（#166 layer 2，[prompt-injection.mjs](file:///Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/lib/b-roll/prompt-injection.mjs)）：NEGATIVE 全代码拥有（按缺失组去重注入）；BRAND 条件注入；CAMERA/MOTION/LIGHTING 只导出建议、**从不注入**。
- 因此 **declared prompt 不得手写 negative/brand**；长度不是约束（compose 后实测 45–182 / 480 token）。
- 质量闸保持 **warn-only**，preflight exit 0 不变（S21「never fails」，[scene-rules.test.mjs](file:///Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/__tests__/scene-rules.test.mjs#L1430-L1462)）。

## 4. 方案决策

### D1 写作协议放 L1 执行文档，不新建文档

declared prompt 写作是 Stage-3 的**执行指令**（做什么、按什么模板写），按 DOCS-INDEX Layer 放置规则落 `docs/video-script-writing-guide.md`（已是 `content-pipeline.md` Stage 3 的引用目标），新增一节「Declared b-roll prompt 写作协议」。**不**新建 L1 文档，**不**在文档里重复 `VISUAL_TYPE_DIMENSION_DEFAULTS` 常量——以指针指向代码单一事实来源。

### D2 质量闸三判据，并入现有 check，不新增 check 名

`checkBrollPromptDimensions(scenes)` 扩为三判据（均为 warn）：

- **(a) 数字扫描**（保留现状）：阿拉伯数字 → 移入 texts。
- **(b) 薄写**：prompt 既**无镜头景别（CAMERA）也无镜头运动（MOTION）信号** → 判为 subject-only 薄写。信号词表以常量集合实现，并把「启发式、非语义」写进注释与 detail。
- **(c) 跨 scene 逐字重复**：归一化（trim + lower + 折叠空白）后两条以上 scene 的 prompt 相同 → 对涉及的每个场景各报一条，detail 列出重复出现次数。

保持单一 check 名（`B-roll prompt dimensions`）与 warn 级别，使 preflight exit 0、下游无需改判据消费。

**判据与范围决策（实施期实测回填，2026-10-18）**：

- **薄写用两维（CAMERA/MOTION），不用三维**。原设想含 LIGHTING，实测否决：被 #289 点名的薄写样例 `...glowing server racks, cinematic vertical` 带光照词却无镜头方向；在真实 `anthropic-distillation-7labs` 数据上，加 LIGHTING 会让 7 条薄写中的 4 条逃逸（实测）。故 LIGHTING **不入**薄写判据。
- **判据为启发式关键词探针，非语义阅读**：命名词表命中即算「有信号」，不判断贴切与否；detail 明标 `heuristic`。
- VISUAL METAPHOR 无法用关键词可靠识别，**不**纳入机器判据，改由 D1 协议教学。
- 判据覆盖**所有声明生成 prompt 的场景**——既含 `b-roll` 的 `aiVideo.prompt`，也含 `ai-image` 的 `aiImage.prompt`（`generatingPrompt` 按策略分派）。

### D3 信号表作可导出常量

`BROLL_SHOT_SIGNALS`（CAMERA/MOTION 两组正则，语义 = 声明了「镜头怎么拍」）导出，供测试直接消费（断言薄写样例不命中任一组）与文档指针复用，避免测试重抄正则。

### D4 per-model prompt 模板为可拆分增量（Part 3）

按目标 T2V 模型 family 给格式/语言偏好的模板层：新增一个 per-model prompt 模板模块（由跟进票创建，本票不建）+ `docs/research/` 笔记。**本票主要 1+2 可独立交付**；D4 若 session 收尾时机不足则转为独立跟进票（外部事实调研，触发 AGENTS.md §7 proposal-review）。不阻塞 1+2 的验收。

## 5. Modified Files Impact（R3 必填）

| 文件 | 改动 | 风险/回滚 |
|---|---|---|
| `scripts/short-video/lib/scene-rules.mjs` | 扩 `checkBrollPromptDimensions`（三判据）+ 导出 `BROLL_SHOT_SIGNALS` | 纯新增分支，保持 warn-only；回滚=删新增分支 |
| `scripts/short-video/__tests__/scene-rules.test.mjs` | 新增薄写（含被点名样例、光照-only）/重复/数字保留/clean 用例 | 测试文件，无生产影响 |
| `docs/video-script-writing-guide.md` | 新增 declared prompt 写作协议一节 | L1 文档；需 `npm run lint:docs` + § 编号核对 |
| `docs/DOCS-INDEX.md` | 登记本 spec 行（`specs/` 表） | 文档索引；规则 5 要求同步 |
| per-model prompt 模板模块（新，Part 3，跟进票创建） | per-model 模板 | 增量，未接入则无行为变化 |
| `docs/research/`（新，Part 3） | per-model prompt 最佳实践 | L2 |

**不改**：`prompt-injection.mjs`（注入层归属不变）、scene-data 数据、orchestrator/runner 生成路径、verify 判据消费。

## 6. Behavioral Scenarios

| # | 场景 | 预期 |
|---|---|---|
| S1 | 薄写 subject-only prompt（如 `data visualization dashboard, digital analytics, tech interface`） | warn，detail 标 `heuristic` 并指向缺镜头方向 |
| S2 | 富写 prompt（含 camera + motion，如 `slow dolly push-in, medium shot, ...`） | 无 warn |
| S3 | 含阿拉伯数字的 prompt | 保留现状 warn（数字维度） |
| S4 | 两 scene prompt 归一化后逐字相同 | 对每个涉及 scene 各一条 warn，detail 含出现次数 |
| S5 | 所有 prompt 各异且非薄写 | `checkBrollPromptDimensions` 返回空数组 |
| S6 | 非生成 scene（无 generating strategy 或空 prompt） | 静默（不产生结果） |
| S7 | 任何以上场景 | 结果 `level` 恒为 `warn`，绝无 `fail`（preflight exit 0 保持） |
| S8 | 已有 content dir 真实数据 | 40 条 anthropic-distillation-7labs 复现 ≥1 条重复 warn + ≥1 条薄写 warn |
| S9 | Part 1 文档 | 协议含 per-visualType 模板 + 三条反模式，且以指针指向 `VISUAL_TYPE_DIMENSION_DEFAULTS`，无常量重复 |
| S10 | 被点名样例 `...glowing server racks, cinematic vertical`（有光照词、无镜头方向） | 仍判薄写 warn（锁死 LIGHTING 不进判据的决策） |
| S11 | 声明生成 prompt 的 `ai-image` 场景 | 同受判据（`aiImage.prompt` 亦被扫） |

## 7. 非目标

- 改注入层归属（negative/brand 仍由代码注入）
- 在 scene-data 手写 negative/brand
- 替换 orchestrator / 生成路径 / 判据消费方
- 让质量闸 fail（保持 warn）
- per-model 模板接入生成路径（Part 3 仅模板层，接线另票）

## 8. 验收

- [ ] affected `scene-rules.test.mjs` + `npm test` 全绿；覆盖 S1–S8、S10–S11
- [ ] 真实数据 smoke：`anthropic-distillation-7labs`（pt1–pt4，40 条）命中重复 warn + 薄写 warn
- [ ] `npm run lint:docs` 通过；新增 § 编号存在性核对；`git diff --check`
- [ ] `checkBrollPromptDimensions` 输出恒为 warn（S7 断言保留）
- [ ] Part 1 协议节落地并被 `content-pipeline.md` Stage 3 链路可达（经 `video-script-writing-guide.md` 既有引用）
- [ ] 本 spec 已登记进 `docs/DOCS-INDEX.md` 的 `specs/` 表；tickets 落 `.scratch/scene-prompt-adapter-289/issues/`（索引规则 2、287、5）
