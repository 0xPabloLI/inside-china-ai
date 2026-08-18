# Video Rendering: Remotion Replaces Playwright Recording

## Context

The short video pipeline renders 9:16 vertical video scenes (1080×1920) with:
- Animated text overlays (hooks, data points, quotes, CTAs)
- Background images/videos with Ken Burns / parallax effects
- Brand watermark and color system
- Karaoke-style burned-in subtitles
- BGM with per-scene volume ducking
- Scene transitions (cuts, fades, slides)

**Phase 1 (Jul 2026):** Scenes were rendered as HTML/CSS pages, recorded via Playwright's `page.screencast()` API. FFmpeg then assembled the recorded segments + TTS audio + subtitles + BGM into the final MP4.

**Problems with Playwright recording:**
1. **Timing drift** — Playwright screencast frames were not frame-accurate. Scene durations drifted by 50-200ms, causing audio/video desync.
2. **No transition engine** — Transitions between scenes had to be done in FFmpeg post-production (crossfade, xfade), limited to what FFmpeg supports.
3. **Animation inconsistency** — CSS animations triggered on page load, not on video timeline. Re-recording a scene required a full browser reload.
4. **No audio preview** — Audio was added in post-production. Could not preview audio+video together during scene development.
5. **Rendering speed** — Each scene required a separate Playwright recording pass (browser launch → load HTML → record → save). 10 scenes = 10 browser sessions.

## Decision

**Migrate to Remotion** as the video rendering engine. Remotion is a React-based video framework that:
- Renders frames deterministically via server-side rendering (frame-accurate)
- Supports composition of video, audio, images, and animations in a single timeline
- Provides `TransitionSeries` for scene transitions (replaced with absolute `Sequence` — see Timeline Contract below)
- Renders via `npx remotion render` (headless Chrome + frame extraction)
- Supports `staticFile()` for audio assets (BGM, TTS)

### Migration scope (6 tickets, T1-T6)

| Ticket | Description | Commit |
|--------|-------------|--------|
| T1 | Extract `burnSubtitles`/`mixBgm`/`normalizeLoudness` from `assemble.mjs` into `post-process.mjs` | `fed2158` |
| T2 | Scaffold Remotion project (Composition, types, assets symlink) | `8f8c314` |
| T3 | 12 animation components + 8 visual components with safe-zones | `ccb1c34` |
| T4 | HookScene, CtaScene, MediaBackground components | `0e24cfb` |
| T5 | ShortVideo Composition with TransitionSeries/Audio + render-remotion orchestrator | `ceeeb18` |
| T6 | Integrate Remotion path detection into `main.mjs` (`--remotion` flag or `meta.renderer`) | `65a96e8` |

### Scene component architecture

7 scene types mapped to Remotion components:

| Scene Type | Remotion Component | Purpose |
|-----------|-------------------|---------|
| `hook` | `HookScene` | Opening attention grabber (large text, fast animation) |
| `content` | `ContentScene` | Standard narration + on-screen text |
| `narrative` | `NarrativeScene` | Media-layer scenes (background image/video + text overlay) |
| `data` | `DataScene` | Data point emphasis (large numbers, charts) |
| `quote` | `QuoteScene` | Quote display (centered, serif font) |
| `cta` | `CtaScene` | Call-to-action (subscribe, follow) |
| `transition` | `TransitionScene` | Scene-to-scene transition (handled by TransitionSeries) |

### Dual-track rendering

`main.mjs` supports both rendering paths:
- `--remotion` flag or `meta.renderer === "remotion"` → Remotion path
- Default → Playwright path (legacy, maintained as fallback)

The Playwright path is kept as a fallback because:
- Remotion requires `npx remotion render` (headless Chrome, ~2GB npm install)
- Some older scene-data files may not have Remotion-compatible scene types
- Debugging: Playwright allows live DOM inspection; Remotion is a black box during render

## Why not alternatives

### FFmpeg-only rendering (no HTML/React)
- **Pros:** Maximum control, no browser dependency.
- **Cons:** Text animation, layout, and typography in FFmpeg `drawtext`/`ass` filters is extremely limited. Complex layouts (multi-line text wrapping, positioning, brand colors) require manual coordinate calculation. No CSS, no flexbox, no responsive layout.
- **Decision:** Text-heavy scenes (data points, quotes, hooks) need CSS layout. FFmpeg is for post-processing only (subtitles, BGM, loudness).

### HTML + Playwright (keep current approach)
- **Pros:** No new dependency. Direct CSS control.
- **Cons:** Frame-accurate timing is impossible with Playwright screencast. The screencast API captures frames at variable intervals, not at a fixed frame rate. This causes audio drift over 60s videos.
- **Decision:** Frame accuracy is non-negotiable for karaoke subtitles. Playwright screencast cannot guarantee it.

### Motion Canvas (alternative React video framework)
- **Pros:** TypeScript-native, similar to Remotion.
- **Cons:** Smaller community, fewer tutorials, less ecosystem. Remotion has `@remotion/player` for preview, `@remotion/renderer` for CLI, and a VS Code extension.
- **Decision:** Remotion's ecosystem is more mature and better documented.

## Trade-offs

| Aspect | Remotion | Playwright (legacy) |
|--------|---------|-------------------|
| **Frame accuracy** | Exact (deterministic frame rendering) | Drifts 50-200ms per scene |
| **Transitions** | Absolute `Sequence` with internal fade-in (Option A) | FFmpeg xfade (post-production) |
| **Audio preview** | Yes (in Remotion Studio) | No (audio added post-render) |
| **Rendering speed** | ~30-60s per video (parallel frames) | ~60-120s per video (10 browser sessions) |
| **Dependencies** | Remotion npm package (~2GB with Chrome) | Playwright (already installed) |
| **Learning curve** | React + Remotion API | HTML/CSS (already known) |
| **Layout flexibility** | Full CSS (flexbox, grid, animations) | Full CSS (same) |
| **Subtitle rendering** | Separate ASS file (FFmpeg post) | Separate ASS file (FFmpeg post) |
| **Debugging** | Remotion Studio (visual preview) | Browser DevTools (DOM inspection) |

### CSS-to-Remotion mapping
The migration required translating CSS values from `base-styles.mjs`/`scene-templates.mjs` to Remotion's `interpolate()` and `<Img>`/`<Video>`/`<AbsoluteFill>` components. A `fix(remotion)` commit (`e8c9e32`) matched exact CSS values — font sizes, colors, spacing, frame glow — to ensure visual parity.

## Timeline Contract: Option A — Fixed Scene Start

**Decision date:** 2026-08-18

All tracks (visual, audio, subtitle, totalFrames) use the SAME offsets derived from `sceneTimeline()` in `lib/timeline.mjs`. No track compresses the global timeline.

- `TransitionSeries` was **removed** from `ShortVideo.tsx` because its 6-frame transition overlap shifted visual onsets relative to audio/subtitle offsets, causing 0.2s desync per transition.
- Replaced with absolute `<Sequence from={offset} durationInFrames={clipFrames}>` for both visual and audio, using the same `cumulativeOffsetFrames` that matches `sceneTimeline()`.
- Fade-in for subsequent scenes is an **internal animation** (first 6 frames of each scene), not a cross-scene overlap.
- `Root.tsx` `calculateMetadata` and `render-remotion.mjs` `totalFrames` both use `sceneClipFrames()` from `timeline.mjs` — no duplicated frame calculation.

## Consequences

- Remotion project lives at `scripts/short-video/remotion/` with its own `package.json` and `node_modules`.
- `render-remotion.mjs` orchestrates: (1) build scene props JSON, (2) call `npx remotion render`, (3) return MP4 path.
- `main.mjs` checks `meta.renderer` or `--remotion` flag to select rendering path. Default is still Playwright for backwards compatibility.
- Frame analysis verification (`verify-scene-dom.mjs`) uses Playwright DOM inspection for both paths — it checks the HTML source that Remotion components render, not the final video frames.
- Post-processing (`post-process.mjs`) is shared between both paths: subtitles, BGM, loudness normalization happen after rendering.
- Future scene types must be implemented as both HTML templates (for Playwright fallback) and Remotion components (for primary path).
- Remotion render requires headless Chrome — on macOS, this is bundled with the `remotion` npm package. On CI/Linux, `--gl=angle` or `--gl=swiftshader` may be needed.
