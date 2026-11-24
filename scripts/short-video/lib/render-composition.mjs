/**
 * Composition fingerprint — "did the code that turns props into pixels change?"
 *
 * The incremental renderer may only reuse previously rendered frames when the
 * composition itself is byte-identical. Scene fingerprints cover data; this
 * covers the renderer: React components, tokens, layout helpers, transition
 * rules and the Remotion config/package. Fonts are not loaded from files in
 * this project (system stacks live in `src/tokens.ts`), so tokens changes are
 * already caught by the source sweep.
 *
 * Fixtures are excluded: `src/*-fixture.tsx` and `src/fixture-media.mjs` exist
 * for determinism tests, never for `Root.tsx`'s real composition.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { compositionFingerprintOf } from "./render-incremental.mjs";

const SOURCE_EXTENSIONS = /\.(tsx?|css)$/;
const FIXTURE = /(^|[\\/])[^\\/]*fixture[^\\/]*$/i;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * @param {{remotionDir: string}} input
 * @returns {{fingerprint: string, entries: Array<{path: string, sha256: string}>}}
 */
export function computeCompositionFingerprint({ remotionDir }) {
  const files = [];
  for (const rel of ["package.json", "remotion.config.ts"]) {
    const full = join(remotionDir, rel);
    if (existsSync(full)) files.push(full);
  }
  const srcDir = join(remotionDir, "src");
  if (existsSync(srcDir)) {
    for (const full of walk(srcDir)) {
      const rel = relative(remotionDir, full);
      if (FIXTURE.test(full)) continue;
      if (!SOURCE_EXTENSIONS.test(rel)) continue;
      files.push(full);
    }
  }

  const entries = files
    .map((full) => ({
      path: relative(remotionDir, full),
      sha256: createHash("sha256").update(readFileSync(full)).digest("hex"),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const fingerprint = compositionFingerprintOf(entries);

  return { fingerprint, entries };
}

/** Cheap stat-based guard used before trusting a cache directory. */
export function isReadableFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
