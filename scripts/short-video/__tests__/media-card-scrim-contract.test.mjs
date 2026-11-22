/**
 * MediaCard scrim contract.
 *
 * Regression source: 2026-11-15 (#1375) gave MediaBackground frame-scoped
 * bottom and rail gradients whose stops are calibrated for the 1080×1920
 * canvas. MediaCard was left on the default "frame" scope, so those stops
 * re-scaled into the card's own 820×594 box and painted a dark band on its
 * right and bottom edges — read as a drop shadow (reported 2026-11-22).
 *
 * MediaCard is a band, not the full frame. This guard keeps a future refactor
 * from silently dropping the explicit element scope again.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CARD_PATH = join(
  process.cwd(),
  "scripts/short-video/remotion/src/components/MediaCard.tsx",
);

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
