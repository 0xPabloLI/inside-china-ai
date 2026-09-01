/**
 * Type declarations for .mjs imports from the existing pipeline lib/.
 * These let TypeScript understand the pure-JS modules we import.
 */

declare module "../../../lib/safe-zones.mjs" {
  export const CANVAS: { width: number; height: number };
  export const SAFE_ZONES: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  export const SUBTITLE_LANE: {
    marginV: number;
    fontSize: number;
    maxLines: number;
    lineHeight: number;
    maxWidth: number;
    marginL: number;
    marginR: number;
  };
  export const SUBTITLE_LANE_BOTTOM: number;
  export const SUBTITLE_LANE_TOP: number;
  export const WATERMARK_POS: { top: number; left: number };
  export const BRAND_FONT_STACK: string;
}

declare module "../../../lib/timeline.mjs" {
  export const FPS: number;
  export const SCENE_BUFFER: number;
  export function frameCount(seconds: number, fps?: number): number;
  export function sceneClipFrames(ttsDuration: number, fps?: number): number;
  export function sceneClipDuration(ttsDuration: number, fps?: number): number;
}
