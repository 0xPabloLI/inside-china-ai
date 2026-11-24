/**
 * MediaCard scrim contract.
 *
 * Regression source: a bounded media card was left on MediaBackground's
 * default "frame" scrim scope. Those gradient stops are calibrated for the
 * 1080×1920 canvas; inside an 820px card they re-scale into the card and paint
 * a dark band on its right and bottom edges — read as a drop shadow.
 *
 * This is the fast source gate; the pixel gate lives in
 * media-focus-render.test.mjs and measures a solid-white card edge against
 * its centre. Both are required: this one fails before a render starts, the
 * pixel one catches a gradient that reappears through another layer.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CARD_PATH = join(process.cwd(), "scripts/short-video/remotion/src/components/MediaCard.tsx");

describe("MediaCard scrim scope", () => {
  it("passes the element scrim scope to MediaBackground", () => {
    const source = readFileSync(CARD_PATH, "utf8");
    const mediaStart = source.indexOf("<MediaBackground");
    expect(mediaStart).toBeGreaterThan(-1);
    const mediaEnd = source.indexOf("/>", mediaStart);
    expect(mediaEnd).toBeGreaterThan(mediaStart);
    const call = source.slice(mediaStart, mediaEnd);
    expect(call).toContain('scrimScope="element"');
  });
});
