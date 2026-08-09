# Safe Zone Calibration Log

> TikTok UI overlay measurements and safe-zone adjustment history.
> `docs/brand-system.md` contains the current values; this file records WHY they are what they are.
> Add new calibration passes here, not to brand-system.md.

---

## Pass 1 — Initial calibration (2026-08-08, first version)

**Source**: 2026 research (quso/Moda 170K-post analysis, Kreatli, vSubtitle, Blitzcut) + a real FYP playback screenshot (576×1024, ×1.875 → 1080×1920).

**Findings**:
- Top UI ("Community | Following | For You" tabs, search) ≈ top 0–165px
- Right action rail (avatar / like / comment / save / share / music disc) at x≈880–1080, y≈655–1775
- Bottom caption/username climbs to y≈1500 worst case (long caption + safety label)
- Bottom nav bar y≈1790–1905
- TikTok native auto-captions ~60px em (≈3.1% of frame height), centered at ~62–70% of frame height

**Decisions**:
- `SAFE_ZONES = { top: 220, right: 200, bottom: 770, left: 60 }` — content x∈[60,880], y∈[220,1150]
- `SUBTITLE_LANE = { marginV: 570, fontSize: 60, maxLines: 2, lineHeight: 1.35, maxWidth: 720 }` — symmetric margins 180/180, subtitle area [180, 900]
- `WATERMARK_POS = { top: 60, left: 60 }`

---

## Pass 2 — Second FYP screenshot (2026-08-08)

**Source**: Another real FYP screenshot (576×1024, ×1.875, OCR-measured).

**Findings**:
- Top tabs y 91–175
- Action-rail icons x≈960–1080 with count labels starting x≈930 (y 746–1564)
- Caption UI top y≈1489
- Bottom tab bar y≥1822
- Nothing intrudes the content band; the x≤880 cap keeps a 50px margin from the rail count labels

**No value changes** — confirmed Pass 1 values.

---

## Pass 3 — IMG_7975.PNG iPhone screenshot (2026-08-09)

**Source**: `scripts/short-video/assets/IMG_7975.PNG` — 750×1334 iPhone FYP screenshot, ×1.44 → 1080×1920, OCR via tesseract.

**Findings (three occlusion problems)**:

### 3a. Search icon vs brandBar

| Element | x range | y range | Source |
|---------|---------|---------|--------|
| TikTok search icon | 969–1030 | 91–151 | OCR |
| brandBar (old `right: 60px`) | 60–1020 | 80–128 | CSS |

The brandBar extended to x=1020, so the "INTELLIGENCE BRIEFING" tag (pushed right by `margin-left: auto`) was covered by the search icon. Overlap: x=[969,1020], y=[91,128] — 51×37px.

**Fix**: `right: 60px → 200px` — brandBar right edge moves to x=880, matching `SAFE_ZONES.right`. Clears search icon by 89px.

### 3b. LIVE button vs brandBar logo

| Element | x range | y range | Source |
|---------|---------|---------|--------|
| TikTok LIVE button | 48–115 | 114–138 | OCR |
| brandBar logo (old `top: 80px`) | 60–108 | 80–128 | CSS |

The brandBar logo bottom was at y=128, overlapping LIVE by 14px (y=114–128).

**Fix**: `top: 80px → 140px` — brandBar starts at y=140, below LIVE's bottom at y=138. 2px clearance. brandHeader slot bottom extended 140→200 to cover.

### 3c. Subtitle right edge vs action rail

| Element | x range | y range | Source |
|---------|---------|---------|--------|
| Subtitle (old symmetric margins 180/180) | 180–900 | 1188–1350 | ASS |
| Right action rail | 880–1080 | 655–1775 | Pass 1 |

Subtitle right edge x=900 extended 20px into the action rail zone (x≥880). The rail's vertical extent (y≈655–1775) overlaps the subtitle band (y≈1188–1350), so long cues' right portion could be occluded.

TikTok's own native auto-captions are canvas-centered but naturally narrow (3–5 words per line from auto speech-to-text), so they never reach the rail. Our karaoke cues can be up to 720px wide (6 words at 60px), which would be occluded if centered.

**Fix**: asymmetric margins `180/180 → 110/250` — subtitle area shifts to [110, 830], center x=470 (matches content band center (60+880)/2=470), right edge clears rail by 50px. `maxWidth=720` unchanged, so `cues.mjs` chunking and `measure.mjs` pixel measurement are unaffected.
