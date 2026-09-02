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
  /** Keyword to highlight with @remotion/rough-notation (optional). */
  highlight?: string;
  [key: string]: string | StatItem[] | string[] | undefined; // allow visualType-specific fields
}

/** A single scene definition (from scene-data.mjs). */
export interface SceneData {
  id: number;
  name?: string;
  visualType: string;
  voiceover: string;
  texts?: SceneTexts;
  media?: MediaField;
  /** Layout variant for scene rendering (required for non-cta scenes). */
  layout?: string;
  /**
   * Scene-level opt-out of auto media sourcing (a deliberate CSS-only scene).
   * Read by scene-rules, final-media-gate and the b-roll orchestrator at the
   * SCENE level — never a text field (decision 66: it was briefly misplaced
   * in the texts contract, where the render layer now rejects it).
   */
  mediaOptOut?: boolean;
}

/** Props passed to the ShortVideo Composition via renderMedia(). */
export interface ShortVideoProps {
  scenes: SceneData[];
  audioPaths: string[];
  durations: number[];
  contentDir?: string;
}
