import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

/**
 * #315 guard: the delivery-record gate must not be a one-shot reminder.
 *
 * Two complementary contracts live here, and they must not collapse into one:
 *
 *   - this file locks the **workflow's shape** — which jobs exist, what each
 *     one is triggered by, which invariants used to be broken (bot comments
 *     matching the marker, the waiver transition missing, the no-cron range);
 *   - `scripts/__tests__/signals-gate.test.mjs` locks the **behaviour** — it
 *     compiles each job and runs it against a fake GitHub, so a branch that
 *     mislabels an issue fails there.
 *
 * Since the #810 follow-up, the marker/waiver rules and the label names are no
 * longer written into each job: `scripts/issue-tracker-ledger.mjs` owns them and
 * the jobs read its JSON. So the assertions below check that each job delegates,
 * and that the delegation is the only home — a copy of the marker regex creeping
 * back into the YAML is the drift this file exists to catch.
 *
 * The most dangerous false positive is the bot's own warning comment: its body
 * contains 「交付记录缺失」, which matches the marker regex. The bot exclusion is
 * asserted in the shared module now (`issue-tracker-ledger.test.mjs`), and each
 * job still has to route through it.
 */

const repoRoot = new URL("../../../", import.meta.url);

const workflowText = readFileSync(
  new URL(".github/workflows/issue-tracker-signals.yml", repoRoot),
  "utf8",
);
const labelsDocText = readFileSync(new URL("docs/agents/triage-labels.md", repoRoot), "utf8");
const ledgerModuleText = readFileSync(
  new URL("scripts/issue-tracker-ledger.mjs", repoRoot),
  "utf8",
);

export const DELIVERY_LABEL = "delivery-record-missing";
export const ESCALATION_MARKER = "<!-- delivery-record-escalation -->";

/** The canonical marker regex literal — and it has exactly one home. */
export const MARKER_LITERAL = "/交付记录|Delivery record/i";

/** The waiver predicate literal every resolver must share. */
export const WAIVER_LITERAL = /\/无需交付记录\|delivery-record-waived\/i/;

/** The three #315/#810 jobs, and the module path each one quotes. */
const LEDGER_CLI = "issue-tracker-ledger.mjs";
const GATED_JOBS = ["check-delivery-record", "clear-delivery-record", "delivery-record-recheck"];

/** Bot-authored comments never count as delivery records (either polarity). */
export const BOT_GUARD = /user\??\.type\s*[!=]==\s*['"]Bot['"]/;

/** A user comment carrying this token explicitly waives the record (#315 review fix). */
export const WAIVER_TOKEN = "无需交付记录";

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
    // Labels come from the shared decision, never from a literal in the YAML.
    expect(body).toContain(LEDGER_CLI);
    expect(body).toMatch(/decision\.labels/);
    expect(body).toMatch(/addLabel\(deliveryRecord\)/);
    expect(body).toMatch(/clearLabel\(deliveryRecord\)/);
    // Bot exclusion lives in the shared module now; this job must not re-derive it.
    expect(body).not.toMatch(BOT_GUARD);
  });

  it("comment event on a labeled closed issue clears the label (bot comments excluded)", () => {
    const body = jobs["clear-delivery-record"];
    expect(body).toMatch(/issue_comment/);
    // The label only ever exists on closed issues; guard against the open case.
    expect(body).toMatch(/state\s*!==\s*'closed'/);
    expect(body).toContain(LEDGER_CLI);
    // The spec review found the missing "waived" transition: an explicit waiver
    // must clear the ledger too, or the escalation invitation leaves it stuck.
    expect(body).toMatch(/decision\.hasWaiver/);
    expect(body).toMatch(/clearLabel\(/);
  });

  it("a late record without the product view opens the second ledger instead of closing the book", () => {
    // The hole the spec review found: close with no record, then backfill a
    // record with sha + evidence and no product view. Clearing only the record
    // ledger would let that pass, which is exactly what #353 shipped.
    const body = jobs["clear-delivery-record"];
    expect(body).toMatch(/decision\.coversProductView/);
    expect(body).toMatch(/decision\.productViewReminder/);
    expect(body).toMatch(/addLabels\(/);
  });

  it("daily recheck: schedule-triggered, escalates once after 3 days, exempts rejections", () => {
    const body = jobs["delivery-record-recheck"];
    expect(body).toMatch(/github\.event_name == 'schedule'/);
    // Scans only the labeled ledger, server-side, and gets the label from the module.
    expect(body).toContain(LEDGER_CLI);
    expect(body).toMatch(/deliveryRecord: LEDGER/);
    expect(body).toMatch(/staleDays/);
    // One ping per issue: marker-guarded escalation @ the repo owner.
    expect(body).toContain(ESCALATION_MARKER);
    expect(body).toMatch(/@\$\{context\.repo\.owner\}/);
    // not_planned / wontfix closures have no delivery record to expect.
    expect(body).toMatch(/not_planned/);
    expect(body).toMatch(/wontfix/);
    // The escalation body names the waiver path.
    expect(body).toContain(WAIVER_TOKEN);
    // The bot's own escalation comment mentions the marker words — the module
    // excludes it, and the job must not grow a second scan of its own.
    expect(body).toMatch(/decision\.hasWaiver/);
  });

  it("the marker, the waiver and the bot exclusion have exactly one home", () => {
    // Ledger labels: the module declares them and no job re-types them.
    expect(ledgerModuleText).toContain(MARKER_LITERAL);
    expect(ledgerModuleText).toMatch(WAIVER_LITERAL);
    expect(ledgerModuleText).toMatch(BOT_GUARD);
    expect(ledgerModuleText).toContain('"delivery-record-missing"');
    expect(ledgerModuleText).toContain('"product-view-missing"');

    // No gated job may re-type the classification rules: that is the drift this
    // change removed. The one bot check left in a job is the clear job's event
    // gate (`comment.user.type === 'Bot'` → ignore this event), which runs before
    // any classification and answers a different question than "is this a record".
    for (const id of GATED_JOBS) {
      expect(markerLiterals(jobs[id]).map((m) => `${id}:${m}`)).toEqual([]);
      expect(jobs[id].match(WAIVER_LITERAL)?.[0]).toBeUndefined();
      const botChecks = jobs[id].match(/user\.type\s*[!=]==\s*['"]Bot['"]/g) ?? [];
      expect(botChecks.length, `job ${id} re-derives bot classification`).toBeLessThanOrEqual(1);
    }
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

  it("grandfather cutoff: closures before 2026-09-19 are exempt from the ledger", () => {
    // 161 pre-convention closures (sweep dry-run 35511083073) must never be
    // labeled or escalated — the ledger only governs post-cutoff closures.
    for (const id of ["delivery-record-recheck", "sweep-delivery-records"]) {
      const body = jobs[id];
      expect(body).toContain("LEDGER_CUTOFF = Date.parse('2026-09-19T00:00:00Z')");
      expect(body).toContain(".getTime() < LEDGER_CUTOFF");
    }
  });
});
