# Asset Sourcing: Three-Layer Collection Architecture

The video pipeline needs visual assets from diverse sources (free APIs, Chinese news sites, video platforms, western social media, WeChat). Each source has different reliability, rate limits, and access requirements. A single-method approach fails because API sources are faster but not all sources have APIs, Chinese sites have anti-bot measures, and western platforms need different access methods.

**Three-layer collection architecture with per-source fallback chain:** API direct-connect (fastest, JSON) → CDP primary (Chrome DevTools Protocol, handles login-gated sources) → CDP fallback (Google site: search) → MCP fallback (mcp-search-bridge / Grok). Each source in `source-registry.mjs` declares its access method, API config, CDP fallback, and MCP fallback.

## Considered Options

- **Single-method (CDP-only)**: One code path, but API sources are faster and Chinese sites with anti-bot block CDP.
- **Single-method (API-only)**: Fastest, but most Chinese sources have no public API and yt-dlp sources need video download.
- **External service (ScrapeCreators)**: One API for all sources, but paid (consumes credits per call). Configured as optional API source with `paidApi: true`, skipped by default.

## Consequences

- Source definitions and classification: see `docs/content-pipeline.md` → source registry section.
- Collection layer order is enforced in `collectFromSource()`: API → CDP → cdpFallback → mcpFallback.
- Chrome Remote Debugging must be enabled for CDP sources.
- Adding a source = adding a collector object to `source-registry.mjs`. No code changes needed in `search-sources.mjs`.
