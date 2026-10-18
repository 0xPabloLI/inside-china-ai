# Ticket 01 — Declared b-roll prompt 写作协议（文档）

> Spec: [spec-scene-prompt-adapter-289.md](../specs/spec-scene-prompt-adapter-289.md) · Part 1（D1） · 独立可交付

## Scope

在 `docs/video-script-writing-guide.md` 新增一节「Declared b-roll prompt 写作协议」：

- 按 `visualType`（hook/narrative/data/contrast/quote/cta）给出 declared prompt 的**维度模板与引导**：subject、构图/景别、镜头运动、光影氛围、视觉隐喻。
- 三条**反模式**清单：subject-only 薄写；跨 scene 逐字复用；手写 negative/brand（会被注入层去重或整段跳过）。
- 以指针指向代码单一事实来源 `VISUAL_TYPE_DIMENSION_DEFAULTS`（[prompt-injection.mjs](../..//scripts/short-video/lib/b-roll/prompt-injection.mjs)），**不在文档重复常量**。

## Blocking edges

无（可先行）。

## Demo path

打开 `docs/video-script-writing-guide.md`，`grep -n "Declared b-roll prompt"` 命中新节；节内 `grep -n "VISUAL_TYPE_DIMENSION_DEFAULTS"` 出现指针；节内**不**出现维度常量字符串（如 `"dark #0a0a14 studio background"`）。

## Acceptance criteria（基线会失败）

- [ ] 新节存在且含 per-visualType 模板 + 三条反模式（基线：节不存在 → grep 命中 0）  
- [ ] 节内指针指向 `VISUAL_TYPE_DIMENSION_DEFAULTS`，无常量重复  
- [ ] `npm run lint:docs` 通过；新增 § 编号存在性核对；`git diff --check` 干净  

## Verification

`npm run lint:docs` + grep 断言 + § 编号核对。
