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
  "focus",
  "cropFocus",
  "source",
  "animation",
  "overlay",
  "volume",
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

    const unknown = Object.keys(media).filter((key) => !MEDIA_FIELD_KEYS.has(key));
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
