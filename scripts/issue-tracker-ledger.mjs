/**
 * The two closing ledgers' shared decision (#315, #810 follow-up).
 *
 * A closed issue can carry `delivery-record-missing`, `product-view-missing`, or
 * neither, and four workflow jobs read that state: the close job that sets it,
 * the comment job that clears it, the nightly recheck, and the manual backlog
 * sweep. Before this module each job carried its own copy of the marker regex,
 * the waiver regex, the label strings, the cutoff date and the reminder prose —
 * in a file no linter reads. That is how the first cut of the product-view gate
 * shipped a branch that filed explicit `无需交付记录` waivers under the
 * missing-record ledger: the record regex matched the waiver's substring first,
 * and there was no second place for the order to disagree with.
 *
 * So the four jobs decide nothing themselves. Each pipes the issue's comments
 * into this module's CLI and acts on the JSON it prints:
 *
 *   node scripts/issue-tracker-ledger.mjs           < comments.json
 *   {"hasWaiver":false,"recordCount":1,"coversProductView":false,...}
 *
 *   node scripts/issue-tracker-ledger.mjs --config --owner <login>
 *   {"labels":{...},"staleDays":3,"ledgerCutoff":"...","markers":{...},"escalations":{...}}
 *
 * A throw here fails the job loudly. That is deliberate: the alternative is
 * treating "the module did not load" as "the record is not compliant", which
 * would mislabel every issue the run touched.
 *
 * The three-sentence rule itself still has exactly one implementation,
 * `evaluateCommentProductView` in `scripts/check-product-view.mjs` — counting,
 * not a second copy of the rule; and the three role names it counts toward come
 * from the same place, `PRODUCT_VIEW_ROLES`. This module only decides how
 * comments map onto that judgement and onto the labels.
 *
 * Scope, stated honestly because the ledger's reach is easy to overclaim: the
 * product-view ledger is bounded by **when a record is judged**, not by when the
 * issue closed. The close job judges new closures; the comment job judges a
 * record written later, so a pre-gate issue whose record someone backfills today
 * is held to today's standard. Nothing labels an issue whose comments nobody
 * touches, and the manual sweep only writes the missing-record ledger.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { evaluateCommentProductView, PRODUCT_VIEW_ROLES } from "./check-product-view.mjs";

/** Set on a closed issue whose comments carry no `交付记录` / `Delivery record` marker. */
export const DELIVERY_RECORD_LABEL = "delivery-record-missing";

/** Set on a closed issue whose record exists but has no `## 产品视角` section with three units. */
export const PRODUCT_VIEW_LABEL = "product-view-missing";

/** The marker that makes a comment a delivery record. */
export const RECORD_MARKER = /交付记录|Delivery record/i;

/**
 * The explicit opt-out. Tested before `RECORD_MARKER` because `无需交付记录`
 * contains `交付记录`; reading the record marker first turns a waiver into a
 * delivery record.
 */
export const WAIVER_MARKER = /无需交付记录|delivery-record-waived/i;

/** Age at which an unresolved ledger entry is escalated, once. */
export const STALE_DAYS = 3;

/**
 * Grandfathering cutoff (user decision 2026-09-20): 161 issues closed before the
 * record gate went CI-shaped are never entered or escalated. Two jobs used to
 * repeat this date; a date two places must agree on is the same drift risk as a
 * regex two places must agree on.
 */
export const LEDGER_CUTOFF_ISO = "2026-09-19T00:00:00Z";

/**
 * The escalation dedup markers. They live with the prose that carries them, so a
 * job cannot check for one string and post another.
 */
export const ESCALATION_MARKERS = {
  record: "<!-- delivery-record-escalation -->",
  productView: "<!-- product-view-escalation -->",
};

/**
 * CI writes the reminders, and the bot's own comments contain the marker word, so
 * a bot comment must never count as the record it is complaining is missing.
 * @param {{user?: {type?: string}}} [comment]
 * @returns {boolean}
 */
export function isHumanComment(comment) {
  return Boolean(comment) && comment.user?.type !== "Bot";
}

/**
 * @param {{user?: object, body?: string}} [comment]
 * @returns {boolean}
 */
export function isWaiverComment(comment) {
  return isHumanComment(comment) && WAIVER_MARKER.test(comment.body ?? "");
}

/**
 * @param {{user?: object, body?: string}} [comment]
 * @returns {boolean}
 */
export function isRecordComment(comment) {
  return (
    isHumanComment(comment) && RECORD_MARKER.test(comment.body ?? "") && !isWaiverComment(comment)
  );
}

/**
 * Whether a comment also carries the product-view three sentences.
 * @param {{body?: string}} [comment]
 * @returns {boolean}
 */
export function commentCoversProductView(comment) {
  return evaluateCommentProductView(comment?.body ?? "").ok;
}

/**
 * @param {Array<{user?: object, body?: string}>} [comments]
 * @returns {boolean}
 */
function hasWaiver(comments = []) {
  return comments.some(isWaiverComment);
}

/**
 * The three roles as a numbered prompt, shared by both reminders and both
 * escalations so no job re-types them.
 * @returns {string}
 */
function roleList() {
  return PRODUCT_VIEW_ROLES.map((role, index) => `${index + 1}. ${role}`).join("\n");
}

/**
 * The actionable message for a record that exists but says nothing about users.
 * Shared so the close job and a late backfill ask for exactly the same thing.
 * @returns {string}
 */
export function productViewReminder() {
  return [
    "⚠️ **交付记录缺产品视角三句** —— 有带 `交付记录` 标记的评论，但它没有 `## 产品视角` 节，或不足三条实质内容。",
    "",
    "按 `docs/agents/issue-tracker.md` 的 Session cognitive offload 与 `docs/agents/implementation-workflow.md` §9 第 8 步，交付记录以这三句开头：",
    "",
    roleList(),
    "",
    `补一条带 \`## 产品视角\` 节、且仍带 \`交付记录\` 标记的评论即可，\`${PRODUCT_VIEW_LABEL}\` 账本自动摘除。`,
    `账本查询：\`gh issue list --label ${PRODUCT_VIEW_LABEL} --state closed\`。`,
  ].join("\n");
}

/**
 * The actionable message for a closed issue with no record at all.
 * @returns {string}
 */
export function recordMissingReminder() {
  return [
    "⚠️ **交付记录缺失** —— 这张票已关闭，但没有任何评论带 `交付记录` / `Delivery record` 标记。",
    "",
    "按 `docs/agents/issue-tracker.md` 的 Session cognitive offload：per-issue 交付记录的**唯一 home 是评论**（正文是 write-once，不改）。",
    "",
    "请补一条**自包含**的交付记录评论——开头是产品影响三句（" +
      PRODUCT_VIEW_ROLES.join("、") +
      "），再列 commit sha、验证证据（测试 / live evidence）、发现的机制和遗留项——每项用自己的 `##` 标题分段，最终汇报渲染产品视角时就只会拿到三句（节的边界见 `implementation-workflow.md` §9 第 8 步）；标准是「没见过这个 session 的读者仅凭该评论就能恢复或审计这项工作，并知道用户看到了什么变化」。",
    "",
    `补登后 \`${DELIVERY_RECORD_LABEL}\` 自动摘除；缺失超 ${STALE_DAYS} 天未补，日检会催办一次。`,
    `账本查询：\`gh issue list --label ${DELIVERY_RECORD_LABEL} --state closed\`。`,
  ].join("\n");
}

/**
 * The one-time nudge the nightly recheck posts for a record ledger entry.
 * @param {string} owner - repository owner, for the @-mention
 * @returns {string}
 */
export function recordMissingEscalation(owner) {
  return [
    ESCALATION_MARKERS.record,
    `🏳️ 这张票已关闭超过 ${STALE_DAYS} 天，仍没有带 \`交付记录\` / \`Delivery record\` 标记的评论。`,
    "",
    `@${owner} 请补登交付记录（产品影响三句：${PRODUCT_VIEW_ROLES.join(" / ")}；commit / 证据 / 遗留项）；确认无需交付记录（如拒绝项）时，回复包含 \`无需交付记录\` 的评论即可清账。`,
    `账本查询：\`gh issue list --label ${DELIVERY_RECORD_LABEL} --state closed\`。`,
  ].join("\n");
}

/**
 * The one-time nudge the nightly recheck posts for a product-view ledger entry.
 * @param {string} owner - repository owner, for the @-mention
 * @returns {string}
 */
export function productViewEscalation(owner) {
  return [
    ESCALATION_MARKERS.productView,
    `🏳️ 这张票已关闭超过 ${STALE_DAYS} 天，交付记录仍缺产品视角三句。`,
    "",
    "@" + owner + " 按下面三条补一节 `## 产品视角`，并仍带 `交付记录` 标记：",
    "",
    roleList(),
    "",
    `账本查询：\`gh issue list --label ${PRODUCT_VIEW_LABEL} --state closed\`。`,
  ].join("\n");
}

/**
 * The constants a job needs before it can talk to any issue: which labels
 * exist, how long an entry may sit, which closures are grandfathered, which
 * markers guard the once-only escalations, and the escalation prose. Read once
 * per run through `--config`.
 *
 * `owner` is optional because the escalations are the only owner-dependent
 * strings; without it they are `null` rather than a body addressed to nobody.
 *
 * @param {string} [owner]
 * @returns {{
 *   labels: {deliveryRecord: string, productView: string},
 *   staleDays: number,
 *   ledgerCutoff: string,
 *   markers: {record: string, productView: string},
 *   escalations: {record: string, productView: string} | null,
 * }}
 */
export function ledgerConfig(owner = "") {
  return {
    labels: { deliveryRecord: DELIVERY_RECORD_LABEL, productView: PRODUCT_VIEW_LABEL },
    staleDays: STALE_DAYS,
    ledgerCutoff: LEDGER_CUTOFF_ISO,
    markers: { ...ESCALATION_MARKERS },
    escalations: owner
      ? { record: recordMissingEscalation(owner), productView: productViewEscalation(owner) }
      : null,
  };
}

/**
 * Everything the jobs need to know about one issue's comments.
 *
 * `recordCount` counts records; `coversProductView` is true when **any** record
 * carries the section. Per issue, not per comment: an issue holding one compliant
 * record is accounted for even if a later comment restates only the commits.
 *
 * @param {Array<{user?: object, body?: string}>} [comments]
 * @returns {{
 *   hasWaiver: boolean,
 *   recordCount: number,
 *   coversProductView: boolean,
 *   recordMissingReminder: string,
 *   productViewReminder: string,
 * }}
 */
export function decideLedgerState(comments = []) {
  const records = comments.filter(isRecordComment);
  return {
    hasWaiver: hasWaiver(comments),
    recordCount: records.length,
    coversProductView: records.some(commentCoversProductView),
    recordMissingReminder: recordMissingReminder(),
    productViewReminder: productViewReminder(),
  };
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  // `--config` answers "what are the labels, the stale window, the cutoff and the
  // escalation wording" without needing an issue; the plain form answers "what
  // does this issue's comment list say". Two questions, two shapes — an empty
  // issue is not a config.
  if (process.argv.includes("--config")) {
    const ownerAt = process.argv.indexOf("--owner");
    const owner = ownerAt === -1 ? "" : (process.argv[ownerAt + 1] ?? "");
    process.stdout.write(`${JSON.stringify(ledgerConfig(owner))}\n`);
  } else {
    const raw = readFileSync(0, "utf8");
    const parsed = raw.trim() ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      console.error("[issue-tracker-ledger] stdin must be a JSON array of comments");
      process.exit(1);
    }
    process.stdout.write(`${JSON.stringify(decideLedgerState(parsed))}\n`);
  }
}
