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
 * quotes a section that already passed the gate — the newest human record comment
 * carrying the marker, or the pull-request body when no comment carries one. The
 * report cannot then say something different from what the ticket says, because
 * it is not saying anything of its own.
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
 *     stdout: `## 产品视角` and the section body, to paste verbatim
 *     stderr: provenance (`source=comment:<id>` / `source=pr-body`) or the reason
 *     exit 0 = rendered, 1 = nothing compliant to quote, 2 = bad usage
 */
import { pathToFileURL } from "node:url";

import { evaluateCommentProductView, extractSection } from "./check-product-view.mjs";
import { isRecordComment } from "./issue-tracker-ledger.mjs";
import { runGh } from "./short-video/lib/gh-cli.mjs";

/** The heading the report opens with; the gate accepts the English spelling too. */
const HEADING = "## 产品视角";

/** How to fix the failure, quoted in every message so it needs no doc lookup. */
const FIX =
  "post the delivery record (marker `交付记录` / `Delivery record` plus a `## 产品视角` section) and render again";

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
  const comments = JSON.parse(gh(["api", `${base}/comments?per_page=100`]));

  // Records only: a section without the marker is not a delivery record, a bot
  // comment is not one either, and a waiver explicitly declines to write one.
  // Newest first, because a later record is the one the ticket now stands on.
  const records = comments.filter(isRecordComment).reverse();
  const rejections = [];
  for (const comment of records) {
    const verdict = evaluateCommentProductView(comment.body ?? "");
    if (!verdict.ok) {
      rejections.push(verdict.reason);
      continue;
    }
    return {
      ok: true,
      text: `${HEADING}\n\n${extractSection(comment.body ?? "")}\n`,
      source: { kind: "comment", id: comment.id },
    };
  }

  const isPullRequest = Boolean(issue.pull_request);
  if (isPullRequest) {
    // The PR body is gate-checked, so it is a legitimate fallback. An issue body
    // is not: it is a write-once spec no gate ever judged for these sentences.
    const verdict = evaluateCommentProductView(issue.body ?? "");
    if (verdict.ok) {
      return {
        ok: true,
        text: `${HEADING}\n\n${extractSection(issue.body ?? "")}\n`,
        source: { kind: "pr-body" },
      };
    }
    rejections.push(`the pull-request body: ${verdict.reason}`);
  }

  const inspected =
    records.length === 0
      ? "no record comment carries the `交付记录` marker"
      : `${records.length} record comment(s): ${rejections.join("; ")}`;
  const noFallback = isPullRequest
    ? ""
    : " (not a pull request, so there is no gate-checked body to fall back to)";
  return {
    ok: false,
    reason: `no compliant \`## 产品视角\` section on #${number}: ${inspected}${noFallback} — ${FIX}`,
  };
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const repoAt = process.argv.indexOf("--repo");
  const repo = repoAt === -1 ? undefined : process.argv[repoAt + 1];
  const positional = process.argv.slice(2).filter((arg, index, all) => {
    if (arg.startsWith("--")) return false;
    return all[index - 1] !== "--repo";
  });
  const number = Number(positional[0]);

  if (!Number.isInteger(number) || number <= 0) {
    console.error(
      "usage: node scripts/product-view-section.mjs <issue-or-pr-number> [--repo owner/name]",
    );
    process.exit(2);
  }

  let result;
  try {
    result = renderProductViewSection({ number, repo });
  } catch (error) {
    // `gh` missing, logged out, 404 — never a reason to print a partial section.
    console.error(`[product-view] gh failed for #${number}: ${error.message}`);
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
