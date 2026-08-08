# Spec: 标准 Hook 开场卡（Hook Opening Card Standard）

> Status: draft（待用户确认）
> Date: 2026-08-08
> Grill: 已完成（Round 1+2 用户确认：2 个焦点变体；模板 + 数据生产者迁移、已有 4 视频不动；安全盒文本限宽 860px；verify-scene-dom 加顶部 FAIL 检查且旧视频不单独修；顺带实现 scene-layout.mjs lib 部分（吸收 safe-zones spec T4），hookScene 作为首个消费者；focal 必填、subject/badge/stats/source 可选；断言变体字段命名 hookText/revealText）
> 上游依赖: `docs/specs/spec-video-layout-safe-zones.md`（D1 槽位区域映射、D3 槽位布局系统设计——本 spec 实现其 lib 部分）

## 1. 问题

每个视频的 Hook 开场页（Scene 1，前 3 秒决定 70% 完播）已 drift 成 4 套手写实现、3 种数据形状——与 CTA 结尾页标准化前完全同构：

| 视频 | 数据形状 | 视觉型 | 备注 |
|---|---|---|---|
| bytedance-distillation | `subject`+`hookText`+`revealText`+`source` | 断言型 | 手写绝对定位魔数（340/560/820/1020） |
| restraint pt1 | 同上 | 断言型 | 主体行 `top:160px` **压入顶部 220px 禁区**（验证器不查顶部，无人发现） |
| deepseek | `badge`+`subject`+`bigNumber`+`subtitle`+`stats[]` | 数字型 | scene1 内联复制 brand-bar/breaking-badge/stat-card CSS，不走共享 templateCss |
| distillation pt1/pt2/pt3 | `badge`+`line1`+`line2` | 警报型 | alert-bar `top:80px` 压入顶部禁区 |
| evergreen ×5 / batch-generate | `line1`+`line2`（第 3 种形状） | — | 数据生产者，产出即落后 |

问题：

1. 数据契约 3 种形状，新视频只能复制旧 scene1 再改，drift 持续扩大
2. 逐元素手写绝对定位 → 安全区越界是写法的必然结果（3/4 视频顶部越界）
3. `verify-scene-dom.mjs` 只查底部（FAIL）和右侧（WARN），**顶部 220px 带无检查**
4. 品牌规则的 hook 硬要求（主体 logo ≥120px、0.3s 内出现、首帧即有内容）靠 warn 级事后检查，不是结构保证
5. 每个新视频重写 ~40 行 CSS

## 2. 设计（已锁定）

**槽位骨架固定，焦点区二选一，文案槽位数据驱动。** hookScene 建在 `lib/scene-layout.mjs` 的槽位系统上（safe-zones spec D3 设计已锁定，本 spec 实现其 lib 部分并作为首个消费者）——场景不再写绝对定位魔数，元素物理上不可能越界。

```
┌─ 0–220  顶部禁区：仅品牌 chrome（brandBar top:80，豁免） ─┐
│ ┌─ kicker 槽 220–400 ─────────────┐
│ │  [badge]  可选：红丸 BREAKING     │
│ ├─ hero 槽 400–1080（flex 居中）──┤
│ │  [subject] 可选：logo 120px + 名字 │
│ │  [focal]  必选，二选一：           │
│ │   A 数字型：bigNumber(amber 260px) │
│ │             + numberLabel         │
│ │   B 断言型：hookText（首帧即见）    │
│ │             + revealText（1.5s 砸入）│
│ ├─ support 槽 1080–1340 ──────────┤
│ │  [stats] 可选：数据卡行            │
│ │  [source] 可选：来源行             │
│ └──────────────────────────────────┘
├─ 1340–1417 呼吸空隙 / 1417–1530 字幕带 / 1530+ TikTok UI ─┘
背景三层固定：grid-bg + glow（随 color 槽位变色）+ scanlines + scan-sweep
```

- 槽位 x 区间按 SAFE_ZONES（left 60 / right 160 → 内容宽 860px）。这是对 Grill R1-Q3「对称 60 + 限宽 860」的修正落法：D3 已锁定 slotCss 按 SAFE_ZONES，两者产出的文本宽度同为 860px，但右缘硬收在 920（右栏实际遮挡区之外），比屏幕对称更符合平台现实
- 动画时序契约固化进模板：brandBar 0.1s → badge 0.2s → subject 0.2–0.4s → hookText 0s（首帧可见，无延迟）→ bigNumber 0.3s / revealText 0.8s 砸入 → stats 0.8s 起 stagger → source 1.3s。优化依据：TikTok Analytics 显示观众在 0:02 流失，原 bigNumber 0.8s 延迟使核心视觉元素在观众离开时刚出现。
- 动画只用 baseStyles() 已内置 keyframes，唯一例外：`scanSweep` 由 hookScene 以模板级局部 keyframe 声明一次（见「关键设计决策」D-4）
- `withWatermark` 因 brandBar 存在自动跳过（复用现有机制）
- 警报型不归第三变体：归入断言型 + `color: "red"`（红 glow + 红 revealText）

### 关键设计决策

- **D-1 焦点变体选择**：`bigNumber` 存在 → 数字型；否则 `hookText` 存在 → 断言型。两者同现时模板层按 bigNumber 优先确定性渲染（不 crash），数据层由 checkHookContract FAIL 拦截
- **D-2 数字恒为 amber**（brand-system 硬性规则：Hook 大数字用 amber）；`color` 槽位只驱动 glow 色调 + revealText/强调色，默认 blue
- **D-3 `glowPulse` keyframe 是蓝色专用**（base-styles 内硬编码蓝色 text-shadow）：`color` 非 blue 时 revealText 用静态 text-shadow（该色 RGBA），不挂 glowPulse，避免红字蓝辉光
- **D-4 scanSweep 处理**：scene-drift 现行规则「scene-templates 零 @keyframes」过严（其立法意图是共享 keyframes 单一来源）。规则修正为「模板文件不得重新声明 12 个 SHARED_KEYFRAMES」，hookScene 的 scanSweep 作为模板局部 keyframe 声明一次。**否决的替代方案**：scanSweep 移入 baseStyles 共享——会迫使 3 个旧视频删除本地声明（违反"旧视频不动"）
- **D-5 badge 复用 breakingBadge 的视觉语言（红丸 + pulse dot），但不用其绝对定位**（templateCss 的 `.breaking-badge` 是 `top:210px` 全局绝对定位，本身就是 deepseek 顶部越界的来源）；hookScene 在 kicker 槽内以 flex 流内样式渲染
- **D-6 logo 注册表**：`lib/scene-templates.mjs` 新增 `logoSvg(key)`——读 `assets/logos/<key>.svg`、剥 xml 声明/注释、key 校验 `/^[a-z0-9-]+$/`（防路径穿越）、文件不存在或 key 非法时返回 `""`（降级为纯文字主体行）。当前注册表实际内容：deepseek / deepseek-icon
- **D-7 签名与 ctaScene 对齐**：`hookScene(scene, duration)`，data-only 零业务文案

## 3. 数据契约（唯一形状）

```js
texts: {
  // kicker 槽
  badge: "BREAKING",                  // 可选 — 红丸文案
  // hero 槽 · 主体
  subject: "DEEPSEEK",                // 可选 — 主体名（公司/话题）
  subjectLogo: "deepseek",            // 可选 — logo 注册表 key
  // hero 槽 · 焦点（必选其一，不可同现）
  bigNumber: "$1.4B",                 // 数字型 — amber 大数字
  numberLabel: "FUNDING ROUND PAUSED",// 数字型伴侣，可选；highlight 子串包 .hl
  hookText: "0 KPIs. 0 ORG CHARTS.",  // 断言型 — 首帧即见（无动画延迟）
  revealText: "ONLY A VISION",        // 断言型伴侣，可选 — 1.5s stampIn 砸入
  // support 槽
  stats: [{ num: "4", unit: "HR", label: "LEAKED MEETING" }], // 可选
  source: "BLOOMBERG",                // 可选 — 来源行
  // 全局
  color: "blue",                      // 可选 — 语义色 token（blue/red/amber/green/purple/cyan），默认 blue
}
```

契约规则（`checkHookContract`，FAIL 级，进 `runAllSceneDataChecks`）：

| 条件 | 结果 |
|---|---|
| `bigNumber` 与 `hookText` 同现 | fail「focal 二选一，不可同现」 |
| 两者皆无 | fail「缺 focal：bigNumber 或 hookText 必给其一」+ 迁移指引 |
| 其余组合 | pass |

对现有内容的预估影响（无 CI，verify 均为手动按 dir 运行）：bytedance ✓ / restraint ✓ / deepseek ✓（bigNumber 在场即合规）意外通过；distillation pt1/pt2/pt3（line1/line2）✗——与 safe-zones spec D4 防回退机制同哲学（这些视频重跑 pipeline 本就会被 bottom=1340 阻断，报错附迁移指引）。

## 4. 实施形态

- **新增 `lib/scene-layout.mjs`**（吸收 safe-zones tickets T4 的 lib 范围）：`SLOTS`（brandHeader 60–140 / kicker 220–400 / hero 400–1080 / support 1080–1340，数值与 safe-zones.mjs 同源校验）、`slotCss()`、`sceneFrame({ kicker, hero, support })`。bytedance 的槽位迁移仍归原 spec T6，不在本 spec
- `lib/scene-templates.mjs`：新增 `hookScene()` + `logoSvg()` + `templateCss()` 追加 `.s-hook` 样式
- `lib/scene-rules.mjs`：新增 `checkHookContract` 并注册
- `verify-scene-dom.mjs`：新增顶部带 FAIL 检查（元素 top < 220 且不在豁免表 = FAIL；豁免表已含 brand-bar/水印/背景层）
- 数据生产者迁移：`evergreen-templates/*.mjs` ×5（`line1/line2` → `hookText/revealText`）+ `batch-generate.mjs` 脚手架（hook texts 换契约 + 注释引用）
- 测试夹具：新增 `content/_test-fixtures/hook-standard/`（scene1 委托 hookScene + 末帧 ctaScene），供 verify-scene-dom 几何验证；verify-scene-dom EXPECTATIONS 加对应条目
- 漂移守卫（`scene-drift.test.mjs`）：新增 HOOK_PIPELINES 字节级等值块（初始为空数组 + 约定注释：新 content 采用 hookScene 时须登记）；evergreen hook 契约断言；batch-generate 脚手架断言；keyframes 规则修正（D-4）
- 文档：`docs/brand-system.md` Hook Scene 模板节重写为 hookScene + 槽位图；`docs/video-workflow.md` 新增 hook 数据契约表；`docs/tickets/tickets-video-layout-safe-zones.md` T4 标注「由本 spec 实施」

## 5. Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact（修改影响评估）

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| scripts/short-video/lib/scene-layout.mjs | 新增 SLOTS/slotCss/sceneFrame | Low | 纯追加；首个消费者是 hookScene；数值与 safe-zones 同源由测试锁定 |
| scripts/short-video/lib/scene-templates.mjs | 新增 hookScene/logoSvg + .s-hook CSS | Medium | 纯追加函数与 CSS 类，不改既有导出；templateCss 被全部场景消费——只追加不改既有类，由既有场景测试 + drift 等值测试兜底。最坏后果：CSS 类名碰撞 → 类名加 .s-hook 作用域前缀规避 |
| scripts/short-video/lib/scene-rules.mjs | 新增 checkHookContract 并注册 | Medium | 新 FAIL 级规则改变 preflight 退出码：distillation pt1/pt2/pt3 的 hook（line1/line2）将 fail。可接受：无 CI 自动跑旧内容；这些视频重跑本就被 bottom=1340 防回退阻断（D4 刻意设计）；报错含迁移指引。验证：scene-rules 测试全组合 |
| scripts/short-video/verify-scene-dom.mjs | 新增顶部带 FAIL 检查 | Medium | 旧 3 视频新增 FAIL 行（它们已因 bottom 带 FAIL）。这是本 spec 的目标行为而非回归。验证：hook-standard 夹具 PASS + 含故意越界元素的用例 FAIL |
| scripts/short-video/evergreen-templates/*.mjs ×5 | hook texts 键改名 line1/line2→hookText/revealText | Low | 数据模板，未进 pipeline；检查：evergreen 契约断言 |
| scripts/short-video/batch-generate.mjs | 脚手架 hook texts 换契约 | Low | 只影响未来生成的草稿；检查：脚手架断言 |
| scripts/short-video/__tests__/scene-drift.test.mjs | keyframes 规则修正（D-4）+ hook 守卫块 | Low | 测试文件自身；规则修正是放宽模板文件约束（内容文件的 SHARED 重声明禁令不变） |
| scripts/short-video/__tests__/scene-templates.test.mjs / scene-rules.test.mjs | hookScene / checkHookContract 测试块 | Low | 追加 |
| scripts/short-video/content/_test-fixtures/hook-standard/ | 新增夹具 | Low | 纯追加，不进任何生产路径 |
| docs/brand-system.md / docs/video-workflow.md / docs/tickets/tickets-video-layout-safe-zones.md | 文档对齐 | Low | 文档 |

不改动的文件（显式声明）：4 个已实现视频的 scenes.mjs / scene-data.mjs 一字不动；`base-styles.mjs` 不动（scanSweep 不进共享，见 D-4）；`compile-series*.mjs` 不动（hook 识别逻辑与本契约无交集）。

### Section 2: Behavioral Scenarios（行为场景矩阵）

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | 断言型完整渲染（badge+subject+logo+hookText+revealText+stats+source） | 各元素落各自槽位；hookText 无动画延迟（首帧可见）；revealText 1.5s stampIn | 视觉回归 | 单测断言各元素 + 槽位容器归属 |
| 2 | 数字型渲染（bigNumber+numberLabel+stats） | amber 大数字（bigNumberAnchor）+ label；numberLabel 的 highlight 子串包 .hl | 渲染 bug | 单测 |
| 3 | focal 同现（bigNumber + hookText） | 模板层 bigNumber 优先确定性渲染；数据层 checkHookContract → fail | 契约模糊 | 两侧单测 |
| 4 | focal 缺失 | checkHookContract → fail，报错含迁移指引 | 漏检 | 单测 |
| 5 | texts {} 全空 | 输出骨架无 undefined、无业务文案（copy-free） | 降级路径 | 单测 + copy-free 断言 |
| 6 | 可选槽位缺失（badge/subject/stats/source/logo 各组合） | 对应元素整体不渲染，不留空壳 | 条件渲染 bug | 单测逐槽位断言 |
| 7 | subject 无 subjectLogo | 纯文字主体行，名字 ≥80px/900 | 品牌规则弱化 | 单测断言字号 |
| 8 | logoSvg 非法 key（`../../etc`）/ 不存在 key | 返回 ""，降级纯文字；不读任意路径 | 路径穿越 | 单测（非法 key + 缺失 key） |
| 9 | color="red"（警报型） | glow 红调 + revealText 红色静态 text-shadow，**不挂 glowPulse**（蓝专用） | 红字蓝辉光 | 单测断言 animation 属性 |
| 10 | color 缺省 | 默认 blue，revealText 挂 glowPulse | 回归 | 单测 |
| 11 | withWatermark 注入 hookScene 输出 | 因 brand-bar 跳过，无双重品牌 | 双重品牌 | 单测（既有机制复用） |
| 12 | hookScene 的 keyframes | 输出仅声明一次模板局部 scanSweep；12 个 SHARED_KEYFRAMES 零重声明 | drift | scene-drift 修正后规则 |
| 13 | SLOTS 与 SAFE_ZONES 同源 | kicker.top ≥ 220；support.bottom ≤ 1340；槽位互不重叠；x ∈ [60,920] | 数值漂移 | scene-layout 不变式测试 |
| 14 | hook-standard 夹具过 verify-scene-dom | 全场景 PASS（含新顶部检查）；水印 EXPECTATIONS 正确 | 几何越界 | CLI 运行验证（Playwright 实测） |
| 15 | 顶部带检查：brandBar(80)/水印(60) | PASS（豁免表命中） | 误伤品牌 chrome | 用例覆盖 |
| 16 | 顶部带检查：内容元素 top=160 | FAIL，报错含元素类名 + 实测 y | 漏检 | 用例覆盖 |
| 17 | checkHookContract 对 4 旧视频 | bytedance/restraint/deepseek pass；distillation 系 fail（预期，见 §3） | 误报/漏报 | 单测按现状断言 |
| 18 | evergreen ×5 迁移后 | 每个 hook 有合法 focal（hookText 或 bigNumber） | 漏迁移 | drift 契约断言 |
| 19 | batch-generate 脚手架 | hook texts 用 hookText/revealText 键，注释引用契约 | 生产者漏改 | drift 脚手架断言 |
| 20 | HOOK_PIPELINES 等值守卫 | 列表内 content 的 hook 输出与 hookScene 字节级一致（初始空列表 + 登记约定注释） | drift 回归 | scene-drift 测试 |
| 21 | 旧视频源文件零改动 | 现有 drift/模板/规则测试不红（scene1 未动 → 无连带失败） | 误触旧内容 | 全量 vitest |
| 22 | CTA 既有契约 | ctaScene 相关测试全绿（不回归） | 回归 | 既有测试不动 |
| 23 | 编译/构建 | lint + tsc + build 通过 | CI | Runtime Verify |

## 6. 测试映射

矩阵 #1-2、#5-10、#12 → `scene-templates.test.mjs`（hookScene 块）；#3-4、#17 → `scene-rules.test.mjs`；#11 → scene-templates 或 drift（withWatermark 分支）；#13 → 新增 `scene-layout.test.mjs`；#14-16 → verify-scene-dom CLI 对 hook-standard 夹具实测（+ 若存在 CLI 测试 harness 则纳入）；#18-20、#12 的 drift 侧 → `scene-drift.test.mjs`；#21-22 → 全量 vitest 回归；#23 → CLI。

## 7. Out of Scope

- 4 个已实现视频（bytedance/deepseek/distillation/restraint）的 hook 迁移——下次使用时按新规范迁移（与 safe-zones spec Out of Scope 同策略）
- bytedance 的槽位化迁移（safe-zones tickets T6）
- `base-styles.mjs` 任何改动（scanSweep 不进共享 keyframes）
- TikTok 发布侧、字幕系统（safe-zones spec D2 已处理）

## 8. Further Notes

- 跨 spec 协调：本 spec 实施后，safe-zones tickets T4（scene-layout.mjs lib）即被完成，实施时同步在其 ticket 标注；T5/T6/T7 仍归原 spec
- distillation pt1 的 alert-bar 顶部越界、restraint 的 ds-row 越界，随各视频未来整体迁移一并解决，本次不单独修（Grill R2-Q2 确认）
- 验证路径：全量 vitest → `verify-video.mjs --pre --content _test-fixtures/hook-standard` → `verify-scene-dom.mjs --content _test-fixtures/hook-standard` → 渲染单帧截图目视（hookScene 双变体各一帧）
