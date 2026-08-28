# Handoff: Vertical Image Cropping Pipeline Optimization

## Problem

The pipeline renders images in a 9:16 (1080×1920) vertical video using `object-fit: cover`. For landscape images (16:9 or wider), this crops ~45% of the content (left/right edges). The current pipeline has **no analysis of the cropped result** — VLM only sees the original image, not the cropped version.

### Concrete Example (Alibaba video)

| Scene | Image | Original Size | Cropping Result |
|-------|-------|--------------|-----------------|
| S4 | searxng_image-alibaba-01.jpg | 3840×2160 (16:9) | 9:16 cover crops left/right — "Alibaba" text partially lost |
| S5 | searxng_image-alibaba-02.jpg | 1920×1080 (16:9) | Same issue — logo near edges cropped |
| S7 | brave_image-alibaba-01.jpg | 1080×608 (16:9) | "Alibaba" building sign may be cropped |

### Root Cause

1. **VLM (`vlm_analyzer.py`)**: Only resizes the image (long edge → 1920px) before analysis. Does NOT simulate 9:16 cover crop.
2. **Focus detection (`focus_detector.py`)**: Detects saliency regions and faces, but this data is not used to set `object-position` in the rendering.
3. **No `focus` field in scene-data**: Most scenes don't set `media.focus`, so it defaults to `"center"` — which may not be optimal.
4. **No fallback for landscape images**: When cover crop would lose important content, there's no automatic switch to `fit: "contain"` + blurred background.

## Current Pipeline Flow (Image Analysis)

```
asset-sourcer.mjs
  → visual-analyzer.mjs.analyzeAssetSemantics(path)
    → vlm_analyzer.py (resizes if >1920px, analyzes original image)
      → returns: { description, subjects, contentKind, fit, criticalEdgeText, reason }
  → visual-analyzer.mjs.detectFocus(path)
    → focus_detector.py (OpenCV saliency + face detection)
      → returns: { protectedRegions, saliency }
  → asset-sourcer writes media.fit, media.focus to scene-data
```

**Gap**: No step simulates the 9:16 crop and validates that the cropped result preserves the image's main subject.

## Proposed Pipeline Enhancement

### Phase 1: Crop Simulation in VLM Analysis

Add a crop simulation step before VLM analysis:

```python
# In vlm_analyzer.py, new function:
def simulate_9_16_crop(img_path):
    """Crop image to 9:16 from center (simulating object-fit: cover).
    Returns path to cropped temp image."""
    from PIL import Image
    img = Image.open(img_path)
    w, h = img.size
    target_ratio = 9 / 16  # 0.5625
    
    if w / h > target_ratio:
        # Image is wider than 9:16 — crop sides
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        cropped = img.crop((left, 0, left + new_w, h))
    else:
        # Image is taller than 9:16 — no horizontal crop needed
        return img_path, None
    
    # Save cropped version
    fd, tmp = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    cropped.save(tmp, "JPEG", quality=90)
    return tmp, tmp
```

Then in the analysis flow:
1. Analyze original image (for fit/criticalEdgeText)
2. Also analyze 9:16-cropped image (for "does cropped version lose important content?")
3. If VLM says cropped version loses content → set `fit: "contain"` instead of `"cover"`

### Phase 2: Smart object-position from Saliency

Use `focus_detector.py` saliency map to determine optimal `object-position`:

```javascript
// In visual-analyzer.mjs, new function:
function computeObjectPosition(saliencyResult, imageWidth, imageHeight) {
  // saliency gives centroid of most salient region
  // Convert to CSS object-position percentage
  const { centroidX, centroidY } = saliencyResult;
  const xPercent = Math.round((centroidX / imageWidth) * 100);
  const yPercent = Math.round((centroidY / imageHeight) * 100);
  return `${xPercent}% ${yPercent}%`;
}
```

This replaces the hardcoded `FOCUS_MAP` in `MediaBackground.tsx` with data-driven positioning.

### Phase 3: Landscape Image Fallback

When VLM analysis says the image is landscape AND cover crop would lose important content:

```typescript
// In MediaBackground.tsx or scene-data:
// If fit === "contain" and image is landscape:
//   - Render blurred enlarged version as background (fills 9:16)
//   - Render original image centered with letterbox (contains full content)
```

This is the "blur background" technique used by many video editors:
1. Clone the image, scale to fill 9:16, apply heavy blur (e.g., `blur(20px)`)
2. Overlay the original image at natural aspect ratio, centered

### Phase 4: Content-Aware Resizing (Alternative to Cropping)

For images with long horizontal text (e.g., "Alibaba Group" logo wall), instead of cropping:
- Resize image to fit 9:16 width
- Pad top/bottom with brand-colored gradient or solid color
- This preserves 100% of content

```python
# New function in vlm_analyzer.py or a new preprocessor:
def fit_to_vertical(img_path, bg_color="#0a0a14"):
    """Resize image to fit 9:16 without cropping. Pads top/bottom."""
    from PIL import Image
    img = Image.open(img_path)
    w, h = img.size
    target_w = 1080
    target_h = 1920
    
    # Scale image to target width
    scale = target_w / w
    new_w = target_w
    new_h = int(h * scale)
    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Create canvas with bg color
    canvas = Image.new("RGB", (target_w, target_h), bg_color)
    # Paste centered vertically
    top = (target_h - new_h) // 2
    canvas.paste(img, (0, top))
    
    return canvas
```

## Files to Modify

| File | Change | Phase |
|------|--------|-------|
| `lib/vlm_analyzer.py` | Add `simulate_9_16_crop()` + dual analysis | Phase 1 |
| `lib/visual-analyzer.mjs` | Add `computeObjectPosition()` from saliency | Phase 2 |
| `lib/asset-sourcer.mjs` | Write `media.focus` from saliency data | Phase 2 |
| `remotion/src/components/MediaBackground.tsx` | Replace `FOCUS_MAP` with dynamic positioning | Phase 2 |
| `remotion/src/components/MediaBackground.tsx` | Add blurred-background fallback for `fit: "contain"` | Phase 3 |
| `lib/vlm_analyzer.py` or new `lib/image-preprocessor.py` | Add `fit_to_vertical()` padding | Phase 4 |

## Suggested Skills

- `remotion-markup` — for Remotion rendering API
- `impeccable` — for visual quality review
- `code-review` — after implementation

## Related Issues

- #113 (VLM image preprocessing — resize >1920px to fix hallucination)
- #101 (P8b: Temporal Focus for video backgrounds)
- #94 (Scene-level visual intent + evidence-media audit)
