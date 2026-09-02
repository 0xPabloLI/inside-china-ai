/**
 * Renderer guard — the HTML/Playwright render path was retired (decision 59,
 * spec-text-overflow-hardening.md, 2026-09-01). Remotion is the only renderer.
 * The guard fails fast on any attempt to opt back into the retired path:
 * the `--playwright` CLI flag or `meta.renderer = "playwright"`.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { assertRemotionRenderer } from "../lib/renderer-guard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("assertRemotionRenderer", () => {
  it("rejects the retired --playwright CLI flag", () => {
    expect(() =>
      assertRemotionRenderer({ argv: ["node", "main.mjs", "--playwright"], meta: {} }),
    ).toThrow(/retired/i);
  });

  it('rejects meta.renderer = "playwright"', () => {
    expect(() => assertRemotionRenderer({ argv: [], meta: { renderer: "playwright" } })).toThrow(
      /retired/i,
    );
  });

  it("accepts the Remotion default (no renderer declared)", () => {
    expect(() => assertRemotionRenderer({ argv: [], meta: {} })).not.toThrow();
  });

  it('accepts an explicit renderer: "remotion"', () => {
    expect(() =>
      assertRemotionRenderer({ argv: ["--content", "x"], meta: { renderer: "remotion" } }),
    ).not.toThrow();
  });

  it("points the failure at the retirement note (decision 59)", () => {
    try {
      assertRemotionRenderer({ argv: ["--playwright"], meta: {} });
      expect.unreachable("guard should have thrown");
    } catch (e) {
      expect(e.message).toContain("59");
      expect(e.message).toContain("retired-html-path");
    }
  });
});

describe("pipeline entrypoints fail fast on --playwright", () => {
  // The guard must fire before any real work (preflight, audio lookup, TTS),
  // so the CLI exits non-zero with the retirement message almost instantly.
  function runEntrypoint(script) {
    try {
      execFileSync(
        "node",
        [join(__dirname, "..", script), "--content", "_gate-smoke", "--playwright"],
        {
          cwd: join(__dirname, ".."),
          stdio: "pipe",
          timeout: 30_000,
        },
      );
      return { status: 0, output: "" };
    } catch (e) {
      return {
        status: e.status,
        output: `${e.stdout?.toString() ?? ""}${e.stderr?.toString() ?? ""}`,
      };
    }
  }

  it("render-only.mjs refuses --playwright with the retirement message", () => {
    const { status, output } = runEntrypoint("render-only.mjs");
    expect(status).not.toBe(0);
    expect(output).toMatch(/retired/i);
  });

  it("main.mjs refuses --playwright with the retirement message", () => {
    const { status, output } = runEntrypoint("main.mjs");
    expect(status).not.toBe(0);
    expect(output).toMatch(/retired/i);
  });
});
