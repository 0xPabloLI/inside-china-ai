import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// The CI filter that drops the documented test-fixture false positives from the
// Semgrep SARIF (see .github/scripts/filter-semgrep-fps.py and the Semgrep job
// in .github/workflows/ci.yml). It must drop exactly the documented classes —
// same rule id AND a test path — because a filter that silently widens would
// hide real findings from the security tab, and a filter that fails open would
// let the job pass with nothing uploaded.

const FILTER = join(import.meta.dirname, "..", "..", ".github", "scripts", "filter-semgrep-fps.py");
const RULE =
  "javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal";
// Rules outside the documented set: their test-path findings must survive, so
// the suite pins that the filter matches by rule id as well as by path.
const OUTSIDE_A = "javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring";
const OUTSIDE_B = "javascript.browser.security.eval-detected.eval-detected";

// The filter is a python script, and this suite shells out to it. CI installs
// python3; a machine without it skips rather than fails.
const HAS_PYTHON = spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;

function result(ruleId, uri, line) {
  return {
    ruleId,
    level: "warning",
    message: { text: "finding" },
    locations: [{ physicalLocation: { artifactLocation: { uri }, region: { startLine: line } } }],
  };
}

describe("semgrep SARIF false-positive filter", () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "semgrep-fp-filter-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeReport(results, { runs = 1 } = {}) {
    const path = join(dir, "semgrep.sarif");
    writeFileSync(
      path,
      JSON.stringify({
        version: "2.1.0",
        runs: Array.from({ length: runs }, () => ({
          tool: { driver: { name: "semgrep" } },
          results,
        })),
      }),
    );
    return path;
  }

  function runFilter(...paths) {
    return spawnSync("python3", [FILTER, ...paths], { encoding: "utf8" });
  }

  function uris(path) {
    const report = JSON.parse(readFileSync(path, "utf8"));
    return report.runs[0].results.map(
      (r) => `${r.ruleId.split(".").pop()}:${r.locations[0].physicalLocation.artifactLocation.uri}`,
    );
  }

  it.skipIf(!HAS_PYTHON)("drops the rule in test paths and keeps everything else", () => {
    const path = writeReport([
      result(RULE, "scripts/__tests__/fixture.test.mjs", 10),
      result(RULE, "src/components/widgets/tokens-drift.test.ts", 29),
      result(RULE, "scripts/short-video/lib/scene-audio.mjs", 33),
      result(OUTSIDE_A, "scripts/__tests__/fixture.test.mjs", 12),
      result(OUTSIDE_B, "scripts/spec.spec.mjs", 4),
    ]);

    const r = runFilter(path);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("dropped 2 known test-fixture false positive(s)");
    expect(uris(path)).toEqual([
      "path-join-resolve-traversal:scripts/short-video/lib/scene-audio.mjs",
      "unsafe-formatstring:scripts/__tests__/fixture.test.mjs",
      "eval-detected:scripts/spec.spec.mjs",
    ]);
  });

  // The other documented classes: test fixtures shell out to ffmpeg with
  // mkdtemp paths and numeric arguments (detect-child-process), merge
  // in-memory state with Object.assign (insecure-object-assign), build RegExp
  // from constant lists or captured process output
  // (detect-non-literal-regexp), and mutate fixture objects by fixed key
  // constants (prototype-pollution-loop). Each is dropped in test paths only —
  // production findings of the same rules still upload.
  it.skipIf(!HAS_PYTHON)("drops the other fixture rules in test paths only", () => {
    const path = writeReport([
      result(
        "javascript.lang.security.detect-child-process.detect-child-process",
        "scripts/short-video/__tests__/audio-sync.test.mjs",
        573,
      ),
      result(
        "javascript.lang.security.insecure-object-assign.insecure-object-assign",
        "scripts/short-video/__tests__/ytdlp-guard.test.mjs",
        104,
      ),
      result(
        "javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp",
        "scripts/spec.spec.mjs",
        4,
      ),
      result(
        "javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop",
        "scripts/short-video/__tests__/pool-contract-fixtures.test.mjs",
        127,
      ),
      result(
        "javascript.lang.security.detect-child-process.detect-child-process",
        "scripts/short-video/lib/render-only.mjs",
        40,
      ),
      result(
        "javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp",
        "scripts/short-video/lib/cli-content.mjs",
        12,
      ),
      result(
        "javascript.lang.security.insecure-object-assign.insecure-object-assign",
        "src/components/foo.tsx",
        8,
      ),
      result(
        "javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop",
        "scripts/foo.mjs",
        3,
      ),
    ]);

    const r = runFilter(path);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("dropped 4 known test-fixture false positive(s)");
    expect(uris(path)).toEqual([
      "detect-child-process:scripts/short-video/lib/render-only.mjs",
      "detect-non-literal-regexp:scripts/short-video/lib/cli-content.mjs",
      "insecure-object-assign:src/components/foo.tsx",
      "prototype-pollution-loop:scripts/foo.mjs",
    ]);
  });

  it.skipIf(!HAS_PYTHON)("filters every run in the report", () => {
    const path = writeReport([result(RULE, "scripts/__tests__/a.test.mjs", 1)], {
      runs: 2,
    });

    const r = runFilter(path);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("dropped 2 known test-fixture false positive(s)");
    const report = JSON.parse(readFileSync(path, "utf8"));
    expect(report.runs.map((run) => run.results.length)).toEqual([0, 0]);
  });

  it.skipIf(!HAS_PYTHON)("fails loudly on an unreadable report instead of passing empty", () => {
    const missing = join(dir, "absent.sarif");
    const broken = join(dir, "broken.sarif");
    writeFileSync(broken, "{ not json");

    const missingRun = runFilter(missing);
    expect(missingRun.status).toBe(1);
    expect(missingRun.stderr).toContain("absent.sarif");

    const brokenRun = runFilter(broken);
    expect(brokenRun.status).toBe(1);
    expect(brokenRun.stderr).toContain("broken.sarif");
  });

  it.skipIf(!HAS_PYTHON)("fails loudly when the report holds no scan run", () => {
    // Valid JSON, structurally empty: uploading nothing must not look like
    // success just because the file parsed.
    const path = writeReport([], { runs: 0 });

    const r = runFilter(path);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no scan run");
  });

  it.skipIf(!HAS_PYTHON)("treats a run with no findings as a clean scan, not an error", () => {
    const path = writeReport([]);

    const r = runFilter(path);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("dropped 0 known test-fixture false positive(s)");
  });

  it.skipIf(!HAS_PYTHON)("requires a report path", () => {
    const r = runFilter();
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage:");
  });
});
