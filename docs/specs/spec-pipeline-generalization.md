# Spec: Pipeline Generalization — Verification Intelligence, Media Upscale, Currency Auto-fix, Layout & Chart Template

> Created: 2026-08-19
> Status: Ready for implementation
> Source: Grill session 3 rounds, 2026-08-19
>
> **后续变动注记（2026-09-01）**：本 spec 中关于 Playwright 渲染路径的保留/回退设计（§11、§13-14、Out of Scope）已被决策 59 推翻——HTML/Playwright 路径已全部退役并归档到 `scripts/short-video/retired-html-path/`，`--playwright` 旗标现为 fail-fast（`lib/renderer-guard.mjs`）。涉及 `scenes.mjs` / `scene-templates.mjs` 的模板改动项对应物现在是 `remotion/src/` 场景组件。

## Problem Statement

The short-video pipeline has 10 systemic issues that affect every video, not just one. They span verification logic, media quality, currency compliance, layout, and scene templates. Each was surfaced during the Unitree IPO video production but root-caused to pipeline-level code.

## Solution

10 targeted fixes to pipeline-level modules. No per-video patches. Each fix is generalizable to all future content.

## User Stories

1. As a video producer, I want the verification script to recognize any company from the video's own meta data, so that new companies don't trigger false "subject visibility" warnings.
2. As a video producer, I want the goal-signal check to only flag explicit CTA verbs, so that normal narration words like "see" don't count as goal signals.
3. As a video producer, I want the loop-close check to pass when the CTA references the hook's core data point, so that successful loop-closes aren't false warnings.
4. As a video producer, I want subtitles to cover 100% of the video timeline, so that no gaps appear between scenes.
5. As a video producer, I want the pipeline to automatically source missing media assets, so that I don't have to manually search and download.
6. As a video producer, I want scene layouts to use vertical space evenly, so that content doesn't clump in the center with dead space above and below.
7. As a video producer, I want a CSS chart scene template for stock price / data visualization, so that financial data scenes look professional without needing external screenshots.
8. As a video producer, I want all RMB amounts to automatically get USD dual-annotation before TTS, so that the rule is enforced by code not agent memory.
9. As a video producer, I want low-resolution media to be automatically upscaled, so that backgrounds don't look pixelated.
10. As a video producer, I want on-screen text concatenation to always include proper spacing, so that words like "STRATEGICBACKERS" never appear.
11. As a video producer, I want the default renderer to be Remotion, so that I get the better quality path by default.

## Implementation Decisions

### 1. Dynamic company registry for `checkSubjectVisibility`

- `checkSubjectVisibility(scenes)` in `scene-rules.mjs` currently checks `KNOWN_COMPANIES` (hardcoded 10 companies in `tiktok-rules.mjs`).
- Change: accept an optional `meta` parameter. Read `meta.keyEntities.companies` for the video's company list. Also check `scene.texts.subject` field (hook template already renders this).
- `KNOWN_COMPANIES` list remains as a fallback when `meta` is not passed (backwards compat with tests).
- `runAllSceneDataChecks(scenes, seriesMeta, opts)` passes `opts.meta` through.

### 2. Smarter `checkPrimaryGoal`

- Current: 4 goal categories with overly broad regex (`/watch|see|look|here is|this is/i` for "completion").
- New: 3 categories, explicit CTA verbs only:
  - engagement: `/follow|subscribe/`
  - interaction: `/comment|tell|ask|question/`
  - amplification: `/share|save/`
- "completion" category removed (too broad, caused false signals).
- Threshold remains ≤2 signals → pass.

### 3. Smarter `checkLoopClose`

- Current: always returns warn (no pass state exists).
- New: extract core numbers from `meta.dataPoints` (if available) or hook voiceover. If any core number appears in the CTA voiceover → pass (loop-close achieved). Otherwise → warn.

### 4. Subtitle 100% coverage via hold-out extension

- In `cues.mjs` `buildCues()`, after constructing all cues, add a final pass: for each gap between consecutive cues that is < `SCENE_BUFFER + 0.1s` (0.6s), extend the earlier cue's `end` to `nextCue.start - CHAIN_GAP`.
- This fills the inter-scene buffer gaps without changing the Netflix timing rules.
- `COVERAGE_GAP_THRESHOLD` stays at 1.0s (real gaps still caught).

### 5. Asset-sourcer auto-step in pipeline

- New Step 1.5 in `main.mjs`: after loading scene-data, before TTS.
- For each scene with `media` field where the file doesn't exist → trigger `asset-sourcer` search using keywords from `meta.keyEntities.companies[0]` + scene `name`.
- Asset-sourcer already exists (`lib/asset-sourcer.mjs`) with 28+ sources. This is a pipeline integration, not new code.
- Auto-assigns downloaded assets to `scene.media.path`.

### 6. Vertical layout: `space-evenly` for slot content

- In `scene-layout.mjs` `slotCss()`: change `.slot-hero` and `.slot-kicker` from `justify-content: center` to `justify-content: space-evenly`.
- Effect: content with few elements distributes evenly across the band instead of clumping in center.
- `.slot-support` stays `center` (usually single source line).

### 7. CSS chart scene template

- New `visualType: "chart"` in scene-data.
- New `sceneChart()` function in scenes dispatcher (per-content `scenes.mjs`).
- Renders a pure CSS/SVG bar chart from `texts.chartData`:
  ```
  { bars: [{ label: "IPO", value: 150, color?: "amber" }, { label: "OPEN", value: 1100, color?: "amber" }], yAxis: "PRICE (¥)", source: "..." }
  ```
- Chart fits in hero slot, source in support slot.

### 8. RMB→USD auto-fix in `normalizeSceneData()`

- New function `normalizeSceneData(scenes, meta)` in a new `lib/normalize-currency.mjs`.
- Scans all `voiceover` and `texts` strings for `¥\d+` or `\d+ (?:billion|million) yuan` patterns.
- If a `$` equivalent is not already present, inserts `$X (¥Y)` format using ¥1 ≈ $0.14.
- Called in `main.mjs` Step 0 (after scene-data load, before TTS).
- `checkCurrencyDualAnnotation()` in `scene-rules.mjs` as verify-time warn (detects any remaining un-annotated RMB).

### 9. Media upscale pre-processing

- New Step 1.5b in `main.mjs`: after asset-sourcer (or directly if all media exists), call `autoUpscaleIfNeeded()` on each `scene.media.path`.
- `autoUpscaleIfNeeded()` already exists in `lib/upscale.mjs`. Checks resolution, upscales if < 720p short side using Real-ESRGAN.
- Only processes confirmed media files (Cascade architecture: selected first, then quality-enhanced).
- Works for both Playwright and Remotion paths.

### 10. Text concatenation spacing fix

- Fix templates in `scene-templates.mjs` and per-content `scenes.mjs`: add space between `title` and `titleHighlight` spans.
- Pattern: `${t(txt, "title")} <span class="card-highlight">${t(txt, "titleHighlight")}</span>` (note the space).
- New verify rule `checkTextConcatenation()` in `scene-rules.mjs`: detect on-screen text fields that when concatenated produce a dictionary word boundary violation (two uppercase words joined without space).

### 11. Default renderer: Remotion

- `main.mjs` line 94: change default from Playwright to Remotion.
- `const useRemotion = !args.includes("--playwright") || meta.renderer === "remotion" || meta.renderer !== "playwright"`.
- Playwright code remains as fallback (not deleted). `--playwright` flag or `meta.renderer = "playwright"` opts back.

## Testing Decisions

### Testing seams

- **Scene rules**: existing `__tests__/scene-rules.test.mjs` — add test cases for each new/modified rule.
- **Cue building**: existing `__tests__/cues.test.mjs` — add hold-out extension tests.
- **Currency normalization**: new test file `__tests__/normalize-currency.test.mjs`.
- **Upscale integration**: existing `__tests__/upscale.test.mjs` — add pipeline integration test.
- **Chart template**: new test in per-content or shared test file.
- **Text concatenation**: add to `scene-rules.test.mjs`.

### Prior art

- `scene-rules.test.mjs` already tests all verify rules with mock scenes — same pattern.
- `cues.test.mjs` already tests chunking and timing — same pattern.
- `upscale.test.mjs` already tests `autoUpscaleIfNeeded` — extend with pipeline scenario.

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `lib/scene-rules.mjs` | Modify `checkSubjectVisibility`, `checkPrimaryGoal`, `checkLoopClose`; add `checkCurrencyDualAnnotation`, `checkTextConcatenation` | Medium | Core verification module. All changes are additive (new params, new checks). Existing checks unchanged in behavior. Tests lock expected behavior. |
| `lib/tiktok-rules.mjs` | Narrow goal regex patterns | Medium | Shared constant file. Goal patterns only affect `checkPrimaryGoal`. Other consumers (CTA_PATTERN, etc.) unaffected. |
| `lib/subtitles/cues.mjs` | Add hold-out extension pass in `buildCues()` | Medium | Core subtitle generation. New pass is additive — only extends cue end times, doesn't change start times or text. If hold-out fails, cues remain as-is (graceful degradation). |
| `main.mjs` | Add Step 0 normalize-currency, Step 1.5 asset-sourcer + upscale, change default renderer | High | Main pipeline orchestrator. Each new step is sequential and wrapped in try/catch (non-blocking). Default renderer change affects all content without `meta.renderer` set. |
| `lib/scene-layout.mjs` | Change `justify-content` from `center` to `space-evenly` | Medium | Layout affects all scenes visually. `space-evenly` is strictly more distributed than `center` — no content can get worse. DOM verifier still checks bounds. |
| `lib/scene-templates.mjs` | Add space in title+highlight spans | Low | Pure string fix. Only adds a space character. |
| Per-content `scenes.mjs` | Same space fix in per-content templates | Low | Same fix, replicated. |
| `lib/normalize-currency.mjs` (new) | New module | Low | New file, no existing consumers to break. |
| `lib/upscale.mjs` | No code change, just pipeline integration | Low | Existing code, new call site. |
| `verify-video.mjs` | Pass `meta` to `runAllSceneDataChecks` | Low | Adding one parameter pass-through. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Hook has `texts.subject = "UNITREE"` but company not in `KNOWN_COMPANIES` | Pass (subject field is present) | False negative if both subject and meta missing | Fallback to KNOWN_COMPANIES list |
| 2 | Hook has no subject field, no meta.keyEntities | Warn (no company identifiable) | — | — |
| 3 | Voiceover contains "see" in narration context | Not counted as goal signal | — | Removed "completion" category |
| 4 | CTA contains "follow" only (1 goal) | Pass (≤2 signals) | — | — |
| 5 | CTA contains "follow" + hook number "629" | Loop-close: pass | — | — |
| 6 | CTA contains no hook number reference | Loop-close: warn | — | — |
| 7 | Two scenes with 0.5s gap between voiceover end and next start | Cue extended to fill gap | Subtitle stays on screen slightly longer | Within Netflix hold-out allowance |
| 8 | Scene with media.path pointing to non-existent file | Asset-sourcer triggered, searches and downloads | Network failure | try/catch, scene renders without media if search fails |
| 9 | Media file is 640×360 (below 720p) | Auto-upscaled to 720p before rendering | Real-ESRGAN not installed | Graceful degradation to original |
| 10 | Voiceover contains "445 billion yuan" without USD | Auto-fixed to "$63 billion (445 billion yuan)" before TTS | Exchange rate outdated | Rate in single constant, semi-annual review |
| 11 | Voiceover already has "$63 billion (445 billion yuan)" | No modification (dual annotation present) | — | — |
| 12 | `texts.title = "STRATEGIC"` + `texts.titleHighlight = "BACKERS"` | Rendered as "STRATEGIC BACKERS" with space | — | — |
| 13 | Content without `meta.renderer` field | Defaults to Remotion | Remotion deps not installed | Auto-install in render-remotion.mjs already handles this |
| 14 | Content with `meta.renderer = "playwright"` | Uses Playwright | — | Opt-out preserved |
| 15 | Scene with `visualType: "chart"` | Renders CSS bar chart from chartData | Missing chartData field | Template renders empty chart with source only |
| 16 | `meta.keyEntities.companies` is empty array | Falls back to KNOWN_COMPANIES list | — | — |
| 17 | Currency normalization encounters "¥1100 per share" (small amount) | Converts to "$154 (¥1100)" | Precision for small amounts | Use Math.round for amounts < $1M |
| 18 | Upscale called on already-720p file | Returns original path (no upscale needed) | — | Existing behavior in autoUpscaleIfNeeded |

## Out of Scope

- Deleting Playwright rendering code (preserved as fallback)
- Changing the slot system's band positions (only `justify-content` changes)
- Implementing TradingView API integration (CSS chart is sufficient)
- Modifying F5-TTS engine for pronunciation (separate issue)
- Changing subtitle font size or style (separate from coverage fix)

## Further Notes

- Currency exchange rate: ¥1 ≈ $0.14 (7.14 CNY/USD). Single constant `CNY_TO_USD_RATE` in `normalize-currency.mjs`. Review semi-annually per `video-workflow.md`.
- Asset-sourcer integration is non-blocking: if search fails, scene renders without media (same as current behavior for missing files).
- Default renderer change from Playwright to Remotion: Remotion auto-installs deps on first run (`render-remotion.mjs` line 68-70). No manual setup needed.
