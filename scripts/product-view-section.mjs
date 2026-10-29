#!/usr/bin/env node
/**
 * Render the `## 产品视角` section the final report quotes (#810 follow-up).
 *
 * §9 step 8 asks for the same three sentences on three surfaces. The PR body and
 * the closing comment now have mechanical gates (#810, #966); the final report is
 * chat text, so CI has no input to judge. The two harness options are both wrong:
 * a `Stop` hook cannot tell a progress message from a report, and its only input
 * is a transcript path with no published format. Adding a third gate would mean
 * guessing.
 *
 * So this script removes the third surface instead of policing it. The report
 * quotes a section that already passed the gate — the newest compliant record
 * comment written by someone with write access, or the pull-request body when no
 * comment qualifies. The report cannot then say something different from what the
 * ticket says, because it is not saying anything of its own.
 *
 * Quoting is not vouching, and the difference is load-bearing: the gate checks
 * that a section has shape, not that its sentences are true or benign, so a
 * comment body is still untrusted text. Two things keep that honest — the output
 * opens with a marker naming its source (it travels with a paste, so the quoted
 * text never reads as the agent's own claim), and only authors GitHub calls
 * OWNER / MEMBER / COLLABORATOR can be quoted at all.
 *
 * What it is not: a gate. It renders, and it refuses to print a section the gate
 * would reject. An agent that forgets to run it produces a report with the whole
 * section missing — visible to the reader — rather than a plausible-looking
 * section written from memory. That failure is the point; a silent one would put
 * us back where #353 was.
 *
 * Contract:
 *
 *   node scripts/product-view-section.mjs <issue-or-pr-number> [--repo owner/name]
 *     stdout: a source marker, `## 产品视角`, and the section body, to paste verbatim
 *     stderr: provenance (`source=comment:<id>` / `source=pr-body`) or the reason
 *     exit 0 = rendered, 1 = nothing compliant to quote, 2 = bad usage
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { evaluateCommentProductView, extractSection } from "./check-product-view.mjs";
import { isRecordComment } from "./issue-tracker-ledger.mjs";
import { runGh } from "./short-video/lib/gh-cli.mjs";

/** The heading the report opens with; the gate accepts the English spelling too. */
const HEADING = "## 产品视角";

/**
 * GitHub's `author_association` values for people who can write to the repo. The
 * report quotes this text as the ticket's account, so only these authors can be
 * the source; see the note at the filter for why the ledger is broader.
 */
const WRITERS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/** How to fix the failure, quoted in every message so it needs no doc lookup. */
const FIX =
  "post the delivery record (marker `交付记录` / `Delivery record` plus a `## 产品视角` section) and render again";

/**
 * @param {string[]} reasons
 * @returns {string[]} one entry per distinct reason; two bare records are one bug
 */
function dedupe(reasons) {
  return [...new Set(reasons)];
}

/**
 * The text the report pastes: the section, preceded by a marker naming where it
 * came from.
 *
 * The marker travels with a paste, which is what keeps the quoted text from
 * reading as the agent's own verified claim — and it is an HTML comment, which
 * `stripHtmlComments` removes, so it never changes how the gate counts the
 * section it wraps.
 *
 * @param {string} body
 * @param {string} provenance - `comment:<id>` or `pr-body`
 * @returns {string}
 */
function render(body, provenance) {
  return `<!-- product-view: source=${provenance} (quoted from the ticket) -->\n${HEADING}\n\n${extractSection(body)}\n`;
}

/**
 * @typedef {{ok: true, text: string, source: {kind: "comment", id?: number} | {kind: "pr-body"}} |
 *   {ok: false, reason: string}} SectionResult
 */

/**
 * @param {object} options
 * @param {number} options.number - issue or pull-request number (one namespace)
 * @param {string} [options.repo] - `owner/name`; omitted means gh fills `{owner}/{repo}`
 * @param {(args: string[]) => string} [options.runGh] - seam for tests
 * @returns {SectionResult}
 */
export function renderProductViewSection({ number, repo, runGh: gh = runGh } = {}) {
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error("issue/PR number must be a positive integer");
  }
  // One endpoint serves both: GitHub numbers issues and pull requests together,
  // and the issues API returns a `pull_request` key for the latter.
  const base = `${repo ? `repos/${repo}` : "repos/{owner}/{repo}"}/issues/${number}`;
  const issue = JSON.parse(gh(["api", base]));
  // Every page, not the first: the comments endpoint returns oldest first, so a
  // ticket with more comments than one page holds its newest record on a later
  // page — reading page one would miss the very section the report must quote.
  const pages = JSON.parse(gh(["api", "--paginate", "--slurp", `${base}/comments?per_page=100`]));
  const comments = pages.flat();

  // Records only: a section without the marker is not a delivery record, a bot
  // comment is not one either, and a waiver explicitly declines to write one.
  // Newest compliant wins, which is deliberately not "newest record": the ledger
  // is satisfied by *any* compliant record, and a later comment restating only
  // the commits must not displace the section the ticket already earned.
  const allRecords = comments.filter(isRecordComment).reverse();

  // Write access only. The report presents this text as what the ticket says, so
  // a stranger's comment must not stand in for the delivery account — the
  // structural gate checks shape, and shape is exactly what an injected line has.
  // The ledger still counts every human record (that is its own contract); this
  // narrows who the *report* will quote.
  const records = allRecords.filter((comment) => WRITERS.has(comment.author_association));
  const outsiders = allRecords.length - records.length;

  const rejections = [];
  for (const comment of records) {
    const verdict = evaluateCommentProductView(comment.body ?? "");
    if (!verdict.ok) {
      rejections.push(verdict.reason);
      continue;
    }
    return {
      ok: true,
      text: render(comment.body, `comment:${comment.id}`),
      source: { kind: "comment", id: comment.id },
    };
  }

  const isPullRequest = Boolean(issue.pull_request);
  const bodyVerdict = isPullRequest ? evaluateCommentProductView(issue.body ?? "") : null;
  if (bodyVerdict?.ok) {
    // The PR body is gate-checked, so it is a legitimate fallback. An issue body
    // is not: it is a write-once spec no gate ever judged for these sentences.
    return { ok: true, text: render(issue.body, "pr-body"), source: { kind: "pr-body" } };
  }

  // Every surface that was examined, and why it did not qualify — including the
  // body, whose rejection used to be collected and then dropped.
  const inspected = [
    records.length === 0
      ? outsiders === 0
        ? "no record comment carries the `交付记录` marker"
        : `no record comment from someone with write access (${outsiders} from other authors)`
      : `${records.length} record comment(s) from writers: ${dedupe(rejections).join("; ")}`,
    bodyVerdict ? `the pull-request body: ${bodyVerdict.reason}` : "no body to fall back to",
  ];
  return {
    ok: false,
    reason: `no compliant \`## 产品视角\` section on #${number}: ${inspected.join("; ")} — ${FIX}`,
  };
}

/**
 * Parse `<number> [--repo owner/name]`.
 *
 * An unknown flag or a valueless `--repo` is an error rather than something to
 * ignore: ignoring it leaves the number's repo to the working directory, which
 * would quote a section from the wrong repository and look like success.
 *
 * @param {string[]} argv
 * @returns {{number: number, repo?: string}}
 */
export function parseArgs(argv) {
  let number;
  let repo;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const inline = arg.startsWith("--repo=") ? arg.slice("--repo=".length) : null;
    if (arg === "--repo" || inline !== null) {
      const value = inline ?? argv[index + 1];
      if (!value || value.startsWith("-")) throw new Error("--repo needs an owner/name value");
      if (repo !== undefined) throw new Error("--repo given twice");
      repo = value;
      if (inline === null) index += 1;
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`unknown flag ${arg}`);
    if (number !== undefined) throw new Error(`unexpected argument ${arg}`);
    number = Number(arg);
  }
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error("expected an issue or pull-request number");
  }
  return { number, repo };
}

// `import.meta.url` is realpath-resolved while `argv[1]` keeps the link it was
// typed as, so the two must both be resolved before comparing: a raw `===` reads
// a symlinked path (macOS `/tmp`, `/var`, a linked worktree) as an import and
// exits 0 having printed nothing.
const invokedDirectly =
  Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const USAGE =
    "usage: node scripts/product-view-section.mjs <issue-or-pr-number> [--repo owner/name]";
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n${USAGE}`);
    process.exit(2);
  }

  let result;
  try {
    result = renderProductViewSection(args);
  } catch (error) {
    // `gh` missing, logged out, 404 — never a reason to print a partial section.
    console.error(`[product-view] gh failed for #${args.number}: ${error.message}`);
    process.exit(1);
  }

  if (!result.ok) {
    console.error(`[product-view] ${result.reason}`);
    process.exit(1);
  }

  // Provenance goes to stderr so the stdout pasted into the report stays pure
  // markdown — a reader of the chat sees the ticket's words, not a tool banner.
  const sourceKind = result.source.kind === "comment" ? `comment:${result.source.id}` : "pr-body";
  process.stderr.write(`[product-view] source=${sourceKind}\n`);
  process.stdout.write(result.text);
}
