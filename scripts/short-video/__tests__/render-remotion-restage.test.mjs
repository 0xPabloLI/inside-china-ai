// Media re-staging tests — stale public/assets cache.
//
// render-remotion.mjs copies content media into remotion/public/assets/ before
// rendering, but every copy site was guarded by `if (!existsSync(dest))`. A
// content asset edited IN PLACE (same filename, new bytes) therefore never
// reached Remotion again, and the render silently shipped the previous version
// of the picture — the render itself succeeds and nothing warns.
//
// Observed 2026-10-14: the deepseek-flash-silent-update hook background was
// re-composited with a baked dark scrim, the file on disk changed (md5
// 5be3b24dff44bf8d72619eda63b199a4), the public copy still held the old bytes
// (md5 2d166a56a098ee62dfb642236b259c55), and the rendered hook came out with
// the un-scrimmed white page behind the white headline.
//
// Real files in a temp dir — no fs mocks; the guard is a stat comparison.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, utimesSync, statSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { shouldRestageAsset } from "../lib/render-remotion.mjs";

let dir;
const src = () => join(dir, "source.png");
const dest = () => join(dir, "public.png");

/** Write `content` and set the file's mtime to `mtimeMs`. */
function writeAt(path, content, mtimeMs) {
  writeFileSync(path, content);
  const seconds = mtimeMs / 1000;
  utimesSync(path, seconds, seconds);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "restage-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("shouldRestageAsset — copy decision", () => {
  it("copies when the destination does not exist", () => {
    writeAt(src(), "a", 1000);
    expect(shouldRestageAsset(src(), dest())).toBe(true);
  });

  it("re-copies when the source is newer than the stale public copy", () => {
    writeAt(dest(), "old", 1000);
    writeAt(src(), "new", 2000);
    expect(shouldRestageAsset(src(), dest())).toBe(true);
  });

  it("skips the copy when the destination is already current", () => {
    writeAt(src(), "same", 2000);
    writeAt(dest(), "same", 2000);
    expect(shouldRestageAsset(src(), dest())).toBe(false);
  });

  it("re-copies when the sizes differ even if the destination looks newer", () => {
    // Same-name replacement that preserved the mtime (git checkout, cp -p,
    // archive extraction) must still land.
    writeAt(src(), "longer-content", 1000);
    writeAt(dest(), "short", 5000);
    expect(shouldRestageAsset(src(), dest())).toBe(true);
  });

  it("copies (fail-safe) when the destination cannot be stat-ed", () => {
    writeAt(src(), "a", 1000);
    // A directory at the destination path makes statSync succeed but the
    // copy must still be attempted; use a genuinely unreadable path instead.
    expect(shouldRestageAsset(src(), join(dir, "missing-dir", "public.png"))).toBe(true);
  });

  it("copies (fail-safe) when the source cannot be stat-ed", () => {
    writeAt(dest(), "a", 1000);
    expect(shouldRestageAsset(join(dir, "absent.png"), dest())).toBe(true);
  });

  it("treats sub-millisecond mtime drift as a cache hit, not an edit", () => {
    // A timestamp round-trip through utimesSync (float seconds) lands a
    // fraction of a millisecond below the source, which a bare `>` reads as
    // "edited" and re-copies on every render. Real edits are seconds later.
    writeAt(src(), "same", 2000);
    writeAt(dest(), "same", 2000 - 0.4);
    expect(shouldRestageAsset(src(), dest())).toBe(false);
  });

  it("still re-copies when the source is meaningfully newer", () => {
    writeAt(src(), "same", 2000);
    writeAt(dest(), "same", 1000);
    expect(shouldRestageAsset(src(), dest())).toBe(true);
  });
});

describe("shouldRestageAsset — wiring", () => {
  it("the real media copy path re-stages an in-place edit", async () => {
    const contentDir = mkdtempSync(join(tmpdir(), "restage-content-"));
    const publicDir = mkdtempSync(join(tmpdir(), "restage-public-"));
    try {
      const asset = join(contentDir, "assets");
      rmSync(asset, { recursive: true, force: true });
      writeAt(join(contentDir, "bg.png"), "version-one", 1000);
      const destPath = join(publicDir, "bg.png");
      writeAt(destPath, "version-one", 1000);

      expect(shouldRestageAsset(join(contentDir, "bg.png"), destPath)).toBe(false);

      writeAt(join(contentDir, "bg.png"), "version-two-different-length", 3000);
      expect(shouldRestageAsset(join(contentDir, "bg.png"), destPath)).toBe(true);

      // Sanity: the stale copy really is the older bytes on disk.
      expect(statSync(destPath).size).not.toBe(statSync(join(contentDir, "bg.png")).size);
    } finally {
      rmSync(contentDir, { recursive: true, force: true });
      rmSync(publicDir, { recursive: true, force: true });
    }
  });
});
