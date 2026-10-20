#!/usr/bin/env node
/**
 * Product-view gate (#810).
 *
 * `docs/agents/implementation-workflow.md` §9 step 8 requires the "product-view
 * three sentences" (what user-visible problem / what the user sees now / what
 * did not change). §12 records that adding that rule did not work: deliveries
 * kept skipping it, and the recorded conclusion is that what was missing is
 * **blocking force, not wording**. This script is the blocking force — a bound
 * an agent can evaluate, checked on the pull-request body before CI goes green.
 *
 * The check is deliberately about presence and substance, not about truth: a
 * gate that cannot tell done from not-done just moves the skipping somewhere
 * less visible. Judging whether the three sentences are *true* stays with the
 * §9 product-verification gate, which a human reads.
 *
 * Contract (env in, exit code out — same shape as the other `scripts/` gates):
 *
 *   PR_BODY            full pull-request body
 *   PR_AUTHOR          pull_request.user.login
 *   PR_HEAD_REF        pull_request.head.ref
 *   PR_LABELS          comma-separated label names
 *   GITHUB_EVENT_NAME  defaults to "pull_request" (local runs have no event)
 *
 * Exit 0 = pass or exempt, exit 1 = fail with the reason and the three prompts.
 */
import { pathToFileURL } from "node:url";

/** Accepted heading, Chinese first because that is what the template ships. */
const SECTION_RE = /^#{1,3}[ \t]+(?:产品视角|product[\s-]?view)[ \t]*$/im;

/** A unit shorter than this is a label, not a sentence. */
const MIN_UNIT_CHARS = 8;

/** §9 step 8 asks for three sentences. */
const MIN_UNITS = 3;

/**
 * A template bullet left as `- 原本要解决的用户可见问题：` ends in a colon with
 * nothing after it. Without this rule, submitting the template verbatim would
 * satisfy the gate and the gate would be decorative.
 */
const PLACEHOLDER_TAIL_RE = /[：:]\s*$/;

/**
 * Whole-line placeholders. Lowercase on purpose: the repo's marker gate matches
 * the caps form case-sensitively, and a gate about placeholder text should not
 * register itself as unlinked debt. Comparison lowercases the line, so every
 * casing is still caught.
 */
const PLACEHOLDER_WORDS = new Set(["todo", "tbd", "n/a", "...", "…", "-", "—"]);

/**
 * Template guidance lives in HTML comments. They are instructions to the author,
 * so they must not count as content when someone submits the template untouched.
 * @param {string} text
 * @returns {string}
 */
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Pull one markdown section: the matched heading down to the next heading of the
 * same or a higher level (a deeper heading belongs to this section).
 * @param {string} body - full pull-request body
 * @returns {string|null} section body without the heading, or null when absent
 */
export function extractSection(body) {
  const text = stripHtmlComments(String(body ?? "")).replace(/\r\n/g, "\n");
  const match = SECTION_RE.exec(text);
  if (!match) return null;
  const level = match[0].match(/^#+/)[0].length;
  const rest = text.slice(match.index + match[0].length);
  const stop = new RegExp(`^#{1,${level}}[ \\t]+`, "m").exec(rest);
  return (stop ? rest.slice(0, stop.index) : rest).trim();
}

/**
 * Content lines of a section, with markdown decoration removed and template
 * placeholders dropped.
 * @param {string} section
 * @returns {string[]}
 */
export function substantiveLines(section) {
  return String(section ?? "")
    .split("\n")
    .map((line) =>
      line
        .replace(/^[\s>]*/, "")
        .replace(/^(?:[-*+]|\d+[.)])[ \t]+/, "")
        .replace(/^\[[ xX]\][ \t]*/, "")
        .trim(),
    )
    .filter((line) => line.length >= MIN_UNIT_CHARS)
    .filter((line) => !PLACEHOLDER_TAIL_RE.test(line))
    .filter((line) => !PLACEHOLDER_WORDS.has(line.toLowerCase()));
}

/**
 * Sentences in a block of text. Chinese and Latin terminators both count, so a
 * three-sentence paragraph passes just like a three-bullet list.
 * @param {string} text
 * @returns {number}
 */
export function countSentences(text) {
  return String(text ?? "")
    .split(/[。！？]+|[.!?](?=\s|$)/)
    .map((part) => part.trim())
    .filter((part) => part.length >= MIN_UNIT_CHARS).length;
}

/**
 * Substantive units in a section: the larger of its content lines and its
 * sentences, so either writing shape satisfies §9 step 8.
 * @param {string} section
 * @returns {number}
 */
export function countUnits(section) {
  const lines = substantiveLines(section);
  return Math.max(lines.length, countSentences(lines.join(" ")));
}

/**
 * Decide whether a pull request satisfies the product-view gate.
 *
 * @param {object} [input]
 * @param {string} [input.body] - pull-request body
 * @param {string} [input.author] - pull_request.user.login
 * @param {string} [input.headRef] - pull_request.head.ref
 * @param {string|string[]} [input.labels] - label names (comma-joined or array)
 * @param {string} [input.eventName] - GITHUB_EVENT_NAME
 * @returns {{ok: boolean, skipped: boolean, reason: string, units?: number}}
 */
export function evaluateProductView(input = {}) {
  const eventName = String(input.eventName ?? "pull_request");
  const author = String(input.author ?? "");
  const headRef = String(input.headRef ?? "");
  const labels = Array.isArray(input.labels) ? input.labels : String(input.labels ?? "").split(",");

  // Exemptions each exist for a reason, not for convenience: a skipped run
  // states which rule skipped it, so an exemption can never masquerade as a pass
  // an author earned.
  if (eventName !== "pull_request") {
    return {
      ok: true,
      skipped: true,
      reason: `event "${eventName}" carries no pull-request body`,
    };
  }
  if (author.endsWith("[bot]")) {
    return { ok: true, skipped: true, reason: `author ${author} is a bot` };
  }
  if (headRef.startsWith("release-please--")) {
    return {
      ok: true,
      skipped: true,
      reason: `release-please branch ${headRef} (body is generated)`,
    };
  }
  const cleaned = labels.map((label) => label.trim()).filter(Boolean);
  if (cleaned.includes("skip-product-view")) {
    return {
      ok: true,
      skipped: true,
      reason: "label skip-product-view",
    };
  }

  const body = String(input.body ?? "");
  if (!body.trim()) {
    return { ok: false, skipped: false, reason: "the pull-request body is empty" };
  }

  const section = extractSection(body);
  if (section === null) {
    return {
      ok: false,
      skipped: false,
      reason: "no product-view section (expected a `## 产品视角` or `## Product view` heading)",
    };
  }

  const units = countUnits(section);
  if (units < MIN_UNITS) {
    return {
      ok: false,
      skipped: false,
      units,
      reason: `the product-view section holds ${units} substantive unit(s), needs ${MIN_UNITS}`,
    };
  }
  return { ok: true, skipped: false, units, reason: `${units} substantive units` };
}

const PROMPTS = [
  "原本要解决什么用户可见问题",
  "用户现在看到什么变化",
  "哪些行为或边界没有变（无用户可见变化时写明原因）",
];

/** @param {{ok: boolean, skipped: boolean, reason: string}} result */
function report(result) {
  const tag = result.skipped ? "SKIP" : result.ok ? "PASS" : "FAIL";
  console.log(`[product-view] ${tag}: ${result.reason}`);
  if (result.ok) return;
  console.log("[product-view] add this to the pull-request body, three lines of substance:");
  for (const prompt of PROMPTS) console.log(`[product-view]   - ${prompt}：<这里是内容>`);
  console.log(
    "[product-view] no user-visible change? say so in the third line instead of leaving it short,",
  );
  console.log(
    "[product-view] or label the PR `skip-product-view` when the change has no user surface.",
  );
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const result = evaluateProductView({
    eventName: process.env.GITHUB_EVENT_NAME ?? "pull_request",
    body: process.env.PR_BODY ?? "",
    author: process.env.PR_AUTHOR ?? "",
    headRef: process.env.PR_HEAD_REF ?? "",
    labels: process.env.PR_LABELS ?? "",
  });
  report(result);
  process.exit(result.ok ? 0 : 1);
}
