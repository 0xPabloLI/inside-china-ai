# Spec — B-roll Prompt Dimension Check (八维校验第一层)

> Status: ready-for-agent · Created 2026-09-01 · Parent: B-roll capability (spec `docs/archive/spec-broll-generation-capability.md`)
> Follow-up issue: **#166**（承载本 spec 之外的第二层工作，见 Out of Scope）

## Problem Statement

八维 prompt 模板（SUBJECT / VISUAL METAPHOR / BRAND / REFERENCE / CAMERA / MOTION / LIGHTING / NEGATIVE）目前完全由 agent 手工写入 `aiVideo.prompt` 字符串，代码只校验「非空」，不校验内容。手工写入导致维度遗漏，而遗漏的代价很高：一个 prompt 走到 Round 2 才补齐维度，等于 2 候选 × 2 轮 × ~235 s ≈ 15 分钟的 GPU 时间。

真实证据（`content/qwen4-preview/scene-data.mjs`，当前全项目仅有的 3 条 b-roll prompt）：

| Scene | NEGATIVE 实际写法 | 缺失 |
|-------|------------------|------|
| 5 | `no text, no letters, no hands` | watermark 防护 |
| 6 | `no hands` | 文字防护 + watermark 防护 |
| 8 | `no text, no watermark, no hands` | 无 |

三条 prompt 的 NEGATIVE 互不一致，其中两条不完整。NEGATIVE 在本模板中是**固定默认值**（每个场景都该一样），是最不该出现人工差异的一维。

## Solution

在 preflight 场景规则中新增一条 **warn 级**检查，只针对声明了生成策略的 scene，校验 prompt 的两类可机器判定的问题：

1. **NEGATIVE 语义组覆盖** — prompt 必须覆盖三个语义组各至少一词：TEXT / HANDS / ARTIFACT。缺哪组就报哪组。
2. **阿拉伯数字** — prompt 中出现任何阿拉伯数字即 warn，提示「数据值应进 `texts` 层，元素数量可忽略」。

设计原则：**只做词表可靠、模式固定的维度**。NEGATIVE 词表小而固定，阿拉伯数字是正则可判定的。CAMERA / MOTION / LIGHTING 表达多样性过高，机器判定漏报与误报双高，不做（见 Out of Scope）。

warn 而非 fail：维度不完整不阻断渲染，但必须出现在 HITL 审阅面板上——`verify-video.mjs` 的 warn 只进汇总不进 exit code，新增 warn 不会让现有内容突然跑不起来。

## User Stories

1. As an agent writing scene-data, I want preflight to tell me which NEGATIVE group my prompt is missing, so that I fix it before spending GPU time on a generation round.
2. As an agent, I want the warning to name the exact missing group (not just "incomplete prompt"), so that I know what to add without re-reading the template doc.
3. As an agent, I want the fix hint to suggest concrete words for the missing group, so that I can copy-paste instead of recalling the canonical vocabulary.
4. As an agent, I want to be warned when my prompt contains Arabic numerals, so that I remember data values belong in `texts` and not in a T2V prompt that will garble them.
5. As an agent, I want the numeral warning to acknowledge that element counts are legitimate, so that a prompt like "3 glowing layers" is a hint to consider, not a false alarm I learn to ignore.
6. As an agent working on a scene with no b-roll fields, I want zero new output, so that my preflight log does not grow noise for content that never generates video.
7. As an agent, I want a prompt that is already empty to be reported once (by the existing contract check) and not twice, so that I am not nagged by overlapping rules.
8. As a human reviewing the HITL panel, I want dimension gaps surfaced as warnings rather than hard failures, so that an otherwise-ready video is not blocked by a stylistic gap.
9. As a human, I want the check to run inside the existing preflight pass, so that I do not have to remember a new CLI flag or command.
10. As a maintainer, I want the check implemented as a pure function over the scene list, so that it is testable without spawning FastVideo or touching the filesystem.
11. As a maintainer, I want the check registered in the shared scene-rules entry point, so that every existing consumer of that entry point picks it up with no per-caller wiring.
12. As an agent iterating on a failing prompt, I want the warning to name the scene id, so that I can target `generate-broll.mjs --scene <id>` directly.
13. As an agent, I want the check to be case-insensitive, so that "No Hands" and "no hands" are treated identically.
14. As an agent, I want the check to use word boundaries, so that a prompt saying "no texture" is not falsely credited with text protection.
15. As a maintainer, I want the NEGATIVE vocabulary to live in one exported constant, so that a future decision to add a fourth group (e.g. FACE) is a one-line change.
16. As an agent, I want one warning per scene rather than one per problem, so that a prompt missing two groups plus containing digits produces one line, not three.
17. As a human, I want the check to apply to `asset-then-broll` scenes too, so that a fallback prompt is held to the same standard even when sourcing wins and no video is generated.
18. As a maintainer, I want the new check to be the last entry in the check registry, so that existing checks keep their current ordering and output.

## Implementation Decisions

- **新增一个纯函数**，与既有的 `checkMediaStrategyContract` 同构：接收 scene 数组，返回 `{level, category, check, detail, fix}[]`。category 沿用 `"Media"`，check 名定为 `B-roll prompt dimensions`。
- **作用范围 = 生成策略且 prompt 非空**。仅当 scene 的 `mediaStrategy` 属于生成类策略（`b-roll` / `asset-then-broll`）**且** `aiVideo.prompt` 是去空白后非空的字符串时才检查。其余场景一律静默返回 `[]`——包括完全没有 b-roll 字段的 scene（与既有 contract check 的 engaged 原则一致：不用某字段的内容，不被某字段的规则审判）。
- **空 prompt 不重复报错**。空或纯空白的 prompt 已由既有的 contract check 判为 fail，新检查直接跳过，避免同一问题两条输出。
- **NEGATIVE 分三个语义组**，每组命中任一同义词即算覆盖：

  | 组 | 代表词 | 同义词表 |
  |----|--------|---------|
  | TEXT | `no text` | `no letters`, `no words`, `no captions`, `no labels`, `no writing`, `no typography`, `no lettering`, `no signage` |
  | HANDS | `no hands` | `no hand`, `no fingers`, `no people`, `no person` |
  | ARTIFACT | `no watermark` | `no logo`, `no signature`, `no overlay` |

  `no watermark text` 不单独列入——`\bno watermark\b` 已经覆盖它，重复词条只会让词表看起来比实际更长。

  **不含 FACE 组**。当前三条真实 prompt 全部未声明 `no face`，若纳入则条条报警，warn 一旦成为常态即被忽略。FACE 留待真出现人脸问题时再加。
- **匹配方式**：对 prompt 做小写归一，再按 `\b` 词边界匹配每个同义词。词边界是必需的——子串匹配会让 `no texture` 被误判为已覆盖 TEXT 组。
- **数字检测**：对 prompt 做 `/\d/` 检测，命中即记为一个问题。不做「数据型 vs 数量型」的语义区分——边界模糊且规则脆弱；改为在 fix 文案里同时说明两种可能，把最终判断留给人。
- **每 scene 一条输出**，detail 合并列出该 scene 的全部问题（缺失的组名 + 是否含数字）。不按问题拆成多条，避免刷屏。
- **级别恒为 warn**。维度不完整不阻断渲染；`verify-video.mjs` 的 exit code 只看 fail 数，新增 warn 不改变任何现有内容的通过状态。
- **注册到共享入口**：追加为 check 注册表数组的最后一项，使所有现有调用方自动获得该检查，无需逐调用方接线。
- **词表导出为常量**，便于后续增减语义组。

## Testing Decisions

- **单一 seam**：被测对象是纯函数本身（输入 scene 数组，输出结果数组）。不 mock FastVideo、不碰文件系统、不起 Python 进程。这是同类检查既有的测试方式，沿用即可。
- **测试外在行为，不测实现细节**：断言 level / check 名 / detail 是否点名缺失的组 / fix 文案，不断言内部词表结构或匹配函数被调用了几次。
- **沿用既有 prior art**：同文件的 `checkMediaStrategyContract` 测试用三类数据——内联工厂构造的最小 scene、不含 b-roll 字段的 mock scene 列表、以及从真实 content 目录导入的 fixture。新测试沿用同一套三类数据。
- **真实 fixture 断言是本次最有价值的一条**：对 `qwen4-preview` 的真实 scene 列表跑检查，断言 scene 5 报缺 ARTIFACT、scene 6 报缺 TEXT + ARTIFACT、scene 8 不报。这条把「当前手工 NEGATIVE 互不一致」这个事实固化成回归保护——将来谁补全了 prompt，这条测试会红，提醒同步更新预期。
- **反向用例必须覆盖**：`no texture` 不得被计为 TEXT 覆盖；大写 `No Hands` 必须被识别；无 b-roll 字段的 scene 必须静默。

## Out of Scope

以下内容**不在本 spec 范围**，统一由 follow-up issue **#166** 承载：

- **八维的常量注入**（第二层）：NEGATIVE 与 BRAND 底色由代码自动拼进 prompt。需先解决三个约束——`promptHash` 缓存会因 prompt 字符串变化而集体失效导致已赢 clip 全部重跑、512 token 静默截断可能把追加的常量整段吞掉、VLM gate 目前直接拿 prompt 当正向 claim 会被负向描述污染（需拆成「生成用注入后 prompt、gate 用原始 prompt」）。
- **SUBJECT 自动提取**：从 voiceover 提取画面主体。voiceover 里的数字恰恰不能进 prompt，而「排除数字」是语义级判断，正则提取错了比不提取更糟，且 VLM gate 只判相关度不判事实、拦不住。
- **VISUAL METAPHOR**：纯创作，模板化等于消灭创作，不做。
- **CAMERA / MOTION / LIGHTING 的机器检测**：表达多样性过高，词表覆盖不全，漏报误报双高，会训练人忽略 warn。
- **REFERENCE 自动化**：当前 T2V 后端吃不了参考图，REFERENCE 只能以文字描述存在；真要自动把资产转成描述需调 VLM。等出现真实需求再做。
- **BRAND 实体色映射**（DeepSeek 蓝 / Huawei 红）：依赖 scene 主语，需按实体查表，属第二层。

## Further Notes

- **触发本 spec 的判断依据**：全项目当前只有 3 条 b-roll prompt，样本量小。正因如此，第二层（常量注入）的投入产出比不足——为 3 条 prompt 改 `lib/b-roll/` 基础设施并背缓存失效与 claim 分离的复杂度不划算。第一层的价值恰恰在于**用零风险方式量化维度遗漏有多普遍**：若后续 b-roll 用量上到 10+ scene，届时 warn 的出现率就是第二层的决策数据。
- **数字检查当前零命中**：现有三条 prompt 均不含阿拉伯数字（用的是 `One tall bar` / `Two parallel lanes` 这类英文数词）。该检查是预防性的，其「不误报」可由真实 fixture 验证，「命中」只能靠构造用例验证。
- **预期副作用**：`verify-video.mjs --pre` 在 `qwen4-preview` 上会新增 2 条 warn（scene 5、scene 6）。这是本 spec 想要的结果，不是回归。

---

## Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/short-video/lib/scene-rules.mjs` | 新增一个纯函数校验 + 追加为 check 注册表数组最后一项 | Low | 纯追加，不改动任何既有检查的逻辑；注册表追加一项会改变 `runAllSceneDataChecks` 的返回内容，但下游 `verify-video.mjs` 按 level 处理任意 check 名，不感知新增。最坏后果：preflight 多出 warn 行，不阻断（exit code 只看 fail）。验证方式：全量单测 + `verify-video.mjs --pre` 跑真实 content 目录。 |
| `scripts/short-video/__tests__/scene-rules.test.mjs` | 新增一个 describe 块 | Low | 追加到既有文件末尾区域，不修改任何现有断言。最坏后果：新测试失败，不影响被测代码。 |
| `docs/video-workflow.md` | §“The 8-dimension prompt” 补充校验说明 | Low | Agent 消费文档，改动前按 AGENTS Workflow Router → Agent documents 加载 `writing-for-agents`。只追加一句约束说明，不改变既有规则的唯一权威来源。 |
| `docs/issue-tracker.md` | Tier 3 表新增 #166 行；Conflict Matrix 的 `scene-rules.mjs` 行补登记 #166；对齐 #159 的 GitHub 实际状态 | Low | 文档状态同步，无代码影响。按 Triage Protocol 铁律：先更新 Tier/Matrix，再同步 Wave。 |

冲突检查（改前已查 Conflict Risk Matrix）：本次只碰 `scene-rules.mjs`，该行现有登记为 #94（可能）+ #155，风险 🟢 低。**不碰 `lib/b-roll/*`**，因此与 #155 / #156 / #157 / #158 无文件冲突。

### Section 2: Behavioral Scenarios

每行都是 verification obligation，并明确 evidence 类型；确定且可自动验证的行为走 TDD，真实管线组合使用 runtime/real-data smoke。

| # | Scenario | Expected Behavior | Risk | Evidence | Mitigation |
|---|----------|-------------------|------|----------|------------|
| 1 | `b-roll` scene，prompt 三组齐全且无数字 | 无输出（静默通过） | 过严会刷屏 | automated test | 用例断言返回空数组 |
| 2 | `b-roll` scene，prompt 缺 ARTIFACT 组（真实 scene 5） | warn，detail 点名 `ARTIFACT` | — | automated test | 断言 detail 含组名与 scene id |
| 3 | `asset-then-broll` scene，prompt 缺 TEXT + ARTIFACT（真实 scene 6） | warn，detail 同时点名两组 | 多组缺失的拼接可读性 | automated test | 每组逗号分隔，固定顺序 TEXT→HANDS→ARTIFACT |
| 4 | `b-roll` scene，prompt 三组齐全且无数字（真实 scene 8） | 无输出 | — | automated test (real fixture) | 真实 fixture 断言 |
| 5 | prompt 完全不含任何 NEGATIVE 词 | warn，列出全部三个缺失组 | — | automated test | 断言三个组名都在 detail 中 |
| 6 | prompt 只含 HANDS 组 | warn，列出 TEXT + ARTIFACT | — | automated test | 同上 |
| 7 | 无 `mediaStrategy` 且无 `aiVideo` 的普通 scene | 静默，不产生任何输出 | 违反 engaged 原则会污染所有内容的 preflight | automated test | 用不含 b-roll 字段的 mock scene 列表断言空 |
| 8 | `mediaStrategy: "asset"` 但带 `aiVideo.prompt` | 静默（永不生成，不审） | 与既有 contract check 的语义保持一致 | automated test | 断言返回空 |
| 9 | 生成策略但 `aiVideo.prompt` 为空串 | 跳过（交由既有 contract check 报 fail） | 同一问题两条输出会让人忽略 warn | automated test | 断言返回空，并加注释说明不重复报错的理由 |
| 10 | 生成策略但 prompt 为纯空白 `"   "` | 同上，跳过 | trim 前判断会导致误报 | automated test | 先 trim 再判空 |
| 11 | prompt 含 `no texture` | 不得计为 TEXT 组已覆盖 | 子串匹配误报，掩盖真实缺口 | automated test | 词边界匹配 `\bno text\b`；专门用例保护 |
| 12 | prompt 含大写 `No Hands` | 识别为 HANDS 组已覆盖 | 大小写敏感导致误报 | automated test | 匹配前小写归一；专门用例保护 |
| 13 | prompt 含 `no hand`（单数） | 识别为 HANDS 组已覆盖 | 词表单数复数不全 | automated test | 同义词表含单复数 |
| 14 | prompt 含阿拉伯数字（如 `8.6x faster`） | warn，提示数据值应进 `texts` 层 | — | automated test | 断言 detail 提到数字 |
| 15 | prompt 含元素数量的阿拉伯数字（如 `3 glowing layers`） | warn（提示级，文案说明可忽略） | 误报训练人忽略 warn | automated test | 已接受该代价；fix 文案同时说明两种可能 |
| 16 | prompt 用英文数词（`Two parallel lanes`） | 不报数字问题 | 过度检测会误伤合法视觉描述 | automated test | 只检测 `\d`，不检测英文数词；真实 scene 8 覆盖此例 |
| 17 | 同一 prompt 既缺组又含数字 | **一条** warn，detail 合并两类问题 | 拆多条会刷屏 | automated test | 断言结果数组长度为 1 且 detail 同时含两类信息 |
| 18 | 多个 scene 各自有问题 | 每个 scene 一条 warn，互不干扰 | 结果顺序影响快照类断言 | automated test | 按 scene 在数组中的原顺序输出 |
| 19 | 新检查注册进共享入口 | 调用该入口即可获得新检查结果 | 忘记注册则检查永不生效 | automated integration test | 沿用既有「is wired into runAllSceneDataChecks」测试模式 |
| 20 | 真实 `qwen4-preview` scene 列表全量跑 | scene 5 warn / scene 6 warn / scene 8 静默 | prompt 被补全后此断言会失效 | automated test (real fixture) | 断言时写明这是当前状态的固化，补全 prompt 时需同步更新预期 |
| 21 | `verify-video.mjs --pre` 跑 `qwen4-preview` | 新增 2 条 warn，exit code 仍为 0 | warn 若意外阻断会卡住管线 | runtime/real-data smoke | 运行时验证 exit code 与 WARN 计数 |
