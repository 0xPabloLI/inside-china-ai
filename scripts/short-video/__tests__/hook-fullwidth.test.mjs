/**
 * Full-width media-led hook contract (#1559, 2026-11-27).
 *
 * The 2026-11-15 media-led layout gave a contained 16:9 picture an 820×619
 * bed: the picture rendered 820×461 with black margins on both sides, and the
 * user's report was "视频没有放大、没有撑满宽度". The full-width variant gives
 * the picture the canvas width (1080×608) with the same-source blur behind it,
 * and moves the copy into a plate below the picture.
 *
 * These tests pin the four declarations the template cannot infer:
 *   - geometry: 1080×608 picture at y 300, plate at y 916-1206;
 *   - default: contained VIDEO evidence fills the width, images keep the
 *     legacy band (the CapCut / RunningHub regression baseline);
 *   - schema: `fullWidth` only on an effective media-led hook, contain-only;
 *   - plate capacity: subject + number only — numberLabel/source fail.
 */
import { describe, it, expect } from "vitest";
import { CANVAS, MEDIA_LED, HOOK_MEDIA_LED_FULL, SAFE_ZONES } from "../lib/safe-zones.mjs";
import {
  HOOK_MEDIA_LED_LAYOUT,
  isMediaLedFullWidth,
  resolveRenderLayout,
} from "../lib/text-slots.mjs";
import { checkMediaFieldSchema, MEDIA_FIELD_KEYS } from "../lib/media-field-schema.mjs";
import { checkHookMediaContract } from "../lib/scene-rules.mjs";

const hook = (patch = {}) => ({
  id: 1,
  visualType: "hook",
  layout: HOOK_MEDIA_LED_LAYOUT,
  mediaRole: "evidence",
  texts: { badge: "CHINA AI · VIDEO MODEL", subject: "MAGI-2 · 30S 1080P", bigNumber: "$2.25" },
  ...patch,
});

const video = (patch = {}) => ({
  type: "video",
  path: "assets/demo.mp4",
  source: "official demo",
  fit: "contain",
  volume: 0,
  ...patch,
});

const levels = (results) => results.map((r) => r.level);
const fails = (results) => results.filter((r) => r.level === "fail");

describe("full-width media-led geometry", () => {
  it("fills the canvas width with a 16:9 picture and a plate below it", () => {
    expect(HOOK_MEDIA_LED_FULL.pictureTop).toBe(300);
    expect(HOOK_MEDIA_LED_FULL.pictureHeight).toBe(608);
    expect(HOOK_MEDIA_LED_FULL.stripTop).toBe(300 + 608 + 8);
    expect(HOOK_MEDIA_LED_FULL.stripBottom).toBe(CANVAS.height - SAFE_ZONES.bottom);
    expect(HOOK_MEDIA_LED_FULL.stripBottom).toBe(1206);
    // The picture's bottom edge plus the gap is exactly the plate top.
    expect(HOOK_MEDIA_LED_FULL.pictureTop + HOOK_MEDIA_LED_FULL.pictureHeight + 8).toBe(
      HOOK_MEDIA_LED_FULL.stripTop,
    );
    // The plate clears the subtitle lane (starts at 1336).
    expect(HOOK_MEDIA_LED_FULL.stripBottom).toBeLessThan(1336);
    // The legacy band is unchanged.
    expect(MEDIA_LED.full).toBeUndefined();
    expect(MEDIA_LED.mediaTop).toBe(410);
  });
});

describe("fullWidth predicate", () => {
  it("defaults contained video evidence to full width", () => {
    expect(isMediaLedFullWidth(hook({ media: video() }))).toBe(true);
  });

  it("keeps contained image evidence on the legacy 820 band unless it opts in", () => {
    expect(isMediaLedFullWidth(hook({ media: video({ type: "image", path: "a.jpg" }) }))).toBe(
      false,
    );
    expect(
      isMediaLedFullWidth(
        hook({ media: video({ type: "image", path: "a.jpg", fullWidth: true }) }),
      ),
    ).toBe(true);
  });

  it("honours the explicit legacy opt-out and contain-only rule", () => {
    expect(isMediaLedFullWidth(hook({ media: video({ fullWidth: false }) }))).toBe(false);
    expect(isMediaLedFullWidth(hook({ media: video({ fit: "cover" }) }))).toBe(false);
  });

  it("does not claim non-media-led, card, or chart scenes", () => {
    expect(isMediaLedFullWidth({ visualType: "hook", layout: "hero-center", media: video() })).toBe(
      false,
    );
    expect(isMediaLedFullWidth(hook({ media: video({ mode: "card" }) }))).toBe(false);
    expect(isMediaLedFullWidth({ ...hook({ media: null }), info: { chart: "candle" } })).toBe(
      false,
    );
  });
});

describe("fullWidth schema", () => {
  it("ships in the media key set", () => {
    expect(MEDIA_FIELD_KEYS.has("fullWidth")).toBe(true);
  });

  it("passes the declared pair on an effective media-led hook", () => {
    const results = checkMediaFieldSchema([
      hook({ media: video({ fullWidth: true, fill: "blur" }) }),
    ]);
    expect(fails(results)).toHaveLength(0);
  });

  it("fails fullWidth outside the media-led hook", () => {
    const results = checkMediaFieldSchema([
      {
        id: 2,
        visualType: "narrative",
        layout: "media-overlay",
        media: video({ fullWidth: true }),
      },
    ]);
    expect(results.some((r) => r.check.includes("fullWidth is honored"))).toBe(true);
  });

  it("fails fullWidth without contain or with a non-boolean value", () => {
    const badFit = checkMediaFieldSchema([
      hook({ media: video({ fullWidth: true, fit: "cover" }) }),
    ]);
    expect(badFit.some((r) => r.check.includes("fullWidth is honored"))).toBe(true);
    expect(badFit.some((r) => (r.detail ?? "").includes('fit "cover"'))).toBe(true);

    const badType = checkMediaFieldSchema([hook({ media: video({ fullWidth: "yes" }) })]);
    expect(badType.some((r) => r.check.includes("fullWidth is a boolean"))).toBe(true);
  });

  it("allows the blur fill on the full-width variant", () => {
    const results = checkMediaFieldSchema([hook({ media: video({ fill: "blur" }) })]);
    expect(results.some((r) => r.check.includes("fill is honored"))).toBe(false);
  });
});

describe("fullWidth preflight", () => {
  it("passes a video hook with the default full-width band", () => {
    const results = checkHookMediaContract([hook({ media: video() })]);
    expect(levels(results)).not.toContain("fail");
    expect(levels(results)).not.toContain("warn");
  });

  it("passes an image that opts into the full-width band", () => {
    const results = checkHookMediaContract([
      hook({ media: video({ type: "image", path: "a.jpg", fullWidth: true }) }),
    ]);
    expect(fails(results)).toHaveLength(0);
  });

  it("fails numberLabel/source rows — the plate holds subject + number only", () => {
    for (const extra of [{ numberLabel: "SINCE JUNE PEAK" }, { source: "HKEX CLOSE" }]) {
      const results = checkHookMediaContract([
        hook({ media: video(), texts: { subject: "MAGI-2", bigNumber: "$2.25", ...extra } }),
      ]);
      const fail = fails(results).find((r) => r.check.includes("fullWidth rows"));
      expect(fail, JSON.stringify(extra)).toBeDefined();
      expect(fail.detail).toContain(Object.keys(extra)[0]);
    }
  });

  it("warns, not fails, when a contained video opts out of full width", () => {
    const results = checkHookMediaContract([hook({ media: video({ fullWidth: false }) })]);
    expect(fails(results)).toHaveLength(0);
    const warn = results.find((r) => r.level === "warn" && r.check.includes("fullWidth"));
    expect(warn).toBeDefined();
    expect(warn.detail).toContain("legacy 820 band");
  });

  it("keeps the legacy band for images without the flag", () => {
    const results = checkHookMediaContract([
      hook({ media: video({ type: "image", path: "a.jpg" }) }),
    ]);
    expect(fails(results)).toHaveLength(0);
    expect(results.some((r) => r.level === "warn" && r.check.includes("fullWidth"))).toBe(false);
  });
});

describe("fullWidth resolution", () => {
  it("still resolves to the same media-led layout the renderer dispatches", () => {
    expect(resolveRenderLayout(hook({ media: video() }))).toBe(HOOK_MEDIA_LED_LAYOUT);
    expect(resolveRenderLayout(hook({ media: null }))).toBe("hero-center");
  });
});
