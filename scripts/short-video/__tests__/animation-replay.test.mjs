/**
 * #1030 — Keeps the real-data smoke honest.
 *
 * The replay script is the evidence tool cited in the delivery record. Content
 * packs are gitignored / machine-bound, so this suite drives it against a
 * small committed pack fixture and, crucially, asserts that an EMPTY scan
 * throws instead of producing a green-looking zero report.
 */
import { describe, it, expect } from "vitest";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  replayPacks,
  allocatorControl,
  inferSource,
  oldAnimation,
} from "../replay-animation-decisions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, "fixtures", "animation-replay-packs");

describe("replay-animation-decisions (#1030)", () => {
  it("reports before/after decisions over real-shaped pack fixtures", () => {
    const stats = replayPacks(FIXTURES);
    expect(stats.packCount).toBe(2);
    expect(stats.packs).toEqual(["pack-a", "pack-b"]);
    expect(stats.assets).toBe(6);
    expect(stats.animationChanged).toBe(3);
    expect(stats.reasons).toEqual({
      talking_head_video: 1,
      static_image: 1,
      contain_image: 1,
    });
    // pack-a: first-party chart jumps a higher-scoring pexels image.
    // pack-b: xinhua evidence jumps a higher-scoring pexels image.
    expect(stats.tierChanges).toBe(2);
    expect(stats.sample).toHaveLength(3);
    expect(stats.sample.map((row) => `${row.before}->${row.after}`)).toEqual([
      "fade->none",
      "ken-burns->fade",
      "ken-burns->fade",
    ]);
  });

  it("fails loudly on an empty scan instead of printing a vacuous green report", () => {
    expect(() => replayPacks(resolve(__dirname, "fixtures"))).toThrow(
      /No real content packs found/,
    );
    expect(() => replayPacks(resolve(__dirname, "fixtures", "does-not-exist"))).toThrow(
      /No real content packs found/,
    );
  });

  it("fails loudly when packs exist but contain zero media assets", () => {
    expect(() => replayPacks(resolve(__dirname, "fixtures", "animation-replay-empty"))).toThrow(
      /zero media assets/,
    );
  });

  it("infers the source from the stock-library slug when the field is missing", () => {
    expect(inferSource({ path: "assets/pexels-123.jpg" })).toBe("pexels");
    expect(inferSource({ source: "qbitai" })).toBe("qbitai");
    expect(inferSource({ path: "assets/local.png" })).toBe("unknown");
    expect(oldAnimation({ type: "video" })).toBe("fade");
    expect(oldAnimation({ type: "image" })).toBe("ken-burns");
  });

  it("allocator control writes the tier winner with its content-aware preset", () => {
    const control = allocatorControl();
    expect(control.chosenPath).toBe("assets/qbitai-first-party-01.jpg");
    expect(control.animation).toBe("fade");
  });
});
