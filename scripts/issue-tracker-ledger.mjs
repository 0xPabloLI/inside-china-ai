/**
 * The two closing ledgers' shared decision (#315, #810 follow-up).
 *
 * A closed issue can carry `delivery-record-missing`, `product-view-missing`, or
 * neither, and three workflow jobs read that state: the close job that sets it,
 * the comment job that clears it, and the nightly recheck. Before this module
 * each job carried its own copy of the marker regex, the waiver regex, the label
 * strings and the record filter — in a file no linter reads. That is how the
 * first cut of the product-view gate shipped a branch that filed explicit
 * `无需交付记录` waivers under the missing-record ledger: the record regex matched
 * the waiver's substring first, and there was no second place for the order to
 * disagree with.
 *
 * So the workflow bodies no longer decide anything. Each one pipes the issue's
 * comments into this module's CLI and acts on the JSON it prints:
 *
 *   node scripts/issue-tracker-ledger.mjs           < comments.json
 *   {"labels":{...},"hasWaiver":false,"recordCount":1,"coversProductView":false,...}
 *
 * A throw here fails the job loudly. That is deliberate: the alternative is
 * treating "the module did not load" as "the record is not compliant", which
 * would mislabel every issue the run touched.
 *
 * The three-sentence rule itself still has exactly one implementation,
 * `evaluateCommentProductView` in `scripts/check-product-view.mjs` — the same
 * function the PR-body gate uses. This module only decides how comments map onto
 * that judgement and onto the labels.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { evaluateCommentProductView } from "./check-product-view.mjs";

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
 * Whether any comment explicitly declined to write a delivery record.
 * @param {Array<{user?: object, body?: string}>} [comments]
 * @returns {boolean}
 */
export function hasWaiver(comments = []) {
  return comments.some(isWaiverComment);
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
    "1. 原本要解决什么用户可见问题",
    "2. 用户现在看到什么变化",
    "3. 哪些行为或边界没有变（无用户可见变化时写明原因）",
    "",
    "补一条带 `## 产品视角` 节、且仍带 `交付记录` 标记的评论即可，`product-view-missing` 账本自动摘除。",
    "账本查询：`gh issue list --label product-view-missing --state closed`。",
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
    "请补一条**自包含**的交付记录评论——开头是产品影响三句（原本要解决什么用户可见问题、用户现在看到什么变化、哪些行为或边界没有变；无用户可见变化时写明原因），再列 commit sha、验证证据（测试 / live evidence）、发现的机制和遗留项；标准是「没见过这个 session 的读者仅凭该评论就能恢复或审计这项工作，并知道用户看到了什么变化」。",
    "",
    "补登后 `delivery-record-missing` 自动摘除；缺失超 3 天未补，日检会催办一次。",
  ].join("\n");
}

/**
 * The constants the jobs need before they can talk to any issue: which labels
 * exist, how long an entry may sit unresolved, and the wording of both
 * reminders. Read once per job run through `--config`.
 * @returns {{labels: {deliveryRecord: string, productView: string}, staleDays: number, recordMissingReminder: string, productViewReminder: string}}
 */
export function ledgerConfig() {
  return {
    labels: { deliveryRecord: DELIVERY_RECORD_LABEL, productView: PRODUCT_VIEW_LABEL },
    staleDays: STALE_DAYS,
    recordMissingReminder: recordMissingReminder(),
    productViewReminder: productViewReminder(),
  };
}

/**
 * Everything the three jobs need to know about one issue's comments.
 *
 * `recordCount` counts records; `coversProductView` is true when **any** record
 * carries the section. Per issue, not per comment: an issue holding one compliant
 * record is accounted for even if a later comment restates only the commits.
 *
 * @param {Array<{user?: object, body?: string}>} [comments]
 * @returns {ReturnType<typeof ledgerConfig> & {
 *   hasWaiver: boolean,
 *   recordCount: number,
 *   coversProductView: boolean,
 * }}
 */
export function decideLedgerState(comments = []) {
  const records = comments.filter(isRecordComment);
  return {
    ...ledgerConfig(),
    hasWaiver: comments.some(isWaiverComment),
    recordCount: records.length,
    coversProductView: records.some(commentCoversProductView),
  };
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  // `--config` answers "what are the labels and the stale window" without
  // needing an issue; the plain form answers "what does this issue's comment
  // list say". Two questions, two shapes — an empty issue is not a config.
  if (process.argv.includes("--config")) {
    process.stdout.write(`${JSON.stringify(ledgerConfig())}\n`);
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
