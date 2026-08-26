# Code Review: Hashtag Trending Fix

> 审阅日期：2026-08-26
> 审阅对象：`caption-utils.mjs`、`generate-caption.mjs`、`caption-utils.test.mjs`、`tiktok-best-practices.md`
> Spec: `docs/spec-hashtag-trending-fix.md`

## Standards Axis（代码规范审查）

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 函数单一职责 | ✅ Pass | `normalizeHashtag` 只做规范化，`deriveHashtags` 只做标签选择 |
| 纯函数 | ✅ Pass | 无副作用，无 IO，可独立测试 |
| JSDoc 完整 | ✅ Pass | 新增函数有完整 JSDoc，含参数/返回值说明 |
| TypeScript + functional style | ✅ Pass | 函数式组件，无 class，2-space 缩进 |
| camelCase / PascalCase | ✅ Pass | 变量 camelCase，常量 UPPER_SNAKE |
| 既有测试不回归 | ✅ Pass | 42 个既有测试全绿 + 19 个新测试全绿 = 61/61 |
| 测试覆盖场景矩阵 | ✅ Pass | 15 个行为场景 + 8 个 normalizeHashtag 测试全部覆盖 |

## Spec Axis（Spec 对齐审查）

| Spec 要求 | 实现状态 | 验证方式 |
|-----------|---------|---------|
| normalizeHashtag: trim + 去# + 小写 + 拒绝空值/空白 | ✅ Done | T1 测试组（8 个用例） |
| #creatorsearchinsights 移除黑名单 | ✅ Done | `BLACKLISTED_HASHTAGS = []` + T2 测试组 |
| 优先级分层：core/brand/primary/secondary/pad/trending | ✅ Done | 代码 L446-L491 |
| 满容量替换：优先 secondary vertical，其次 pad | ✅ Done | T3-4 测试 |
| Primary entity 保护：companies[0] 不可替换 | ✅ Done | T3-12 测试 |
| 人工覆盖锁定：不注入 trending | ✅ Done | T3-11 测试 |
| Trending 最多 1 个 | ✅ Done | T3-7 测试 |
| Trending 规范化 | ✅ Done | T3-9, T3-10 测试 |
| Trending 去重 | ✅ Done | T3-6, T3-8 测试 |
| generate-caption.mjs hashtagStrategy.trending | ✅ Done | 代码 L108-L119 |
| tiktok-best-practices.md 黑名单说明更新 | ✅ Done | 文档已更新 |

## 发现的问题

### 无 P0/P1 问题

### Minor（不阻塞合入）

1. **第 521 行缩进不一致**：`if` 语句前有一个多余空格。不影响功能，建议修但不阻塞。
2. **`scenes` 参数在 `deriveHashtags` 中未使用**：保持 API 兼容性（与 `deriveTitle`/`deriveDescription` 一致的签名），合理保留。

## 结论

**通过**。代码符合项目规范，满足 spec 全部要求，测试覆盖场景矩阵所有行。既有功能无回归。
