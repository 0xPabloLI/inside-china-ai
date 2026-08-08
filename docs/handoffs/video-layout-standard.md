# Handoff: 视频布局安全区标准 + 强制执行链

> **日期**: 2026-08-08 · **来源 session**: 视频视觉系统修复（字幕安全区/槽位布局/品牌 logo/竖屏重做）
> **用途**: 任何后续「修改视频视觉/设计内容」的 session，开工前先读本文件 + `docs/brand-system.md`，否则改出来的东西会撞上已落地的强校验（RED tests / Step 2.5 硬门）。
> **状态**: 已提交并推送至 main（`538d5f7` 等），spec/tickets 已归档 `docs/archive/`。

---

## 1. 一句话总结

本次 session 把「TikTok 竖屏视频视觉规范」固化成了 **代码（常量）+ 校验（硬门）+ 文档（brand-system.md）** 三层：字幕与内容/平台 UI 严格分离、所有场景走固定槽位、对比场景必须竖向堆叠、品牌 mark 真实可见。未来不合规的视频**在录制前就会被 pipeline 阻断**。

---

## 2. 核心事实：1080×1920 区域映射（单一事实源 `lib/safe-zones.mjs`）

实测校准来源：用户真实 FYP 播放截图（576×1024，×1.875 放大到 1080×1920）+ 2026 研究（quso/Moda 17 万帖、Kreatli、vSubtitle、Blitzcut）交叉验证。

| 区域 | 实测 UI | 我方安全区 |
|---|---|---|
| 顶部 nav | y 0–165 | 内容 y ≥ 220 |
| **右操作栏**（头像/点赞/评论/收藏/分享/音乐碟） | **x 880–1080, y 655–1775** | 内容右缘 ≤ x880（`right: 200`） |
| 底部 caption+用户名 | 最高 y≈1500 | 内容底 ≤ y1150（`bottom: 770`） |
| 底部 tab 栏 | y 1790–1905 | 我方内容归零 |
| TikTok 原生字幕 | ~60px em（≈屏高 3.1%），位于 62–70% 高度 | 字幕 60px，带 y1188–1350 |

**常量**（被测试锁定，改数值会红）：

```js
SAFE_ZONES = { top: 220, right: 200, bottom: 770, left: 60 }
// 内容带 = x[60,880] 宽 820 · y[220,1150]

SUBTITLE_LANE = { marginV: 570, fontSize: 60, maxLines: 2, lineHeight: 1.35, maxWidth: 720 }
// 字幕带 y1188–1350（62–70% 可读带）· marginL/R = (1080-720)/2 = 180 → 右缘 x900
// 派生: SUBTITLE_LANE_BOTTOM = 1350, SUBTITLE_LANE_TOP = 1188
```

---

## 3. 槽位布局系统（`lib/scene-layout.mjs`）— 所有场景必须走它

| 槽 | y 范围 | 用途 |
|---|---|---|
| brandHeader | 60–140 | 品牌 chrome（brandBar/水印），非内容 |
| kickerTitle | 220–400 | 徽章/标题 |
| hero | 400–950 | 主视觉 |
| support | 950–1150 | 来源/结论/补充 |

- 组装方式：`sceneFrame({ kicker, hero, support, align })`，横向 `SLOT_X.left=60 / right=880`（宽 820）。
- **禁止**：手写全屏 `flex + justify-content: space-between` + 底部 padding（三岛布局的根源）。
- ⚠️ **GOTCHA（曾踩坑）**：`SLOT_X.right` 是 **x 坐标 880**，不是 CSS `right` inset。生成 CSS 时必须换算 `right: ${CANVAS.width - SLOT_X.right}px`（=200）。直接写 `right: 880px` 会把槽压成 100px 宽。

---

## 4. 字幕规则（`lib/subtitles/`）

- `ass.mjs`：样式全部从 `SUBTITLE_LANE` 派生（fontSize 60 / marginV 570 / margins 180），**不要硬编码**。
- `measure.mjs`：Helvetica-Bold AFM 字宽表（per-1000-em × fontSize）。
- `cues.mjs`：分块按**像素实测宽度**：`HARD_PX = maxWidth = 720`（绝不超宽），`SOFT_PX = round(HARD×0.85) = 612`（软断）。`MAX_WORDS=6`、句子边界、孤儿合并、时间轴（lead-in/hold-out/gap）逻辑**不要动**。
- 兜底：极端折行落在两行预留带内（y≤1350），不压内容。

---

## 5. 品牌 mark（`lib/scene-templates.mjs` / `base-styles.mjs` / `build-mark-svg.mjs`）

- **视频专用资产**：`assets/china-ai-news-mark-video.svg`（有 `viewBox` + 品牌色 fill `#4d8bff`/`#ef4444`）。
- 由 `build-mark-svg.mjs` 从 `china-ai-news-mark.svg` **幂等生成**（源文件不动）。改品牌 mark → 改源 SVG 后重跑该脚本，不要直接改 video 资产。
- 用它的三处：brandBar（48px）/ 水印（55px, opacity 0.35）/ CTA 大 logo（130px）。
- `ctaScene` 与 `hookScene` 是**共享模板**，所有视频必须委托它们；模板层禁硬编码商业文案（drift 测试锁）。

---

## 6. 强制执行链（未来视频怎么被约束）

| 层 | 机制 | 位置 |
|---|---|---|
| 1 常量 | 测试锁定 | `safe-zones.test.mjs` / `scene-drift.test.mjs` |
| 2 数据级 | `verify-video.mjs --pre`（SKILL.md 规则） | pipeline Step 0 |
| 3 **渲染级硬门** | `verify-scene-dom.mjs` 自动跑在 **Step 2.5**（HTML 生成后、录制前），FAIL 即中止 | `main.mjs` / `render-only.mjs` |
| 4 源码级 | side-by-side class 禁令 + 共享模板 byte-identical | `scene-drift.test.mjs` |

**DOM 校验规则**（`verify-scene-dom.mjs`）：
- 顶/底越界（y<220 或 y>1150）→ **FAIL**（豁免：背景层 `grid-bg`/`glow-red`/`glow-blue`/`glow-amber`/`glow-tint`/`scanlines`/`scan-sweep`/`glitch`/`glitch-flash`/`fade-to-black`/`frame-glow`/`flash-frame`、brand-chrome `brand-bar`/`brand-logo-large`/`brand-watermark` 及其子元素）
- 右缘 > x880：**底边 y>640（操作栏内）→ FAIL**；y≤640（顶部 chrome）→ WARN
- 水平溢出（scrollWidth）、`undefined`、mid-word break → FAIL
- 逃生口：`--skip-dom-check`（**仅限调试**，所有 content 目录已迁移到槽位布局，新内容不许用）

**竖向堆叠规则**：对比/VS 场景必须 A/VS/B 纵向堆叠，禁横向并排。`scene-drift.test.mjs` 以 `class="` 前缀匹配禁用 `accused-row` / `chip-compare` / `vs-circle` / `cols`（含后缀变体）。

---

## 7. 改动文件清单（本次 session）

**实现**：`lib/safe-zones.mjs`、`lib/scene-layout.mjs`（新）、`lib/scene-templates.mjs`、`lib/base-styles.mjs`、`lib/subtitles/{ass,measure,cues}.mjs`、`verify-scene-dom.mjs`、`main.mjs`、`render-only.mjs`、`build-mark-svg.mjs`（新）、`assets/china-ai-news-mark-video.svg`（新）

**内容样本（迁移参考）**：`content/bytedance-distillation/scenes.mjs` — S6/S7/S8 竖向堆叠（`.accused-stack`/`.chip-stack`/`.vstack`），全部场景槽位化，**scene-data.mjs 文案零改动**

**测试**：`safe-zones` / `scene-layout` / `scene-drift` / `subtitle-cues` / `subtitle-measure` / `build-mark-svg`（共 812 绿 + DOM verify 9/9）

**文档**：`docs/brand-system.md`（现行生产标准 — 改设计先改它）、`docs/archive/spec-video-layout-safe-zones.md`（已归档，含场景矩阵）

---

## 8. 常用验证命令

```bash
# DOM 布局硬门（改任何场景后必跑）
node scripts/short-video/verify-scene-dom.mjs --content bytedance-distillation   # 期望 9/9 PASS

# 单测 / 全量
npx vitest run scripts/short-video/__tests__/scene-layout.test.mjs
npx vitest run scripts/short-video   # 全量（812）

# 快速重渲染（不重跑 TTS，视觉迭代用）
node scripts/short-video/render-only.mjs --content bytedance-distillation   # 跑完抽帧看

# 品牌 mark 重建（改源 SVG 后）
node scripts/short-video/build-mark-svg.mjs
```

⚠️ **抽帧教训**：成片时长 ≠ 各 scene 时长之和（clip 会补帧），逐场景抽帧要对齐实际时间轴；CTA 在最尾（bytedance 成片 72s，CTA 在 ~67.5s 之后）。曾因在 66s 抽帧误判「S9=S8」——实际是抽帧抽到了 S8。

---

## 9. 遗留 / 未做（下次 session 注意）

- ✅ **老 content 槽位迁移完成（2026-08-08 v3）**：`deepseek`（12 场景）、`restraint/pt1`（11）、`restraint/pt3`（10）、`distillation/pt1`（8）全部迁移到 slot 布局，`verify-scene-dom.mjs` 全绿；对比场景（deepseek S3/S5/S10、restraint pt1 S6/S9、restraint pt3 S8、distillation pt1 S2/S6）全部竖向堆叠，禁用类 `cols`/`vs-circle` 等已从全部 content 移除；`scene-drift.test.mjs` 的 side-by-side 断言从仅 bytedance 扩展到全部 content 目录。`--skip-dom-check` 不再是合法逃逸路径。
- ✅ **`distillation/pt2` + `distillation/pt3` 场景实现完成（2026-08-08）**：两目录原为 throw stub（handoff-2026-08-05 Task 3 遗留），scene-data/meta 早已齐全。现按 pt1 视觉 DNA + slot 布局实现 9+9 场景（pt2: identity-bleed hook/recap/K3 规格/benchmark 表/hallucination/quote/白宫 hook/teaser；pt3: crash hook/recap/MiniMax timeline/Moonshot 融资/IPO 对比竖堆叠/playbook quote/verification 条形表/closing），DOM gate 9/9 + 9/9 PASS，CTA 均委托共享 ctaScene（scene-drift CTA 守卫已含 pt2/pt3）。至此**全部 7 个 content 目录均有 sceneFrame 实现**。
- ✅ `breaking-badge` 模板已从 `top: 210px` 修正为 `top: 220px`（安全区对齐，测试锁定）。
- ✅ 场景 watermark 契约更新：全部场景自带 `brandBar()` → `withWatermark` 对全部场景跳过水印（deepseek-scenes / distillation-pt1-scenes 测试已同步）。
- ✅ **hook 契约迁移完成（2026-08-08）**：`distillation/pt1/pt2/pt3` + `restraint/pt3` 的 scene 1 全部委托共享 `hookScene`（badge/hookText/revealText/color 数据契约；restraint pt3 带 subjectLogo + stats）。`scene-drift.test.mjs` HOOK_PIPELINES 登记 4 条 + byte-identity 与 `withWatermark(hookScene(...))` 比较；`scene-rules.test.mjs` 全部 7 目录 hook focal contract 通过；`verify-guard-cli.test.mjs` 新增 all-dirs preflight 守卫（deepseek 12 场景 / restraint pt1 11 场景为历史 long-form，走 `--long-form`）。restraint pt3 补 share-worthy 数据点（S1 stats + S2 6-12 MONTHS LATE）使 preflight 全绿。至此所有 content 目录 hook 均为 hookScene。
- lint 状态：仓库 lint 已全绿（rag session 完成了 `scripts/rag/` 并提交，包含此前缺失的 `lib/supabase-client.mjs`；2026-08-08）。
- ~~`docs/video-workflow.md` 字幕表旧值~~ ✅ 已同步（2026-08-08）：subtitle 表 60px / MarginV=570 / 720px 硬宽、Logo 水印位置（WATERMARK_POS）、Pipeline Steps 补 Step 2.5 DOM 门、内容带 820px 溢出表；`~/.catpaw/skills/short-video-pipeline/SKILL.md`（与 `~/.cursor/skills/...` 同一硬链接）也同步修正了 42px/450、`generate-ass.py` 死引用、字幕主/次配色（→ Dispatch Blue / White）。
