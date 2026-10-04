import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPTS_DIR = fileURLToPath(new URL("../", import.meta.url));
// Vendored third-party trees are not ours to lint.
const SKIP_DIRS = new Set(["node_modules", "experiments", "__tests__", "fixtures"]);

function listMjs(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listMjs(full, acc);
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
