import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

/**
 * #315 guard: the delivery-record gate must not be a one-shot reminder.
 * The workflow text is the spec (same contract-test pattern as
 * closed-label-guard.test.mjs — inline github-script cannot be imported,
 * so the tests lock structure + the invariants that failed before):
 *
 *   1. close without a user delivery record  -> `delivery-record-missing` label
 *   2. a later user comment carrying the marker — or an explicit waiver
 *      (`无需交付记录`) — on a labeled closed issue clears the label
 *      (the #252 stale case: record lands minutes after close)
 *   3. daily recheck re-verifies the ledger, escalates once after 3 days,
 *      and exempts not_planned/wontfix closures
 *   4. a workflow_dispatch sweep labels the existing backlog (dry-run default)
 *
 * The most dangerous false positive is the bot's own warning comment: its body
 * contains 「交付记录缺失」, which matches the marker regex. Every marker scan
 * MUST exclude Bot-authored comments — asserted per job below.
 */

const repoRoot = new URL("../../../", import.meta.url);

const workflowText = readFileSync(
  new URL(".github/workflows/issue-tracker-signals.yml", repoRoot),
  "utf8",
);
const labelsDocText = readFileSync(new URL("docs/agents/triage-labels.md", repoRoot), "utf8");

export const DELIVERY_LABEL = "delivery-record-missing";
export const ESCALATION_MARKER = "<!-- delivery-record-escalation -->";

/** The canonical marker regex literal every scanner must share. */
export const MARKER_LITERAL = "/交付记录|Delivery record/i";

/** Bot-authored comments never count as delivery records (either polarity). */
export const BOT_GUARD = /user\.type\s*[!=]==\s*'Bot'/;

/** A user comment carrying this token explicitly waives the record (#315 review fix). */
export const WAIVER_TOKEN = "无需交付记录";

/** The waiver predicate literal every resolver must share (slashes make prose mentions inert). */
export const WAIVER_LITERAL = /\/无需交付记录\|delivery-record-waived\/i/;

/** Split the `jobs:` section into per-job text blocks keyed by job id. */
function jobBodies() {
  const jobsIdx = workflowText.search(/^jobs:\s*$/m);
  expect(jobsIdx, "`jobs:` section not found").toBeGreaterThanOrEqual(0);
  const section = workflowText.slice(jobsIdx);
  const map = {};
  let current = null;
  for (const line of section.split("\n")) {
    const header = line.match(/^  ([a-z][a-z0-9-]*):\s*$/);
    if (header) {
      current = header[1];
      map[current] = [];
      continue;
    }
    if (current) map[current].push(line);
  }
  return Object.fromEntries(Object.entries(map).map(([id, lines]) => [id, lines.join("\n")]));
}

/** Every occurrence of the marker regex literal in a text block. */
function markerLiterals(text) {
  return text.match(/\/交付记录\|Delivery record\/i/g) ?? [];
}

describe("#315 delivery-record gate (workflow contract)", () => {
  const jobs = jobBodies();

  it("workflow defines the three #315 jobs", () => {
    for (const id of [
      "check-delivery-record",
      "clear-delivery-record",
      "delivery-record-recheck",
      "sweep-delivery-records",
    ]) {
      expect(jobs[id], `job ${id} missing`).toBeTruthy();
    }
  });

  it("delivery-record-missing is a doc-defined signal label that survives label stripping", () => {
    const signalSection = labelsDocText.match(
      /## Signal Labels \(machine-managed\)[\s\S]*?(?=\n## |$)/,
    );
    expect(signalSection).toBeTruthy();
    const signalLabels = [...signalSection[0].matchAll(/`([a-z0-9:-]+)`/g)].map((m) => m[1]);
    expect(signalLabels).toContain(DELIVERY_LABEL);

    // Added AFTER close by check-delivery-record — the strip job must never
    // remove it, or the ledger silently forgets its own backlog.
    const stripMatch = workflowText.match(/const STRIP = new Set\(\[([^\]]*)\]\)/);
    expect(stripMatch).toBeTruthy();
    const stripSet = [...stripMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(stripSet).not.toContain(DELIVERY_LABEL);
  });

  it("on-close check: missing record adds the label, found record clears a stale one", () => {
    const body = jobs["check-delivery-record"];
    expect(body).toMatch(new RegExp(`addLabels[\\s\\S]*'${DELIVERY_LABEL}'`));
    expect(body).toMatch(new RegExp(`removeLabel[\\s\\S]*'${DELIVERY_LABEL}'`));
    // Bot exclusion + shared marker literal (see file header for why).
    expect(body).toMatch(BOT_GUARD);
    expect(markerLiterals(body)).toEqual([MARKER_LITERAL]);
  });

  it("comment event on a labeled closed issue clears the label (bot comments excluded)", () => {
    const body = jobs["clear-delivery-record"];
    expect(body).toMatch(/issue_comment/);
    // The label only ever exists on closed issues; guard against the open case.
    expect(body).toMatch(/state\s*!==\s*'closed'/);
    expect(body).toMatch(BOT_GUARD);
    expect(markerLiterals(body)).toEqual([MARKER_LITERAL]);
    // The spec review found the missing "waived" transition: an explicit
    // waiver predicate must clear the ledger too, or the escalation
    // invitation leaves the label stuck forever.
    expect(body).toMatch(WAIVER_LITERAL);
    expect(body).toMatch(new RegExp(`removeLabel[\\s\\S]*'${DELIVERY_LABEL}'`));
  });

  it("daily recheck: schedule-triggered, escalates once after 3 days, exempts rejections", () => {
    const body = jobs["delivery-record-recheck"];
    expect(body).toMatch(/github\.event_name == 'schedule'/);
    // Scans only the labeled ledger, server-side.
    expect(body).toMatch(new RegExp(`'${DELIVERY_LABEL}'`));
    expect(body).toMatch(/STALE_DAYS = 3/);
    // One ping per issue: marker-guarded escalation @ the repo owner.
    expect(body).toContain(ESCALATION_MARKER);
    expect(body).toMatch(/@\$\{context\.repo\.owner\}/);
    // not_planned / wontfix closures have no delivery record to expect.
    expect(body).toMatch(/not_planned/);
    expect(body).toMatch(/wontfix/);
    // Waiver is a first-class resolution in the recheck (predicate literal,
    // not prose), and the escalation body tells the user how to waive.
    expect(body).toMatch(WAIVER_LITERAL);
    expect(body).toContain(WAIVER_TOKEN);
    // The bot's own escalation comment mentions the marker words — must be excluded.
    expect(body).toMatch(BOT_GUARD);
  });

  it("sweep input labels the existing backlog, dry-run by default", () => {
    const inputBlock = workflowText.match(/workflow_dispatch:[\s\S]*?permissions:/);
    expect(inputBlock).toBeTruthy();
    expect(inputBlock[0]).toMatch(/sweep_delivery/);
    expect(inputBlock[0]).toMatch(/default: false/);

    const body = jobs["sweep-delivery-records"];
    expect(body).toMatch(/sweep_delivery/);
    // Same apply-gate as strip-closed-labels: write only when apply=true.
    expect(body).toMatch(/apply/);
    expect(body).toMatch(/state: 'closed'/);
    // Old-era bot warning comments contain the marker words — must be excluded.
    expect(body).toMatch(BOT_GUARD);
  });

  it("every inline github-script compiles (smoke 35510954855: dup const = SyntaxError text contracts cannot see)", () => {
    const workflow = parse(workflowText);
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    let compiled = 0;
    for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith("actions/github-script") && step.with?.script) {
          compiled += 1;
          // Compile-only: parses the body (catches duplicate declarations,
          // stray syntax) without executing any API call.
          expect(
            () => new AsyncFunction("github", "context", "core", step.with.script),
            `job ${id}: inline script has a JS syntax error`,
          ).not.toThrow();
        }
      }
    }
    expect(compiled).toBeGreaterThanOrEqual(6);
  });
});
