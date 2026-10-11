/**
 * #564 follow-up: the three re-render tools accept --content like the main
 * pipeline, so targeting a video no longer means editing source.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  parseContentArg,
  listContentDirs,
  resolveContentDir,
  formatContentError,
} from "../cli-content.mjs";

describe("parseContentArg", () => {
  it("returns absent when the flag is not present", () => {
    expect(parseContentArg([])).toEqual({ kind: "absent" });
    expect(parseContentArg(["--bgm"])).toEqual({ kind: "absent" });
  });

  it("returns the value after --content", () => {
    expect(parseContentArg(["--content", "deepseek"])).toEqual({
      kind: "value",
      value: "deepseek",
    });
  });

  it("flags a dangling --content", () => {
    expect(parseContentArg(["--content"])).toEqual({ kind: "missing-value" });
    expect(parseContentArg(["--content", "--bgm"])).toEqual({ kind: "missing-value" });
  });
});

describe("resolveContentDir", () => {
  let baseDir;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "cli-content-"));
    mkdirSync(join(baseDir, "content", "alpha"), { recursive: true });
    mkdirSync(join(baseDir, "content", "beta"), { recursive: true });
  });
  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("uses an explicit --content directory", () => {
    expect(
      resolveContentDir({ argv: ["--content", "beta"], baseDir, defaultContent: "alpha" }),
    ).toEqual({ ok: true, contentDir: "beta" });
  });

  it("falls back to the default so bare runs behave as before", () => {
    expect(resolveContentDir({ argv: [], baseDir, defaultContent: "alpha" })).toEqual({
      ok: true,
      contentDir: "alpha",
    });
  });

  it("fails fast on an unknown directory and lists what exists", () => {
    const result = resolveContentDir({
      argv: ["--content", "nope"],
      baseDir,
      defaultContent: "alpha",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/content\/nope/);
    expect(result.available).toEqual(["alpha", "beta"]);
  });

  it("fails on a dangling --content instead of silently using the default", () => {
    const result = resolveContentDir({ argv: ["--content"], baseDir, defaultContent: "alpha" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/requires a directory name/);
  });

  it("listContentDirs returns sorted dir names only", () => {
    expect(listContentDirs(baseDir)).toEqual(["alpha", "beta"]);
  });
});

describe("formatContentError", () => {
  let baseDir;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "cli-content-"));
    mkdirSync(join(baseDir, "content", "alpha"), { recursive: true });
  });
  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("includes the message and the available-content hint", () => {
    const result = resolveContentDir({
      argv: ["--content", "nope"],
      baseDir,
      defaultContent: "alpha",
    });
    const text = formatContentError(result);
    expect(text).toMatch(/content\/nope/);
    expect(text).toMatch(/Available content:/);
    expect(text).toMatch(/- alpha/);
  });

  it("returns an empty string for a successful resolution", () => {
    const result = resolveContentDir({ argv: [], baseDir, defaultContent: "alpha" });
    expect(formatContentError(result)).toBe("");
  });
});
