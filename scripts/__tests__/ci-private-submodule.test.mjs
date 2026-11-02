/**
 * CI wiring for the private skills submodule (#466).
 *
 * The point of #466 is that CI reported green while the skills glob under
 * vitest's include matched nothing, because `skills/shared` was never checked
 * out. Wiring the step once does not stay true by itself: someone can drop the
 * step, drop the secret reference, or restore the default persisted credential
 * (which would collide with the PAT header). These assertions are the tripwire,
 * and the missing-token path is executed rather than merely asserted about the
 * YAML.
 */
import { describe, it, expect } from "vitest";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..", "..");
const CI = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
const SCRIPT = join(ROOT, ".github", "scripts", "checkout-private-submodule.sh");

// The test runner's own environment must not supply the values the script is
// supposed to build; strip any inherited GIT_CONFIG_* before layering extras.
function cleanEnv(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("GIT_CONFIG_")) env[key] = value;
  }
  return { ...env, ...extra };
}

describe("private skills submodule CI wiring (#466)", () => {
  it("checks out skills/shared through the credentialed step", () => {
    expect(CI).toContain("bash .github/scripts/checkout-private-submodule.sh");
    expect(CI).toContain("secrets.SHARED_SKILLS_TOKEN");
  });

  it("does not persist the default checkout credential", () => {
    // Persisted GITHUB_TOKEN auth and the PAT header both target
    // https://github.com/; two Authorization headers break the fetch.
    expect(CI).toMatch(/persist-credentials:\s*false/);
  });

  it("fails closed with a named cause when the token is absent", () => {
    const run = spawnSync("bash", [SCRIPT], {
      env: cleanEnv({ SHARED_SKILLS_TOKEN: "" }),
      encoding: "utf8",
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("SHARED_SKILLS_TOKEN");
    expect(run.stderr).toContain("silently not run");
  });

  it("passes the PAT as a per-process Authorization header to git", () => {
    const dir = mkdtempSync(join(tmpdir(), "submodule-check-"));
    try {
      const dump = join(dir, "dump.txt");
      const fakeGit = join(dir, "git");
      writeFileSync(
        fakeGit,
        [
          "#!/bin/sh",
          "{",
          "  printf 'count=%s\\n' \"${GIT_CONFIG_COUNT:-}\"",
          "  printf 'key=%s\\n' \"${GIT_CONFIG_KEY_0:-}\"",
          "  printf 'value=%s\\n' \"${GIT_CONFIG_VALUE_0:-}\"",
          "  printf 'args=%s\\n' \"$*\"",
          '} > "$DUMP"',
          "",
        ].join("\n"),
      );
      chmodSync(fakeGit, 0o755);

      execFileSync("bash", [SCRIPT], {
        env: cleanEnv({
          PATH: `${dir}:${process.env.PATH}`,
          SHARED_SKILLS_TOKEN: "test-token",
          DUMP: dump,
        }),
      });

      const seen = Object.fromEntries(
        readFileSync(dump, "utf8")
          .trim()
          .split("\n")
          .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
      );
      const expected = Buffer.from("x-access-token:test-token").toString("base64");
      expect(seen.args).toBe("submodule update --init --recursive");
      expect(seen.count).toBe("1");
      expect(seen.key).toBe("http.https://github.com/.extraheader");
      expect(seen.value).toBe(`AUTHORIZATION: basic ${expected}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
