# Spec: MCP Fallback for Trend Sources

> 创建于 2026-08-04。为 self-media sources 添加 MCP server fallback。

## 1. 目标

当 CDP 抓取失败时（空结果/登录过期/验证码），自动尝试通过 MCP server 获取数据。

## 2. 架构

```
collectFromSource(source, keyword)
  ├── 1. CDP primary
  │     → 成功：return articles
  │     → 失败（空/登录/验证码）：进入 step 2
  ├── 2. MCP fallback (if source.mcpFallback configured)
  │     → spawn MCP server → initialize → tools/call → parse
  │     → 成功：return articles (apply cleanTitle if needed)
  │     → 失败：进入 step 3
  └── 3. skip + warn
```

## 3. MCP Client 设计

`scripts/short-video/lib/mcp-client.mjs` — 轻量 JSON-RPC 2.0 stdio 客户端：

```javascript
export async function callMcpTool({
  command,    // e.g., "python"
  args,       // e.g., ["-m", "xiaohongshu_mcp_server"]
  toolName,   // e.g., "search_feeds"
  toolArgs,   // e.g., { keyword: "AI", limit: 20 }
  timeoutMs,  // default 30000
}) → { success: boolean, data?: any, error?: string }
```

## 4. mcpFallback 配置格式

每个 source 增加 `mcpFallback` 字段：

```javascript
{
  name: "xhs",
  // ... existing CDP fields ...
  mcpFallback: {
    command: "python",
    args: ["-m", "xiaohongshu_mcp_server"],
    toolName: "search_feeds",
    toolArgs: (keyword) => ({ keyword, limit: 20 }),
    resultMapper: (mcpResult) => mcpResult.map(item => ({
      title: item.title || item.desc || "",
      url: item.url || item.link || "",
    })),
  },
}
```

## 5. Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件                                                   | 修改内容                                       | 风险等级 | 评估                             |
| ------------------------------------------------------ | ---------------------------------------------- | -------- | -------------------------------- |
| `scripts/short-video/lib/mcp-client.mjs`               | 新建 — JSON-RPC 2.0 stdio 客户端               | Low      | 纯新建，不影响现有逻辑           |
| `scripts/short-video/lib/trend-sources.mjs`            | 追加 mcpFallback 字段到 5 个 self-media source | Low      | 纯追加字段，不修改现有字段       |
| `scripts/short-video/discover-trends.mjs`              | collectFromSource 增加 fallback 分支           | Medium   | 修改核心函数。CDP 成功时行为不变 |
| `scripts/short-video/__tests__/mcp-client.test.mjs`    | 新建 — MCP client 测试                         | Low      | 纯新建测试                       |
| `scripts/short-video/__tests__/trend-sources.test.mjs` | 追加 mcpFallback 验证                          | Low      | 纯追加测试                       |

### Section 2: Behavioral Scenarios

| #   | Scenario                    | Expected Behavior         | Risk | Mitigation                        |
| --- | --------------------------- | ------------------------- | ---- | --------------------------------- |
| M1  | CDP 成功                    | 返回 CDP 结果，MCP 不触发 | 低   | fallback 只在 CDP 失败时触发      |
| M2  | CDP 空 → MCP 成功           | 返回 MCP 结果             | 低   | collectFromSource 先 CDP 后 MCP   |
| M3  | CDP 登录过期 → MCP          | 试 MCP                    | 低   | 同 M2                             |
| M4  | MCP 未安装                  | spawn 失败 → warn + skip  | 低   | try-catch                         |
| M5  | MCP 超时                    | 30s → kill → warn         | 中   | AbortController                   |
| M6  | MCP error response          | warn + skip               | 低   | 检查 response.error               |
| M7  | CDP+MCP 都失败              | skip，不影响其他源        | 低   | 源独立                            |
| M8  | news sources 无 mcpFallback | 不尝试 MCP                | 低   | 检查 mcpFallback 字段存在性       |
| M9  | MCP 进程残留                | finally kill              | 中   | finally 块                        |
| M10 | MCP 结果需 cleanTitle       | useCleanTitle 生效        | 低   | cleanTitle 在 fallback 结果也执行 |
| M11 | MCP stdio 握手失败          | 10s 超时 → kill           | 中   | initialize 超时                   |
| M12 | TikTok Creator 无 fallback  | CDP 失败 → skip           | 低   | 无 mcpFallback 字段               |
