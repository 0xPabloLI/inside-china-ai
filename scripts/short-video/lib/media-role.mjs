/**
 * Media role — what the picture is FOR, which decides how much frame it gets.
 *
 * The 2026-11-15 media-led decision ("背后的图片视频更加重要一些") gave every
 * media field a full-bleed window, including AI-generated decoration. That is
 * how a Seedream still ended up owning two thirds of a news frame while the
 * text was pinned to a 312px bar. From 2026-11-18 the default flips, and the
 * 2026-11-19 revision splits "not evidence" into two treatments:
 *
 *   evidence   — proves the claim (page capture, chart, official demo frame).
 *                Keeps the full-bleed band / media window.
 *   background — atmosphere only (AI still, stock, generic illustration).
 *                Fills the frame behind the text bar + scrims. This is the
 *                default for anything that is not evidence: a card floating in
 *                the middle of the frame leaves dead space and reads like a
 *                pasted sticker.
 *   card       — a whole subject that must be seen uncropped (product, person,
 *                object) but is not proof. Renders in the bounded 820×686 card.
 *
 * Explicit `mediaRole` wins (`decorative` is kept as a `card` alias for packs
 * written before this revision). Otherwise `media.evidence === true` marks
 * evidence and everything else is background. Importance cannot be inferred
 * from metadata alone — an author promotes a real first-party clip with
 * `mediaRole: "evidence"`, and a subject that needs the card writes `"card"`.
 *
 * @module media-role
 */

export const MEDIA_ROLE = Object.freeze({
  EVIDENCE: "evidence",
  BACKGROUND: "background",
  CARD: "card",
  /** @deprecated Alias for card (packs written before 2026-11-19). */
  DECORATIVE: "decorative",
});

export const MEDIA_ROLES = Object.freeze([
  MEDIA_ROLE.EVIDENCE,
  MEDIA_ROLE.BACKGROUND,
  MEDIA_ROLE.CARD,
  MEDIA_ROLE.DECORATIVE,
]);

/**
 * Resolve a scene's media role.
 *
 * @param {{media?: object|null, mediaRole?: string}} scene
 * @returns {"evidence"|"background"|"card"}
 */
export function mediaRoleOf(scene) {
  const explicit = scene?.mediaRole;
  if (explicit === MEDIA_ROLE.DECORATIVE) return MEDIA_ROLE.CARD;
  if (explicit === MEDIA_ROLE.EVIDENCE || explicit === MEDIA_ROLE.BACKGROUND || explicit === MEDIA_ROLE.CARD) {
    return explicit;
  }
  return scene?.media?.evidence === true ? MEDIA_ROLE.EVIDENCE : MEDIA_ROLE.BACKGROUND;
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
 * Media as the renderer should see it. Background and card media remain
 * declared in narrative scenes; hooks render `null` for both — a hook is
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
