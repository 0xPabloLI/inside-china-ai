# Tickets: Video Guard 固化 + Widget A11y + 容器统一

依赖边: T1 → (无) → 共享渲染环境; T2/T3 独立可并行; T4 独立。全部 ticket 完成后统一 Runtime Verify（lint + build + tsc + Playwright），一次 commit + push。

状态: **全部完成 2026-08-07**（含 Review 修复轮: news-coverage outline-offset 统一、api-pricing isActive 提取、CLI 契约测试）

## T1. scene-rules 严格化（FAIL + --long-form 豁免）

- [x] `lib/scene-rules.mjs`: `checkSceneCount(scenes, opts)`、`checkVoiceoverWordCount(scenes, opts)` 超限默认 `fail`；`opts.longForm` 时降级 `warn`；fix 文案含拆分建议
- [x] `runAllSceneDataChecks(scenes, seriesMeta, opts)` 透传 opts
- [x] `verify-video.mjs`: 解析 `--long-form`，透传，更新 Usage 注释
- [x] 单元测试: T1 矩阵 T1-1..T1-12（scene-rules.test.mjs 改 3 断言 + 新增 7 用例；含边界 6/10/180/181）
- [x] CLI 契约测试: verify-guard-cli.test.mjs（T1-10 exit 1 / T1-11 --long-form exit 0 / T1-12 合规 exit 0）+ content/_test-fixtures/overlimit fixture
- [x] 验收: scene-rules 78/78 绿 + CLI 3/3 绿；`verify --pre --content distillation/pt1` 仍 0 fail(exit 0)；`verify --pre --content deepseek` 现 fail(exit 1，符合预期)；`--long-form` 版本 exit 0

## T2. Widget A11y（5 组件 + 验证脚本）

- [x] funding-view bar: `aria-pressed`
- [x] companies-view: `aria-expanded` + focus-visible
- [x] news-coverage-view 圆点: `aria-label` + `aria-pressed` + focus-visible（Review 轮: offset-1 → offset-2 统一配方）
- [x] moonshot-funding-view bar: `aria-pressed` + focus-visible
- [x] api-pricing-view 公司按钮: `aria-pressed` + focus-visible（Review 轮: isActive 变量消除重复表达式）
- [x] 新建 `scripts/verify-widget-a11y.mjs`（Playwright，T2 矩阵全覆盖，含键盘焦点 + 点击回归 + 存在性探测）+ `src/components/widgets/a11y-container-contract.test.ts` 静态契约（10 用例，覆盖未发布 widget）
- [x] 验收: 脚本 red → green（初始 red 7 FAIL → 修复后 14 PASS / 0 FAIL / 16 SKIP）

## T3. Widget 容器统一

- [x] 外层 4 文件: 删除冗余自容器（用户决定），Fragment 包裹，路由 wrapper 拥有卡片；Playwright T3-1 断言 wrapper(bg-card+my-10) 存在 + 无 my-6 残留
- [x] 内层: funding /50→/30; companies 卡片 → `bg-muted/30 border-border/60`; talent rounded-xl×2 → rounded-lg（+bg 统一）; identity-bleed /40→/30; api-pricing key insight /50→/30; vision freq bar /50→/30; oss chips /40→/30; news-coverage 政治边框 `purple-500/30` → `border-border/60`
- [x] 排除项回归: LangToggle / pricing 分段控件保持 /40
- [x] 验收: 静态 grep 无残留 + Playwright 断言全绿（14 PASS/0 FAIL）+ tsc/build 过关

## T4. compare lint 回归核实

- [x] `npx eslint src/routes/compare.deepseek-vs-qwen-vs-glm-4.tsx` → 0 problems（无代码改动）
- [ ] 若 >0: 记录问题并修复（追加到本 ticket）— N/A，0 problems
- [x] 验收: T4 矩阵
