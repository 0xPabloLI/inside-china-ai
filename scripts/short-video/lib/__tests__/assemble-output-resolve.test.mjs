import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveOutputVideo } from "../assemble.mjs";

describe("resolveOutputVideo", () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "resolve-video-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns the latest versioned file when versions exist", () => {
    writeFileSync(join(dir, "demo-v2026-08-25T10-00-00-short.mp4"), "");
    writeFileSync(join(dir, "demo-v2026-08-29T05-06-23-short.mp4"), "");
    writeFileSync(join(dir, "demo-v2026-08-27T08-15-32-raw-prebgm.mp4"), "");

    const resolved = resolveOutputVideo(dir, "demo");
    expect(resolved).toBe(join(dir, "demo-v2026-08-29T05-06-23-short.mp4"));
  });

  test("falls back to the legacy unversioned name when no version exists", () => {
    const legacyDir = join(dir, "legacy");
    mkdirSync(legacyDir);
    writeFileSync(join(legacyDir, "demo-short.mp4"), "");

    expect(resolveOutputVideo(legacyDir, "demo")).toBe(join(legacyDir, "demo-short.mp4"));
  });

  test("returns the legacy path even when the directory is empty or missing", () => {
    const emptyDir = join(dir, "empty");
    mkdirSync(emptyDir);
    expect(resolveOutputVideo(emptyDir, "demo")).toBe(join(emptyDir, "demo-short.mp4"));
    expect(resolveOutputVideo(join(dir, "missing"), "demo")).toBe(
      join(dir, "missing", "demo-short.mp4"),
    );
  });

  test("does not treat other subjects' versions as matches", () => {
    const mixedDir = join(dir, "mixed");
    mkdirSync(mixedDir);
    writeFileSync(join(mixedDir, "other-v2026-08-29T05-06-23-short.mp4"), "");

    expect(resolveOutputVideo(mixedDir, "demo")).toBe(join(mixedDir, "demo-short.mp4"));
  });
});
