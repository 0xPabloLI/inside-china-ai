import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// #287 — unified entry-point env loader. loadEnv() mutates the real
// process.env, so every scenario runs in a spawned child node process with a
// sanitized environment (no shell-exported keys, no cross-test pollution).
// Library boundary invariant at the bottom guards the #275 contract.

const LOAD_ENV_PATH = fileURLToPath(new URL("../lib/load-env.mjs", import.meta.url));
const POOL_LIB_PATH = fileURLToPath(new URL("../lib/search-pool.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const POOL_KEY_NAMES = ["SERPER_API_KEY", "BRAVE_SEARCH_API_KEY", "TAVILY_API_KEY", "JINA_API_KEY"];

/** Spawn a child node (ESM) running `code`; returns {stdout, stderr}. */
function runNodeEsm(code, { env = {}, cwd = REPO_ROOT } = {}) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** Child snippet: loadEnv(optional path), then print selected keys as JSON. */
function probeKeysAfterLoad(envPathExpr) {
  return `
    const { loadEnv } = await import(${JSON.stringify(LOAD_ENV_PATH)});
    loadEnv(${envPathExpr});
    console.log(JSON.stringify({ PROBE_KEY: process.env.PROBE_KEY ?? null }));
  `;
}

function writeEnvFile(dir, content) {
  const envPath = join(dir, `env-${Math.random().toString(36).slice(2)}.local`);
  writeFileSync(envPath, content, "utf8");
  return envPath;
}

// ─── loadEnv ───

describe("loadEnv", () => {
  it("loads KEY=VALUE pairs from the given file into process.env", () => {
    const envPath = writeEnvFile(mkdtempSync(join(tmpdir(), "load-env-")), 'PROBE_KEY="from_file"\n');
    const { stdout } = runNodeEsm(probeKeysAfterLoad(JSON.stringify(envPath)));
    expect(JSON.parse(stdout)).toEqual({ PROBE_KEY: "from_file" });
  });

  it("missing file is a silent no-op (fail-open, #269 semantics)", () => {
    const missingPath = join(mkdtempSync(join(tmpdir(), "load-env-")), "does-not-exist.local");
    const { stdout, stderr } = runNodeEsm(probeKeysAfterLoad(JSON.stringify(missingPath)));
    expect(JSON.parse(stdout)).toEqual({ PROBE_KEY: null });
    expect(stderr).toBe("");
  });

  it("real environment variables take precedence over file values", () => {
    const envPath = writeEnvFile(mkdtempSync(join(tmpdir(), "load-env-")), "PROBE_KEY=from_file\n");
    const { stdout } = runNodeEsm(probeKeysAfterLoad(JSON.stringify(envPath)), {
      env: { PROBE_KEY: "from_real_env" },
    });
    expect(JSON.parse(stdout)).toEqual({ PROBE_KEY: "from_real_env" });
  });

  it("loads only once per process (later calls are no-ops)", () => {
    const dir = mkdtempSync(join(tmpdir(), "load-env-"));
    const firstPath = writeEnvFile(dir, "PROBE_KEY=first\n");
    const secondPath = writeEnvFile(dir, "PROBE_KEY=second\n");
    const child = `
      const { loadEnv } = await import(${JSON.stringify(LOAD_ENV_PATH)});
      loadEnv(${JSON.stringify(firstPath)});
      loadEnv(${JSON.stringify(secondPath)});
      console.log(JSON.stringify({ PROBE_KEY: process.env.PROBE_KEY ?? null }));
    `;
    const { stdout } = runNodeEsm(child);
    expect(JSON.parse(stdout)).toEqual({ PROBE_KEY: "first" });
  });

  it("non-ENOENT load failure warns on stderr but does not throw", () => {
    // A directory path makes process.loadEnvFile throw ERR_INVALID_ARG_TYPE —
    // the pipeline must keep booting (fail-open) and surface one warning.
    const dirPath = mkdtempSync(join(tmpdir(), "load-env-"));
    const { stdout, stderr } = runNodeEsm(probeKeysAfterLoad(JSON.stringify(dirPath)));
    expect(JSON.parse(stdout)).toEqual({ PROBE_KEY: null });
    expect(stderr).toMatch(/loadEnvFile/i);
  });
});

// ─── Library boundary (#275 invariant) ───

describe("search-pool library boundary", () => {
  it("importing search-pool.mjs as a library never loads .env.local", () => {
    // .env.local exists at the repo root with real pool keys; a sanitized
    // child proves they stay unset after a bare library import. Entries
    // (main.mjs / search-sources.mjs / the pool CLI guard) own env loading.
    const child = `
      await import(${JSON.stringify(POOL_LIB_PATH)});
      const keys = ${JSON.stringify(POOL_KEY_NAMES)};
      console.log(JSON.stringify(Object.fromEntries(keys.map((k) => [k, process.env[k] ?? null]))));
    `;
    const { stdout } = runNodeEsm(child);
    const observed = JSON.parse(stdout);
    for (const key of POOL_KEY_NAMES) {
      expect(observed[key], `${key} must stay unset on library import`).toBeNull();
    }
  });
});
