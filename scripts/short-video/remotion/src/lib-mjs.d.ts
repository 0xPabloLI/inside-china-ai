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
    alignment: number;
    marginL: number;
    marginR: number;
  };
  export const SUBTITLE_LANE_BOTTOM: number;
  export const SUBTITLE_LANE_TOP: number;
  export const WATERMARK_POS: { top: number; left: number };
  export const BRAND_FONT_STACK: string;
}

declare module "../../../lib/type-scale.mjs" {
  export type TypeBand = { min: number; max: number | null };
  export const TYPE_TIERS: {
    label: TypeBand;
    supporting: TypeBand;
    hero: TypeBand;
  };
  export const EMPTY_FIELD: {
    maxObjectPx: number;
    minFrames: number;
    visualTypes: readonly string[];
  };
  export function tierForSize(px: number): "label" | "supporting" | "hero" | null;
  export function isEmptyField(input: {
    largestObjectPx: number | null | undefined;
    frames?: number | null;
  }): boolean;
}

declare module "../../../lib/timeline.mjs" {
  export const FPS: number;
  export const SCENE_BUFFER: number;
  export function sceneClipFrames(ttsDuration: number, fps?: number): number;
  export function sceneClipDuration(ttsDuration: number, fps?: number): number;
}

declare module "../../../lib/official-fit-kernel.mjs" {
  export function officialSeedSize(
    predicted: number,
    slot: { minSize: number; preferredSize: number; step?: number },
  ): number;
  export function fitCandidatesFromSeed(
    slot: { preferredSize: number; minSize: number },
    seed?: number,
    step?: number,
  ): number[];
  export function minContainerSeed(seeds: number[]): number | null;
  export function solveSingleLinePxLetterSpacing(p: {
    adv100: number;
    letterSpacingTotal: number;
    maxWidth: number;
  }): number | null;
}
