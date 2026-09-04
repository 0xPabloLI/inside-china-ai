# Tickets: Video Download Layer (VDL)

> Spec: `docs/spec-video-download-layer.md`
> Issue: #75

## T-VDL-1: DownloadResult type + URL normalizer

**Dependencies**: None (foundation)

**Deliverables**:

- [ ] `scripts/short-video/lib/url-normalizer.mjs` — `canonicalizeUrl(url)` sync function
- [ ] `scripts/short-video/lib/video-downloaders.mjs` — module skeleton with DownloadResult JSDoc typedef + exports
- [ ] `scripts/short-video/__tests__/video-downloaders.test.mjs` — test file created

**Tests (red → green)**:

- [ ] `canonicalizeUrl` strips query string and fragment
- [ ] `canonicalizeUrl` normalizes http:// to https://
- [ ] `canonicalizeUrl` normalizes trailing slash
- [ ] `canonicalizeUrl` lowercases hostname
- [ ] `canonicalizeUrl` returns "" for null/undefined/empty input (VD-09)
- [ ] `canonicalizeUrl` handles already-canonical URLs idempotently (VD-10)
- [ ] DownloadResult type is exported as JSDoc typedef

## T-VDL-2: Strategy selector

**Dependencies**: T-VDL-1 (needs canonicalizeUrl + DownloadResult)

**Deliverables**:

- [ ] `selectStrategy(url, options)` function in `video-downloaders.mjs`
- [ ] Priority routing: direct-media → ytdlp → cobalt → unsupported
- [ ] Direct media URL detection (`.mp4` extension + known CDN domains)
- [ ] YouTube/B站 URL detection

**Tests**:

- [ ] Direct media URL (.mp4) → selects direct-http strategy (VD-01)
- [ ] YouTube URL → selects ytdlp strategy (VD-02)
- [ ] B站 URL → selects ytdlp strategy
- [ ] Unknown public URL → selects cobalt strategy
- [ ] null/empty URL → returns {status:"skipped", reason:"empty-url"} (VD-09)
- [ ] Same URL with different query params → same canonical URL (VD-10)

## T-VDL-3: DirectHttp + Ytdlp adapter wrappers

**Dependencies**: T-VDL-1 (needs DownloadResult), T-VDL-2 (needs strategy selector)

**Deliverables**:

- [ ] `DirectHttpAdapter.download(url, {fetchFn})` — wraps downloadAsset pattern
- [ ] `YtdlpAdapter.download(url)` — wraps downloadYtdlp pattern
- [ ] Buffer validation: >1KB check, <20MB check (VD-13)
- [ ] MIME validation: reject non-video/* (VD-14)

**Tests**:

- [ ] DirectHttp downloads .mp4 → returns {status:"downloaded"} with buffer (VD-01)
- [ ] DirectHttp file <1KB → returns {status:"failed", reason:"file-too-small"}
- [ ] DirectHttp file >20MB → returns {status:"skipped", reason:"exceeds-size-limit"} (VD-13)
- [ ] DirectHttp non-video MIME → returns {status:"skipped", reason:"non-video-mime"} (VD-14)
- [ ] Ytdlp YouTube URL → returns {status:"downloaded"} with buffer (VD-02)
- [ ] Ytdlp "login" error → returns {status:"failed", reason:"needs-auth", retryable:false}

## T-VDL-4: Cobalt adapter — preflight + state machine

**Dependencies**: T-VDL-1 (needs DownloadResult), T-VDL-2 (needs strategy selector)

**Deliverables**:

- [ ] `CobaltAdapter` class with `preflight()` and `download()` methods
- [ ] `GET /` preflight: fetch services list, version, turnstile check
- [ ] `POST /` with full response state machine
- [ ] Error code classification (retryable vs non-retryable)
- [ ] Auth header support (Api-Key / Bearer)
- [ ] Platform-in-services check before POST

**Tests**:

- [ ] Preflight success → adapter available, services cached (VD-04)
- [ ] Preflight connection refused → adapter unavailable, returns skipped (VD-03)
- [ ] Preflight returns turnstileSitekey → returns unsupported (VD-12)
- [ ] POST returns `tunnel` → download data.url, return downloaded (VD-04)
- [ ] POST returns `redirect` → download data.url, return downloaded (VD-04)
- [ ] POST returns `picker` → return needs-selection (VD-05)
- [ ] POST returns `local-processing` → return unsupported (VD-05b)
- [ ] POST returns `error.rate_exceeded` → return failed + retryable:true (VD-05c)
- [ ] POST returns `error.auth.*` → return failed + retryable:false (VD-05d)
- [ ] POST returns non-JSON → return failed, reason:"invalid-response" (VD-07)
- [ ] tunnel data.url fetch returns HTML → return failed, reason:"non-video-response" (VD-08)
- [ ] URL platform not in services[] → return skipped, reason:"platform-not-supported" (VD-06)
- [ ] Auth header (COBALT_API_KEY set) → included in POST headers
- [ ] Downloaded buffer >20MB → return skipped (VD-13)
- [ ] Downloaded buffer non-video MIME → return skipped (VD-14)

## T-VDL-5: Integration + env + docs

**Dependencies**: T-VDL-2, T-VDL-3, T-VDL-4

**Deliverables**:

- [ ] `downloadVideo(url, options)` — top-level orchestrator: canonicalize → selectStrategy → adapter.download → return DownloadResult
- [ ] All adapters fail → return last failed result with attempted strategies (VD-11)
- [ ] `.env.example` — add COBALT_API_URL + COBALT_API_KEY
- [ ] `docs/research/asset-source-quick-reference.md` — add VDL section
- [ ] Run full test suite — all tests green

**Tests**:

- [ ] downloadVideo(direct-media-url) → DirectHttpAdapter path (VD-01)
- [ ] downloadVideo(youtube-url) → YtdlpAdapter path (VD-02)
- [ ] downloadVideo(unknown-url, cobalt unavailable) → cobalt skipped, returns unsupported (VD-03, VD-11)
- [ ] downloadVideo(null) → returns skipped, reason:"empty-url" (VD-09)
- [ ] downloadVideo(duplicate-url) → second call returns skipped, reason:"already-attempted" (VD-10)
