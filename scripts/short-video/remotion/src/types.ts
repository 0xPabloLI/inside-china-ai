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
/**
 * Media object shape (#199 2.8). The validation-side enum constants
 * (VALID_MODES/VALID_FITS/VALID_FOCUSES) live in lib/media-bg.mjs; the key set
 * lives in lib/media-field-schema.mjs (MEDIA_FIELD_KEYS, #836). TS/.mjs are
 * written twice; update both together — a test fails when the key sets drift.
 */
/**
 * #759 Capture Provenance (采集凭据): the geometry an element-level capture
 * claims to have produced, in page CSS px. Consumed by the Node side only —
 * `lib/media-integrity.mjs` validates it (clip must contain rect) at the final
 * media gate; the renderer never reads it. The gate also reconciles
 * `clip × scale` with the file's real pixel size (#758).
 */
export interface MediaCaptureBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MediaProvenance {
  sourceUrl: string; // http(s) page the element was taken from
  selector: string; // element the rect belongs to
  rect: MediaCaptureBox; // the element
  clip: MediaCaptureBox; // what was actually captured — must contain rect
  scale: number; // device scale factor, > 0
  /** true = the bound file is a composition of this capture (legacy pre-composed banner), so the final gate skips pixel reconciliation. The deterministic producer never emits it. */
  composed?: boolean;
}

export interface MediaField {
  type: "image" | "video";
  path: string;
  mode?: "background" | "fullscreen" | "card"; // default "background" — card = framed evidence card (#663)
  fit?: "cover" | "contain"; // default "cover" — how to place landscape media in 9:16
  /** Solid matte behind a contained picture's letterbox (CSS color). Match the source's own edge so the card frame does not read as a dark shadow. */
  matteColor?: string;
  /**
   * #1524: fill behind a contained picture. `"blur"` paints a blurred,
   * cover-cropped copy of the same source across the container, so a 16:9
   * source sits at full width with no letterbox and no subject crop.
   * Only legal with `fit: "contain"`, and only on `media-first` or the
   * full-width media-led hook — the scene-data schema and preflight enforce
   * both.
   */
  fill?: "blur";
  /**
   * #1559: the media-led hook's full-canvas-width band. `true` fills the
   * frame width with the contained picture (1080×608 for a 16:9 source) and
   * moves subject/number into the plate below; `false` keeps the legacy
   * 820×619 band. Omitted: video evidence defaults to `true`, image evidence
   * keeps the legacy band (the CapCut / RunningHub regression baseline).
   * Requires `fit: "contain"`.
   */
  fullWidth?: boolean;
  /** @deprecated Replaced by protectedRegions from detectFocus() in Phase 2. Existing scene-data values still render, but new auto-analysis no longer writes this field. */
  focus?: "top" | "center" | "bottom"; // default "center" — crop focus when fit is "cover"
  /** #1040: normalized [0,1] CSS object-position ratio (0 = left/top, 0.5 = centre, 1 = right/bottom) — NOT a source-space point. `objectPositionFor` maps it straight to `${x * 100}%`; producers convert via crop-decision.mjs `sourceFocusToObjectPosition`. Overrides deprecated `focus` enum when present. Set by selectBestCrop(). */
  cropFocus?: { x: number; y: number }; // default undefined → falls back to `focus` enum
  source?: string;
  animation?: "fade" | "ken-burns" | "slide" | "zoom" | "none";
  volume?: number; // 0-1, default 0.08 (≈ -22dB). Video only; images have no audio.
  /**
   * #1525: scene-relative audio window, seconds. `audioIn` starts the source
   * sound at that scene time; `audioOut` stops it. Both default to the scene
   * edges, so omitting them keeps the pre-#1525 whole-scene behaviour. The
   * source is still the same clip selected by `videoStartOffsetMs`; this gates
   * what the viewer hears, not which frames play.
   */
  audioIn?: number;
  audioOut?: number;
  /** #1525: seconds of fade at the audio window edges; default 0.25 each. */
  audioFadeIn?: number;
  audioFadeOut?: number;
  /**
   * #1525: lower this clip's source audio while the scene has narration.
   * `duckLevel` is the multiplier (0–1, default 0.25); requires
   * `duckUnderNarration: true` because silent-by-default is the safer choice.
   */
  duckUnderNarration?: boolean;
  duckLevel?: number;
  /**
   * Controls the sub-720p upscale safety net. `false` opts out entirely (set by
   * the B-roll stage — Tier A clips are 480×832 by design). `"resample"` keeps
   * the net but swaps Real-ESRGAN for the deterministic kernel: charts and
   * screenshots carry glyphs the SR model rewrites, and its `-t 256` tiling
   * drops tiles outright (#1399). Default (unset/true) = the photo path.
   */
  upscale?: boolean | "resample";
  /** #360: start offset into the source video, ms (int ≥ 0, absent = 0). Consumed by MediaBackground to begin playback at the offset. Not produced by the pipeline (manual scene-data / patch only). */
  videoStartOffsetMs?: number;
  /** #759: marks this media as Evidence Media — the capture that carries the asserted fact itself. The final media gate then requires `provenance`. Only the boolean `true` marks; `null`/`false`/absent mean "not evidence", any other value fails the gate. */
  evidence?: boolean;
  /** #759: Capture Provenance for Evidence Media (see MediaProvenance). Validated at the final media gate, never by the renderer. */
  provenance?: MediaProvenance;
  /** VLM content classification (P3). Used by recommendScene for scene-type matching. */
  contentKind?:
    "product_demo" | "talking_head" | "landscape" | "chart" | "text_screenshot" | "other" | string;
  /** VLM key subject terms (P3). Used for semantic scoring in scoreCandidate. */
  subjects?: string[];
  /**
   * #156 backdrop layer: a generated clip rendered BENEATH the primary
   * media (visible where the primary doesn't cover the frame). Muted by
   * contract (volume 0); the primary media renders at its own brightness,
   * never through a dim layer. Written by the b-roll orchestrator when a
   * scene that already has media wins generation.
   */
  backdrop?: {
    type: "video";
    path: string;
    source?: string;
    animation?: "fade";
    /** Opt out of the frame-level right action-rail vignette. Default true.
     * Light full-bleed artwork otherwise reads as a hard vertical shadow in
     * the 200px TikTok action rail. */
    railVignette?: boolean;
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

/**
 * #214 digital-human foreground card declaration. Schema owner:
 * lib/scene-rules.mjs checkAvatarContract (fail-closed on unknown fields).
 * videoPath is content-relative as authored; render-remotion.mjs
 * stageAvatarVideos() rewrites it to the `_staged/` path under public/assets/
 * and fail-closes on missing/corrupt files before the render starts.
 */
export interface AvatarField {
  videoPath?: string;
  position?: "right-card"; // default; the only rendered variant (1′)
  scale?: number;
  /** On-screen seconds (scene-local); omitted = the card covers the whole scene. */
  present?: { from: number; to: number }[];
}

/** One native-chart datum (#1398). */
export interface InfoDatum {
  label: string;
  value: number;
  /** Second endpoint for a slope chart. */
  value2?: number;
  highlight?: boolean;
}

/** One baked daily bar (#1405). Prices are HK dollars; volume is shares. */
export interface CandleBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  highlight?: boolean;
}

/**
 * Native chart grammar (#1398). `relationship` chooses the chart family;
 * `chart` names the shape; `data` is the small, directly-labeled series.
 * Validation and defaults live in `lib/info-grammar.mjs` — this type is the
 * renderer-facing mirror, not a second source of truth.
 */
export interface InfoSpec {
  relationship: string;
  chart: string;
  /** Category series, or the baked OHLC series for `chart: "candle"`. */
  data: InfoDatum[] | CandleBar[];
  unit: string;
  baseline?: number;
  sort?: "none" | "asc" | "desc";
  highlight?: string;
  time?: { from: string; to: string };
  decimals?: number;
  prefix?: string;
  suffix?: string;
  axisLabels?: [string, string];
  panelVariant?: "clean" | "terminal";
  /** Attribution inside the frame (#1405); candle charts print it on-canvas. */
  credit?: string;
  /** Bake contract (#1405): instrument and file the series was baked from. */
  symbol?: string;
  dataFile?: string;
}

/**
 * Pack-level narrative arc (#1398). Separate from `narrativeRole`, which
 * already carries the legacy S/T/A/R retention taxonomy.
 */
export type NarrativeArcRole = "establisher" | "initial" | "peak" | "release";

/** Declared attention budget for one scene (#1398). */
export interface AttentionSpec {
  /** Arrays are accepted only so the advisory audit can report >1 cue. */
  cue?: string | string[];
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
  /**
   * What the picture is FOR (2026-11-18, revised 2026-11-19). `evidence` keeps
   * the full-bleed band; `background` fills the frame behind the opaque text panels;
   * `card` is the bounded 820×686 window. Omitted → `media.evidence === true`
   * decides, everything else defaults to background. `decorative` is a legacy
   * alias for card.
   */
  mediaRole?: "evidence" | "background" | "card" | "decorative";
  /** Digital-human foreground card (#214) — rendered by components/AvatarCard. */
  avatar?: AvatarField;
  /** Layout variant for scene rendering (required for non-cta scenes). */
  layout?: string;
  /** Native chart grammar (#1398), valid only with `layout: "chart"`. */
  info?: InfoSpec;
  /** E/I/P/R role for the pack-level narrative arc audit (#1398). */
  arcRole?: NarrativeArcRole;
  /** Declared attention cue(s) for the advisory attention-budget audit (#1398). */
  attention?: AttentionSpec;
  /** Legacy S/T/A/R retention role; consumed by the retention checks, not the arc audit. */
  narrativeRole?: string;
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
