/**
 * Tests for verify-lfs-pointers.mjs
 *
 * Verifies two paths:
 *   1. A valid LFS pointer in staging → passes
 *   2. A raw binary blob in staging (not a pointer) → fails
 *
 * These tests create temporary git fixtures and do NOT touch
 * the real working tree or user's staged files.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// From scripts/short-video/__tests__/ → repo root is 3 dirs up
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "verify-lfs-pointers.mjs");

// LFS pointer for a tiny file (content: "hello\n", sha256: 5891b5b522d5db...)
const VALID_POINTER = `version https://git-lfs.github.com/spec/v1
oid sha256:5891b5b522d5db08b87c3a37315615b0b3a45c83e6cd5f0c95e0c2c03b2f4a87
size 6
`;

describe("verify-lfs-pointers.mjs", () => {
  let tempRepo;

  beforeAll(() => {
    // Create a temp git repo with LFS initialized
    tempRepo = mkdtempSync(join(tmpdir(), "lfs-test-"));
    execSync("git init", { cwd: tempRepo });
    execSync("git lfs install", { cwd: tempRepo });

    // Copy .gitattributes from the real repo
    const gitattributes = `*.png filter=lfs diff=lfs merge=lfs -text
*.mp4 filter=lfs diff=lfs merge=lfs -text
*.svg -text
`;
    writeFileSync(join(tempRepo, ".gitattributes"), gitattributes);
    execSync("git add .gitattributes", { cwd: tempRepo });
    execSync('git commit -m "init: .gitattributes"', { cwd: tempRepo });
  });

  afterAll(() => {
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("passes when a staged file is a valid LFS pointer", () => {
    // Write a file that looks like a PNG but is actually an LFS pointer
    writeFileSync(join(tempRepo, "test-image.png"), VALID_POINTER);
    execSync("git add test-image.png", { cwd: tempRepo });

    // Run the verifier — should exit 0
    const result = execSync(`node "${SCRIPT}"`, {
      cwd: tempRepo,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(result).toContain("valid pointers");
  });

  it("fails when a staged file is a raw binary blob (not an LFS pointer)", () => {
    // Disable LFS filter so the raw binary stays as a raw blob in staging
    execSync("git lfs uninstall", { cwd: tempRepo });
    execSync("git config filter.lfs.clean ''", { cwd: tempRepo });
    execSync("git config filter.lfs.smudge ''", { cwd: tempRepo });
    // Modern git-lfs also installs a `process` filter (required=true) in
    // .git/config — unset both, or the staged blob still becomes a pointer.
    execSync("git config filter.lfs.process ''", { cwd: tempRepo });
    execSync("git config filter.lfs.required ''", { cwd: tempRepo });

    // Write actual binary content (PNG header bytes) — NOT an LFS pointer
    const binaryContent = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      0x00,
      0x00,
      0x00,
      0x0d,
      0x49,
      0x48,
      0x44,
      0x52, // IHDR chunk
    ]);
    writeFileSync(join(tempRepo, "raw-binary.png"), binaryContent);
    execSync("git add raw-binary.png", { cwd: tempRepo });

    // Run the verifier — should exit 1
    let exitCode = 0;
    let output = "";
    try {
      execSync(`node "${SCRIPT}"`, {
        cwd: tempRepo,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      exitCode = e.status ?? 1;
      output = (e.stdout || "") + (e.stderr || "");
    }
    expect(exitCode).toBe(1);
    expect(output).toContain("FAILED");

    // Re-enable LFS for subsequent tests
    execSync("git lfs install", { cwd: tempRepo });
    execSync("git config --unset filter.lfs.clean", { cwd: tempRepo });
    execSync("git config --unset filter.lfs.smudge", { cwd: tempRepo });
    execSync("git config --unset filter.lfs.process", { cwd: tempRepo });
    execSync("git config --unset filter.lfs.required", { cwd: tempRepo });
  });

  it("passes when no LFS-tracked files are staged", () => {
    // Reset staging area completely
    execSync("git reset HEAD 2>/dev/null || true", { cwd: tempRepo });

    // Stage a text file (not LFS-tracked)
    writeFileSync(join(tempRepo, "readme.txt"), "hello world");
    execSync("git add readme.txt", { cwd: tempRepo });

    const result = execSync(`node "${SCRIPT}"`, {
      cwd: tempRepo,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(result).toContain("No LFS-tracked files staged");
  });

  it("skips SVG files (text-based, not LFS-tracked)", () => {
    // Stage an SVG file
    writeFileSync(join(tempRepo, "logo.svg"), "<svg></svg>");
    execSync("git add logo.svg", { cwd: tempRepo });

    const result = execSync(`node "${SCRIPT}"`, {
      cwd: tempRepo,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    // SVG is not in the LFS extension list, so it's skipped
    expect(result).toContain("No LFS-tracked files staged");
  });
});
