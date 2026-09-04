# Spec: Media Background Support (bgImage/bgVideo)

> Created: 2026-08-11
> Status: Grilling complete, ready for implementation

## 1. Goal

Add background image and video support to short video scenes, with entrance/exit animations. Both images and videos render via HTML/CSS/Playwright (single rendering path, no FFmpeg compositing).

## 2. Data Schema

Each scene object in `scene-data.mjs` gains an optional `media` field:

```javascript
media: {
  type: "image" | "video",     // media type
  path: "assets/xxx.jpg",      // relative to content dir
  source: "Unitree official",  // attribution
  animation: "fade",           // preset: "fade"|"ken-burns"|"slide"|"zoom"|"none"
  overlay: 0.7                 // 0-1, default 0.7
}
```

## 3. Animation Presets

| Preset      | Entrance                              | Sustained | Exit                         | Images? | Videos? |
| ----------- | ------------------------------------- | --------- | ---------------------------- | ------- | ------- |
| `fade`      | 0.8s opacity 0→1                      | static    | 0.5s opacity 1→0             | ✅      | ✅      |
| `ken-burns` | 0.8s fade + scale 1.0→1.08 throughout | slow zoom | 0.5s fade out                | ✅      | ❌      |
| `slide`     | 0.6s translateX(100%)→0 + fade        | static    | 0.4s translateX→-100% + fade | ✅      | ✅      |
| `zoom`      | 0.5s scale 1.2→1.0 + fade             | static    | 0.5s scale→1.1 + fade out    | ✅      | ✅      |
| `none`      | none                                  | static    | none                         | ✅      | ✅      |

Default: `fade` when `animation` not specified.

## 4. Rendering

- **Images**: CSS `background-image: url(file://...)` on a `.media-bg` div
- **Videos**: HTML `<video autoplay loop muted playsinline>` element
- **Overlay**: semi-transparent div `.media-overlay` between media and text
- **Z-index**: media-bg (0) < overlay (1) < scene content (2+)
- **Hook/CTA scenes**: ignore `media` field (data allowed, templates don't render it)
- **Fallback**: file missing → warn + render pure CSS background (no crash)

## 5. Files

### New

- `lib/media-bg.mjs` — path resolution + animation CSS + HTML generation
- `lib/__tests__/media-bg.test.mjs` — unit tests

### Modified

- `lib/record-scenes.mjs` — add `<video>` readyState wait
- `verify-video.mjs` — add media file existence check (pre-render mode)
- `lib/scene-rules.mjs` — add media validation rule (optional)

### NOT Modified

- `lib/assemble.mjs` — no changes (video already in WebM)
- `lib/base-styles.mjs` — no changes (media CSS is self-contained in media-bg.mjs)
- `lib/scene-templates.mjs` — hookScene/ctaScene already ignore unknown fields

## 6. Scenario Matrix

| #   | Scenario                            | Expected                                     | Risk                       |
| --- | ----------------------------------- | -------------------------------------------- | -------------------------- |
| S1  | Scene with image media, file exists | Background image renders with animation      | Low                        |
| S2  | Scene with video media, file exists | `<video>` plays as background with animation | Medium (Playwright timing) |
| S3  | Scene with media, file missing      | Warn + fallback to CSS background            | Low                        |
| S4  | Scene without media field           | Pure CSS, no change from current behavior    | Low                        |
| S5  | Hook scene with media field         | Media ignored, hook renders normally         | Low                        |
| S6  | CTA scene with media field          | Media ignored, CTA renders normally          | Low                        |
| S7  | ken-burns preset on video           | Falls back to fade (ken-burns is image-only) | Low                        |
| S8  | Short duration scene (2s)           | Fade in 0.8s + fade out 0.5s fits within 2s  | Low                        |
| S9  | Very short duration (1s)            | Fade in truncated, no overlap with fade out  | Low                        |
| S10 | Unknown animation preset            | Falls back to fade + warn                    | Low                        |
| S11 | Video not ready after 5s timeout    | Continue recording without video (degraded)  | Medium                     |
| S12 | media.overlay = 0                   | No overlay, text directly on media           | Low                        |
| S13 | media.overlay not specified         | Default 0.7 overlay                          | Low                        |

## 7. Remotion Compatibility

The `media` field schema is **Remotion-agnostic** (pure data). Remotion migration will:

1. Read the same `media` field from scene-data
2. Render with React `<Img>`/`<Video>` instead of CSS/HTML
3. Implement the same 5 animation presets with `interpolate()`/`spring()`
4. The `lib/media-bg.mjs` module gets replaced by a React equivalent
