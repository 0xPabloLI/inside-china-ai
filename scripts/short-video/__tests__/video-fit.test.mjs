import { test, expect } from "vitest";

import { assetReadyFromInventory, evaluateVideoFit, scoreVideoFit } from "../lib/video-fit.mjs";

const clip = (path, duration) => ({ path, duration, width: 1080, height: 1080 });
const still = (path) => ({ path, width: 1080, height: 1080 });
const scene = (id, visualType, media = null, mediaRole = null) => ({
  id,
  visualType,
  ...(mediaRole ? { mediaRole } : {}),
  media: media ? { type: "video", ...media } : null,
});

test("score 5 needs two clips, 15 counted seconds and four stills", () => {
  const inventory = {
    videos: [clip("a.mp4", 8), clip("b.mp4", 8)],
    images: [still("1.png"), still("2.png"), still("3.png"), still("4.png")],
  };
  expect(scoreVideoFit(inventory)).toEqual({
    score: 5,
    motionClipCount: 2,
    motionSeconds: 16,
    stillCount: 4,
  });
});

test("one 120-second clip is capped and cannot buy score 5 alone", () => {
  const inventory = {
    videos: [clip("demo.mp4", 120)],
    images: [still("1.png"), still("2.png"), still("3.png"), still("4.png")],
  };
  expect(scoreVideoFit(inventory).score).toBe(4);
  expect(scoreVideoFit(inventory).motionSeconds).toBe(10);
});

test("score 2 is stills only; score 1 is one or two stills", () => {
  const three = { videos: [], images: [still("1"), still("2"), still("3")] };
  const two = { videos: [], images: [still("1"), still("2")] };
  expect(scoreVideoFit(three).score).toBe(2);
  expect(scoreVideoFit(two).score).toBe(1);
});

test("a 5 claim over a 2-still inventory fails", () => {
  const result = evaluateVideoFit({
    inventory: { videos: [], images: [still("1"), still("2"), still("3")] },
    meta: { createdAt: "2026-11-20", videoFit: 5 },
    scenes: [scene(1, "hook", { path: "1" })],
  });
  expect(result.actual).toBe(2);
  const claimRow = result.rows.find((row) => row.check.includes("claim"));
  expect(claimRow.level).toBe("fail");
});

test("videoFit 5 fails when the hook is CSS-only", () => {
  const result = evaluateVideoFit({
    inventory: {
      videos: [clip("a.mp4", 8), clip("b.mp4", 8)],
      images: [still("1"), still("2"), still("3"), still("4")],
    },
    meta: { createdAt: "2026-11-20", videoFit: 5 },
    scenes: [
      scene(1, "hook"),
      scene(2, "explainer", { path: "a.mp4", type: "video" }),
      scene(3, "demo", { path: "b.mp4", type: "video" }),
      scene(4, "why", { path: "1.png", type: "image" }),
      scene(5, "cta"),
    ],
  });
  expect(result.actual).toBe(5);
  expect(
    result.rows.find((row) => row.check.includes("hook has renderable evidence media")).level,
  ).toBe("fail");
});

test("videoFit 5 passes with motion hook, two clips used and 50% coverage", () => {
  const result = evaluateVideoFit({
    inventory: {
      videos: [clip("a.mp4", 8), clip("b.mp4", 8)],
      images: [still("1"), still("2"), still("3"), still("4")],
    },
    meta: { createdAt: "2026-11-20", videoFit: 5 },
    scenes: [
      scene(1, "hook", { path: "a.mp4", type: "video" }, "evidence"),
      scene(2, "explainer", { path: "b.mp4", type: "video" }),
      scene(3, "demo", { path: "1.png", type: "image" }),
      scene(4, "why", { path: "2.png", type: "image" }),
      scene(5, "cta"),
    ],
  });
  expect(result.actual).toBe(5);
  expect(result.rows.every((row) => row.level === "pass")).toBe(true);
});

test("videoFit 5 fails when the hook clip is bound as background (not rendered)", () => {
  const result = evaluateVideoFit({
    inventory: {
      videos: [clip("a.mp4", 8), clip("b.mp4", 8)],
      images: [still("1"), still("2"), still("3"), still("4")],
    },
    meta: { createdAt: "2026-11-20", videoFit: 5 },
    scenes: [
      scene(1, "hook", { path: "a.mp4", type: "video" }, "background"),
      scene(2, "explainer", { path: "b.mp4", type: "video" }),
      scene(3, "demo", { path: "1.png", type: "image" }),
      scene(4, "why", { path: "2.png", type: "image" }),
      scene(5, "cta"),
    ],
  });
  const hookRow = result.rows.find((row) =>
    row.check.includes("hook has renderable evidence media"),
  );
  expect(hookRow.level).toBe("fail");
  expect(hookRow.detail).toMatch(/background/);
});

test("videoFit 3 requires 60% non-CTA media coverage", () => {
  const inventory = { videos: [clip("a.mp4", 4)], images: [still("1"), still("2")] };
  const pass = evaluateVideoFit({
    inventory,
    meta: { createdAt: "2026-11-20", videoFit: 3 },
    scenes: [
      scene(1, "hook"),
      scene(2, "explainer", { path: "a.mp4", type: "video" }),
      scene(3, "demo", { path: "1.png", type: "image" }),
      scene(4, "why", { path: "2.png", type: "image" }),
      scene(5, "detail"),
      scene(6, "cta"),
    ],
  });
  expect(pass.actual).toBe(3);
  expect(pass.rows.find((row) => row.check.includes("coverage")).level).toBe("pass");

  const fail = evaluateVideoFit({
    inventory: {
      videos: [],
      images: ["1", "2", "3", "4", "5", "6"].map((name) => still(name)),
    },
    meta: { createdAt: "2026-11-20", videoFit: 3 },
    scenes: [
      scene(1, "hook"),
      scene(2, "explainer", { path: "1.png", type: "image" }),
      scene(3, "demo", { path: "2.png", type: "image" }),
      scene(4, "why"),
      scene(5, "detail"),
      scene(6, "cta"),
    ],
  });
  expect(fail.actual).toBe(3);
  expect(fail.rows.find((row) => row.check.includes("coverage")).level).toBe("fail");
});

test("a package created on the policy date must declare videoFit", () => {
  const result = evaluateVideoFit({
    inventory: {
      videos: [clip("a.mp4", 8), clip("b.mp4", 8)],
      images: [still("1"), still("2"), still("3"), still("4")],
    },
    meta: { createdAt: "2026-11-20" },
    scenes: [],
  });
  expect(result.rows.find((row) => row.check === "videoFit declared").level).toBe("fail");
});

test("assetReady is 1 only when the curated inventory clears the density floor", () => {
  expect(assetReadyFromInventory({ videos: [], images: [still("1"), still("2")] })).toBe(0);
  expect(
    assetReadyFromInventory({ videos: [], images: [still("1"), still("2"), still("3")] }),
  ).toBe(1);
  const twoStills = evaluateVideoFit({
    inventory: { videos: [], images: [still("1"), still("2")] },
    meta: { createdAt: "2026-11-21", videoFit: 1 },
    scenes: [],
  });
  expect(twoStills.assetReady).toBe(0);
  expect(twoStills.actual).toBe(1);
});
