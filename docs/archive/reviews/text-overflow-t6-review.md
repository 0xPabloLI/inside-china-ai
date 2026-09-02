# T6 Code Review — HTML（Playwright）路径退役（#147）

- 日期：2026-09-02
- 审查范围：`git diff ee93a74...830cd44`（单 commit `830cd44`，75 files，+660/−5875）
- 方式：双轴并行 sub-agent（Standards + Spec）

## Standards

### 硬性违反（已修复，commit `9914777`）

1. **SKILL.md symlink 自相矛盾** — L397 "(versioned output + symlink)" vs L157 "no symlink" vs L442 symlink 段。违反「文档审查三查」跨章节矛盾。✅ 已修：统一为 no symlink，L442 整段改写（auto-delete 声明在现行代码中无对应实现，一并移除）。
2. **CONTEXT.md / SKILL.md 残留 fallback 描述** — CONTEXT.md L121 仍称 Playwright "Kept as a fallback path"；SKILL.md L366 仍要求 `npx playwright install chromium`。✅ 已修：CONTEXT.md 改为 retired + 指向 `retired-html-path/`；SKILL.md 移除 playwright install。
3. **media-asset-management.md 指针悬空** — L81-82 引用已归档的 `lib/scene-templates.mjs logoSvg()`。✅ 已修：重新指向 Remotion 消费方（HookScene / CtaScene / visuals.tsx）。

### 硬性违反（记录在案，不拆分）

4. **B-roll prompt 维度检查搭车提交** — `checkBrollPromptDimensions`（scene-rules.mjs ~110 行 + ~170 行测试 + video-workflow.md 段落）与退役无关，混入 `830cd44`。违反 Commit Cadence 规则 1。**处置**：不拆分——功能 warn 级、测试全绿、spec 已在盘上（`docs/specs/spec-broll-prompt-dimension-check.md`，untracked，属 #166 工作流），拆 75-file commit 风险大于收益。此发现同时被 Spec 轴标记。

### 判断题（已修复）

5. **ADR-0010 未作废注** — 文中 "kept as legacy fallback" 已失实。✅ 已修：文首加 Status update 注记（decision 59, #147）。DOCS-INDEX 的 "Active" 无需改——指 ADR 决策本身仍生效。

### 判断题（不修）

6. **`void opts;` 死参数**（scene-rules.mjs）— 属搭车的 b-roll 检查代码，随 #166 工作流处理。

## Spec

- **(a) 缺失项：无** — T6 checklist 5 条逐项核实全部落地（renderer-guard 7 tests 双入口接线、6 积木 git mv、17+4 删除零残留、回归哨兵 2645/3=#153 存量、9 份文档同步）。
- **(b) 范围外：1 项** — 即 Standards #4 的 b-roll 检查搭车。
- **(c) 实现偏差：计数口径** — "8 个 HTML 绑定测试" 实为 7 个整文件删除 + infra-paths.test.mjs 内删 1 个，无实质问题。

## 结论

- Standards：6 findings（4 hard，2 judgement）— 5 已修，1 随 #166 处理
- Spec：3 findings（0 缺失，1 scope creep，1 口径）— scope creep 记录在案不拆分
