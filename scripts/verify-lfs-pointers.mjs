#!/usr/bin/env node
/**
 * LFS pointer verifier — checks staged binary files use LFS pointers.
 *
 * Reads .gitattributes to determine which extensions should be LFS-tracked,
 * then inspects staged blobs (A/C/M) for those extensions. If a staged file's
 * content starts with the LFS pointer header (`version https://git-lfs...`),
 * it passes. Otherwise, it fails with a clear message.
 *
 * SVG files are always skipped (text-based, explicitly NOT LFS-tracked).
 *
 * Usage (from pre-commit hook):
 *   node scripts/verify-lfs-pointers.mjs
 *
 * Exit codes:
 *   0 — all staged LFS-tracked files are valid pointers (or none staged)
 *   1 — one or more staged LFS-tracked files are NOT pointers
 */
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Use cwd() so the script works in any git repo (for testing with temp repos).
// Fall back to script's parent dir for backwards compatibility.
const repoRoot = existsSync(join(process.cwd(), ".gitattributes"))
  ? process.cwd()
  : join(__dirname, "..");

// ── Parse .gitattributes for LFS-tracked extensions ──
function getLfsExtensions() {
  const gitattributesPath = join(repoRoot, ".gitattributes");
  if (!existsSync(gitattributesPath)) return [];

  const content = readFileSync(gitattributesPath, "utf-8");
  const extensions = [];

  for (const line of content.split("\n")) {
    // Match lines like: *.mp4 filter=lfs diff=lfs merge=lfs -text
    const match = line.match(/^\*\.(\w+)\s+filter=lfs/);
    if (match) {
      extensions.push(match[1].toLowerCase());
    }
  }

  return extensions;
}

// ── Get staged files (Added/Copied/Modified) ──
function getStagedFiles() {
  const output = execSync("git diff --cached --name-only --diff-filter=ACM", {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return output.trim().split("\n").filter(Boolean);
}

// ── Check if a staged blob is an LFS pointer ──
function isLfsPointer(filePath) {
  try {
    // Read the staged blob content (first 200 bytes is enough)
    const content = execSync(
      `git cat-file -p :"${filePath}" 2>/dev/null | head -c 200`,
      { cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    // LFS pointer format:
    // version https://git-lfs.github.com/spec/v1
    // oid sha256:...
    // size ...
    return content.startsWith("version https://git-lfs.github.com/spec/v1");
  } catch {
    // If we can't read the blob, assume it's not staged properly
    return false;
  }
}

// ── Main ──
function main() {
  const lfsExtensions = getLfsExtensions();
  if (lfsExtensions.length === 0) {
    console.log("  [lfs-check] No LFS-tracked extensions found in .gitattributes");
    process.exit(0);
  }

  const stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    console.log("  [lfs-check] No staged files to check");
    process.exit(0);
  }

  // Filter staged files to only LFS-tracked extensions
  const lfsStagedFiles = stagedFiles.filter((file) => {
    const ext = file.split(".").pop()?.toLowerCase();
    return ext && lfsExtensions.includes(ext);
  });

  if (lfsStagedFiles.length === 0) {
    console.log("  [lfs-check] No LFS-tracked files staged");
    process.exit(0);
  }

  console.log(`  [lfs-check] Checking ${lfsStagedFiles.length} LFS-tracked file(s)...`);

  const failures = [];
  for (const file of lfsStagedFiles) {
    if (!isLfsPointer(file)) {
      failures.push(file);
    }
  }

  if (failures.length > 0) {
    console.error("\n  ❌ LFS pointer check FAILED for:");
    for (const file of failures) {
      console.error(`     ${file}`);
    }
    console.error("\n  These files have LFS attributes but are NOT LFS pointers.");
    console.error("  Run: git lfs install && git add --renormalize <file>");
    console.error("  Or: git rm --cached <file> && git add <file>\n");
    process.exit(1);
  }

  console.log(`  [lfs-check] ✅ All ${lfsStagedFiles.length} LFS-tracked file(s) are valid pointers`);
  process.exit(0);
}

main();
