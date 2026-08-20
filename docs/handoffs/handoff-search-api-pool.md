# Handoff: Search API Pool — 多搜索 API 轮转调度

> Created: 2026-08-20
> Parent discussion: `docs/research/pipeline-simplification-discussion.md` (Topic 3)
> Trigger: User wants monthly-renewing search APIs as a pool, not sequential fallback

## Context

当前管线的 fallback 链是线性的——每个层失败后走下一个。但 Jina、Tavily、mcp-search-bridge 都是"搜索类" API，且都有每月更新的免费额度。用户要求把它们做成一个 **pool**，同一层内 round-robin，额度独立消耗。

## Pool Members

| API | 免费额度 | 刷新周期 | 超额行为 | MCP 已配置 |
|-----|---------|----------|----------|-------------|
| **Jina Search** | 1M tokens/月 | 每月更新 | 降级到无 key 模式（20 RPM） | ✅ |
| **Tavily** | 1000 credits/月 | 每月1号重置 | 请求停止 | ✅ |
| **mcp-search-bridge (Grok)** | 无限（自建） | 不适用 | 无限制 | ✅ |

## What exists already

- **Jina MCP**: 已配置在 `mcopilot_mcp_settings.json`，提供 `jina_search`（关键词搜索）和 `jina_reader`（URL→Markdown）
- **Tavily MCP**: 已配置为 HTTP MCP server
- **mcp-search-bridge**: 已配置为 stdio MCP server，管线代码通过 `lib/mcp-client.mjs` spawn 调用，source-registry 中 7 个源有 `mcpFallback` 配置指向它

## What's missing (the gap)

### 1. Pool 调度器
需要一个 `SearchApiPool` 类/模块，管理三个 API 的调用和额度追踪：

```javascript
// 目标接口
class SearchApiPool {
  constructor(members) { /* [{ name, mcpToolName, priority, monthlyLimit, currentUsage }] */ }
  
  async search(keyword) {
    // 1. 按 priority + remaining quota 选最优 member
    // 2. 调用该 member 的 MCP tool
    // 3. 成功 → 返回结果
    // 4. 失败 → 尝试下一个 member
    // 5. 全失败 → throw
  }
  
  resetMonthlyUsage() { /* 每月1号重置 currentUsage */ }
  getStatus() { /* 返回各 member 的剩余额度 */ }
}
```

### 2. 额度追踪持久化
- 当前用量需要持久化（写入文件或 DB），否则重启后丢失
- 简单方案：`output/search-api-usage.json`，记录 `{ member, month, usageCount }`
- 每次调用后 increment，每月1号自动重置

### 3. source-registry 集成
- 新增 `searchApiPool` 配置字段（替代现有的 `mcpFallback`）
- 或保留 `mcpFallback` 作为单个 fallback，pool 作为更高层的 fallback

### 4. 与现有 fallback 链的关系

现有链：
```
apiSearch → CDP (extractScript) → cdpFallback (Google site:) → mcpFallback (Grok)
```

新链（加入 web_fetch + Jina Reader + Pool）：
```
Layer 0: apiSearch (API 直连) — 最快
Layer 1: web_fetch — 免费、无限制
Layer 2: Jina Reader (URL→Markdown) — JS 渲染、1M tokens/月
Layer 3: CDP extractScript — per-site 精确选择器
Layer 3b: Generic eval fallback — 通用选择器
Layer 4: Search API Pool — Jina Search + Tavily + Grok (round-robin)
```

注意 Layer 2 (Jina Reader) 和 Layer 4 (Jina Search) 用的是 Jina 的不同功能：
- Jina Reader: `r.jina.ai/{url}` — 已知 URL 提取正文
- Jina Search: 关键词搜索，发现新 URL

它们消耗同一个 token 池。

## Implementation Scope

### 改动文件
1. `scripts/short-video/lib/search-api-pool.mjs` — 新建，Pool 调度器
2. `scripts/short-video/lib/source-registry.mjs` — 新增 `searchApiPool` 配置
3. `scripts/short-video/search-sources.mjs` — `collectFromSource` 新增 Layer 1-4
4. `scripts/short-video/__tests__/search-api-pool.test.mjs` — 新建，Pool 单元测试

### 不改动的文件
- `lib/mcp-client.mjs` — 已有的 MCP 调用逻辑不变
- `lib/cdp-client.mjs` — CDP 传输层不变
- MCP 配置文件 — 三个搜索 MCP 已配置好

## Design Decisions

1. **Pool 内优先级**：Jina Search > Tavily > Grok（按免费额度从大到小）
2. **额度耗尽时**：自动降级到下一个 member，不停服务
3. **月度重置**：检查 `usage.month !== currentMonth` → 重置
4. **Pool 只用于 "关键词搜索" 场景**，不用于 "URL 提取" 场景（后者走 web_fetch → Jina Reader → CDP）

## Suggested Skills

- `implement` skill — 标准 TDD 实施
- `tdd` skill — Pool 调度器单元测试（round-robin、额度耗尽降级、月度重置）
- `writing-for-agents` skill — 更新 `docs/tools-catalog.md` 和 `docs/research/pipeline-simplification-discussion.md`

## Key References

- MCP 配置：`mcopilot_mcp_settings.json`（jina, tavily, mcp-search-bridge 三个 server）
- 管线入口：`scripts/short-video/search-sources.mjs` `collectFromSource()` 函数
- 现有 MCP 调用：`scripts/short-video/lib/mcp-client.mjs`
- Tavily 定价：https://tavily.com/pricing（1000 credits/月免费，每月1号重置）
- Jina 定价：1M tokens/月免费，每月更新
- 讨论：`docs/research/pipeline-simplification-discussion.md`
