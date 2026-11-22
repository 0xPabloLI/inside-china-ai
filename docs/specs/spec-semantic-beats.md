# Spec — News SHOTBOOK 语义拍契约（#733 S2）

> **状态**：Active spec（S2 tracer：词表 + Scene Data 契约 + 校验器 + 主拍派生/显式写回；渲染消费层未开工）。
> **上游**：`#733` S1 镜头配方卡（PR #1488）；来源 `#302` D 段 talkcraft SHOTBOOK。
> **下游**：S2 强调层（待开票）；S3 新闻题材封闭词表（本 spec 已先定义 26 词，S3 只做题材特化，不再改结构）。

## 1. 问题与目标

现有 Scene Data 的粒度是 **scene**，一个 scene 内哪一句是主论点、哪一句只是支撑，没有机器可读的声明。配方卡解决“这一拍用哪种版式”，但不解决“这一句在语义上是什么”。结果是：

- 写稿与选版之间靠人读，强调层无法只挑主论点；
- 改一句口播后，下游无法判断哪个强调该跟着走。

本 spec 定义 **语义拍（semantic beat）**：scene 内部的一个语义单元，锚定到 `voiceover` 的**精确子串**，声明封闭词表中的角色与主/次权重。它不选版式、不渲染，只提供可校验的结构。

## 2. 已决定的结构

### 2.1 落点

`scene.beats` 是 Scene Data 的可选数组，**不新建文件**：

```js
{
  id: 2,
  voiceover: "Qwen 4 Max cut task cost 62%, from $4.43 to $1.67.",
  beats: [
    { id: "cost-drop", at: "cut task cost 62%", role: "delta", weight: "main" },
    { id: "baseline", at: "$4.43", role: "baseline", weight: "sub" },
  ],
}
```

- **拍 = scene 内部子结构**，不升为 scene 之上的一层（Open Question 3 的答案）。
- `beats` 缺省 = 不启用；现有 37 个包不迁移、不报错。
- 拍的身份是 `scene.id + beat.id`，scene 重排不会跨 scene 撞 id。

### 2.2 字段

| 字段     | 类型     | 规则                                                                 |
| -------- | -------- | -------------------------------------------------------------------- |
| `id`     | string   | kebab-case；同一 scene 内唯一                                       |
| `at`     | string   | `voiceover` 的精确子串，且**只出现一次**；重复短语需补上下文        |
| `role`   | string   | `NEWS_BEAT_ROLES` 26 词之一                                          |
| `weight` | string   | `main` / `sub`；同一 scene 最多一个 `main`                           |
| `screenAt` | object? | 仅 `main` 可用；`{ field, text }`，屏幕文案与口播不同词时显式指定要标注的屏幕片段 |

不允许额外字段：schema 不能靠“先塞进去再说”悄悄长出来；`screenAt` 是显式扩展，字段名与嵌套键都封闭。

### 2.3 26 词新闻词表

`talkcraft` 的营销词表**不复制**，只重写结构。词表与选词规则在 `scripts/short-video/lib/semantic-beats.mjs` 的 `NEWS_BEAT_ROLES` 单一真值，CLI `--roles` 直接打印。

覆盖：开场（hook）、断言（claim）、证据（evidence）、数字（stat/metric）、对照（comparison/baseline/delta）、机制（mechanism/cause/consequence）、背景（context/timeline）、引语（quote/attribution）、限制（caveat/counterpoint）、定义（definition/example）、预测（forecast/implication/stake）、收束（cta/transition/recap/payoff）。

### 2.4 主拍 → 屏幕片段派生与显式写回

`semantic-beats --highlight` 默认只做**读**，不写回 Scene Data。它把每个 scene 的 `main` beat 映射到 T8 的 `texts.highlight`；只有显式加 `--highlight --write --content <slug>` 才写入。

- 只有渲染器真正会标注的字段才算候选：`narrative` 的 `result` / `action`，`hook` 的 `hookText`；`company` / `context` / `quote` / `badge` 不在候选内。
- `at` 必须在候选字段里**精确匹配**，且只命中一个字段、在该字段只出现一次；0 命中 / 多字段 / 多次出现都只报告，不猜。
- 已有 `texts.highlight` 时不覆盖；若其字段不在上述候选内，报告 `unsupported-field`。

落地前真实语料覆盖（2026-11-22，37 个 shipped pack；随后 13 条死高亮已移除）：

| 指标 | 数量 |
| --- | --- |
| 现有 `texts.highlight` | 59 |
| 渲染器真正会标注（result/action/hookText） | 46 |
| 指向未接线字段（company/context/quote/badge） | 13 |
| `highlight.text` 在 `voiceover` 里逐字出现（可派生） | 8 |
| 大小写不敏感后出现 | 26 |

结论：口播与屏幕文案本来就经常不同词，**逐字派生只能覆盖少数场景**。因此主拍可加 `screenAt: { field, text }`：

- `field` 必须是渲染器真正接线的字段（`narrative.result/action`、`hook.hookText`），且必须是当前 scene 的有值字符串；
- `text` 必须在该字段里精确出现一次；0 次 / 多次都 fail-closed；
- `screenAt` 只允许挂在 `main` 拍；没有 `screenAt` 时仍回退到 `at` 的逐字匹配。

```js
{ id: "screen-claim", at: "operating", role: "claim", weight: "main",
  screenAt: { field: "hookText", text: "OPERATES" } }
```

T8 同步收紧：`texts.highlight.field` 只要不在接线白名单，`assertKnownTextFields` 直接拒绝。落地前实测的 13 条死高亮（company 9 / context 2 / quote 1 / badge 1）已从 shipped packs 移除；画面无变化（B 场景三变体 SSIM 1.0），只是不再让死数据通过门禁。

写回规则：

- `--write` 必须同时给 `--content <slug>`，不能与 `--check` 连用；默认仍是 dry-run。
- 只为 `status=derived` 的 scene 插入一行 `highlight: { field, text }`，放在 `texts` 对象首行；不重排、不改引号、不格式化整份文件，diff 只多一行。
- 存在 `invalid-beats` 时整份文件拒绝写入；已有 `highlight` / 找不到 scene / 找不到 `texts` / 源文件形状不符都 fail-closed。
- 写入后仍是普通文本改动，由 git diff 与 pre-render gate 复核；CLI 不会自动 commit。

### 2.5 为什么锚文本而不是时间码

- 时间码在改句后静默漂移；精确子串在**校验期**就红，渲染不会带着错位强调出片。
- 语义拍是“这句话是什么”，不是“这句话在第几秒”；中文/英文重写后仍可复用同一 `role`。

## 3. Fail-closed 矩阵

`validateSceneBeats()` / `runAllSceneDataChecks()`（pre-render）与 `semantic-beats --check` 共用同一实现：

| 条件                                   | 结果                                                        |
| -------------------------------------- | ----------------------------------------------------------- |
| `beats` 非数组                         | fail `beats-not-array`                                      |
| 出现未知字段                           | fail `beat-unknown-field`                                   |
| `id` 非 kebab-case / 重复              | fail `beat-id-invalid` / `beat-id-duplicate`                |
| `at` 为空                              | fail `beat-at-empty`                                        |
| `at` 不在 `voiceover`                  | fail `beat-at-missing`                                      |
| `at` 出现多次                          | fail `beat-at-ambiguous`                                    |
| `role` 不在 26 词                      | fail `beat-role-invalid`                                    |
| `weight` 非 main/sub                   | fail `beat-weight-invalid`                                  |
| 一个 scene 多个 main                   | fail `beat-main-duplicate`                                  |
| `screenAt` 挂在 sub 拍                 | fail `beat-screen-at-sub`                                   |
| `screenAt` 不是 `{ field, text }`      | fail `beat-screen-at-invalid`                               |
| `screenAt.field` 不是接线字段          | fail `beat-screen-field-unsupported`                        |
| `screenAt.field` 无字符串文案          | fail `beat-screen-field-missing`                            |
| `screenAt.text` 为空 / 不在字段 / 多次 | fail `beat-screen-at-empty` / `missing` / `ambiguous`       |
| scene 无 `voiceover` 却声明 beats      | fail `voiceover-missing`                                    |
| `beats` 缺省                           | pass（opt-in）                                              |
| 合法 beats                             | pass，每个 scene 一条 `Scene N semantic beats`               |
| `texts.highlight` 指向未接线字段        | fail `assertKnownTextFields`（“not annotated by the renderer”） |

## 4. 边界

- **配方卡**：`shot-recipes.mjs` 继续独占版式选择；beat 不携带 layout/recipeId。
- **Scene 契约**：`beats` 是新增可选字段，不改变现有 `voiceover` / `texts` / `media` 语义。
- **preflight / MRL-2**：启用 beats 的包会在 pre-render gate 中 fail-closed；未启用的包零影响。
- **渲染**：本 spec 不新增 `<Audio>`、字幕或时间线行为；强调层是下游票。

## 5. 非目标

- 不实现强调层（字体、下划线、逐词动画、层矩阵）。
- 不做 beat 与配方卡的自动配对；不做跨 scene 的叙事弧分析。
- 不做 26 词之外的题材扩展（S3 另议）。
- 不迁移现有 37 个内容包。

## 6. 验收

- `semantic-beats --check` 在全部 shipped pack 上退出 0（无 beats 的包显示 skipped）。
- `runAllSceneDataChecks` 对非法 beats 产生 `fail`，对无 beats 的包不产生新结果。
- 单测覆盖上表每个分支（`semantic-beats.test.mjs` + `text-slots.test.mjs`）。
- 真实数据 smoke：`--check` 跑过 37 个包；启用 beats 的样例用单测 fixture（当前无已发布包采用）。
- `writeHighlightToSource` 单测覆盖：插入后仍可 import、保留注释/缩进、CRLF、重复写入拒绝、scene 不存在拒绝。

## 7. 后续

S2 强调层：消费 `beats`，把 `main` 映射到已有 recipe/文本槽的强调能力；必须先做 still 对比与 `#735` QA 的帧级证据。S3：新闻题材词表特化，不改本 spec 的结构。

underline 的暗底可读性证据与 3 人盲评协议见 `docs/research/hook-underline-legibility-2026-11.md`；盲评通过后只改 `ANNOTATION.underline`。
