# Tickets: Widget 技术债清理（English-only + hover 键盘等价物）

依赖边: T1（静态测试红）→ T2（English-only 实现）→ T3（键盘等价实现）→ T4（verify 脚本新 probe 红→绿）→ T5（全量验证 + 提交）。T1 静态断言在实现前必须红。

## T1. 静态契约测试先行（red）

- [x] `a11y-container-contract.test.ts` 新增 English-only 断言：9 个 view 无 `LangToggle`/`lang` prop/`isZh`/`"zh"` 分支；数据文件无 `\w+Zh` 字段
- [x] 新增键盘契约断言：6 个 hover widget 文件含 `tabIndex={0}`/`onFocus`/`onBlur`/`aria-expanded`/`focus-visible:outline-brand`（后改为 button 或 tabIndex 二选一，因 3 个视图转真 button）
- [x] benchmark/identity-bleed/agi-roadmap 加入 button 配方列表
- [x] 跑 vitest 确认新增断言红（9 failed / 9 passed；preview 同步 9 FAIL 确认红）

## T2. English-only 实现

- [x] 删除 shared/lang-toggle.tsx；deepseek/i18n.ts 拍平 en-only
- [x] 5 个 deepseek view（pricing/cloud/talent/companies/funding）去 toggle/state/isZh 分支
- [x] 4 个无 toggle view（api-pricing/oss/agi/vision）去 lang prop + zh 三元
- [x] 6 个含 zh 数据文件清理（pricing/people/keywords/funding/companies + vision-keywords/data/keywords.ts）；oss/api-pricing/agi 数据无 zh 字段（条件行满足）
- [x] registry.ts 类型 → ComponentType；posts.$slug.tsx + widgets.$name.tsx 调用点 `<Widget />`
- [x] vitest 静态断言转绿（18/18）

## T3. hover 键盘等价实现

- [x] benchmark-controversy / identity-bleed：行 → button + focus/blur/click + aria-expanded
- [x] minimax-stock：SVG circle tabIndex + aria-label + focus/blur/click
- [x] vision-keywords：span 补 onFocus/onBlur/click + aria-expanded（cloud-view 同步补齐）
- [x] agi-roadmap：卡片 → button + focus/blur/click
- [x] oss-comparison：tr tabIndex + focus/blur + focus 类
- [x] 全部加 `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`
- [x] review follow-up：7 个视图的三通道状态抽取为 `shared/use-hover-pin.ts`（`useHoverPin<T>()`）

## T4. verify-widget-a11y.mjs 运行时验证（red → green）

- [x] probeKeyboard 泛化：接受 button / tabIndex / role=button 元素（SVG className 兼容：`getAttribute("class")`）
- [x] 7 个新 per-widget probe（6 hover + cloud）：focus 显示 → blur 隐藏 → click 固定/取消
- [x] 实现前跑 preview 确认新断言红（无 focusable 交互元素）
- [x] 实现后 preview 144 PASS / 0 FAIL（2 遍稳定）；文章模式 17 PASS / 0 FAIL（2 遍稳定）；SKIP 仅剩 /widgets 列表页良性项
- [x] 探针限定 `[data-widget]` 作用域（两路由 wrapper 加 `data-widget`）+ settle 等待；修复文章页 header 菜单按钮误匹配与 marker 撞正文

## T5. 全量验证 + 提交

- [x] lint + tsc + build 全过；vitest 全量 1057/1057 无回归
- [x] code-review 双轴（Standards：3 修 2 记录；Spec：1 补记 1 记录，见 spec「Code Review Follow-ups」）
- [ ] commit + push；spec/tickets 归档 docs/archive/ + README 更新
- [ ] GitHub issue #20 记录完成；content-pipeline.md 语言规则段落核对（如需补充说明）
