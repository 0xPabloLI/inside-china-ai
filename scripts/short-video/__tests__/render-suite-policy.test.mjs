/**
 * Two rules that keep the render suites from silently costing CI minutes
 * (#1097; the failure they prevent is #1084 → #1087 → #1093 in one line:
 * nobody was watching either the wiring or the per-assertion cost).
 *
 * Rule 1 — a render suite must not spawn the Remotion CLI itself. Each such
 * spawn pays npx (~2.6 s), the CLI's whole renderer/bundler require graph
 * (~6 s) and a fresh webpack build (~3 s) for ONE still: measured 13.2 s per
 * assertion of which the render was 0.8 s. `remotion-still.mjs` bundles once
 * per process, drops npx and reuses one headless browser, so the same still
 * costs 1.4 s. A suite that goes around the driver is not "slightly slower" —
 * it is a straight multiple on the job.
 *
 * Rule 2 — a suite that renders must be wired into the `Pixel render contracts`
 * job, or explicitly excluded in `vitest.config.ts`. #1084 spent two days red on
 * main because a suite was in neither list: it was not failing in CI, it was
 * absent from it.
 *
 * Both rules are self-widening: a new suite is caught by Rule 1 the moment it
 * spawns the CLI, and by Rule 2 the moment it imports the driver.
 *
 * Rule 3 (#1208) — a fixture entry is exclusive to one suite unless the pair is
 * registered in `SHARED_ENTRY_REASONS`. Sharing is safe now that bundle
 * directories are keyed by worker pool, but it used to race (two processes
 * `rmSync`ing each other's `public/`), so the next shared pair has to be a
 * deliberate, recorded choice instead of a new accident.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(DIR, "..", "..", "..");
const CI_YML = readFileSync(join(REPO, ".github/workflows/ci.yml"), "utf8");
const VITEST_CONFIG = readFileSync(join(REPO, "vitest.config.ts"), "utf8");

/** Every test file next to this one, minus this policy file itself. */
const SELF = "render-suite-policy.test.mjs";
const TEST_FILES = readdirSync(DIR).filter((name) => name.endsWith(".test.mjs") && name !== SELF);

const source = (name) => readFileSync(join(DIR, name), "utf8");

/** A CLI render invocation, however it is spelled. */
const SPAWNS_CLI = [/"remotion",\s*"still"/, /"still",\s*ENTRY/, /"npx"/];

/** Suites that render at all — they are the ones the pixel job must run. */
const RENDER_SUITES = TEST_FILES.filter((name) => source(name).includes("remotion-still.mjs"));

/**
 * Fixture entries are exclusive unless registered here (#1208).
 *
 * Two suites may share one `*-fixture.tsx`: the bundle directory is keyed by
 * entry AND vitest worker pool, so the two files never write the same disk
 * directory. That is still a deliberate cost (a second webpack build per
 * worker), and it is exactly the shape that raced when the key was the entry
 * alone, so a new shared pair must be registered with the reason it is safe.
 */
const SHARED_ENTRY_REASONS = new Map([
  [
    "src/scene-gate-fixture.tsx",
    "contrast-media-render + scene-gate-render: two views of the same scene set; media routing and gate assertions share one fixture by design",
  ],
  [
    "src/text-gate-fixture.tsx",
    "official-fit-render + text-gate-render: one text-gate fixture; official-format and gate-failure assertions are separate angles",
  ],
]);

const entryOf = (name) => {
  const match = /const ENTRY = "([^"]+)"/.exec(source(name));
  return match ? match[1] : null;
};

/** Shared entries with no registration: [entry, [suite, ...]]. */
function unregisteredSharedEntries(suites, registered = SHARED_ENTRY_REASONS) {
  const byEntry = new Map();
  for (const { name, entry } of suites) {
    if (!entry) continue;
    byEntry.set(entry, [...(byEntry.get(entry) ?? []), name]);
  }
  return [...byEntry].filter(([entry, names]) => names.length > 1 && !registered.has(entry));
}

describe("render-suite policy (#1097, #1208)", () => {
  it("finds the suites it is supposed to police", () => {
    // A gate that scans nothing reports green — the exact failure mode this
    // file exists to avoid.
    expect(RENDER_SUITES.length).toBeGreaterThanOrEqual(8);
  });

  // Rule 1 runs over EVERY test file: a suite that spawns the CLI without ever
  // importing the driver would otherwise be invisible to this gate.
  it.each(TEST_FILES)("%s renders through the shared driver, not its own CLI spawn", (name) => {
    const src = source(name);
    const offenders = SPAWNS_CLI.filter((re) => re.test(src));
    expect(
      offenders.map(String),
      `${name} must call renderStill() from remotion-still.mjs; a per-assertion CLI spawn costs ~13 s of overhead for one frame`,
    ).toEqual([]);
  });

  it.each(RENDER_SUITES)("%s is wired into the pixel job or explicitly excluded", (name) => {
    const path = `scripts/short-video/__tests__/${name}`;
    const wired = CI_YML.includes(path);
    const excluded = VITEST_CONFIG.includes(path);
    expect(
      wired || excluded,
      `${path} is in neither .github/workflows/ci.yml nor vitest.config.ts — a suite nobody runs cannot fail`,
    ).toBe(true);
  });

  it("every render suite declares a fixture entry the rule below can read", () => {
    for (const name of RENDER_SUITES) {
      expect(
        entryOf(name),
        `${name} no longer declares const ENTRY = "src/*-fixture.tsx"`,
      ).toBeTruthy();
    }
  });

  it("keeps every fixture entry exclusive unless registered as shared", () => {
    const suites = RENDER_SUITES.map((name) => ({ name, entry: entryOf(name) }));
    const shared = unregisteredSharedEntries(suites);
    expect(
      shared.map(([entry, names]) => `${entry} ← ${names.join(" + ")}`),
      "two suites share a fixture entry without registering why (#1208: bundle dirs are keyed per worker pool, but sharing must stay deliberate)",
    ).toEqual([]);
  });

  it("flags a shared entry that is not registered", () => {
    // Proves the gate can go red: this is what a future unregistered pair looks
    // like, and an empty scan must not be mistaken for compliance.
    const offending = unregisteredSharedEntries(
      [
        { name: "a-render.test.mjs", entry: "src/new-fixture.tsx" },
        { name: "b-render.test.mjs", entry: "src/new-fixture.tsx" },
      ],
      new Map(),
    );
    expect(offending).toEqual([
      ["src/new-fixture.tsx", ["a-render.test.mjs", "b-render.test.mjs"]],
    ]);
  });

  it("wired suites actually reach the pixel job's run step", () => {
    // `includes` alone would pass if the path only appeared in a comment;
    // anchor on the `run:` block that lists the suites.
    const step = CI_YML.slice(CI_YML.indexOf("Pixel render contracts ("));
    const run = step.slice(step.indexOf("run:"));
    expect(run).toContain("vitest run");
    for (const name of RENDER_SUITES) {
      const path = `scripts/short-video/__tests__/${name}`;
      if (!CI_YML.includes(path)) continue; // excluded — covered above
      expect(
        run.slice(0, run.indexOf("Upload stills")),
        `${path} is named in ci.yml but not run`,
      ).toContain(path);
    }
  });
});
