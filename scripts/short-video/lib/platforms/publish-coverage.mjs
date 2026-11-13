/**
 * Publish-path coverage diff (#964).
 *
 * The CDP web upload path and the manual app guide do not execute the same
 * steps. Before this module the difference lived only in prose (and in a
 * comparison table that treated the manual guide as if every step had been
 * executed), so a run could silently publish with a weaker signal set.
 *
 * The rule is data-driven from `profile.manualGuide.steps`: every step id must
 * have an entry here, and a profile step without one is a hard error rather
 * than a row that quietly disappears. The contract test pins both directions
 * (no missing rule, no stale rule).
 *
 * Status semantics
 * ----------------
 *   auto          this run performs it
 *   replaced      the web path replaces the app step (not a gap)
 *   pending       still to do in this session / the open tab
 *   not-covered   the web path cannot do it (phone-only or no control)
 *   unverified    the script does not touch it; the operator must confirm
 *   off           deliberately disabled (--no-aigc)
 *   draft-lost    attached now, but a saved draft discards it
 *   post-publish  a follow-up after publishing (phone)
 */

/**
 * The render groups. Single source for both the printed sections, the totals
 * and the kind vocabulary, so a new kind cannot be counted in one place and
 * rendered in none.
 */
export const COVERAGE_GROUPS = Object.freeze({
  automated: Object.freeze(["auto"]),
  replaced: Object.freeze(["replaced"]),
  pending: Object.freeze(["pending"]),
  notCovered: Object.freeze(["not-covered", "unverified", "off", "draft-lost", "post-publish"]),
});

/** The kind vocabulary, derived from the groups so it cannot drift from them. */
export const COVERAGE_KINDS = Object.freeze(Object.values(COVERAGE_GROUPS).flat());

if (new Set(COVERAGE_KINDS).size !== COVERAGE_KINDS.length) {
  throw new Error("publish-coverage: a kind appears in more than one render group");
}

export const STEP_COVERAGE = Object.freeze({
  "open-app": Object.freeze({
    kind: "replaced",
    short: "Open TikTok app",
    note: "the web upload page replaces the app's [+] entry",
  }),
  "select-video": Object.freeze({
    kind: "auto",
    short: "Select video file",
  }),
  "aigc-label": Object.freeze({
    kind: "auto",
    short: "AI-generated content",
    offWhenNoAigc: true,
    offNote: "disabled by --no-aigc; the label cannot be added after publishing",
  }),
  "paste-caption": Object.freeze({
    kind: "auto",
    short: "Paste caption",
  }),
  "edit-sticker": Object.freeze({
    kind: "not-covered",
    short: "Edit",
    note:
      "app-only; the web path publishes a pre-rendered video. A Studio draft " +
      "does not sync to the phone app, so finish there by uploading the " +
      "exported mp4 (the web caption, sound and AIGC choices are redone)",
  }),
  "add-sound": Object.freeze({
    kind: "auto",
    short: "Audio",
    note:
      "attached and credited on the post; whether a web attach gets the same " +
      "distribution weighting as an in-app pick is unmeasured",
    pendingWithoutPublish: true,
    draftLost: true,
    pendingNote:
      "staged in the open editor; 保存 then 发布 in the tab, or re-run without " +
      "--save-draft to prepare the session that publishes. Whether a web attach " +
      "weights like an in-app pick is unmeasured",
    draftNote:
      "a saved draft drops the attached sound; the draft also does not reach " +
      "the phone app, so re-attach it in whichever session finishes the post",
  }),
  location: Object.freeze({
    kind: "not-covered",
    short: "Location",
    note:
      "neither path tagged a location (the successful manual posts did not either — " +
      "user-confirmed 2026-11-01), so this is not a CDP regression; a Studio draft " +
      "does not sync to the phone app, so add one only by exporting the mp4 and " +
      "uploading it in the app (the web caption, sound and AIGC choices are redone)",
  }),
  privacy: Object.freeze({
    kind: "unverified",
    short: "Privacy",
    note: "not set by this script; confirm Public in the open tab before publishing",
  }),
  publish: Object.freeze({
    kind: "not-covered",
    short: "Publish",
    note:
      "public publishing is manual (#1181, ruled 2026-11-13): the automated " +
      "path stops at a saved draft; click 发布 yourself in Studio, or upload " +
      "the exported mp4 in the app",
  }),
  "first-hour-engagement": Object.freeze({
    kind: "post-publish",
    short: "First hour",
    note: "after publishing: reply to every comment in the first hour (phone)",
  }),
  "pin-comment": Object.freeze({
    kind: "post-publish",
    short: "Pin a comment",
    note: "after publishing: pin the article-link comment (phone)",
  }),
});

/**
 * Build the diff for one run.
 *
 * @param {Object} profile - Platform profile (must carry manualGuide.steps)
 * @param {Object} [opts]
 * @param {boolean} [opts.aigcEnabled=true] - the AIGC label is applied
 * @param {boolean} [opts.draftSaved=false] - this run saves a draft instead
 * @param {boolean} [opts.aborted=false] - the run stopped before completion
 * @returns {{rows: Array<{id: string, short: string, kind: string, note: string|null}>, totals: {total: number, automated: number, replaced: number, pending: number, notCovered: number}}}
 */
export function buildCoverageDiff(
  profile,
  { aigcEnabled = true, draftSaved = false, aborted = false } = {},
) {
  const steps = profile?.manualGuide?.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("coverage diff requires profile.manualGuide.steps");
  }

  const rows = steps.map((step) => {
    const rule = STEP_COVERAGE[step.id];
    if (!rule) {
      throw new Error(
        `no coverage rule for manual-guide step "${step.id}" — add one in publish-coverage.mjs`,
      );
    }

    let kind = rule.kind;
    let note = rule.note ?? null;

    if (rule.offWhenNoAigc && aigcEnabled === false) {
      kind = "off";
      note = rule.offNote;
    } else if (rule.draftLost && draftSaved) {
      kind = "draft-lost";
      note = rule.draftNote;
    } else if (rule.pendingWithoutPublish) {
      kind = "pending";
      note = draftSaved && rule.draftNote ? rule.draftNote : (rule.pendingNote ?? null);
    }

    // An aborted run must not keep claiming steps it did not finish. The
    // operator takes over the open tab at that point, so every previously
    // automated/pending row becomes an explicit "confirm this" gap.
    if (aborted && ["auto", "pending", "draft-lost"].includes(kind)) {
      kind = "unverified";
      note = "run aborted before this step completed — confirm in the open tab";
    }
    if (aborted && step.id === "publish") {
      kind = "not-covered";
      note = "the run did not publish";
    }
    if (!COVERAGE_KINDS.includes(kind)) {
      throw new Error(`coverage diff produced unknown kind "${kind}" for step "${step.id}"`);
    }

    return { id: step.id, short: rule.short, kind, note };
  });

  const countIn = (group) => rows.filter((row) => COVERAGE_GROUPS[group].includes(row.kind)).length;
  return {
    rows,
    totals: {
      total: rows.length,
      automated: countIn("automated"),
      replaced: countIn("replaced"),
      pending: countIn("pending"),
      notCovered: countIn("notCovered"),
    },
  };
}

/**
 * Render the diff for the operator and the publish log.
 *
 * @param {{rows: Array<{id: string, short: string, kind: string, note: string|null}>, totals: Object}} diff
 * @returns {string}
 */
export function formatCoverageDiff(diff) {
  const { rows, totals } = diff;
  const lines = [
    "📋 Publish-path coverage (web Studio vs the manual app guide)",
    `   ${totals.automated} automated · ${totals.replaced} replaced · ${totals.pending} pending · ${totals.notCovered} not covered (${totals.total} steps)`,
  ];

  const section = (title, kinds) => {
    const group = rows.filter((row) => kinds.includes(row.kind));
    if (group.length === 0) return;
    lines.push("", `   ${title}`);
    for (const row of group) {
      lines.push(`     • ${row.short}${row.note ? ` — ${row.note}` : ""}`);
    }
  };

  section("✅ Automated by this run:", COVERAGE_GROUPS.automated);
  section("🔁 Replaced by the web path:", COVERAGE_GROUPS.replaced);
  section("⏳ Pending in this session:", COVERAGE_GROUPS.pending);
  section("⚠️  Not covered — phone or manual follow-up:", COVERAGE_GROUPS.notCovered);

  return lines.join("\n");
}
