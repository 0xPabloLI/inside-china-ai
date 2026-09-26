// #360 S8: render-side warning for unverifiable videoStartOffsetMs.
//
// warnOffsetUnverifiable is the renderRemotion media-staging seam: the render
// side has no source-duration knowledge, so an out-of-range offset cannot be
// verified — one console.warn per scene, no block, no clamp.

import { describe, it, expect, vi, afterEach } from "vitest";
import { warnOffsetUnverifiable } from "../lib/render-remotion.mjs";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("warnOffsetUnverifiable — #360 S8", () => {
  it("warns once for a scene whose media carries a positive offset", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scene = {
      id: 3,
      media: { type: "video", path: "clip.mp4", videoStartOffsetMs: 12000 },
    };
    warnOffsetUnverifiable(scene);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("Scene 3");
    expect(warn.mock.calls[0][0]).toContain("12000");
    expect(warn.mock.calls[0][0]).toContain("S8");
  });

  it("does not warn when the offset is absent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnOffsetUnverifiable({ id: 1, media: { type: "video", path: "clip.mp4" } });
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn when the offset is 0", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnOffsetUnverifiable({
      id: 1,
      media: { type: "video", path: "clip.mp4", videoStartOffsetMs: 0 },
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
