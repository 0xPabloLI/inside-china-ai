/**
 * Publish-path coverage diff (#964).
 *
 * The ticket's original comparison treated the manual app guide as if every
 * step had been executed, which overstated the CDP gap: the successful manual
 * posts never tagged a location either. These tests pin the corrected
 * semantics and the contract that every `manualGuide.steps` entry must have a
 * coverage rule — adding a step without classifying it makes the diff red
 * instead of silently dropping it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { tiktokProfile } from "../lib/platforms/tiktok.mjs";
import {
  COVERAGE_GROUPS,
  COVERAGE_KINDS,
  STEP_COVERAGE,
  buildCoverageDiff,
  formatCoverageDiff,
} from "../lib/platforms/publish-coverage.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const stepIds = tiktokProfile.manualGuide.steps.map((s) => s.id);
const rowById = (diff, id) => diff.rows.find((row) => row.id === id);

describe("coverage rules cover the profile", () => {
  it("has a rule for every manual-guide step", () => {
    expect(() => buildCoverageDiff(tiktokProfile, {})).not.toThrow();
    for (const id of stepIds) expect(STEP_COVERAGE[id], `missing rule for ${id}`).toBeDefined();
  });

  it("has no rule for a step that no longer exists", () => {
    expect(Object.keys(STEP_COVERAGE).sort()).toEqual([...stepIds].sort());
  });

  it("only uses known statuses", () => {
    const diff = buildCoverageDiff(tiktokProfile, { publish: true });
    for (const row of diff.rows) {
      expect(COVERAGE_KINDS, `unknown status ${row.kind} for ${row.id}`).toContain(row.kind);
    }
  });

  it("assigns every status to exactly one render group", () => {
    const grouped = Object.values(COVERAGE_GROUPS).flat();
    expect([...grouped].sort()).toEqual([...COVERAGE_KINDS].sort());
    expect(new Set(COVERAGE_KINDS).size).toBe(COVERAGE_KINDS.length);
    for (const rule of Object.values(STEP_COVERAGE)) {
      expect(COVERAGE_KINDS, rule.short).toContain(rule.kind);
    }
  });

  it("keeps each display alias anchored in the profile label", () => {
    // The profile owns the step wording; the coverage map may classify a step
    // but must not ship a second copy of its name that can drift independently.
    for (const step of tiktokProfile.manualGuide.steps) {
      expect(step.label.toLowerCase(), step.id).toContain(
        STEP_COVERAGE[step.id].short.toLowerCase(),
      );
    }
  });

  it("counts every step exactly once", () => {
    for (const opts of [
      { publish: true },
      { publish: false },
      { publish: false, draftSaved: true },
      { publish: true, aigcEnabled: false },
      { publish: true, aborted: true },
    ]) {
      const { rows, totals } = buildCoverageDiff(tiktokProfile, opts);
      expect(totals.total).toBe(stepIds.length);
      expect(rows).toHaveLength(stepIds.length);
      expect(
        totals.automated + totals.replaced + totals.pending + totals.notCovered,
        JSON.stringify(opts),
      ).toBe(totals.total);
    }
  });

  it("downgrades unfinished claims when the run aborted", () => {
    const diff = buildCoverageDiff(tiktokProfile, { publish: true, aborted: true });
    expect(diff.totals.automated).toBe(0);
    expect(rowById(diff, "aigc-label").kind).toBe("unverified");
    expect(rowById(diff, "aigc-label").note).toMatch(/aborted/);
    expect(rowById(diff, "add-sound").kind).toBe("unverified");
    expect(rowById(diff, "publish").kind).toBe("not-covered");
    expect(rowById(diff, "publish").note).toMatch(/did not publish/);
  });

  it("does not claim a saved draft when a draft run aborted", () => {
    const diff = buildCoverageDiff(tiktokProfile, {
      publish: false,
      draftSaved: true,
      aborted: true,
    });
    expect(rowById(diff, "add-sound").kind).toBe("unverified");
    expect(rowById(diff, "add-sound").note).toMatch(/aborted/);
    expect(rowById(diff, "add-sound").note).not.toMatch(/a saved draft drops/);
  });
});

describe("the diff reflects what this run actually does", () => {
  it("a --publish run automates the sound, caption, AIGC and publish steps", () => {
    const diff = buildCoverageDiff(tiktokProfile, { publish: true });
    for (const id of ["select-video", "paste-caption", "add-sound", "aigc-label", "publish"]) {
      expect(rowById(diff, id).kind, id).toBe("auto");
    }
    expect(rowById(diff, "open-app").kind).toBe("replaced");
    // Comment 1 requires the weighting difference to stay visible as an open
    // question, not be flattened into "music is covered".
    expect(rowById(diff, "add-sound").note).toMatch(/unmeasured/);
  });

  it("leaves publish and the staged sound pending when nothing is published", () => {
    const diff = buildCoverageDiff(tiktokProfile, { publish: false });
    expect(rowById(diff, "publish").kind).toBe("pending");
    expect(rowById(diff, "add-sound").kind).toBe("pending");
    expect(rowById(diff, "add-sound").note).toMatch(/保存/);
  });

  it("marks the sound as lost when a draft is saved", () => {
    const diff = buildCoverageDiff(tiktokProfile, { publish: false, draftSaved: true });
    expect(rowById(diff, "add-sound").kind).toBe("draft-lost");
    expect(rowById(diff, "add-sound").note).toMatch(/draft/i);
    expect(rowById(diff, "publish").kind).toBe("pending");
    expect(rowById(diff, "publish").note).toMatch(/phone/i);
  });

  it("marks the AIGC label off when --no-aigc overrides it", () => {
    const diff = buildCoverageDiff(tiktokProfile, { publish: true, aigcEnabled: false });
    expect(rowById(diff, "aigc-label").kind).toBe("off");
    expect(rowById(diff, "aigc-label").note).toMatch(/cannot be added after publishing/);
  });

  it("records Location as 'neither path', not as a CDP-only regression", () => {
    const diff = buildCoverageDiff(tiktokProfile, { publish: true });
    const location = rowById(diff, "location");
    expect(location.kind).toBe("not-covered");
    expect(location.note).toMatch(/neither path/);
    expect(location.note).toMatch(/manual posts/);
  });

  it("records in-app editing as app-only", () => {
    const diff = buildCoverageDiff(tiktokProfile, { publish: true });
    expect(rowById(diff, "edit-sticker").kind).toBe("not-covered");
    expect(rowById(diff, "edit-sticker").note).toMatch(/app-only/);
  });

  it("keeps the post-publish steps as explicit follow-ups", () => {
    const diff = buildCoverageDiff(tiktokProfile, { publish: true });
    expect(rowById(diff, "pin-comment").kind).toBe("post-publish");
    expect(rowById(diff, "first-hour-engagement").kind).toBe("post-publish");
  });
});

describe("formatCoverageDiff", () => {
  it("prints the automated and gap groups with the corrected Location note", () => {
    const text = formatCoverageDiff(buildCoverageDiff(tiktokProfile, { publish: true }));
    expect(text).toContain("Publish-path coverage");
    expect(text).toContain("Automated by this run");
    expect(text).toContain("Not covered");
    expect(text).toContain("Location");
    expect(text).toContain("neither path");
    expect(text).toContain("app-only");
    expect(text).toContain("Pin a comment");
  });

  it("prints a pending group for a prepared-only run", () => {
    const text = formatCoverageDiff(buildCoverageDiff(tiktokProfile, { publish: false }));
    expect(text).toContain("Pending in this session");
    expect(text).toContain("Publish");
  });
});

describe("the upload driver prints and logs the diff", () => {
  const source = readFileSync(join(__dirname, "..", "tiktok-upload-prep.mjs"), "utf8");

  it("builds the diff from the profile and records it", () => {
    expect(source).toContain("buildCoverageDiff(tiktokProfile");
    expect(source).toContain('"coverageAborted"');
    expect(source).toContain('"coverage"');
    expect(source).toContain("formatCoverageDiff(");
  });

  it("does not downgrade a post that was already published", () => {
    expect(source).toContain("publishSucceeded = true");
    expect(source).toContain("if (publishSucceeded)");
    expect(source).toContain("showCoverage({ aborted: true })");
  });
});
