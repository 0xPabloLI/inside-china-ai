/**
 * Tests for the capture-evidence-shot CLI surface (#758).
 *
 * The module is imported dynamically on purpose: if `main()` still ran at
 * import time, the guard test below would see its console output or exit code.
 * Nothing here launches a browser.
 */
import { describe, it, expect, vi } from "vitest";
import { resolve } from "path";
import { fileURLToPath } from "url";

const CONTENT_ROOT = resolve(fileURLToPath(new URL("../content", import.meta.url)));

const loadCli = () => import("../capture-evidence-shot.mjs");

describe("capture-evidence-shot CLI", () => {
  it("exports its helpers without running main at import", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = process.exitCode;
    try {
      const mod = await loadCli();
      // A run-at-import main() reports through console and sets exitCode from a
      // microtask, so give it a turn before asserting.
      await new Promise((done) => setTimeout(done, 0));
      expect(typeof mod.parseViewport).toBe("function");
      expect(typeof mod.resolveContentDir).toBe("function");
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(before);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("parses a WxH viewport and rejects anything else", async () => {
    const { parseViewport } = await loadCli();
    expect(parseViewport("1280x900")).toEqual({ width: 1280, height: 900 });
    expect(parseViewport("320X240")).toEqual({ width: 320, height: 240 });
    expect(() => parseViewport("1280")).toThrow(/<width>x<height>/);
    expect(() => parseViewport("1280×900")).toThrow(/<width>x<height>/);
    expect(() => parseViewport("0x900")).not.toThrow();
  });

  it("resolves a slug under the content root and refuses escapes", async () => {
    const { resolveContentDir } = await loadCli();
    expect(resolveContentDir("my-pack")).toBe(resolve(CONTENT_ROOT, "my-pack"));
    expect(resolveContentDir("nested/pack")).toBe(resolve(CONTENT_ROOT, "nested/pack"));
    for (const slug of [".", "..", "../outside", "../../scripts", "/tmp/pack"]) {
      expect(() => resolveContentDir(slug), slug).toThrow(/must name a pack inside/);
    }
  });
});
