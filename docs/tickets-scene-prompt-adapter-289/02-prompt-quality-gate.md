# Ticket 02 — 声明 prompt 质量闸（代码，TDD）

> Spec: [spec-scene-prompt-adapter-289.md](../specs/spec-scene-prompt-adapter-289.md) · Part 2（D2/D3） · 独立可交付

## Scope

扩 `checkBrollPromptDimensions`（[scene-rules.mjs](../..//scripts/short-video/lib/scene-rules.mjs#L1843-L1867)）为三判据，全部 **warn-only**（沿用单一 check 名 `B-roll prompt dimensions`）：

- (a) 数字扫描（保留现状）。
- (b) 薄写：prompt 对 CAMERA/MOTION/LIGHTING 三组**全部无信号** → warn。
- (c) 跨 scene 逐字重复：归一化（trim+lower+折叠空白）后相同 → 涉及的每个 scene 各一条 warn，detail 含出现次数。

导出 `BROLL_DIMENSION_SIGNALS`（CAMERA/MOTION/LIGHTING 三组正则）供测试/文档指针复用。

## Blocking edges

无。

## Demo path

```
node --test 或 npx vitest run scripts/short-video/__tests__
```
真数据 smoke：
```
node scripts/short-video/...  # 或在测试内 import anthropic-distillation-7labs/scene-data.mjs 跑 checkBrollPromptDimensions
```
断言该系列出现 ≥1 条重复 warn。

## Acceptance criteria（基线会失败）

- [ ] S1 薄写 prompt → warn（基线：仅扫数字，薄写无信号 → 当前不报）
- [ ] S2 富写 prompt → 无 warn  
- [ ] S3 数字 prompt → 保留 warn  
- [ ] S4 跨 scene 逐字相同（归一化）→ 每个涉及 scene 各一条 warn，detail 含次数（基线：无此判据）  
- [ ] S5 全 clean → 返回 `[]`  
- [ ] S6 非生成 scene / 空 prompt → 静默  
- [ ] S7 结果 `level` 恒 `warn`，无 `fail`（preflight exit 0 保持，含既有 S21 断言）  
- [ ] S8 真数据 smoke：`content/anthropic-distillation-7labs` 命中 ≥1 条重复 warn  
- [ ] affected `scene-rules.test.mjs` + `npm test` 全绿  

## Verification

TDD：先写 S1/S4 → red；实现 → green；补 S2/S3/S5/S6/S7 回归。affected tests + `npm test` + 真数据 smoke。
