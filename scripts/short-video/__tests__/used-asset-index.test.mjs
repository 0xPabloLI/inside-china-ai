import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { buildUsedAssetIndex, isReusedAsset } from "../lib/used-asset-index.mjs";

let root;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "used-asset-index-"));
  // alpha: one asset file + one media-cache entry
  mkdirSync(join(root, "alpha", "assets"), { recursive: true });
  writeFileSync(join(root, "alpha", "assets", "dup.jpg"), "ALPHA-ASSET-BYTES");
  mkdirSync(join(root, "alpha", "research"), { recursive: true });
  writeFileSync(
    join(root, "alpha", "research", "media-cache.json"),
    JSON.stringify({
      entries: [
        {
          sourceUrl: "https://example.com/article",
          images: [{ url: "https://Example.com/img/a.jpg?w=100" }],
          videos: [{ url: "http://example.com/vid/b.mp4" }],
        },
      ],
    }),
  );

  // beta: the "current" content — must be excluded from the index.
  // own.jpg has unique bytes (exclusion test); copy.jpg duplicates alpha's
  // bytes (hash-reuse detection must still fire on content, not path).
  mkdirSync(join(root, "beta", "assets"), { recursive: true });
  writeFileSync(join(root, "beta", "assets", "own.jpg"), "BETA-OWN-UNIQUE-BYTES");
  writeFileSync(join(root, "beta", "assets", "copy.jpg"), "ALPHA-ASSET-BYTES");

  // gamma: no assets dir + broken media-cache.json
  mkdirSync(join(root, "gamma", "research"), { recursive: true });
  writeFileSync(join(root, "gamma", "research", "media-cache.json"), "{not json");

  // delta: assets dir containing a directory (hash would fail → skipped)
  mkdirSync(join(root, "delta", "assets", "nested"), { recursive: true });
  writeFileSync(join(root, "delta", "assets", "ok.jpg"), "DELTA-BYTES");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("buildUsedAssetIndex", () => {
  it("collects file hashes and canonicalized media-cache URLs", () => {
    const index = buildUsedAssetIndex({ contentRoot: root, currentSlug: "beta" });
    expect(index.fileCount).toBeGreaterThanOrEqual(2); // alpha + delta files
    expect(index.urls.has("https://example.com/img/a.jpg")).toBe(true);
    expect(index.urls.has("https://example.com/vid/b.mp4")).toBe(true);
  });

  it("excludes the current slug's own assets", () => {
    const index = buildUsedAssetIndex({ contentRoot: root, currentSlug: "beta" });
    expect(
      isReusedAsset({ url: "", filePath: join(root, "beta", "assets", "own.jpg") }, index),
    ).toBe(false);
  });

  it("degrades gracefully on missing dirs and broken cache JSON", () => {
    const index = buildUsedAssetIndex({ contentRoot: root, currentSlug: "beta" });
    // gamma contributed nothing but did not throw
    expect(index.hashes.size).toBeGreaterThanOrEqual(2);
    expect(index.urls.size).toBe(2);
  });

  it("skips non-file entries inside assets/ instead of failing", () => {
    const index = buildUsedAssetIndex({ contentRoot: root, currentSlug: "beta" });
    // delta/ok.jpg hashed, delta/assets/nested (dir) skipped
    expect(index.fileCount).toBe(2);
  });

  it("returns an empty index for a missing content root", () => {
    const index = buildUsedAssetIndex({
      contentRoot: "/nonexistent-path-xyz",
      currentSlug: "beta",
    });
    expect(index.hashes.size).toBe(0);
    expect(index.urls.size).toBe(0);
    expect(index.fileCount).toBe(0);
  });
});

describe("isReusedAsset", () => {
  const index = () => buildUsedAssetIndex({ contentRoot: root, currentSlug: "beta" });

  it("detects reuse by canonicalized URL (protocol/query/trailing-slash insensitive)", () => {
    expect(isReusedAsset({ url: "http://example.com/img/a.jpg?w=999" }, index())).toBe(true);
  });

  it("detects reuse by file content hash even when the copy lives in the current slug", () => {
    // beta/copy.jpg has identical bytes to alpha/dup.jpg — matching bytes
    // from a fresh download must count as reused regardless of location.
    expect(
      isReusedAsset(
        { url: "https://fresh.example/x.jpg", filePath: join(root, "beta", "assets", "copy.jpg") },
        index(),
      ),
    ).toBe(true);
  });

  it("returns false for unseen url and unseen bytes", () => {
    expect(
      isReusedAsset(
        {
          url: "https://fresh.example/x.jpg",
          filePath: join(root, "gamma", "research", "media-cache.json"),
        },
        index(),
      ),
    ).toBe(false);
  });

  it("returns false on missing inputs or missing index", () => {
    expect(isReusedAsset({}, index())).toBe(false);
    expect(isReusedAsset({ url: "https://example.com/img/a.jpg" }, null)).toBe(false);
  });
});

describe("buildUsedAssetIndex — real content/ smoke", () => {
  it("indexes the real repo content directory without throwing", async () => {
    const { fileURLToPath } = await import("url");
    const here = fileURLToPath(new URL(".", import.meta.url));
    const realContentRoot = join(here, "..", "content");
    const index = buildUsedAssetIndex({
      contentRoot: realContentRoot,
      currentSlug: "qwen4-preview",
    });
    expect(index.fileCount).toBeGreaterThan(0);
    expect(index.hashes.size).toBeGreaterThan(0);
  });
});
