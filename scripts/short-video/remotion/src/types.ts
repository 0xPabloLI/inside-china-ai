/**
 * Scene data types — mirrors the .mjs scene-data structure for TypeScript.
 * Imported by Remotion components for type safety.
 */

/** Statistics card data (hook scene). */
export interface StatItem {
  num: string;
  unit?: string;
  label?: string;
}

/** Media background field (from lib/media-bg.mjs data contract). */
export interface MediaField {
  type: "image" | "video";
  path: string;
  mode?: "background" | "fullscreen"; // default "background"
  fit?: "cover" | "contain"; // default "cover" — how to place landscape media in 9:16
  /** @deprecated Replaced by protectedRegions from detectFocus() in Phase 2. Existing scene-data values still render, but new auto-analysis no longer writes this field. */
  focus?: "top" | "center" | "bottom"; // default "center" — crop focus when fit is "cover"
  /** Normalized [0,1] source-space focus point for cover crop positioning. Overrides deprecated `focus` enum when present. Set by crop-decision.mjs selectBestCrop(). */
  cropFocus?: { x: number; y: number }; // default undefined → falls back to `focus` enum
  source?: string;
  animation?: "fade" | "ken-burns" | "slide" | "zoom" | "none";
  overlay?: number;
  volume?: number; // 0-1, default 0.08 (≈ -22dB). Video only; images have no audio.
  /** Opt out of render-remotion.mjs's sub-720p Real-ESRGAN safety net. Set by the B-roll stage — Tier A clips are 480×832 by design. Default (unset/true) = auto-upscale. */
  upscale?: boolean;
  /** VLM content classification (P3). Used by recommendScene for scene-type matching. */
  contentKind?:
    "product_demo" | "talking_head" | "landscape" | "chart" | "text_screenshot" | "other" | string;
  /** VLM key subject terms (P3). Used for semantic scoring in scoreCandidate. */
  subjects?: string[];
  /**
   * #156 backdrop layer: a generated clip rendered BENEATH the primary
   * media (visible where the primary doesn't cover the frame). Muted by
   * contract (volume 0); the primary media's overlay dims it, so text
   * contrast is preserved. Written by the b-roll orchestrator when a
   * scene that already has media wins generation.
   */
  backdrop?: {
    type: "video";
    path: string;
    source?: string;
    animation?: "fade";
    volume?: number;
    upscale?: boolean;
  };
}

/** Texts object — varies by visualType, all fields optional. */
export interface SceneTexts {
  badge?: string;
  subject?: string;
  subjectLogo?: string;
  bigNumber?: string;
  subtitle?: string;
  subtitleHighlight?: string;
  numberLabel?: string;
  numberHighlight?: string;
  hookText?: string;
  revealText?: string;
  source?: string;
  stats?: StatItem[];
  title?: string;
  brand?: string;
  brandHighlight?: string;
  tagline?: string;
  action?: string;
  topic?: string;
  // ContrastScene fields
  left?: string[];
  right?: string[];
  // InfoCardScene fields
  points?: string[];
  // ContextScene fields
  context?: string;
  detail?: string;
  // DataScene fields
  stat?: string;
  statLabel?: string;
  subtext?: string;
  /**
   * Structured highlight (T8): `field` names the texts field the fragment
   * lives in, `text` is the exact substring to annotate with rough-notation.
   * The render fails unless `text` is a substring of `texts[field]`
   * (assertKnownTextFields); only the fragment gets the annotation, the
   * surrounding copy renders plain.
   */
  highlight?: { field: string; text: string };
  [key: string]: string | StatItem[] | string[] | { field: string; text: string } | undefined; // allow visualType-specific fields + the structured highlight
}

/** A single scene definition (from scene-data.mjs). */
export interface SceneData {
  id: number;
  name?: string;
  visualType: string;
  voiceover: string;
  texts?: SceneTexts;
  /**
   * null is an explicit "no media ever" declaration (#191): the sourcing
   * filter skips the scene on every rerun. Absent field = source it.
   */
  media?: MediaField | null;
  /** Layout variant for scene rendering (required for non-cta scenes). */
  layout?: string;
  /**
   * Original-language source material reference (#185). `sourceText` (the
   * Chinese article excerpt the scene's claim came from) feeds the zh
   * keyword pool for zh-CN sources; url/title ride along for attribution.
   */
  sourceRef?: { url?: string; title?: string; sourceText?: string };
  /**
   * @deprecated (#191) — use `media: null` for "no media ever"; CSS-only
   * layouts (hero-center / stacked-cards) are auto-skipped. Still honored
   * at runtime until removal.
   */
  mediaOptOut?: boolean;
  /**
   * Per-scene asset rejection ledger (#192). Entries match candidate URLs
   * and local paths (exact or basename); asset-sourcer skips rejected
   * candidates for this scene on rerun and the flag is cleared once a new
   * asset is successfully assigned (main.mjs Step 1.5c). The VLM cache is
   * deliberately not bypassed by rejections — same-bytes-different-URL
   * collisions are rare and the rejection is a human judgment.
   */
  mediaReject?: { reason?: string; rejected: string[] };
}

/** Props passed to the ShortVideo Composition via renderMedia(). */
export interface ShortVideoProps {
  scenes: SceneData[];
  audioPaths: string[];
  durations: number[];
  contentDir?: string;
}
