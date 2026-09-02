# Review — B-roll Prompt Dimension Check

- 日期：2026-09-02 · Spec：`spec-broll-prompt-dimension-check.md` · 双轴并行 sub-agent 审查

## Standards 轴

6 findings（3 hard / 3 judgement），全部处理：

| # | 发现 | 处理 |
|---|------|------|
| 1 | `NEGATIVE_GROUP_ORDER` 违反 spec US15「加一组是一行改动」——需改两处 | **已修**：删除该数组，报告顺序改由 `Object.keys(NEGATIVE_GROUPS)` 键序决定 |
| 2 | `docs/video-workflow.md` 写「checks two of the eight」——阿拉伯数字不是八维之一，事实性错误 | **已修**：改为「one of the eight + numeral sweep」，"other seven" |
| 3 | 文档新增规则未经 writing-for-agents 路径 | **澄清**：skill 实际已加载（session 记录在案），非豁免路径 |
| 4 | 判定谓词（生成策略 + 非空 prompt）在两个检查中重复 | **已修**：抽出共享 `generatingPrompt()`，契约检查同步改用 |
| 5 | `export const NEGATIVE_GROUPS` 零消费者（死 API 面） | **已修**：改为模块内常量 |
| 6 | 函数名 `checkBrollPromptDimensions` 承诺八维、实际只查一类 + 数字 | **保留**：JSDoc 已明确「two things a machine can judge」；该名是 spec 定义的 check 名，未来扩展其他维度时语义仍成立 |

## Spec 轴

S1-S21 场景矩阵逐行核对：18 行有直接测试，3 行修正后覆盖：

- **S6 标签错位**——测试名标 S6 但断言的是 US3（fix 推荐词）；S3/S6 实为同一行为。**已修**：S3/S6 合并标注，fix 断言独立为 US3 用例。
- **S21 无自动化测试**——spec 要求 exit code + WARN 计数。**部分修**：补单测近似断言「结果永不 fail」（这是 exit code 不变的充分条件）；完整运行时验证（`verify-video.mjs --pre` 实测 PASS 63 / WARN 4 / FAIL 0、exit 0）作为一次性验证执行并记录于 ticket。
- **S4 间接覆盖**——真实 scene 8 的静默由 S20 断言（`Scene 8` 不出现在结果中），视为覆盖。

Scope creep 一项：数字提取用 `\d+(?:\.\d+)?` + 去重 + 列出具体数字（spec 只要求 `/\d/` 是否命中）。判定有益（HITL 可直接看到是哪个数字），保留。

词表一项：spec 列了 `no watermark text`，实现未含。**改 spec 而非加代码**——`\bno watermark\b` 已覆盖它，冗余词条只让词表虚胖。

## 验证

159 tests 全绿 · eslint（改动文件）通过 · `tsc --noEmit` 通过 · `npm run build` 通过 · preflight 实测 2 条新 warn、exit code 0。

## 偏差记录

全仓库 `npm run lint` 未跑（受 #164 阻塞：`experiments/.venv` 导致 45+ 分钟不收敛），改为 lint 本次改动的两个文件。
