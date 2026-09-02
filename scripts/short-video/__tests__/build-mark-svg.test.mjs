import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import {
  remapFills,
  injectViewBox,
  buildMarkSvg,
  BRAND_BLUE,
  BRAND_RED,
} from "../build-mark-svg.mjs";

/**
 * Brand mark repair (spec D5).
 *
 * Root cause: china-ai-news-mark.svg has explicit width/height but no
 * viewBox, so CSS scaling became cropping (only the top-left blank slice
 * showed); fills were also dark blue (#0000xx) — invisible on #050508.
 *
 * The build script produces a video-specific asset (mark-video.svg) with a
 * correct viewBox and brand-palette fills; the source SVG never changes.
 * The Remotion components (CtaScene / visuals) must read the repaired asset.
 */

const SOURCE_PATH = new URL("../assets/china-ai-news-mark.svg", import.meta.url);
const OUTPUT_PATH = new URL("../assets/china-ai-news-mark-video.svg", import.meta.url);

describe("remapFills", () => {
  it("maps dark blue fills to dispatch blue", () => {
    const { svg } = remapFills('<path fill="#0000FC"/>');
    expect(svg).toContain(`fill="${BRAND_BLUE}"`);
    expect(svg).not.toContain("#0000FC");
  });

  it("maps red-family fills (incl. dark purple-red) to brand red", () => {
    for (const hex of ["#FF0000", "#770046"]) {
      const { svg } = remapFills(`<path fill="${hex}"/>`);
      expect(svg).toContain(`fill="${BRAND_RED}"`);
    }
  });

  it("leaves out-of-palette fills untouched", () => {
    const { svg } = remapFills('<path fill="#F5F5F5"/>');
    expect(svg).toContain('fill="#F5F5F5"');
  });

  it("records what it replaced", () => {
    const { replacements } = remapFills('<path fill="#0000FC"/><path fill="#FF0000"/>');
    expect(replacements).toEqual({ "#0000FC": BRAND_BLUE, "#FF0000": BRAND_RED });
  });
});

describe("injectViewBox", () => {
  it("adds a viewBox derived from the width/height attributes", () => {
    const svg = injectViewBox('<svg version="1.1" width="648" height="420">');
    expect(svg).toContain('viewBox="0 0 648 420"');
  });

  it("does not duplicate an existing viewBox", () => {
    const svg = injectViewBox('<svg viewBox="0 0 1 1" width="648" height="420">');
    expect(svg.match(/viewBox=/g)).toHaveLength(1);
  });
});

describe("buildMarkSvg (source → video asset)", () => {
  it("produces a viewBox'd, brand-palette asset and never touches the source", () => {
    const before = readFileSync(SOURCE_PATH, "utf8");
    const { output } = buildMarkSvg(SOURCE_PATH, OUTPUT_PATH);
    const after = readFileSync(SOURCE_PATH, "utf8");

    // Source file is byte-identical
    expect(after).toBe(before);

    // Output is clean, scaleable and on-palette
    expect(output).toContain('viewBox="0 0 648 420"');
    expect(output).not.toContain("<?xml");
    expect(output).not.toContain("<!--");
    expect(output).not.toMatch(/fill="#(?:0000|FF0000|770046|0300)/i);
    expect(output).toContain(`fill="${BRAND_BLUE}"`);
    expect(output).toContain(`fill="${BRAND_RED}"`);
  });

  it("is idempotent — rebuilding over the output yields identical content", () => {
    const first = buildMarkSvg(SOURCE_PATH, OUTPUT_PATH).output;
    const second = buildMarkSvg(SOURCE_PATH, OUTPUT_PATH).output;
    expect(second).toBe(first);
  });
});
