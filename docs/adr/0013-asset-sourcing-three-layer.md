# Asset Sourcing: Three-Layer Collection Architecture

## Context

The video pipeline needs visual assets (images, videos) for each scene. Assets come from diverse sources with varying access methods:

1. **Free APIs** (Pexels, Pixabay, Unsplash, Coverr) — JSON responses, API key required
2. **Chinese news/media sites** (量子位, 机器之心, 新华网, 澎湃新闻, 雷锋网, 新智元, IT之家) — HTML scraping, no API
3. **Video platforms** (YouTube, B站, 抖音, 小红书, 微博) — yt-dlp download or CDP scraping
4. **Western social media** (X/Twitter, Reddit, Hacker News) — MCP search bridge or last30days skill
5. **WeChat** — public account articles, CDP scraping with login

Each source has different reliability, rate limits, and access requirements. A single-method approach (e.g., "scrape everything via CDP") fails because:
- API sources are faster and more reliable than scraping
- Chinese sites have anti-bot measures (滑块验证码, login walls)
- Western platforms need different access methods (API vs. MCP vs. CDP)
- Some sources are paywalled (ScrapeCreators consumes credits)

## Decision

**Three-layer collection architecture with per-source fallback chain.**

### Architecture

```
For each source, collection attempts layers in order:

  Layer 1: API direct-connect (if source has apiSearch configured)
    └── Fastest, most reliable. JSON response, no browser needed.
    └── Skipped if no API key or paidApi=true (unless --include-paid)

  Layer 2: CDP (Chrome DevTools Protocol) primary
    └── Navigates to source URL, evaluates extractScript in DOM
    └── Requires Chrome Remote Debugging + web-access skill proxy
    └── Handles login-gated sources (uses existing Chrome session)

  Layer 3: CDP fallback (Google site: search)
    └── If primary CDP extraction returns 0 results
    └── Google "site:source.com keyword" → scrape Google results

  Layer 4: MCP fallback (mcp-search-bridge / Grok)
    └── If CDP completely fails (site down, anti-bot)
    └── Uses Grok model with web search to find results
    └── Consumes API credits (SEARCH_API_KEY)
```

### Source registry

`source-registry.mjs` defines all sources (28 total) with:
- `accessMethod: { primary, fallbacks, notes }` — documents the collection strategy
- `apiSearch: { url, parser, authRequired, paidApi }` — API direct-connect config (Issue #34)
- `cdpFallback: { google site: search config }` — Google search fallback
- `mcpFallback: { MCP server config }` — Grok search fallback

### Source categories (28 sources)

| Category | Count | Examples | Primary method |
|----------|-------|---------|---------------|
| news | 7 | 量子位, 机器之心, 新华网, 澎湃新闻, 雷锋网, 新智元, IT之家 | CDP |
| self_media | 8 | 微信公众号, 知乎, 36氪, 虎嗅, 少数派, 极客公园, 钛媒体, 量子位 bitwise | CDP |
| western | 4 | X/Twitter, Reddit, Hacker News, TechCrunch | MCP |
| general | 3 | Google News, Bing News, Baidu News | CDP |
| last30days | 5 | Reddit, YouTube, TikTok, HN, Polymarket | last30days skill |
| wechat | 1 | 微信公众号 | CDP |

## Why not alternatives

### Single-method (CDP-only)
- **Pros:** One code path, simple.
- **Cons:** API sources are faster and cheaper. Chinese sites with anti-bot would block CDP. Western platforms don't have China-optimized search pages. No fallback when a site is down.
- **Decision:** Multi-layer is more resilient. API-first saves browser resources for sources that truly need CDP.

### Single-method (API-only)
- **Pros:** Fastest, most reliable.
- **Cons:** Most Chinese sources have no public API. yt-dlp sources need video download, not API. Some sources require login (WeChat), which API cannot handle.
- **Decision:** Not all sources have APIs. Need CDP for the long tail.

### External service (ScrapeCreators, BrightData)
- **Pros:** One API for all sources. Handles anti-bot, CAPTCHA, login.
- **Cons:** Paid (consumes credits per call). Vendor lock-in. Rate limits. Not all sources covered.
- **Decision:** ScrapeCreators is configured as an optional API source with `paidApi: true` — skipped by default, enabled with `--include-paid` flag. Not primary.

## Trade-offs

| Aspect | Three-layer | Single-method |
|--------|------------|---------------|
| **Reliability** | High (3 fallbacks) | Single point of failure |
| **Speed** | Variable (API fast, CDP slow) | Consistent |
| **Complexity** | High (3 code paths per source) | Low |
| **Cost** | $0 (free APIs + CDP) + optional paid | Varies |
| **Coverage** | 28 sources, multiple access methods | Limited |
| **Maintenance** | Per-source config in registry | Simpler |

### `paidApi` flag
Sources with `paidApi: true` (e.g., ScrapeCreators) are skipped by default. The `--include-paid` flag must be explicitly passed to include them. This prevents accidental credit consumption.

## Consequences

- `search-sources.mjs` is the entry point: `--trend` (homepage scanning) or `--research` (keyword search).
- Collection layer order is enforced in `collectFromSource()`: API → CDP → cdpFallback → mcpFallback.
- Chrome Remote Debugging must be enabled for CDP sources. `web-access` skill proxy at `localhost:3456`.
- mcp-search-bridge server at `~/mcp-search-bridge/server.js` for MCP fallback. Requires `SEARCH_BASE_URL`, `SEARCH_API_KEY`, `SEARCH_MODEL` env vars.
- Issue #33 (replace regex filter/classify with LLM) and Issue #34 (API direct-connect) are open enhancements.
- Adding a source = adding a collector object to `source-registry.mjs`. No code changes needed in `search-sources.mjs`.
- Asset sourcer (`asset-sourcer.mjs`) uses a separate set of sources for visual asset download (Pexels, Unsplash, Pixabay, Coverr, Wikimedia, YouTube, B站, news sites). Same three-layer pattern but focused on image/video download, not article collection.
