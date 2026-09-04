# Spec: Video Download Layer (VDL)

> Issue: #75 (集成替代下载方案)
> Handoff: `docs/handoffs/handoff-video-download-breakthrough.md`
> Review: `docs/reviews/handoff-video-download-breakthrough-review-2026-08-26.md`
> Status: Spec — ready for ticketing

## 1. Goal

Build a unified video download layer (`video-downloaders.mjs`) that implements the strategy selector, Cobalt adapter, and `DownloadResult` contract. This is the **minimum viable delivery** for #75 — the foundation that all future platform adapters build on.

### Out of scope (tracked in #75 as follow-up tasks)

- Platform adapters: douyin-share, tiktok-cdp-detail, weibo-visitor-api, rednote-mcp, cdp-generic
- Cobalt Docker deployment + live smoke test
- `asset-sourcer.mjs` integration (渐进替换 — adapter layer stays independent until integration ticket)
- `source-registry.mjs` schema changes (independent adapter registry, no registry modification)

## 2. Architecture

### 2.1 Module layout

```
scripts/short-video/lib/
  video-downloaders.mjs    (NEW — main module)
    ├── DownloadResult type (unified output contract)
    ├── StrategySelector    (priority-based adapter router)
    ├── CobaltAdapter       (Cobalt HTTP API adapter)
    ├── DirectHttpAdapter   (wrapper of existing downloadAsset())
    ├── YtdlpAdapter        (wrapper of existing downloadYtdlp())
    └── AdapterBase         (shared interface + helpers)
  url-normalizer.mjs        (NEW — URL canonicalization)
  asset-sourcer.mjs          (UNCHANGED — no integration in this delivery)
  source-registry.mjs        (UNCHANGED — no schema changes)
```

### 2.2 DownloadResult contract

All adapters return the same object. No adapter writes files directly — the caller (future integration with asset-sourcer.mjs) handles file verification and persistence.

```js
/**
 * @typedef {Object} DownloadResult
 * @property {"downloaded"|"skipped"|"needs-selection"|"unsupported"|"failed"} status
 * @property {string} strategy - adapter ID: "direct-http"|"cobalt"|"ytdlp"
 * @property {string} source - source name or "unknown"
 * @property {string} sourceUrl - canonical public source URL
 * @property {string} [finalUrl] - resolved media URL (not persisted if contains secrets)
 * @property {string} [mimeType] - e.g. "video/mp4"
 * @property {string} [extension] - e.g. "mp4"
 * @property {number} byteLength - 0 if not downloaded
 * @property {number} durationMs - 0 if unknown
 * @property {{adapterVersion: string, authenticated: boolean}} provenance
 * @property {string} [reason] - machine-readable failure/skip reason
 * @property {Buffer} [buffer] - downloaded data (only when status="downloaded")
 * @property {boolean} [retryable] - for status="failed", whether a retry makes sense
 */
```

### 2.3 Strategy selector

Priority-based routing (NOT Cobalt-first). The selector examines the URL and routes to the appropriate adapter:

```
URL → canonicalizeUrl(url)
  1. Direct media URL (*.mp4, known CDN domains like cdn.pexels.com)
     → DirectHttpAdapter
  2. YouTube/B站 URL
     → YtdlpAdapter
  3. Unknown public URL + Cobalt available + URL platform in services
     → CobaltAdapter
  4. Cobalt unavailable / platform not in services
     → return {status: "unsupported", reason: "no-adapter"}
```

### 2.4 Cobalt adapter

#### Preflight (GET /)

On first use, calls `GET /` to retrieve:

- `cobalt.services[]` — supported platform list
- `cobalt.version` — for provenance
- `cobalt.url` — instance URL

If preflight fails (network error, non-200), adapter marks itself `unavailable` and all subsequent calls return `{status: "skipped", reason: "cobalt-unavailable"}`.

#### POST / response handling (complete state machine)

| Response status    | Action                                  | DownloadResult.status                                    |
| ------------------ | --------------------------------------- | -------------------------------------------------------- |
| `tunnel`           | Download `data.url` via HTTP fetch      | `downloaded` (with buffer)                               |
| `redirect`         | Download `data.url` via HTTP fetch      | `downloaded` (with buffer)                               |
| `picker`           | Do not auto-select                      | `needs-selection`                                        |
| `local-processing` | Not implemented (requires FFmpeg remux) | `unsupported` (reason: `local-processing-not-supported`) |
| `error`            | Classify error code                     | `failed` (with retryable flag)                           |

#### Error classification

| Error code pattern        | Category            | retryable |
| ------------------------- | ------------------- | --------- |
| `error.api.rate_exceeded` | rate-limited        | true      |
| `error.api.auth.*`        | requires-auth       | false     |
| `error.api.fetch.*`       | fetch-error         | false     |
| `error.api.link.*`        | invalid-url         | false     |
| `error.api.content.*`     | content-unavailable | false     |
| other                     | unknown-error       | false     |

#### Preflight services matching

Before POST, check if the URL's platform is in `cobalt.services[]`. If not, skip POST and return `{status: "skipped", reason: "platform-not-supported-by-cobalt"}`.

#### Auth handling

- `COBALT_API_URL` — instance URL (default: `http://localhost:3000`)
- `COBALT_API_KEY` — optional API key (for instances with auth enabled)
- If preflight returns `turnstileSitekey`, adapter returns `{status: "unsupported", reason: "cobalt-requires-turnstile"}` (cannot solve challenge programmatically)

### 2.5 URL normalizer

```
url-normalizer.mjs
  ├── canonicalizeUrl(url)     — SYNC: strip query, fragment, normalize protocol
  └── resolveRedirects(url)    — ASYNC: follow short-link redirects (future, stub for now)
```

Sync `canonicalizeUrl`:

- Normalize `http://` → `https://`
- Strip query string (`?utm_source=...&from=...`)
- Strip fragment (`#section`)
- Normalize trailing slash
- Lowercase hostname

Async `resolveRedirects`: stub that returns input unchanged. Real implementation deferred — short-link resolution needs network requests with timeout.

### 2.6 Existing function wrappers

`DirectHttpAdapter` wraps `downloadAsset()` from `asset-sourcer.mjs`:

- Calls `downloadAsset(url, destPath, headers)` with a temp path
- Reads the file into a Buffer
- Returns `DownloadResult` with `status: "downloaded"`
- On failure, returns `{status: "failed", reason: error.message}`

`YtdlpAdapter` wraps `downloadYtdlp()` from `asset-sourcer.mjs`:

- Calls `downloadYtdlp(url, destPath)` with a temp path
- Same Buffer read pattern
- On `error.includes("login")`, returns `{status: "failed", reason: "needs-auth", retryable: false}`

Both wrappers accept `fetchFn` parameter for dependency injection (used by Cobalt adapter). The wrappers themselves use the existing sync functions directly.

## 3. Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File                                            | Modification                                                                      | Risk | Assessment                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------- |
| `scripts/short-video/lib/asset-sourcer.mjs`     | **None** — wrappers import `downloadAsset`/`downloadYtdlp` but do not modify them | Low  | No behavior change. Verified by existing tests still passing. |
| `scripts/short-video/lib/source-registry.mjs`   | **None** — independent adapter registry                                           | Low  | No schema change. #77 audit unaffected.                       |
| `.env.example`                                  | Add `COBALT_API_URL` and `COBALT_API_KEY` entries                                 | Low  | Pure addition, no existing env vars changed.                  |
| `docs/research/asset-source-quick-reference.md` | Add VDL section documenting adapter layer + Cobalt status                         | Low  | Documentation update only.                                    |

### Section 2: Behavioral Scenarios

| #      | Scenario                                                            | Expected Behavior                                                                                         | Risk   | Mitigation                                                           |
| ------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| VD-01  | Direct media URL (`https://cdn.pexels.com/videos/xxx.mp4`)          | DirectHttpAdapter downloads via HTTP, validates >1KB, returns DownloadResult with buffer + mimeType       | Low    | Wrapper preserves existing downloadAsset() behavior                  |
| VD-02  | YouTube/B站 URL                                                     | YtdlpAdapter wraps downloadYtdlp(), returns buffer or failed with reason                                  | Low    | No change to yt-dlp params (20MB/8s limits preserved)                |
| VD-03  | Cobalt not running (connection refused)                             | Preflight GET / fails, adapter marks unavailable, returns {status:"skipped", reason:"cobalt-unavailable"} | Low    | Strategy selector continues to other adapters or returns unsupported |
| VD-04  | Cobalt returns `tunnel` or `redirect`                               | Download data.url via fetch, validate MIME/size, return {status:"downloaded"} with buffer                 | Medium | Validate response is video (MIME check), reject HTML/auth pages      |
| VD-05  | Cobalt returns `picker`                                             | Return {status:"needs-selection"} — no auto-select                                                        | Low    | Caller knows to skip or prompt                                       |
| VD-05b | Cobalt returns `local-processing`                                   | Return {status:"unsupported", reason:"local-processing-not-supported"}                                    | Low    | Strategy selector can fallback to ytdlp adapter                      |
| VD-05c | Cobalt returns `error` with `error.api.rate_exceeded`               | Return {status:"failed", retryable:true, reason:"rate-limited"}                                           | Low    | Strategy selector knows to try different adapter, not retry Cobalt   |
| VD-05d | Cobalt returns `error` with `error.api.auth.*`                      | Return {status:"failed", retryable:false, reason:"requires-auth"}                                         | Low    | No retry, record in report                                           |
| VD-06  | Cobalt preflight succeeds but URL platform not in services[]        | Return {status:"skipped", reason:"platform-not-supported-by-cobalt"}                                      | Low    | Skip POST, save a failed request                                     |
| VD-07  | Cobalt returns non-JSON or HTML (auth page, 500 error page)         | Parse fails, return {status:"failed", reason:"invalid-response", retryable:false}                         | Medium | Catch JSON.parse error, check Content-Type header                    |
| VD-08  | Cobalt returns `tunnel` but data.url fetch returns HTML (auth page) | Detect via Content-Type header, return {status:"failed", reason:"non-video-response"}                     | Medium | Check Content-Type before accepting buffer                           |
| VD-09  | URL is `null`, `undefined`, or empty string                         | canonicalizeUrl returns "", strategy selector returns {status:"skipped", reason:"empty-url"}              | Low    | Guard at entry point                                                 |
| VD-10  | Same canonical URL appears twice (query params differ)              | canonicalizeUrl normalizes both to same string, caller deduplicates                                       | Low    | URL-level dedup at strategy selector                                 |
| VD-11  | All adapters fail or skip                                           | Strategy selector returns last failed result with all attempted strategies in reason                      | Low    | Caller (future asset-sourcer integration) records in report          |
| VD-12  | Cobalt preflight returns `turnstileSitekey` (challenge required)    | Return {status:"unsupported", reason:"cobalt-requires-turnstile"}                                         | Low    | Cannot solve challenge programmatically, skip                        |
| VD-13  | Downloaded buffer > 20MB (existing yt-dlp limit)                    | Reject, return {status:"skipped", reason:"exceeds-size-limit"}                                            | Low    | Enforce consistent size limit across all adapters                    |
| VD-14  | Downloaded buffer MIME is not video/*                               | Reject, return {status:"skipped", reason:"non-video-mime"}                                                | Low    | Magic-number or Content-Type check                                   |

## 4. Environment Variables

| Variable         | Required | Default                 | Description                                 |
| ---------------- | -------- | ----------------------- | ------------------------------------------- |
| `COBALT_API_URL` | No       | `http://localhost:3000` | Cobalt instance URL                         |
| `COBALT_API_KEY` | No       | (none)                  | Optional API key for auth-enabled instances |

Stored in `.env.local` (gitignored). `.env.example` documents the keys with placeholder values.

## 5. Test Strategy

- **Unit tests**: `__tests__/video-downloaders.test.mjs` — all adapters tested with mock `fetchFn`
- **No real network calls**: Cobalt responses are mocked via dependency-injected `fetchFn`
- **No real cookies/sessions**: DirectHttp and Ytdlp adapters tested via mock buffers
- **Coverage**: Every row in the Scenario Matrix (VD-01~VD-14) has at least one test
- **Framework**: vitest (`npm test`)

## 6. Dependencies

- **No new npm dependencies** — uses existing `fetch` (Node 18+ built-in) and existing `downloadAsset`/`downloadYtdlp` functions
- **No Docker required** — Cobalt adapter handles unavailable instance gracefully
- **No CDP required** — cdp-generic adapter is out of scope

## 7. Issue Tracking

- This delivery: #75 first batch (strategy selector + Cobalt adapter + DownloadResult contract)
- Follow-up (in #75 issue body): platform adapters (douyin-share, tiktok-cdp-detail, weibo-visitor-api, rednote-mcp, cdp-generic)
- Dependency: #77 (source capability audit) — not blocked by this work (independent adapter registry)
- Coordination: #115 (downloadCandidate helper) — future integration point
- Coordination: #114 (SVE video extraction) — future consumer of this adapter layer
