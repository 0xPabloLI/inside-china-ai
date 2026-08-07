# Tickets: 标准 CTA 结尾页

> Spec: `docs/spec-cta-end-card-standard.md`
> 依赖图（tracer-bullet，每个 ticket 独立可验证）：

```
T1 (共享模板) ──┬──> T3 (content 迁移) ──> T5 (漂移守卫 + 集成验证)
T2 (契约规则) ──┘         │
T4 (数据生产者) ──────────┘
```

## T1: 共享 ctaScene 模板（lib/scene-templates.mjs）

- [ ] 单测先行（red）：`scene-templates.test.mjs` 新增 `ctaScene` describe（覆盖矩阵 #1-6、#12-13）
- [ ] `templateCss()` 追加 `.s-cta` 全套样式（logo 130px / brand-name 72px / tagline 32px / topic 36px，动画时序与既有 CTA 一致）
- [ ] 新增 `ctaScene(scene, duration)`：data-only 完整场景生成器（`baseStyles(duration) + templateCss()` + 条件渲染 brand/tagline/action/topic + `fadeToBlack(duration)`），零业务文案、零 keyframes
- [ ] 导出 `ctaScene`
- [ ] 单元测试全绿

## T2: checkCTAActionContract 规则（lib/scene-rules.mjs）

- [ ] 单测先行（red）：`scene-rules.test.mjs` 新增 describe（矩阵 #8-11）
- [ ] 实现 `checkCTAActionContract(scenes)`：末帧 `visualType==="cta"` 且 `texts.action` 缺失/空 → fail（含 fix 提示）；否则 pass
- [ ] 注册进 `runAllSceneDataChecks`
- [ ] validScenes cta 场景补 `action: "FOLLOW FOR MORE"`
- [ ] 单元测试全绿

## T3: content 迁移（scenes.mjs 委托 + scene-data 契约）

- [ ] 测试先行：`distillation-pt1-scenes.test.mjs` scene8 断言更新为新契约文案（`CHINA AI, DECODED` / `FOLLOW FOR PART 2`）→ red
- [ ] `content/bytedance-distillation/scenes.mjs` scene9 → `ctaScene` 委托；scene-data 移除冗余 `topic`
- [ ] `content/deepseek/scenes.mjs` scene12 → `ctaScene` 委托；scene-data：`line1`→`action: "FOLLOW FOR MORE"`，tagline 大写
- [ ] `content/distillation/pt1/scenes.mjs` scene8 → `ctaScene` 委托；scene-data：`line1`→`action: "FOLLOW FOR PART 2"`，tagline 大写
- [ ] `content/restraint/pt1/scenes.mjs` scene11 → `ctaScene` 委托（scene-data 已符合契约，确认即可）
- [ ] `content/distillation/pt2/scene-data.mjs` + `pt3/scene-data.mjs`：`line1`→`action`，补 `brandHighlight`，tagline 大写（scenes.mjs stub，不迁渲染）
- [ ] 清理各 scenes.mjs 迁移后无用 import
- [ ] 测试全绿

## T4: 数据生产者迁移

- [ ] `evergreen-templates/` 5 个文件：`texts: { title: "SUBSCRIBE" }` → `{ brand, brandHighlight, tagline, action: "FOLLOW FOR MORE" }`
- [ ] `batch-generate.mjs` 脚手架 CTA texts → 新契约
- [ ] 断言测试（放 T5 或本 ticket）：每个 evergreen 模板末帧 `texts.action` 非空

## T5: 漂移守卫 + fixture + 集成验证

- [ ] `scene-drift.test.mjs`：新增"每个已实现 content 的 CTA 场景输出与 `ctaScene` 字节级一致"守卫（bytedance / deepseek / restraint pt1 / distillation pt1）
- [ ] `content/_test-fixtures/overlimit/scene-data.mjs` cta texts 补 `action`（保持 T1-10/11/12 退出码不变）
- [ ] 新增 evergreen/batch-generate 契约断言（矩阵 #16-17）
- [ ] 全套测试绿：`cd scripts/short-video && npx vitest run` + 仓库级 lint/tsc/build
- [ ] 渲染 smoke：对每个迁移后的 content 生成最后一帧 HTML，确认无 "undefined"、含 `brand-logo-large`/`stamp-box`/`fade-to-black`

## 收尾（Spec Step 8）

- [ ] `docs/video-workflow.md`：CTA logo 200px → 130px 标准 + ctaScene 加入共享模板清单
- [ ] 归档 `docs/spec-cta-end-card-standard.md` + `docs/tickets-cta-end-card-standard.md` → `docs/archive/`，更新 `docs/archive/README.md` 与 `docs/DOCS-INDEX.md`
