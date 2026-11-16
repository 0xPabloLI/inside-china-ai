import { describe, expect, it } from "vitest";
import {
  INFO_LAYOUT_VERSION,
  layoutSignature,
  layoutSignatureDetail,
  sceneLayoutKey,
} from "../lib/layout-signature.mjs";

const v2Scenes = [
  { visualType: "hook", layout: "hero-center" },
  {
    visualType: "data",
    layout: "chart",
    info: { relationship: "change-over-time", chart: "line" },
  },
  { visualType: "context", layout: "flow" },
  { visualType: "cta", layout: "hero-center" },
];

describe("sceneLayoutKey", () => {
  it("names the layout and info grammar", () => {
    expect(sceneLayoutKey(v2Scenes[1])).toBe("data:chart:change-over-time/line");
    expect(sceneLayoutKey(v2Scenes[2])).toBe("context:flow");
  });

  it("is explicit when a scene has no layout", () => {
    expect(sceneLayoutKey({ visualType: "hook" })).toBe("hook:auto");
  });

  it("distinguishes a chart pin from a native chart", () => {
    expect(
      sceneLayoutKey({ visualType: "data", layout: "chart-card", chart: { entity: "X" } }),
    ).toBe("data:chart-card:pin");
  });
});

describe("layoutSignature", () => {
  it("is stable across calls and object identity", () => {
    const a = layoutSignature(v2Scenes);
    const b = layoutSignature(JSON.parse(JSON.stringify(v2Scenes)));
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{12}$/);
  });

  it("changes when one scene's layout changes", () => {
    const changed = v2Scenes.map((scene, index) =>
      index === 1 ? { ...scene, layout: "chart-card", info: undefined } : scene,
    );
    expect(layoutSignature(changed)).not.toBe(layoutSignature(v2Scenes));
  });

  it("changes when the chart type changes, even with the same layout", () => {
    const changed = v2Scenes.map((scene, index) =>
      index === 1 ? { ...scene, info: { ...scene.info, chart: "column" } } : scene,
    );
    expect(layoutSignature(changed)).not.toBe(layoutSignature(v2Scenes));
  });

  it("changes when scene order changes", () => {
    const reversed = [...v2Scenes].reverse();
    expect(layoutSignature(reversed)).not.toBe(layoutSignature(v2Scenes));
  });

  it("handles an empty pack", () => {
    expect(layoutSignature([])).toMatch(/^[a-f0-9]{12}$/);
  });
});

describe("layoutSignatureDetail", () => {
  it("returns the version, signature, and per-scene keys", () => {
    const detail = layoutSignatureDetail(v2Scenes);
    expect(detail.version).toBe(INFO_LAYOUT_VERSION);
    expect(detail.signature).toBe(layoutSignature(v2Scenes));
    expect(detail.scenes).toEqual(v2Scenes.map(sceneLayoutKey));
  });

  it("pins the version this spec ships", () => {
    expect(INFO_LAYOUT_VERSION).toBe("v2");
  });
});
