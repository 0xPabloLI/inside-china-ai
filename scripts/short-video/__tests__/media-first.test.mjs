/**
 * media-first layout contract (#1524, 2026-11-24).
 *
 * The layout exists because a 16:9 evidence clip cannot fit a 1080×820 bed
 * without either cropping the sides (cover) or showing baked black bars
 * (contain). The four declarations below are what the template cannot infer,
 * so every one is pinned here at the compiler/preflight boundary:
 *   - geometry: media runs the content band, text is a compact 3-row block;
 *   - role: evidence only;
 *   - picture: contain + blur fill, never cover/letterbox;
 *   - copy: company/result/source only, no action/context/badge.
 */
import { describe, it, expect } from "vitest";
import {
  CANVAS,
  MEDIA_BAND,
  MEDIA_FIRST,
  SAFE_ZONES,
  mediaFirstBarHeightFor,
  mediaFirstBarTopFor,
} from "../lib/safe-zones.mjs";
import {
  REMOTION_SLOT_MAP,
  allowsContainFit,
  assertKnownTextFields,
  resolveRenderLayout,
} from "../lib/text-slots.mjs";
import { checkMediaFieldSchema, MEDIA_FIELD_KEYS } from "../lib/media-field-schema.mjs";
import { checkMediaFirstContract, checkTemplateContract } from "../lib/scene-rules.mjs";
import { checkMediaBandFill } from "../lib/frame-analysis.mjs";

const media = (patch = {}) => ({
  type: "video",
  path: "assets/demo.mp4",
  source: "official demo",
  fit: "contain",
  fill: "blur",
  overlay: 0.2,
  volume: 0,
  ...patch,
});

const scene = (patch = {}) => ({
  id: 4,
  visualType: "narrative",
  layout: "media-first",
  mediaRole: "evidence",
  media: media(),
  texts: { company: "FOUR TRACKS", result: "4 WINNING TEAMS", source: "QBITAI" },
  ...patch,
});

const levels = (results) => results.map((r) => r.level);

describe("media-first geometry", () => {
  it("runs media the whole content band and anchors a 3-row block at the bottom", () => {
    const texts = { company: "A", result: "B", source: "C" };
    expect(mediaFirstBarHeightFor(texts)).toBe(256);
    expect(mediaFirstBarTopFor(texts)).toBe(1206 - 256);
    expect(MEDIA_FIRST.textBarHeight).toBe(256);
    // The picture window is the full content band, not a 1080×820 bed.
    expect(MEDIA_BAND.bottom).toBe(CANVAS.height - SAFE_ZONES.bottom);
    expect(MEDIA_BAND.bottom).toBe(1206);
  });

  it("returns 0 height when a scene carries no copy", () => {
    expect(mediaFirstBarHeightFor({})).toBe(0);
    expect(mediaFirstBarTopFor({})).toBe(1206);
  });

  it("derives height from the rows present instead of paying for absent rows", () => {
    expect(mediaFirstBarHeightFor({ company: "A", result: "B" })).toBe(69 + 74 + 8 + 34 + 16);
    expect(mediaFirstBarHeightFor({ result: "B" })).toBe(74 + 34 + 16);
  });
});

describe("media-first render contract", () => {
  it("is a contain-band layout", () => {
    expect(allowsContainFit({ visualType: "narrative", layout: "media-first" })).toBe(true);
    expect(resolveRenderLayout({ visualType: "narrative", layout: "media-first" })).toBe(
      "media-first",
    );
  });

  it("accepts only company/result/source and rejects the four-row fields", () => {
    expect(() =>
      assertKnownTextFields("narrative", "media-first", {
        company: "A",
        result: "B",
        source: "C",
      }),
    ).not.toThrow();
    for (const field of ["action", "context", "badge"]) {
      expect(() =>
        assertKnownTextFields("narrative", "media-first", { result: "B", [field]: "x" }),
      ).toThrow();
    }
    expect(REMOTION_SLOT_MAP.narrative["media-first"].rendered).toEqual(["result"]);
  });
});

describe("media.fill schema", () => {
  it("ships in the media key set", () => {
    expect(MEDIA_FIELD_KEYS.has("fill")).toBe(true);
  });

  it("fails fill without contain, or outside media-first", () => {
    const badFit = checkMediaFieldSchema([scene({ media: media({ fit: "cover" }) })]);
    expect(levels(badFit)).toContain("fail");
    expect(badFit.some((r) => r.check.includes("fill requires contain"))).toBe(true);

    const otherLayout = checkMediaFieldSchema([
      scene({ layout: "media-bottom-bar", media: media() }),
    ]);
    expect(otherLayout.some((r) => r.check.includes("fill is honored"))).toBe(true);
  });

  it("passes the declared pair", () => {
    expect(levels(checkMediaFieldSchema([scene()]))).not.toContain("fail");
  });
});

describe("media-first preflight", () => {
  it("passes a complete declaration", () => {
    const results = checkMediaFirstContract([scene()]);
    expect(levels(results)).not.toContain("fail");
    expect(levels(results)).not.toContain("warn");
  });

  it("fails a missing picture, non-evidence role, cover fit, or missing blur fill", () => {
    const cases = [
      scene({ media: null }),
      scene({ mediaRole: "background" }),
      scene({ media: media({ fit: "cover" }) }),
      scene({ media: media({ fill: undefined }) }),
    ];
    for (const s of cases) {
      expect(levels(checkMediaFirstContract([s]))).toContain("fail");
    }
  });

  it("warns when a row exceeds the short-copy comfort line", () => {
    const results = checkMediaFirstContract([
      scene({
        texts: {
          company: "FOUR TRACKS FROM THE BEIJING CONVENTION CENTRE",
          result: "4 WINNING TEAMS",
        },
      }),
    ]);
    expect(levels(results)).toContain("warn");
  });

  it("is enforced through the aggregate template contract", () => {
    expect(levels(checkTemplateContract([scene()]))).not.toContain("fail");
  });
});

describe("frame band probe", () => {
  const buffer = {
    width: 1080,
    height: 1920,
    data: new Uint8Array(1080 * 1920 * 4).fill(200),
  };

  it("treats a blurred fill as intended coverage, not a letterbox", () => {
    const r = checkMediaBandFill(buffer, SAFE_ZONES, MEDIA_BAND.bottom, {
      fit: "contain",
      fill: "blur",
    });
    expect(r.level).toBe("pass");
    expect(r.detail).toContain("blur");
  });
});
