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
  source?: string;
  animation?: "fade" | "ken-burns" | "slide" | "zoom" | "none";
  overlay?: number;
  volume?: number; // 0-1, default 0.08 (≈ -22dB). Video only; images have no audio.
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
  [key: string]: unknown; // allow visualType-specific fields
}

/** A single scene definition (from scene-data.mjs). */
export interface SceneData {
  id: number;
  name?: string;
  visualType: string;
  voiceover: string;
  texts?: SceneTexts;
  media?: MediaField;
}

/** Props passed to the ShortVideo Composition via renderMedia(). */
export interface ShortVideoProps {
  scenes: SceneData[];
  audioPaths: string[];
  durations: number[];
  contentDir?: string;
}
