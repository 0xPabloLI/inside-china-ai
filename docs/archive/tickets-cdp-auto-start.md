# Tickets: CDP Auto-Start (#116)

**Spec**: `docs/spec-cdp-auto-start.md`
**Issue**: #116

## Ticket 1: `findCdpProxyScript()` + `ensureCdpProxy()` in cdp-client.mjs

**Dependencies**: none
**Files**: `scripts/short-video/lib/cdp-client.mjs`, `scripts/short-video/__tests__/cdp-client.test.mjs`

### Tasks

- [x] Write tests for `findCdpProxyScript` (scenario 3: not found, 3b: found in skill dir)
- [x] Write tests for `ensureCdpProxy` (scenario 1: already running, 2: start success, 4: timeout, 3: script not found)
- [x] Implement `findCdpProxyScript()` — search candidate paths, return first existing or null
- [x] Implement `ensureCdpProxy(opts)` — check running → find script → spawn detached → health retry → return boolean
- [x] Add `CDP_PROXY_PORT` env var support (module-level, already exists as `CDP_BASE` constant)
- [x] Verify all tests pass

### Scenario coverage

| Scenario                             | Test                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------ |
| 1 (proxy running)                    | mock fetch `/targets` → ok → return true, no spawn                       |
| 2 (start success)                    | mock fetch fail → mock existsSync → mock spawn → mock /targets ok → true |
| 3 (script not found)                 | mock existsSync all false → return false                                 |
| 4 (timeout)                          | mock fetch fail → spawn → /targets always fail → return false            |
| 8 (proxy running but /targets error) | mock /targets non-ok → attempt start                                     |

## Ticket 2: Wire `ensureCdpProxy()` into `search-sources.mjs main()`

**Dependencies**: Ticket 1
**Files**: `scripts/short-video/search-sources.mjs`

### Tasks

- [x] Import `ensureCdpProxy` from `cdp-client.mjs`
- [x] Replace CDP check block (L434-453) with `await ensureCdpProxy()` call
- [x] Replace `process.exit(1)` with graceful degradation (warning + continue)
- [x] Verify existing tests still pass (search-sources tests if any)
- [ ] Manual smoke test: run without CDP → see graceful warning, not crash

### Scenario coverage

| Scenario              | Verification                                                   |
| --------------------- | -------------------------------------------------------------- |
| 5 (all MCP/API)       | ensureCdpProxy false → mcpOrApiSources check → continue        |
| 6 (mixed, proxy fail) | cdpAvailable=false → collectFromCdp returns [] → API continues |
| 7 (proxy success)     | cdpAvailable=true → CDP sources work normally                  |
