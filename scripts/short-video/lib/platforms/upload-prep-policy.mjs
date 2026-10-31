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
 * which is why `--publish` + `--no-aigc` needs more than a warning.
 *
 * @param {Object} profile - Platform profile
 * @param {Object} [opts]
 * @param {boolean} [opts.noAigc=false] - `--no-aigc` was passed
 * @param {boolean} [opts.publish=false] - `--publish` was passed (this run publishes)
 * @param {boolean} [opts.confirmUnlabeled=false] - `--confirm-unlabeled` was passed
 * @returns {{enabled: boolean, required: boolean, warning: string|null, overridden: boolean}}
 * @throws {Error} When the label is required and an automated publish would skip it
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
        `(profile.aiDisclosure.required: true) but --no-aigc was passed with --publish. ` +
        `The label cannot be added after publishing. Remove --no-aigc, or pass ` +
        `--confirm-unlabeled when this video genuinely contains no AI-generated content.` +
        (warning ? ` Profile note: ${warning}` : ""),
    );
  }

  return { enabled: false, required: true, warning, overridden: publish };
}
