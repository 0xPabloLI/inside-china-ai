/**
 * Media role — what the picture is FOR, which decides how much frame it gets.
 *
 * The 2026-11-15 media-led decision ("背后的图片视频更加重要一些") gave every
 * media field a full-bleed window, including AI-generated decoration. That is
 * how a Seedream still ended up owning two thirds of a news frame while the
 * text was pinned to a 312px bar. From 2026-11-18 the default flips:
 *
 *   evidence   — proves the claim (page capture, chart, official demo frame).
 *                Keeps the full-bleed band / media window.
 *   decorative — atmosphere only (AI still, stock, generic illustration).
 *                Renders in the bounded card window; hooks drop it entirely.
 *
 * Explicit `mediaRole` wins. Otherwise `media.evidence === true` marks evidence
 * and everything else is decoration. An author who has real first-party footage
 * without the evidence flag can promote it with `mediaRole: "evidence"`.
 *
 * @module media-role
 */

export const MEDIA_ROLE = Object.freeze({
  EVIDENCE: "evidence",
  DECORATIVE: "decorative",
});

export const MEDIA_ROLES = Object.freeze([MEDIA_ROLE.EVIDENCE, MEDIA_ROLE.DECORATIVE]);

/**
 * Resolve a scene's media role.
 *
 * @param {{media?: object|null, mediaRole?: string}} scene
 * @returns {"evidence"|"decorative"}
 */
export function mediaRoleOf(scene) {
  const explicit = scene?.mediaRole;
  if (explicit === MEDIA_ROLE.EVIDENCE || explicit === MEDIA_ROLE.DECORATIVE) return explicit;
  return scene?.media?.evidence === true ? MEDIA_ROLE.EVIDENCE : MEDIA_ROLE.DECORATIVE;
}

/**
 * Whether the scene's media may take the full-bleed band.
 *
 * @param {{media?: object|null, mediaRole?: string}} scene
 * @returns {boolean}
 */
export function isEvidenceMedia(scene) {
  return Boolean(scene?.media) && mediaRoleOf(scene) === MEDIA_ROLE.EVIDENCE;
}

/**
 * Media as the renderer should see it. Decorative media stays declared (so the
 * card can show it in narrative scenes) but hooks render `null` — a hook is
 * text-first unless the picture is proof.
 *
 * @param {{media?: object|null, mediaRole?: string, visualType?: string}} scene
 * @returns {object|null}
 */
export function renderableMedia(scene) {
  if (!scene?.media) return null;
  if (scene.visualType === "hook" && mediaRoleOf(scene) !== MEDIA_ROLE.EVIDENCE) return null;
  return scene.media;
}
