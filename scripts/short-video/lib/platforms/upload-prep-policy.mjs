/**
 * Publish-gate policy for the TikTok Studio upload driver (#951).
 *
 * Why this module exists
 * ----------------------
 * `lib/platforms/tiktok.mjs` declares two things the CDP driver used to work
 * around instead of asking:
 *
 *   - `enabledPublishMethods` — which publish paths the platform allows. The
 *     file said `["manual-guide"]` while `tiktok-upload-prep.mjs` published
 *     through CDP on 2026-10-25, so the "automation paths fail closed" comment
 *     next to it was false: nothing read the declaration.
 *   - `aiDisclosure.required` — declared since 2025-09-01 (《标识办法》) and
 *     read by nothing, which is how the first CDP post shipped unlabeled.
 *
 * Asking the profile here is what makes the declarations load-bearing: editing
 * the profile now changes runtime behaviour instead of only the checklist copy.
 * The policy is pure (no I/O, no argv) so it can be tested without importing
 * the driver, which starts a browser session on import. Method gating itself
 * stays in `publish-utils.mjs#resolvePublishMethod` — the driver calls it with
 * `CDP_PUBLISH_METHOD` from here rather than re-implementing the gate.
 */

import { PUBLISH_METHODS } from "./profile-model.mjs";

/**
 * The publish path this driver implements.
 *
 * Kept as a named constant so the driver reads as `resolvePublishMethod(profile,
 * { method: CDP_PUBLISH_METHOD })` rather than carrying a bare `"cdp"` literal.
 * The enum check below is not decoration: `PUBLISH_METHODS` is the single source
 * of truth for valid methods, and a rename there must fail here at load time
 * instead of silently making the driver ask for a method nobody enables.
 */
export const CDP_PUBLISH_METHOD = "cdp";

if (!PUBLISH_METHODS.includes(CDP_PUBLISH_METHOD)) {
  throw new Error(
    `upload-prep driver requires publish method "${CDP_PUBLISH_METHOD}", which is not in ` +
      `the PUBLISH_METHODS enum (${PUBLISH_METHODS.join(", ")}). Update this driver and ` +
      `lib/platforms/profile-model.mjs together.`,
  );
}

/**
 * Decide whether this run labels the post as AI-generated.
 *
 * The declaration is `profile.aiDisclosure.required`. TikTok cannot add the
 * label after publishing (verified: the Studio ⋯ menu only offers
 * 置顶/下载/删除), so the missing-label case is the one that has no recovery —
 * which is why `--no-aigc` on a publish-bound run needs more than a warning.
 * Since #1181 (ruled 2026-11-13) every non-dry run is publish-bound: it ends
 * in a prepared tab or a saved draft that the operator is one click from
 * publishing.
 *
 * @param {Object} profile - Platform profile
 * @param {Object} [opts]
 * @param {boolean} [opts.noAigc=false] - `--no-aigc` was passed
 * @param {boolean} [opts.publish=false] - this run hands the operator a publish-bound post
 * @param {boolean} [opts.confirmUnlabeled=false] - `--confirm-unlabeled` was passed
 * @returns {{enabled: boolean, required: boolean, warning: string|null, overridden: boolean}}
 * @throws {Error} When the label is required and a publish-bound run would skip it
 */
export function resolveAigcPolicy(
  profile,
  { noAigc = false, publish = false, confirmUnlabeled = false } = {},
) {
  const required = profile?.aiDisclosure?.required === true;

  if (!required) {
    return { enabled: !noAigc, required: false, warning: null, overridden: false };
  }
  if (!noAigc) {
    return { enabled: true, required: true, warning: null, overridden: false };
  }

  const warning = profile.aiDisclosure.note ?? null;

  if (publish && !confirmUnlabeled) {
    throw new Error(
      `AIGC disclosure is required for platform "${profile.platform}" ` +
        `(profile.aiDisclosure.required: true) but --no-aigc was passed in a run ` +
        `that prepares a publish-bound post. The label cannot be added after ` +
        `publishing. Remove --no-aigc, or pass --confirm-unlabeled when this video ` +
        `genuinely contains no AI-generated content.` +
        (warning ? ` Profile note: ${warning}` : ""),
    );
  }

  return { enabled: false, required: true, warning, overridden: publish };
}

/**
 * The terminal action a CDP upload run may take (#1181, ruled 2026-11-13).
 *
 * The ruling downgraded the web path to draft-only: an automated run may save
 * a draft, never click 发布 — the public click belongs to the operator. This is
 * the single contract entry for that decision; `--publish` is refused here,
 * before the browser opens, so no downstream branch can re-enable the public
 * exit by accident.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.publish=false] - `--publish` was passed
 * @param {boolean} [opts.saveDraft=false] - `--save-draft` was passed
 * @returns {{action: "save-draft"|"prepare"}}
 * @throws {Error} When `--publish` is requested (automated public exit is closed)
 */
export function resolveUploadPrepAction({ publish = false, saveDraft = false } = {}) {
  if (publish) {
    throw new Error(
      "Automated public publishing through the TikTok Studio web path is disabled " +
        "(#1181, ruled 2026-11-13): the automated run saves a draft only, and the " +
        "public click is made by the operator. Re-run with --save-draft, review the " +
        "draft in TikTok Studio, then click 发布 yourself.",
    );
  }
  return { action: saveDraft ? "save-draft" : "prepare" };
}
