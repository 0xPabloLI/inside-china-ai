# Tickets — 标准 Hook 开场卡（Hook Opening Card Standard）

> Spec: `docs/specs/spec-hook-opening-card.md`（含场景矩阵）
> 状态: 已确认（2026-08-08）· 依赖序：T1 → T2 →（T3/T4/T5 并行）→ T6
> 跨 spec：本组实施完成后，`docs/tickets/tickets-video-layout-safe-zones.md` 的 T4（scene-layout.mjs lib）即被完成，需在其 ticket 标注；T5/T6/T7 仍归原 spec。

## T1 — 槽位布局系统（lib/scene-layout.mjs）

**What to build:** 新增 `lib/scene-layout.mjs`（吸收 safe-zones tickets T4 的 lib 范围）：`SLOTS`（brandHeader 60–140 / kickerTitle 220–400 / hero 400–1080 / support 1080–1340，数值与 safe-zones.mjs 同源校验）、`slotCss()`、`sceneFrame({ kicker, hero, support })` 组装器。场景模板不再写全屏 flex + 绝对定位魔数。

**Blocked by:** safe-zones T1（已完成，bottom=580 已提交）

**Status:** ready-for-agent

- [ ] SLOTS 导出（support.bottom = CANVAS.height − SAFE_ZONES.bottom，非硬编码 1340）
- [ ] slotCss()：四槽位绝对定位 CSS（x 按 SAFE_ZONES left 60 / right 160；hero 槽 flex 居中）
- [ ] sceneFrame({ kicker, hero, support }) 组装器
- [ ] 不变式测试（`scene-layout.test.mjs`）：kicker.top ≥ 220；support.bottom ≤ 1340；槽位互不重叠；x ∈ [60,920]；SLOTS 与 SAFE_ZONES 同源
- [ ] 全部测试绿 + lint 过

## T2 — hookScene 共享开场模板

**What to build:** `lib/scene-templates.mjs` 新增 `hookScene(scene, duration)` 完整场景生成器（data-only，零业务文案）+ `logoSvg(key)` 注册表 + `templateCss()` 追加 `.s-hook` 样式（含模板局部 `@keyframes scanSweep` 单次声明）。骨架用 T1 的 sceneFrame：kicker（badge 红丸）/ hero（subject 行 + focal 二选一）/ support（stats + source）。签名与数据契约见 spec §2-§3。

**Blocked by:** T1

**Status:** ready-for-agent

- [ ] logoSvg：key 校验 `/^[a-z0-9-]+$/`；缺失/非法 → ""；读 `assets/logos/<key>.svg` 剥 xml/注释
- [ ] hookScene 断言型：hookText 首帧无延迟 + revealText 1.5s stampIn（blue 挂 glowPulse，非 blue 静态辉光）
- [ ] hookScene 数字型：amber 大数字（复用 bigNumberAnchor 视觉约定）+ numberLabel（highlight 子串包 .hl）
- [ ] focal 同现 → 模板层 bigNumber 优先确定性渲染；皆无 → 骨架降级无 undefined
- [ ] statCard 增加可选 `delay` 参数（support 槽 stagger，向后兼容）
- [ ] scene-templates.test.mjs 新块：矩阵 #1-2、#5-10、#11（withWatermark 跳过）、#12（scanSweep 单次 + 零共享 keyframes）
- [ ] 全绿 + copy-free 断言通过

## T3 — checkHookContract 规则

**What to build:** `lib/scene-rules.mjs` 新增 `checkHookContract`（FAIL 级：focal 二选一，同现/皆无均 fail）+ 注册进 `runAllSceneDataChecks`。夹具同步：`scene-rules.test.mjs` validScenes hook 补 focal、`content/_test-fixtures/overlimit/scene-data.mjs` hook 补 focal（保持 verify-guard-cli 退出码不变）。

**Blocked by:** 无

**Status:** ready-for-agent

- [ ] 规则实现 + 注册
- [ ] 全组合单测（pass 数字/断言、fail 同现、fail 皆无、fail 空串、pass 非 hook 场景）
- [ ] validScenes / overlimit 夹具同步（base 场景数据补 `hookText`）
- [ ] 既有规则测试全绿（夹具同步后无连带失败）
- [ ] 对 4 旧视频现状断言：bytedance/restraint/deepseek pass，distillation pt1 fail（矩阵 #17）

## T4 — DOM 校验顶部带 + hook-standard 夹具

**What to build:** `verify-scene-dom.mjs` 新增顶部带 FAIL 检查（内容元素 top < 220 且不在豁免表 = FAIL，豁免表沿用现有 brand chrome/背景层）；新增 `content/_test-fixtures/hook-standard/`（scene1 断言型 hook 委托 hookScene、scene2 数字型、scene3 ctaScene）；EXPECTATIONS 加条目（skipWatermark 全场景）。

**Blocked by:** T2

**Status:** ready-for-agent

- [ ] 顶部带 FAIL 检查（BAND.top = SAFE_ZONES.top；报错含元素类名 + 实测 y）
- [ ] 夹具两变体数据 + scenes.mjs 委托共享模板
- [ ] EXPECTATIONS 条目
- [ ] CLI 实测：`verify-scene-dom.mjs --content _test-fixtures/hook-standard` 全 PASS（矩阵 #14-16）

## T5 — 数据生产者迁移 + drift 守卫

**What to build:** `evergreen-templates/*.mjs` ×5 hook texts `line1/line2` → `hookText/revealText`（值不变机械改名）；`batch-generate.mjs` 脚手架 hook texts 换契约 + 注释引用 hookScene；`scene-drift.test.mjs`：HOOK_PIPELINES 空数组 + 登记约定注释、evergreen hook focal 断言、脚手架断言、keyframes 规则按 D-4 放宽（禁 12 个共享 keyframes，允许模板局部 scanSweep 恰一次）。

**Blocked by:** T2（契约断言引用 hookScene 键名）

**Status:** ready-for-agent

- [ ] evergreen ×5 键名迁移
- [ ] batch-generate 脚手架迁移
- [ ] drift 守卫四块（HOOK_PIPELINES / evergreen focal / 脚手架 / keyframes）
- [ ] 既有 drift 测试不红（#21、#22）

## T6 — 文档 + 收尾验证

**What to build:** `docs/brand-system.md` Hook Scene 模板节重写（hookScene + 槽位图 + 数据契约）；`docs/video-workflow.md` 加 hook 数据契约指针；`tickets-video-layout-safe-zones.md` T4 标注「lib 部分由本组实施」。

**Blocked by:** T1–T5

**Status:** ready-for-agent

- [ ] brand-system.md 更新
- [ ] video-workflow.md 更新
- [ ] safe-zones tickets T4 标注
- [ ] 全量 vitest + lint + tsc + build 通过（#23）
- [ ] 渲染单帧截图目视（hookScene 双变体各一帧）
- [ ] commit + push + 归档 spec/tickets 到 docs/archive/
