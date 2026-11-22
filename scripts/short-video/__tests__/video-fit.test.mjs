import { test } from "node:test";
import assert from "node:assert/strict";

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
  assert.deepEqual(scoreVideoFit(inventory), {
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
  assert.equal(scoreVideoFit(inventory).score, 4);
  assert.equal(scoreVideoFit(inventory).motionSeconds, 10);
});

test("score 2 is stills only; score 1 is one or two stills", () => {
  const three = { videos: [], images: [still("1"), still("2"), still("3")] };
  const two = { videos: [], images: [still("1"), still("2")] };
  assert.equal(scoreVideoFit(three).score, 2);
  assert.equal(scoreVideoFit(two).score, 1);
});

test("a 5 claim over a 2-still inventory fails", () => {
  const result = evaluateVideoFit({
    inventory: { videos: [], images: [still("1"), still("2"), still("3")] },
    meta: { createdAt: "2026-11-20", videoFit: 5 },
    scenes: [scene(1, "hook", { path: "1" })],
  });
  assert.equal(result.actual, 2);
  const claimRow = result.rows.find((row) => row.check.includes("claim"));
  assert.equal(claimRow.level, "fail");
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
  assert.equal(result.actual, 5);
  assert.equal(
    result.rows.find((row) => row.check.includes("hook has renderable evidence media")).level,
    "fail",
  );
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
  assert.equal(result.actual, 5);
  assert.equal(
    result.rows.every((row) => row.level === "pass"),
    true,
  );
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
  assert.equal(hookRow.level, "fail");
  assert.match(hookRow.detail, /background/);
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
  assert.equal(result.rows.find((row) => row.check === "videoFit declared").level, "fail");
});

test("assetReady is 1 only when the curated inventory clears the density floor", () => {
  assert.equal(assetReadyFromInventory({ videos: [], images: [still("1"), still("2")] }), 0);
  assert.equal(
    assetReadyFromInventory({ videos: [], images: [still("1"), still("2"), still("3")] }),
    1,
  );
  const twoStills = evaluateVideoFit({
    inventory: { videos: [], images: [still("1"), still("2")] },
    meta: { createdAt: "2026-11-21", videoFit: 1 },
    scenes: [],
  });
  assert.equal(twoStills.assetReady, 0);
  assert.equal(twoStills.actual, 1);
});
