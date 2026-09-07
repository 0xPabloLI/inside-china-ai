// Avatar foreground card geometry tests (#214 ticket 02).
// Locks the AVATAR_CARD constants to the spec layout (Implementation Decision
// 2) and the not-intruding assertion helper to every protected zone. The
// existing region-separation invariants (safe-zones.test.mjs) are untouched —
// this file is purely additive coverage for the new exports.

import { describe, it, expect } from "vitest";
import {
  CANVAS,
  SAFE_ZONES,
  SUBTITLE_LANE_TOP,
  AVATAR_CARD,
  AVATAR_CARD_RECT,
  assertAvatarCardSafe,
} from "../lib/safe-zones.mjs";

describe("AVATAR_CARD constants (spec Implementation Decision 2)", () => {
  it("is the ≈420×550 right-center vertical card", () => {
    expect(AVATAR_CARD.width).toBe(420);
    expect(AVATAR_CARD.height).toBe(550);
    expect(AVATAR_CARD.position).toBe("right-card");
    // aspect ratio ≈ the 624×816 → 2x upscale (1248×1632) source: no distortion
    const cardRatio = AVATAR_CARD.width / AVATAR_CARD.height;
    const sourceRatio = 624 / 816;
    expect(Math.abs(cardRatio - sourceRatio)).toBeLessThan(0.01);
  });

  it("right edge clears the action rail by ≥180px (research floor)", () => {
    expect(AVATAR_CARD.rightMargin).toBeGreaterThanOrEqual(180);
    // and reuses the repo's stricter calibrated value instead of inventing one
    expect(AVATAR_CARD.rightMargin).toBe(SAFE_ZONES.right);
    expect(CANVAS.width - AVATAR_CARD.rightMargin - AVATAR_CARD.width).toBe(AVATAR_CARD_RECT.x);
  });

  it("bottom edge sits above the subtitle lane with the declared gap", () => {
    const cardBottom = AVATAR_CARD_RECT.y + AVATAR_CARD_RECT.height;
    expect(SUBTITLE_LANE_TOP - cardBottom).toBe(AVATAR_CARD.subtitleGap);
    expect(AVATAR_CARD.subtitleGap).toBeGreaterThanOrEqual(30);
  });

  it("default rect passes its own assertion (self-consistent)", () => {
    expect(assertAvatarCardSafe()).toBe(AVATAR_CARD_RECT);
  });
});

describe("assertAvatarCardSafe — not-intruding matrix (naming the zone)", () => {
  const intruding = (patch) => {
    let err = null;
    try {
      assertAvatarCardSafe({ ...AVATAR_CARD_RECT, ...patch });
    } catch (e) {
      err = e;
    }
    expect(err, `expected rect {${JSON.stringify(patch)}} to fail`).toBeTruthy();
    return err.message;
  };

  it("rejects a card reaching into the right action rail", () => {
    const msg = intruding({ width: AVATAR_CARD.width + 10 });
    expect(msg).toContain("right action rail");
    expect(msg).toContain("SAFE_ZONES.right");
  });

  it("rejects a card dipping into the burned-subtitle lane", () => {
    const msg = intruding({ height: AVATAR_CARD.height + 10 });
    expect(msg).toContain("burned-subtitle lane");
    expect(msg).toContain("SUBTITLE_LANE_TOP");
    expect(msg).toContain("declared gap 40px");
  });

  it("rejects a card rising into the top nav band", () => {
    // shift the whole rect up (same height — bottom stays inside the lane gap)
    const msg = intruding({ y: SAFE_ZONES.top - 1 });
    expect(msg).toContain("top nav band");
    expect(msg).toContain("SAFE_ZONES.top");
  });

  it("rejects a card pushed into the left margin", () => {
    const msg = intruding({ x: SAFE_ZONES.left - 1 });
    expect(msg).toContain("left margin");
    expect(msg).toContain("SAFE_ZONES.left");
  });

  it("rejects a card pushed off the canvas", () => {
    // below the lane AND off-canvas — the lane check fires first (stricter)
    expect(intruding({ y: 1600 })).toContain("burned-subtitle lane");
    expect(intruding({ x: 900 })).toContain("right action rail");
  });

  it("accepts an exactly-limit rect (edges may touch the limits)", () => {
    const atLimit = {
      x: SAFE_ZONES.left,
      y: SUBTITLE_LANE_TOP - AVATAR_CARD.subtitleGap - AVATAR_CARD.height,
      width: CANVAS.width - SAFE_ZONES.right - SAFE_ZONES.left,
      height: AVATAR_CARD.height,
    };
    expect(assertAvatarCardSafe(atLimit)).toBe(atLimit);
  });
});
