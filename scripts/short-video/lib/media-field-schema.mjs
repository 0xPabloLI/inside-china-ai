/**
 * `scene.media` field schema for preflight (#836).
 *
 * #759 taught the final media gate to read `media.evidence` and
 * `media.provenance`, but nothing before render looked at them — a misspelled
 * `evidnce: true` produced no finding anywhere, and the gate then read the
 * scene as "not evidence", so the provenance requirement silently never
 * applied. This check makes "declared but not in effect" a preflight failure.
 *
 * The key list is the .mjs half of a twice-written contract:
 * `remotion/src/types.ts` (`MediaField`) says so in its own header, and
 * `media-field-schema.test.mjs` fails when the two drift apart.
 */
import { isPlainObject, shown, validateProvenance } from "./media-integrity.mjs";

/** Every key a `scene.media` object may carry. Mirrors `MediaField`. */
export const MEDIA_FIELD_KEYS = new Set([
  "type",
  "path",
  "mode",
  "fit",
  "fill", // #1524: "blur" backdrop behind a contained picture (media-first only)
  "focus",
  "cropFocus", // #1040: [0,1] CSS object-position ratio, not a source-space point
  "source",
  "animation",
  "volume",
  "audioIn", // #1525: scene-relative source-audio window, seconds
  "audioOut",
  "audioFadeIn",
  "audioFadeOut",
  "duckUnderNarration",
  "duckLevel",
  "upscale",
  "videoStartOffsetMs",
  "evidence",
  "provenance",
  "contentKind",
  "subjects",
  "backdrop",
]);

/**
 * Every key `scene.media.backdrop` may carry. Mirrors `MediaField["backdrop"]`
 * in `remotion/src/types.ts`; the same drift test keeps both lists honest.
 */
export const BACKDROP_FIELD_KEYS = new Set([
  "type",
  "path",
  "source",
  "animation",
  "volume",
  "upscale",
]);

/**
 * Keys that existed before the 2026-11-25 root rule and are now read by
 * nothing. They are accepted as no-ops so an old pack does not fail over a
 * dead field; there is no renderer path that consumes them.
 */
export const LEGACY_MEDIA_FIELD_KEYS = new Set(["overlay"]);

/**
 * Guidance for an unknown media key, shared with the patch writer so both
 * surfaces name the same two repo-root paths (#846 review).
 */
export const FIX_UNKNOWN_MEDIA_KEY =
  "Fix the key name, or add the field to MediaField (scripts/short-video/remotion/src/types.ts) and MEDIA_FIELD_KEYS (scripts/short-video/lib/media-field-schema.mjs) in the same change — the two halves are one contract.";

/**
 * Validate the shape of every declared `scene.media` object.
 *
 * Deliberately FAILs on unknown keys: the shipped corpus uses only keys from
 * {@link MEDIA_FIELD_KEYS} (38 scene-data files / 95 declarations measured
 * recursively when this landed), and a
 * WARN would reproduce the always-noisy check this repo keeps deleting.
 *
 * @param {Array<Record<string, any>>} scenes
 * @returns {Array<{level: string, category: string, check: string, detail?: string, fix?: string}>}
 */
export function checkMediaFieldSchema(scenes) {
  const results = [];

  for (const scene of scenes ?? []) {
    const media = scene.media;
    if (media === undefined || media === null) continue;

    if (!isPlainObject(media)) {
      results.push({
        level: "fail",
        category: "Media",
        check: `Media field schema: Scene ${scene.id} media is an object or null`,
        detail: `media must be an object or null, got ${Array.isArray(media) ? "array" : typeof media}`,
        fix: "Declare media as `{ type, path, … }`, or set `media: null` for a deliberate CSS-only scene (#191).",
      });
      continue;
    }

    const unknown = Object.keys(media).filter(
      (key) => !MEDIA_FIELD_KEYS.has(key) && !LEGACY_MEDIA_FIELD_KEYS.has(key),
    );
    if (unknown.length > 0) {
      results.push({
        level: "fail",
        category: "Media",
        check: `Media field schema: Scene ${scene.id} keys are recognised`,
        detail: `unknown media key(s): ${unknown.sort().join(", ")} — nothing reads them, so the declaration has no effect`,
        fix: FIX_UNKNOWN_MEDIA_KEY,
      });
    }

    // mode:"card" is honored only where the MediaCard branch exists; elsewhere
    // it silently falls back to the full-bleed MediaBackground it exists to
    // prevent (#848 review). Fail at preflight instead of at render.
    const cardHonored =
      scene.visualType === "hook" ||
      (scene.visualType === "narrative" && scene.layout === "media-bottom-bar");
    if (media.mode === "card" && !cardHonored) {
      results.push({
        level: "fail",
        category: "Media",
        check: `Media field schema: Scene ${scene.id} mode "card" is honored by its layout`,
        detail: `mode:"card" renders only in HookScene and NarrativeScene media-bottom-bar; scene ${scene.id} is ${scene.visualType}/${scene.layout ?? "no layout"} — it would silently fall back to full-bleed MediaBackground`,
        fix: 'Switch the scene to a narrative with layout "media-bottom-bar", or drop mode:"card" and keep the default background render.',
      });
    }

    // #1524: `fill` is the blurred backdrop behind a contained picture. It
    // only makes sense on the media-first layout (where the picture spans the
    // content band) and only with `fit: "contain"` — anything else silently
    // paints a blur under a cover-cropped picture, which changes nothing the
    // viewer can name but costs a second decode per scene.
    if (media.fill !== undefined) {
      if (media.fill !== "blur") {
        results.push({
          level: "fail",
          category: "Media",
          check: `Media field schema: Scene ${scene.id} fill is a known value`,
          detail: `media.fill must be "blur" (or absent), got ${shown(media.fill)} — nothing else is implemented`,
          fix: 'Use `fill: "blur"`, or drop the field.',
        });
      }
      if ((media.fit ?? "cover") !== "contain") {
        results.push({
          level: "fail",
          category: "Media",
          check: `Media field schema: Scene ${scene.id} fill requires contain`,
          detail: `media.fill is declared with fit "${media.fit ?? "cover"}" — the blur backdrop only fills the space a contained picture leaves`,
          fix: 'Add `fit: "contain"`, or drop media.fill and let cover crop the frame.',
        });
      }
      if (scene.visualType !== "narrative" || scene.layout !== "media-first") {
        results.push({
          level: "fail",
          category: "Media",
          check: `Media field schema: Scene ${scene.id} fill is honored by its layout`,
          detail: `media.fill renders only in NarrativeScene layout "media-first"; scene ${scene.id} is ${scene.visualType}/${scene.layout ?? "no layout"} — the declaration would have no effect`,
          fix: 'Move the beat to layout "media-first", or drop media.fill.',
        });
      }
    }

    // #1525: source-audio window. Numeric, non-negative, and only meaningful
    // on a video. A window whose out-point precedes its in-point is silent
    // everywhere, which is not what a producer writing "audioOut" means.
    const audioEdges = ["audioIn", "audioOut", "audioFadeIn", "audioFadeOut"];
    for (const key of audioEdges) {
      if (media[key] === undefined) continue;
      if (typeof media[key] !== "number" || !Number.isFinite(media[key]) || media[key] < 0) {
        results.push({
          level: "fail",
          category: "Media",
          check: `Media field schema: Scene ${scene.id} ${key} is a non-negative number`,
          detail: `media.${key} must be seconds as a finite number ≥ 0, got ${shown(media[key])} (${typeof media[key]})`,
          fix: `Write media.${key} in seconds (e.g. 2.4), or drop the field.`,
        });
      }
    }
    if (
      typeof media.audioIn === "number" &&
      typeof media.audioOut === "number" &&
      media.audioOut <= media.audioIn
    ) {
      results.push({
        level: "fail",
        category: "Media",
        check: `Media field schema: Scene ${scene.id} audioOut follows audioIn`,
        detail: `audioIn ${media.audioIn}s / audioOut ${media.audioOut}s — the window is empty or reversed, so no source sound can play`,
        fix: "Make audioOut later than audioIn, or drop one edge.",
      });
    }
    if (audioEdges.some((key) => media[key] !== undefined) && media.type !== "video") {
      results.push({
        level: "fail",
        category: "Media",
        check: `Media field schema: Scene ${scene.id} audio window is on a video`,
        detail: `media.type is "${media.type}"; an image has no source audio to window`,
        fix: 'Set media.type to "video", or drop the audio fields.',
      });
    }
    if (media.duckUnderNarration !== undefined && typeof media.duckUnderNarration !== "boolean") {
      results.push({
        level: "fail",
        category: "Media",
        check: `Media field schema: Scene ${scene.id} duckUnderNarration is a boolean`,
        detail: `got ${shown(media.duckUnderNarration)} (${typeof media.duckUnderNarration})`,
        fix: "Use `duckUnderNarration: true` or `false`, or drop the field.",
      });
    }
    if (media.duckLevel !== undefined) {
      if (
        typeof media.duckLevel !== "number" ||
        !Number.isFinite(media.duckLevel) ||
        media.duckLevel < 0 ||
        media.duckLevel > 1
      ) {
        results.push({
          level: "fail",
          category: "Media",
          check: `Media field schema: Scene ${scene.id} duckLevel is in [0, 1]`,
          detail: `got ${shown(media.duckLevel)} — it is a gain multiplier, not a percentage`,
          fix: "Use a number between 0 and 1 (0.25 = quarter volume), or drop the field.",
        });
      }
      if (media.duckUnderNarration !== true) {
        results.push({
          level: "fail",
          category: "Media",
          check: `Media field schema: Scene ${scene.id} duckLevel has an effect`,
          detail:
            "duckLevel is declared without duckUnderNarration:true — the renderer will never read it",
          fix: "Add `duckUnderNarration: true`, or drop duckLevel.",
        });
      }
    }

    if (
      media.evidence !== undefined &&
      media.evidence !== null &&
      media.evidence !== true &&
      media.evidence !== false
    ) {
      results.push({
        level: "fail",
        category: "Media",
        check: `Media field schema: Scene ${scene.id} evidence is a boolean`,
        detail: `media.evidence must be true, false or null, got ${shown(media.evidence)} (${typeof media.evidence}) — any other value switches the provenance requirement off`,
        fix: "Use `evidence: true` on Evidence Media, `false`/`null` for an explicit non-evidence declaration, or drop the field.",
      });
    }

    // `upscale` gained a second, non-boolean member in #1399. Both render seams
    // spell the dispatch as `upscale === "resample" ? … : undefined`, so a
    // mistyped string ("resampl") silently falls through to Real-ESRGAN — the
    // exact path that rewrites chart glyphs. Catch it at preflight, where the
    // declared value is still visible.
    if (
      media.upscale !== undefined &&
      media.upscale !== true &&
      media.upscale !== false &&
      media.upscale !== "resample"
    ) {
      results.push({
        level: "fail",
        category: "Media",
        check: `Media field schema: Scene ${scene.id} upscale is a known strategy`,
        detail: `media.upscale must be true, false or "resample", got ${shown(media.upscale)} (${typeof media.upscale}) — any other value falls through to the Real-ESRGAN path`,
        fix: 'Use `upscale: false` to opt out, `upscale: "resample"` for glyph-safe charts/screenshots, or drop the field.',
      });
    }

    if (media.evidence === true && !media.provenance) {
      results.push({
        level: "fail",
        category: "Media",
        check: `Media field schema: Scene ${scene.id} evidence declares provenance`,
        detail:
          "media.evidence:true without media.provenance — the final media gate would reject this scene after sourcing; catch it at preflight instead",
        fix: "Add media.provenance (sourceUrl / selector / rect / clip / scale; clip must contain rect), or drop evidence:true.",
      });
    }

    if (media.provenance !== undefined && media.provenance !== null) {
      const { ok, errors } = validateProvenance(media.provenance);
      if (!ok) {
        results.push({
          level: "fail",
          category: "Media",
          check: `Media field schema: Scene ${scene.id} provenance is valid`,
          detail: `invalid provenance: ${errors.join("; ")}`,
          fix: "Fix the declaration (page CSS px; clip must contain rect), or recapture the element — shape and checks live in scripts/short-video/lib/media-integrity.mjs.",
        });
      }
    }
  }

  if (results.length === 0) {
    results.push({
      level: "pass",
      category: "Media",
      check: "Media field schema (keys / evidence / provenance)",
    });
  }
  return results;
}
