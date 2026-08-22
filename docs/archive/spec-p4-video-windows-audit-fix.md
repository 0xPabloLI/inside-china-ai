# Spec: P4 — VLM Video Time Windows + Audit Remediation + Misfilter Tests

> Spec ID: spec-p4-video-windows-audit-fix
> Created: 2026-08-20
> Status: ready-for-agent
> Related Issues: #67 (capabilities.articles schema), #68 (Signal Density audit), #51 (Cascade audit)
> ADRs: ADR-0009 (VLM), ADR-0015 (Focus Detection), ADR-0016 (Cascade & Signal Density)
> Grill session: 2+ rounds, all decisions settled
> Prior work: P3 (analyzeAssetSemantics merge) ✅, P0/P1 remediation ✅, R1-R4 review fixes ✅

## Problem Statement

Three independent but related issues:

### 1. VLM video analysis has no explicit time window (P4)

The VLM (`vlm_analyzer.py`) analyzes videos without a defined time window. Native video input path passes the entire video to mlx-vlm. Fallback frame extraction caps at `MAX_VIDEO_SECONDS = 8` but native does not. This means:
- Native and fallback paths analyze **different temporal ranges** — semantic inconsistency
- No time window metadata is returned — downstream consumers (P5 ASR, P6 timeline fusion) cannot align
- `probeMedia()` is not available — no ffprobe-based media metadata extraction

### 2. Audit findings: ytdlp platform mismatch + CDP image type leak

Third-party audit (`docs/reviews/source-registry-capability-audit-2026-08-19.md`) found:

- **P0**: `xhs`, `douyin`, `weibo_hot` declare `capabilities.videos` with ytdlp, but `searchYtdlp()` only supports `bilibili` and `youtube_search` — all other platforms silently fall through to YouTube search. Downloaded videos get wrong source attribution.
- **P1-a**: `google_news` and `bing_news` CDP image primary scripts return `type: "text"` candidates (article URLs without images). The CDP download loop doesn't check `candidate.type`, so HTML pages get downloaded as `.jpg`.

### 3. Misfilter test gaps

Pre-filter cascade has no tests for:
- Good assets killed by sparse metadata (API sources without fileSize/resolution)
- CJK title vs English keyword mismatch
- All source names lacking SOURCE_ATTRIBUTIONS coverage check
- attribution.text() return value sanity

## Solution

### Track A: P4 — VLM Explicit Time Windows

#### A1: `probeMedia()` — new module `lib/media-probe.mjs`

Wraps ffprobe calls. Returns structured media metadata or `null` on failure.

```
probeMedia(videoPath) → {
  durationMs: number,
  fps: number,
  hasAudio: boolean,
  width: number,
  height: number,
  rotation: number
} | null
```

Pure function `parseProbeOutput(rawOutput, format)` separates parsing from I/O for testing.

Uses `/opt/homebrew/opt/ffmpeg-full/bin/ffprobe` (same as `upscale.mjs`).

#### A2: Extended `analyzeAssetSemantics()` signature

```
analyzeAssetSemantics(assetPath, opts?)
  opts: { startMs?, endMs?, sampleFps? }
```

When `opts` is omitted (image or backward compat): current behavior unchanged.
When `opts` provided (video): Python receives `window: { startMs, endMs, sampleFps }` in the IPC message.

Python `analyze_semantics` action checks for `window` field:
- Present → native path uses `startMs`/`endMs` to trim; fallback extraction uses same window
- Absent → current behavior (native sees whole video, fallback caps at 8s)

#### A3: Window metadata in output

Python reports `sourceMode`: `"native" | "frames" | "degraded"`.
Node `visual-analyzer.mjs` attaches `window: { startMs, endMs, sampleFps }` from request params.

Final result shape for video with window:
```
{
  description: "...",
  subjects: [...],
  contentKind: "...",
  fit: null,           // video skips fit
  criticalEdgeText: null,
  reason: null,
  window: { startMs, endMs, sampleFps },
  sourceMode: "native" | "frames" | "degraded"
}
```

#### A4: `analyzeAssets()` orchestration

New Phase 2.5 (after focus detection, before VLM):
- For video assets only: call `probeMedia()` → compute window `{ startMs: 0, endMs: min(durationMs, 8000), sampleFps: 1.0 }`
- If `probeMedia()` returns null: use default window `{ startMs: 0, endMs: 8000, sampleFps: 1.0 }`, `sourceMode` will be `"degraded"`
- Pass window to `analyzeAssetSemantics(absPath, { startMs, endMs, sampleFps })`
- Image assets: no change, `opts` omitted

#### A5: Python fallback frame extraction with window

`extract_frames()` updated to accept `startMs`/`endMs`:
- ffmpeg `-ss {startMs/1000} -t {(endMs-startMs)/1000}` for windowed extraction
- `maxFrames = 16` cap (Qwen3-VL 16-image limit)
- When `sampleFps` provided: `fps={sampleFps}` in ffmpeg filter

### Track B: Audit Remediation

#### B1: Remove ytdlp capabilities for unsupported platforms

Remove `capabilities.videos` from `xhs`, `douyin`, `weibo_hot` in `YTDLP_VIDEO_CAPABILITIES`.
Add guard in `searchYtdlp()`: return `[]` for platforms not in `{ "bilibili", "youtube_search" }`.

#### B2: Fix google_news / bing_news CDP image scripts

Primary scripts: only push when `img` exists (remove `type: "text"` branch).
Download loop: add `if (candidate.type && candidate.type !== "image") continue;` guard.

### Track C: Misfilter Tests

New tests in `asset-sourcer.test.mjs` and `source-registry-capabilities.test.mjs`:

1. Good asset with sparse metadata (no fileSize/resolution) — should not be hard-skipped
2. CJK title vs English keyword — boundary match behavior
3. Every source name in ALL_SOURCES has a matching SOURCE_ATTRIBUTIONS key
4. attribution.text() returns non-empty string for all sources
5. `searchYtdlp()` returns `[]` for unsupported platforms (regression test for B1)
6. `google_news`/`bing_news` primaryScript does not produce `type: "text"` candidates (regression test for B2)

## User Stories

1. As a pipeline operator, I want video VLM analysis to use a defined time window, so that native and fallback paths analyze the same temporal range.
2. As a pipeline operator, I want `probeMedia()` to extract video metadata via ffprobe, so that I know duration, fps, and audio presence before VLM analysis.
3. As a developer, I want `analyzeAssetSemantics()` to accept optional time window params, so that I can pass precise windows to the VLM.
4. As a developer, I want window metadata (`windowStartMs`, `windowEndMs`, `sampleFps`, `sourceMode`) in VLM output, so that P5 ASR and P6 timeline fusion can align.
5. As a developer, I want `probeMedia()` to return null on failure without crashing, so that VLM analysis proceeds with default window.
6. As a pipeline operator, I want unsupported ytdlp platforms to return no results instead of YouTube results, so that source attribution is never wrong.
7. As a pipeline operator, I want CDP image scripts to only return image candidates, so that HTML pages are never downloaded as .jpg.
8. As a developer, I want pre-filter tests to cover sparse-metadata assets, so that good assets from APIs without fileSize/resolution are not wrongly skipped.
9. As a developer, I want all source names verified against SOURCE_ATTRIBUTIONS, so that no source is missing attribution.
10. As a developer, I want regression tests for the ytdlp platform fix, so that unsupported platforms never silently fall through to YouTube.
11. As a developer, I want regression tests for the CDP image type fix, so that non-image candidates never enter the image download path.

## Implementation Decisions

### Modules to create
- `lib/media-probe.mjs` — ffprobe wrapper + `parseProbeOutput()` pure function

### Modules to modify
- `lib/visual-analyzer.mjs` — extend `analyzeAssetSemantics()` signature, attach window metadata
- `lib/vlm_analyzer.py` — accept `window` field in `analyze_semantics` action, update `extract_frames()` for windowed extraction
- `lib/asset-sourcer.mjs` — Phase 2.5 probe + window calculation, `searchYtdlp()` guard, CDP download loop type check
- `lib/source-registry.mjs` — remove `capabilities.videos` from `xhs`/`douyin`/`weibo_hot`, fix `google_news`/`bing_news` CDP scripts

### Interfaces
- `probeMedia(videoPath) → ProbeResult | null`
- `analyzeAssetSemantics(assetPath, opts?: { startMs?, endMs?, sampleFps? }) → Promise<AssetSemantics>`
- `searchYtdlp(keyword, platform)` — platform must be in supported set, else returns `[]`

### ffprobe path
`/opt/homebrew/opt/ffmpeg-full/bin/ffprobe` — same as `upscale.mjs` and `tts/post-process.mjs`.

### Default window
`{ startMs: 0, endMs: 8000, sampleFps: 1.0 }` — matches current `MAX_VIDEO_SECONDS = 8`.

### maxFrames for fallback
16 — Qwen3-VL's multi-image input limit. When `sampleFps * windowSeconds > 16`, reduce effective fps to fit.

### IPC message format (Node → Python)
```json
{
  "requestId": "uuid",
  "action": "analyze_semantics",
  "path": "/abs/path/to/video.mp4",
  "window": { "startMs": 0, "endMs": 8000, "sampleFps": 1.0 }
}
```
`window` is optional. Images never include it.

### Python response format
```json
{
  "requestId": "uuid",
  "description": "...",
  "subjects": ["..."],
  "contentKind": "...",
  "fit": null,
  "criticalEdgeText": null,
  "reason": null,
  "sourceMode": "native",
  "error": null
}
```

### sourceMode values
- `"native"` — mlx-vlm native video input succeeded
- `"frames"` — ffmpeg frame extraction fallback used
- `"degraded"` — probeMedia failed, default window used

## Testing Decisions

### Pure function tests (parallel)
- `parseProbeOutput()` — various ffprobe output formats (CSV, JSON, missing fields, empty)
- `preFilterCandidate()` — sparse metadata, CJK mismatch, borderline scores
- `searchYtdlp()` — unsupported platform returns `[]` (mock `execSync`)

### Smoke tests (serial, `--maxWorkers=1`)
- `probeMedia()` with real ffprobe on test video file
- `analyzeAssetSemantics()` with window on test video (optional — requires VLM)

### Regression tests (parallel)
- `google_news`/`bing_news` primaryScript mock DOM — only image candidates produced
- All source names in ALL_SOURCES have SOURCE_ATTRIBUTIONS key
- `attribution.text()` returns non-empty string for all sources

### Test seams
- `parseProbeOutput` — pure function, no I/O
- `preFilterCandidate` — pure function, existing seam
- `searchYtdlp` — mock `execSync` (existing pattern in asset-sourcer tests)
- CDP script validation — mock DOM evaluation (existing pattern in source-registry tests)

## Out of Scope

1. **P5 ASR worker** — separate ticket, depends on P4 probe infrastructure
2. **P6 timeline fusion** — separate ticket, depends on P4 + P5
3. **P7 content-addressed caching** — separate ticket
4. **P8 Focus Phase 2** — video focus detection, separate ticket
5. **capabilities.articles schema completion** — Issue #67
6. **Signal Density audit** — Issue #68
7. **Alternative downloaders** (RedNote-MCP, weibo-downloader, bilibili-api-python) — separate tickets
8. **Global ffprobe unification** — consolidating 5+ scattered ffprobe calls into `media-probe.mjs` is a separate refactor

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `lib/visual-analyzer.mjs` | Extend `analyzeAssetSemantics()` signature with optional `opts` param | Medium | Backward compat: no `opts` = current behavior. Image path ignores `opts`. Video path uses window when present. |
| `lib/vlm_analyzer.py` | Accept `window` field in `analyze_semantics` action; update `extract_frames()` with `-ss`/`-t` params | Medium | Python checks `window` presence — absent = current behavior. `extract_frames()` new params are optional with defaults. |
| `lib/asset-sourcer.mjs` | Phase 2.5 probe for videos; `searchYtdlp()` platform guard; CDP download loop type check | Medium | Phase 2.5 only runs on video assets. `searchYtdlp()` guard returns `[]` for unsupported platforms (was silently returning YouTube results — this is a bug fix). CDP type check skips non-image candidates (was downloading HTML as .jpg — bug fix). |
| `lib/source-registry.mjs` | Remove `capabilities.videos` from `xhs`/`douyin`/`weibo_hot`; fix `google_news`/`bing_news` primaryScript | Medium | Removing `capabilities.videos` means `YTDLP_SOURCES` no longer includes these 3 sources. They still have `capabilities.articles` for trend discovery. Fixing CDP scripts changes image extraction behavior — only image candidates will be returned. |
| `lib/media-probe.mjs` | New file — no existing code modified | Low | Pure addition. No existing consumers affected. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Video asset with probeMedia success | Window = { 0, min(duration, 8000), 1.0 }. VLM receives window. sourceMode = "native" or "frames" | Low | probeMedia returns valid metadata. Window computed from duration. |
| 2 | Video asset with probeMedia failure (corrupt file / ffprobe missing) | probeMedia returns null. Default window { 0, 8000, 1.0 } used. sourceMode = "degraded" | Low | VLM proceeds with default window. No crash. |
| 3 | Image asset with opts passed | opts ignored. Image path unchanged. No window in output. | Low | Image path doesn't read opts. |
| 4 | Video asset, no opts passed (backward compat) | Current behavior: native sees whole video, fallback caps at 8s. No window metadata. | Low | opts is optional. Python checks window field presence. |
| 5 | Very short video (< 1s) | Window = { 0, duration, 1.0 }. Fallback may produce 1 frame. VLM analyzes single frame. | Low | maxFrames=16 cap. Single frame is valid input. |
| 6 | Video with no audio track | probeMedia returns hasAudio=false. VLM analysis unaffected (VLM doesn't use audio). | Low | hasAudio is informational for P5 ASR. |
| 7 | searchYtdlp called with platform="xiaohongshu" | Returns `[]` (unsupported platform). No YouTube results. | Low | Guard check: only bilibili and youtube_search produce results. |
| 8 | searchYtdlp called with platform="bilibili" | Uses `bilisearch:` as before. Returns B站 results. | Low | Existing behavior unchanged. |
| 9 | google_news CDP extraction with article-only result (no images) | primaryScript returns `[]`. No text candidates produced. | Low | Script only pushes when img exists. |
| 10 | bing_news CDP extraction with mixed image/text results | Only image candidates returned. Text candidates filtered. | Low | Script only pushes when img exists. |
| 11 | CDP download loop receives candidate with type="text" | Skipped (type check guard). Not downloaded. | Low | `if (candidate.type && candidate.type !== "image") continue;` |
| 12 | Good asset from Pexels API (no fileSize, no resolution) | technicalScore = 14 (title match) + 14 (image type) = 28. ≥20 → downloaded. <30 → lowConfidence=true → skipped from VLM. | Medium | This is current behavior. API sources with sparse metadata get lowConfidence. Not a regression — but test documents it. |
| 13 | CJK title "优必选机器人" with keyword "UBTECH" | No boundary match (CJK vs Latin). technicalScore may be low. | Medium | `hasBoundaryMatch` uses `includes()` for CJK. "优必选" doesn't contain "UBTECH". This is a real gap — but P3 VLM subjects matching handles it post-analysis. |
| 14 | All sources have SOURCE_ATTRIBUTIONS key | Every source name in ALL_SOURCES has a matching key in SOURCE_ATTRIBUTIONS | Low | New test assertion. Any missing key would cause `buildAttribution()` to return null. |
| 15 | attribution.text() returns empty string | Test catches sources with empty attribution text | Low | New test assertion. |
| 16 | probeMedia on non-video file (image) | Returns null (ffprobe can't probe images, or returns empty). analyzeAssets skips probe for images. | Low | Phase 2.5 only calls probeMedia for video assets (type === "video"). |
| 17 | extract_frames with window where startMs > endMs | ffmpeg handles gracefully (returns 0 frames). VLM gets empty frame list → degraded result. | Low | Window computation: `endMs = min(durationMs, 8000)`. startMs always 0 in P4. |
| 18 | Native video path fails, fallback uses window | extract_frames uses startMs/endMs for `-ss`/`-t`. Same temporal range as native would have used. | Low | Both paths use same window from IPC message. |

## Further Notes

- ffprobe path `/opt/homebrew/opt/ffmpeg-full/bin/ffprobe` is already used by `upscale.mjs` and `tts/post-process.mjs`. No new dependency.
- `MAX_VIDEO_SECONDS = 8` in `vlm_analyzer.py` becomes the default `endMs` when no window is provided, preserving backward compat.
- The `sourceMode` field is new in VLM output. Existing consumers (`analyzeAssets()` in `asset-sourcer.mjs`) don't read it — they use description/subjects/contentKind/fit. P5/P6 will consume it.
- Removing `capabilities.videos` from `xhs`/`douyin`/`weibo_hot` reduces `YTDLP_SOURCES` from 5 to 2 (bilibili + youtube_search). No code changes needed in consumers — they iterate `YTDLP_SOURCES` dynamically.
