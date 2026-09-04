# Spec: Source Registry Selector & MCP Fallback Fix

## Problem Statement

Three bugs in `source-registry.mjs` cause search sources to silently return 0 results:

1. XHS extractScript uses `[data-v-*]` — invalid CSS selector (CSS doesn't support wildcard attribute names)
2. XHS mcpFallback references `python -m xiaohongshu_mcp_server` — package was never installed
3. X cdpFallback extractScript uses `div.g, .Gx5Zad, .fP1Qef` — Google frontend redesign broke these class selectors

## Solution

Fix all three selector/config issues, update tests to match, verify with 10-round CDP runtime tests.

## User Stories

1. As a pipeline operator, I want XHS CDP search to return results, so that I can find Xiaohongshu posts about AI topics
2. As a pipeline operator, I want X Google cdpFallback to work, so that when X CDP fails (SPA timing), I still get x.com links as fallback
3. As a pipeline operator, I want XHS mcpFallback to point to the installed `rednote-mcp` package, so that the fallback chain is not a dead config
4. As a developer, I want tests to verify selector content (not just structure), so that silent selector breakage is caught by CI
5. As a developer, I want tests to fail when I change mcpFallback config, so that I'm forced to update them intentionally

## Implementation Decisions

- **XHS extractScript**: Replace `[data-v-*] .note-content` with `section.note-item, .note-item, .search-result-item`. The secondary selector `a[href*="/explore/"]` stays unchanged (it was already correct).
- **XHS mcpFallback**: Change from `python -m xiaohongshu_mcp_server` to `rednote-mcp --stdio`. Tool name `search_feeds` → `search_notes`. Param `keyword` → `keywords` (plural, per rednote-mcp schema).
- **X cdpFallback extractScript**: Replace `div.g, .Gx5Zad, .fP1Qef` with `h3`-based selector. New logic: find all `h3` → get parent `<a>` href → filter `x.com`/`twitter.com` URLs. `h3` is a semantic tag, unlikely to change across Google redesigns.
- **No new files** — only modify `source-registry.mjs` and `source-registry.test.mjs`.

## Testing Decisions

- **Test seam**: `source-registry.test.mjs` — existing test file, already tests source structure and config. Add assertions to existing `describe` blocks.
- **Update 3 existing assertions** that will fail due to mcpFallback change (L557-558, L601-602).
- **Add 3 new assertions**: (a) XHS extractScript doesn't contain `[data-v-*]` and contains `section.note-item`; (b) XHS mcpFallback command is `rednote-mcp`, toolName is `search_notes`, toolArgs returns `keywords` key; (c) X cdpFallback extractScript contains `h3` and doesn't contain `div.g`.
- **Runtime verification**: 10-round CDP tests for XHS and X Google, already completed with 10/10 success.

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File                                                     | Change                                                                      | Risk   | Assessment                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/short-video/lib/source-registry.mjs`            | 3 selector/config fixes (XHS extractScript, XHS mcpFallback, X cdpFallback) | Medium | Modifies existing source configs used by search-sources.mjs fallback chain. Verified: XHS CDP 10/10 success, X Google 10/10 success. mcpFallback change is config-only (rednote-mcp not functional yet, but config is correct for when it works). |
| `scripts/short-video/__tests__/source-registry.test.mjs` | Update 3 assertions + add 3 new                                             | Low    | Test-only change, no runtime impact.                                                                                                                                                                                                              |

### Section 2: Behavioral Scenarios

| #   | Scenario                                                | Expected Behavior                                                        | Risk   | Mitigation                                                                        |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------- |
| 1   | XHS CDP search with valid keyword                       | Returns 40 items (section.note-item selector)                            | Low    | Tested 10/10, 40 items/round                                                      |
| 2   | XHS CDP when user not logged in                         | loginCheckScript detects "请先登录"                                      | Low    | loginCheckScript unchanged                                                        |
| 3   | XHS mcpFallback invoked (CDP fails)                     | Spawns `rednote-mcp --stdio`, calls `search_notes` with `keywords` param | Medium | rednote-mcp search currently times out (upstream issue), but config is correct    |
| 4   | X cdpFallback invoked (CDP fails)                       | Opens Google site:x.com, extracts via h3 selector, returns 9 x.com links | Low    | Tested 10/10, 9 items/round                                                       |
| 5   | X cdpFallback when Google shows captcha                 | extractScript returns 0 results (no h3 found)                            | Low    | Falls through to mcpFallback (Grok)                                               |
| 6   | Test CI runs with updated assertions                    | All tests pass (existing + updated + new)                                | Low    | Will run `npm test` to verify                                                     |
| 7   | search-sources.mjs calls collectFromSource for xhs      | Reads updated extractScript, gets 40 results                             | Low    | search-sources.mjs reads source.extractScript dynamically, no hardcoded selectors |
| 8   | search-sources.mjs calls collectFromSource for x_search | Reads updated cdpFallback, gets 9 results when CDP fails                 | Low    | search-sources.mjs reads source.cdpFallback.extractScript dynamically             |

## Out of Scope

- Other source extractScripts (sogou_weixin, douyin, weibo, etc.) — tracked in #87
- rednote-mcp search timeout fix — upstream issue, rednote-mcp's internal headless browser is blocked by XHS anti-bot
- MCP→API migration (#90) — separate issue
- extractScript auto-fallback (#66) — separate issue
- Handoff document restructuring — handled separately

## Further Notes

- Runtime test results: `docs/research/source-layer-comparison.md`
- Commit `af75dc4` already contains the source-registry.mjs fixes; this spec adds test coverage
