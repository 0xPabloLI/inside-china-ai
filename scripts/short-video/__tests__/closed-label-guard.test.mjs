import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * #321 guard 1: the closed-label deny-list is double-written —
 * `.github/workflows/issue-tracker-signals.yml` (strip-closed-labels job)
 * and `docs/agents/triage-labels.md` (State/Signal label tables) must agree.
 * The workflow comment itself admits "the job won't follow the doc" — this
 * test is the thing that makes drift visible instead of silent.
 */

const repoRoot = new URL("../../../", import.meta.url);

const workflowText = readFileSync(
  new URL(".github/workflows/issue-tracker-signals.yml", repoRoot),
  "utf8",
);
const labelsDocText = readFileSync(
  new URL("docs/agents/triage-labels.md", repoRoot),
  "utf8",
);

/** Labels in the workflow's STRIP set (the `new Set([...])` literal). */
function workflowStripSet() {
  const m = workflowText.match(/const STRIP = new Set\(\[([^\]]*)\]\)/);
  if (!m) throw new Error("STRIP set not found in issue-tracker-signals.yml");
  return new Set(
    [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]),
  );
}

/** Backticked label names under a `## Section` heading of triage-labels.md. */
function docSectionLabels(heading) {
  const section = labelsDocText.match(
    new RegExp(`## ${heading}[\\s\\S]*?(?=\\n## |$)`),
  );
  if (!section) throw new Error(`section "${heading}" not found in triage-labels.md`);
  return new Set(
    [...section[0].matchAll(/`([a-z0-9: -]+)`/gi)].map((x) => x[1]),
  );
}

/** The workflow's priority matcher, as written (`/^P[0-3]$/`). */
function workflowPriorityRegex() {
  const m = workflowText.match(/const isPriority = \(name\) => (\/\^P\[\d-\d\]\$\/)/);
  if (!m) throw new Error("isPriority regex not found in issue-tracker-signals.yml");
  return m[1];
}

describe("#321 closed-label deny-list sync (workflow ↔ triage-labels.md)", () => {
  // wontfix lives in the State Labels table but is deliberately KEPT on
  // closed issues — it answers "why closed", which is semantics, not state.
  const KEEP_ON_CLOSE = new Set(["wontfix"]);

  it("STRIP set == (state ∪ signal labels) − keep-on-close", () => {
    const expected = new Set([
      ...docSectionLabels("State Labels"),
      ...docSectionLabels("Signal Labels \\(machine-managed\\)"),
    ]);
    for (const kept of KEEP_ON_CLOSE) expected.delete(kept);

    const actual = workflowStripSet();
    const missingFromWorkflow = [...expected].filter((n) => !actual.has(n));
    const unknownInWorkflow = [...actual].filter((n) => !expected.has(n));

    expect(missingFromWorkflow).toEqual([]); // doc gained a label, workflow lagged
    expect(unknownInWorkflow).toEqual([]); // workflow strips a label the doc doesn't define
  });

  it("workflow's priority regex matches the doc's Priority Labels range", () => {
    const prioritySection = labelsDocText.match(
      new RegExp(`## Priority Labels[\\s\\S]*?(?=\\n## )`),
    );
    expect(prioritySection).toBeTruthy();
    const docPriorities = [...prioritySection[0].matchAll(/`(P\d)`/g)].map((x) => x[1]);
    expect(docPriorities.length).toBeGreaterThan(0);

    const regexSrc = workflowPriorityRegex(); // e.g. /^P[0-3]$/
    const lo = Number(regexSrc.match(/\[(\d)-/)[1]);
    const hi = Number(regexSrc.match(/-(\d)\]/)[1]);
    for (const p of docPriorities) {
      const n = Number(p.slice(1));
      expect(n).toBeGreaterThanOrEqual(lo);
      expect(n).toBeLessThanOrEqual(hi);
    }
  });
});
