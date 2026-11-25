/**
 * Caption readability for the TikTok feed — distinct from the platform maximum.
 *
 * TikTok truncates the caption behind “more” after roughly one line (measured
 * ~70–100 chars on current builds, Sept 2026). The platform still accepts 2,200
 * chars, and long captions remain useful as search text, but the human has to
 * meet the hook before the fold. This module turns that into a gate on new
 * packs:
 *
 *   first block (the part above “more”)   > 150 chars = FAIL, > 100 = WARN
 *   body before the hashtag line          > 300 chars = FAIL, > 200 = WARN
 *
 * The pack date decides whether the hard gate applies: packs created before
 * 2026-11-25 were authored under the old “≤ 2,200” contract and are warned,
 * not failed, so an accepted caption is never retroactively invalidated.
 *
 * Thresholds live here only; generate-publish-package, scene-rules and
 * verify-video all import them rather than carrying their own copies.
 */

export const CAPTION_READABILITY = Object.freeze({
  enforcedFrom: "2026-11-25",
  previewWarnChars: 100,
  previewMaxChars: 150,
  bodyWarnChars: 200,
  bodyMaxChars: 300,
});

/**
 * New packs (created on/after the enforcement date, or undated) must obey the
 * hard caps. Older packs are grandfathered and only warned.
 *
 * @param {object|null} [meta] - meta.mjs shape
 * @returns {boolean}
 */
export function shouldEnforceCaptionReadability(meta) {
  const createdAt = typeof meta?.createdAt === "string" ? meta.createdAt.slice(0, 10) : "";
  return createdAt === "" || createdAt >= CAPTION_READABILITY.enforcedFrom;
}

/**
 * Measure the feed-facing parts of a caption.
 *
 * A caption is `body\n\n#tag #tag\n`; the hashtag block does not count toward
 * body length because it sits after the text the reader is being asked to
 * read. The first visible line is what TikTok shows before “more”.
 *
 * @param {string} captionText - caption file content (body + blank line + hashtags)
 * @returns {{
 *   ok: boolean,
 *   metrics: { bodyChars: number, previewChars: number, totalChars: number, hashtagChars: number },
 *   issues: Array<{ level: "fail"|"warn", code: string, message: string }>
 * }}
 */
export function auditCaptionReadability(captionText) {
  const total = String(captionText ?? "")
    .replace(/\r\n/g, "\n")
    .trimEnd();
  const blocks = total.split(/\n{2,}/);
  const last = blocks.length > 1 ? blocks[blocks.length - 1].trim() : "";
  const hasHashtagBlock = last.startsWith("#");
  const hashtagChars = hasHashtagBlock ? last.length : 0;
  if (hasHashtagBlock) blocks.pop();

  const body = blocks.join("\n\n").trim();
  const preview =
    body
      .split("\n")
      .find((line) => line.trim().length > 0)
      ?.trim() ?? "";
  const bodyChars = body.length;
  const previewChars = preview.length;
  const issues = [];

  if (previewChars > CAPTION_READABILITY.previewMaxChars) {
    issues.push({
      level: "fail",
      code: "preview",
      message:
        `first block is ${previewChars} chars (max ${CAPTION_READABILITY.previewMaxChars}); ` +
        `TikTok folds it behind “more” near ${CAPTION_READABILITY.previewWarnChars}`,
    });
  } else if (previewChars > CAPTION_READABILITY.previewWarnChars) {
    issues.push({
      level: "warn",
      code: "preview",
      message:
        `first block is ${previewChars} chars; put the hook in the first ` +
        `${CAPTION_READABILITY.previewWarnChars} so it survives the fold`,
    });
  }

  if (bodyChars > CAPTION_READABILITY.bodyMaxChars) {
    issues.push({
      level: "fail",
      code: "body",
      message:
        `body is ${bodyChars} chars (max ${CAPTION_READABILITY.bodyMaxChars}); ` +
        `keep the supporting copy under ${CAPTION_READABILITY.bodyWarnChars}`,
    });
  } else if (bodyChars > CAPTION_READABILITY.bodyWarnChars) {
    issues.push({
      level: "warn",
      code: "body",
      message:
        `body is ${bodyChars} chars; the short-copy sweet spot is ` +
        `${CAPTION_READABILITY.bodyWarnChars} or less`,
    });
  }

  return {
    ok: issues.every((issue) => issue.level !== "fail"),
    metrics: { bodyChars, previewChars, totalChars: total.length, hashtagChars },
    issues,
  };
}
