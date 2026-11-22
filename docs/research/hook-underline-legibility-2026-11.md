# Hook underline legibility on the dark canvas（#733 S2，2026-11-22）

> **下游票**：`#733`（S2 强调层 underline token 调色/加粗；3 人盲评通过后落地；本文件只交证据与候选，不改生产 token）。
> **配套**：`docs/specs/spec-semantic-beats.md` §2.4 / §7；CLI `scripts/short-video/annotation-legibility.mjs`。
> **证据分级**：`[实测]` 由 `doubao-work` scene 1 的真实 Remotion still 量得；`[标准]` WCAG 2.2 SC 1.4.11；`[推断]` 本文的归纳。

---

## 1. 结论

1. **对比度不是失败点。** 现行 Dispatch Blue 3px 下划线在 `#0a0a14` 画布上，token 理论对比度 **6.05:1**，渲染后实测 **5.77:1**，均高于 WCAG 非文本 3:1 的下限。它客观可见，不属于“看不见”的问题。
2. **真正的弱点是同色相邻 + 余量不足。** 下划线与下一行 `YOUR COMPUTER` 同为 Dispatch Blue，紧贴在一起，线容易被读成 pay-off 文字的一部分，而不是对 claim 的独立标注；同时声明线宽 3px 只有画布高度的 **0.156%**，低于手机端 **0.2%**（1080×1920 下 3.84px）的余量线。rough-notation 的墨迹实测平均 **4.42px（0.23%）**，刚好擦线通过，没有余量。
3. **盲评首选 amber 4px，保守备选 brand 5px。** amber 把对比度拉到 **8.42:1**，并与蓝字 pay-off 形成色相分离；brand 5px 只增加线宽、不换色，风险最小；white 4px 对比最高（17.2:1）但会与白色 claim 文字混在一起；cyan 仍留在蓝色家族。
4. **本轮不改生产 token。** 3 人盲评未做，按 `#733` 既有裁决，underline 的颜色/线宽调整必须由盲评决定。本文把盲评候选、量化和判据一次备齐。

---

## 2. 方法

- 样本：`scripts/short-video/content/doubao-work/scene-data.mjs` scene 1（`hook` / `hero-center`），`hookText = "AI THAT OPERATES"`，`highlight = { field: "hookText", text: "OPERATES" }`。
- 渲染：`npx remotion still` 以 `ShortVideo` composition 出 frame 75，只替换 `ANNOTATION.underline.strokeWidth` 与 `HookScene` 传给 `SplitHighlight` 的颜色；渲染后源文件已还原（`git status` 干净）。
- 变体：current（brand 3px）/ brand-thick（brand 5px）/ amber（4px）/ white（4px）/ cyan（4px）。
- 指标：
  - WCAG 相对亮度对比度（fg vs `#0a0a14`，并按实际渲染像素复核）；
  - 声明线宽与画布高度的比例；
  - 实际墨迹：在 y 590–632 的 claim 下划线带内按目标色提取像素，`面积 ÷ 水平跨度` 得平均厚度；
  - 变化范围：与 current 帧逐像素差，确认差异只落在 `OPERATES` 的下划线包围盒内。

---

## 3. 实测结果

| 变体 | 颜色 | 声明线宽 | token 对比度 `[标准]` | 渲染后对比度 `[实测]` | 渲染墨迹厚度 `[实测]` | 与 current 的差异 bbox `[实测]` |
| --- | --- | --- | --- | --- | --- | --- |
| current | `#4d8bff` | 3px | 6.05:1 | 5.77:1 | 4.42px（0.23%） | — |
| brand-thick | `#4d8bff` | 5px | 6.05:1 | 5.79:1 | 7.95px（0.41%） | x 433–822 / y 604–616 |
| amber | `#f59e0b` | 4px | 9.17:1 | 8.42:1 | 7.12px（0.37%） | x 433–822 / y 605–615 |
| white | `#f5f5f5` | 4px | 18.06:1 | 17.2:1 | 6.43px（0.33%） | x 433–822 / y 604–616 |
| cyan | `#22d3ee` | 4px | 10.90:1 | 10.42:1 | 6.37px（0.33%） | x 433–822 / y 604–616 |

变化 bbox 宽度 388px，正是 `OPERATES` 在 78px 字号下的墨迹宽度；所有变体都只动这条线，没有碰文字、卡片或来源行。

---

## 4. 判读

### 4.1 为什么“看得见”仍然显得弱

- **同色竞争**：下划线与 `YOUR COMPUTER` 都是 `#4d8bff`，两者垂直距离不足一行。视觉上蓝线会先被归到下一行的蓝字，而不是“这一句是 claim”的标记。
- **余量不足**：声明 3px = 0.156% 画布高，低于 0.2% 的手机端余量线；实际墨迹 4.42px 只是靠 rough-notation 的抖动/抗锯齿擦线通过。任何一次下采样或压缩都可能把它压回 1–2 个设备像素。
- **白色 claim 的对比已经很高**：claim 文字 `#f5f5f5` 对画布约 18:1；一条 5.77:1 的蓝线在同一视野里不是“最亮”的元素，容易被文字压住。

### 4.2 候选的取舍

- **amber 4px**：8.42:1，且与蓝字 pay-off 色相分离；在 382M / $4B 卡片上已经存在 amber，属于既有语义色，不是新引入的品牌色。风险是与 amber 数字同屏时注意力分散——但两者相距约 250px，且数字是静态信息、下划线是 claim 标记。
- **brand 5px**：只改线宽，品牌一致性最好；对比度仍是 5.79:1，同色竞争没有解除，但在小屏上厚度余量从 0.23% 提到 0.41%。
- **white 4px**：对比度最高，但在白色 claim 文字正下方会读成普通文本下划线，层级弱于 amber。
- **cyan 4px**：对比 10.42:1，仍属蓝色家族，与 pay-off 的分离不如 amber。

---

## 5. 建议的盲评协议

- 受试：3 人，独立看 `blind-sheet.png`（A–E 随机顺序，不含变体名），在手机高度（约 720px）观看，距离 30cm，每个变体 5 秒。
- 三维度各 1–5 分：**可读性**（线是否一眼可见）、**主次层级**（claim 是否比 pay-off 更先被注意到）、**不廉价**（是否像设计的一部分，而不是 default underline）。
- 判据：若 amber 的“可读性”均分 ≥ brand-thick，且“不廉价”均分 ≥ 3.0，则选 amber 4px；否则选 brand-thick 5px。white/cyan 只作为对照，不进入默认。
- 盲评答案键（**不要发给评审人**）：A = white 4px，B = current 3px，C = brand-thick 5px，D = amber 4px，E = cyan 4px。
- 盲评通过后只改 `scripts/short-video/remotion/src/components/shared.ts` 的 `ANNOTATION.underline`（必要时加 `HookScene` 的 underline 颜色），跑 still 复验与 affected tests。

---

## 6. 证据与复现

- 全帧 contact sheet：`scripts/short-video/output/underline-contrast/contact-sheet.png`
- claim 区放大对照：`scripts/short-video/output/underline-contrast/zoom-stack.png`
- 盲评随机表：`scripts/short-video/output/underline-contrast/blind-sheet.png`（答案键见 §5 与 §3 的顺序，不在表内）
- 数值复算：`node scripts/short-video/annotation-legibility.mjs`（token 理论值）；渲染像素值由本文档记录的 still 量得。
- 渲染变体时临时改过 `ANNOTATION.underline.strokeWidth` 与 hook 的 underline 颜色，渲染后已逐字节还原（当前工作树 `shared.ts` / `HookScene.tsx` 无 diff）。

---

## 7. 未做 / 边界

- 未改生产 token、未接入 pre-render gate；本轮不产生任何成片 diff。
- 未做中文 hook 样张、未覆盖 `NarrativeScene` 的 amber marker（那是另一条标注，不在本票的 underline 范围）。
- 3 人盲评需真人执行；Agent 不得代填分数。
