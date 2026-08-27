# Asset Sourcing: Three-Layer Collection Architecture

The video pipeline needs visual assets from diverse sources (free APIs, Chinese news sites, video platforms, western social media, WeChat). Each source has different reliability, rate limits, and access requirements. A single-method approach fails because API sources are faster but not all sources have APIs, Chinese sites have anti-bot measures, and western platforms need different access methods.

**Three-layer collection architecture with per-source fallback chain:** API direct-connect (fastest, JSON) → CDP primary (Chrome DevTools Protocol, handles login-gated sources) → CDP fallback (Google site: search) → MCP fallback (mcp-search-bridge / Grok). Each source in `source-registry.mjs` declares its access method, API config, CDP fallback, and MCP fallback via the `capabilities` field — a single source of truth for all data types (articles, images, videos). `asset-sourcer.mjs` queries sources by capability (`capabilities.images`, `capabilities.videos`) instead of maintaining separate `API_SOURCES` / `YTDLP_SOURCES` / `CDP_SOURCES` arrays.

## Considered Options

- **Single-method (CDP-only)**: One code path, but API sources are faster and Chinese sites with anti-bot block CDP.
- **Single-method (API-only)**: Fastest, but most Chinese sources have no public API and yt-dlp sources need video download.
- **External service (ScrapeCreators)**: One API for all sources, but paid (consumes credits per call). Configured as optional API source with `paidApi: true`, skipped by default.

## Consequences

- Source definitions and classification: see `docs/content-pipeline.md` → source registry section.
- Collection layer order is enforced in `collectFromSource()`: API → CDP → googleSiteFallback → mcpFallback.
- Chrome Remote Debugging must be enabled for CDP sources.
- Adding a source = adding a collector object to `source-registry.mjs`. No code changes needed in `search-sources.mjs` or `asset-sourcer.mjs` — both query the same registry by capability (`capabilities.articles` / `capabilities.images` / `capabilities.videos`).
- **Dual-capability CDP sources**: All 9 CDP search sources (xinhua, thepaper, leiphone, xinzhiyuan, zhidx, google_news, bing_news, ithome, jiqizhixin) have both `capabilities.articles` and `capabilities.images`. The top-level `articleScript` returns `{ title, url: articleUrl, imageUrl }` for trend discovery; `capabilities.images.imageScript` returns `{ title, url: imageUrl, type: 'image' }` for asset sourcing. Same DOM, different field semantics.
- **Cross-stage image caching**: Trend discovery's `articleScript` extracts `imageUrl` from the same DOM as article titles — zero additional CDP evals (enrichWithImages skips articles that already have `imageUrl`). Asset sourcer's Phase 0 `loadCachedImages` consumes cached URLs from `trending-topics.json` — zero CDP requests for images already seen during trend discovery.
- **URL unification**: ithome and jiqizhixin previously had homepage URLs (no keyword search) for articles but search URLs for images. Both now use search-page URLs with `supportsKeyword: true`, so trend discovery and asset sourcing hit the same search page.
