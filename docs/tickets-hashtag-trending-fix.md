# Tickets: Hashtag Trending 修复

> Spec: `docs/spec-hashtag-trending-fix.md`

## Ticket A-1: normalizeHashtag() + 黑名单移除

> 依赖: 无
> 文件: `caption-utils.mjs`, `caption-utils.test.mjs`

### Checklist

- [x] TDD: 先写测试 — `normalizeHashtag()` 测试（空值、非字符串、前后空格、前导#、大小写、含空白）
- [x] TDD: 先写测试 — `#creatorsearchinsights` 不再被黑名单过滤
- [x] 实现 `normalizeHashtag(value)` 函数
- [x] 从 `BLACKLISTED_HASHTAGS` 移除 `#creatorsearchinsights`（变为 `[]`）
- [x] 在人工覆盖分支中用 `normalizeHashtag()` 规范化 `metadata.hashtags`
- [x] 既有 36 个测试保持通过（61/61 全绿）

## Ticket A-2: deriveHashtags() 自动派生路径重写

> 依赖: A-1
> 文件: `caption-utils.mjs`, `caption-utils.test.mjs`

### Checklist

- [x] TDD: 先写测试 — 场景 #1（无 trending → 基础回归）
- [x] TDD: 先写测试 — 场景 #2-3（trending 直接加入，tags.length < 5）
- [x] TDD: 先写测试 — 场景 #4-5（满容量替换 secondary vertical / pad）
- [x] TDD: 先写测试 — 场景 #6（无可替换标签 → 丢弃 trending）
- [x] TDD: 先写测试 — 场景 #7（最多 1 个 trending）
- [x] TDD: 先写测试 — 场景 #8（trending 与已有标签去重）
- [x] TDD: 先写测试 — 场景 #9-10（trending 规范化：大小写、空格、前导#）
- [x] TDD: 先写测试 — 场景 #11（trending 非法值过滤）
- [x] TDD: 先写测试 — 场景 #12（人工覆盖 + trending → 不注入）
- [x] TDD: 先写测试 — 场景 #14（primary entity 保护）
- [x] 实现自动派生路径：优先级分层 + 替换算法
- [x] 在自动派生路径中用 `normalizeHashtag()` 规范化所有输入
- [x] 既有 36 个测试保持通过（61/61 全绿）

## Ticket A-3: generate-caption.mjs hashtagStrategy 分类

> 依赖: A-2
> 文件: `generate-caption.mjs`

### Checklist

- [x] 在 `hashtagStrategy` 对象中新增 `trending` 分类
- [x] trending 分类逻辑：判断哪些 hashtags 来自 `metadata.trendingHashtags`
- [x] 验证 caption 生成输出格式正确

## Ticket A-4: 文档更新

> 依赖: A-1, A-2
> 文件: `docs/tiktok/tiktok-best-practices.md`

### Checklist

- [x] 更新黑名单说明：移除 `#creatorsearchinsights`，注明移除依据
- [x] 更新 trending 消费机制：说明代码如何消费 `metadata.trendingHashtags`
- [x] 更新 `caption-utils.mjs` 中 `deriveHashtags()` 的 JSDoc 注释
