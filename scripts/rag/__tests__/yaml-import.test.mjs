import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// From scripts/rag/__tests__/ up two levels = scripts/, so the scan really
// covers every script rather than just scripts/rag/**.
const SCRIPTS_DIR = fileURLToPath(new URL("../../", import.meta.url));
// Vendored third-party trees and generated output are not ours to lint.
const SKIP_DIRS = new Set(["node_modules", "experiments", "__tests__", "fixtures", "output"]);

function listMjs(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    // lstat, not stat: scripts/short-video/output/** holds dangling symlinks,
    // which make statSync throw ENOENT mid-walk.
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) listMjs(full, acc);
    else if (full.endsWith(".mjs")) acc.push(full);
  }
  return acc;
}

describe("js-yaml import contract", () => {
  // js-yaml v5 (pinned in package.json) ships no default export, so
  // `import yaml from "js-yaml"` throws at module load: "does not provide an
  // export named 'default'". That silently broke `node scripts/rag/index.mjs`
  // — every doc save's RAG reindex failed non-blocking and nobody noticed.
  it("js-yaml exposes named load and no default", async () => {
    const mod = await import("js-yaml");
    expect(typeof mod.load).toBe("function");
    expect(mod.default).toBeUndefined();
  });

  it("no scripts/ source imports js-yaml as default", () => {
    const offenders = listMjs(SCRIPTS_DIR)
      .filter((file) => /^import\s+yaml\s+from\s+["']js-yaml["']/m.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(SCRIPTS_DIR, "scripts/"));
    expect(offenders).toEqual([]);
  });
});
