import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateTopicVideoFit, scoreTopicVideoFit } from "../lib/topic-video-fit.mjs";

const asset = (type, overrides = {}) => ({
  type,
  label: `${type}-asset`,
  url: `https://example.com/${type}.jpg`,
  ...overrides,
});

test("no evidence scores 0 and never counts a bare label", () => {
  const result = scoreTopicVideoFit({
    assets: [{ type: "demo", label: "official demo" }],
    hook: "TEXT CARD: 770B",
  });
  assert.equal(result.score, 0);
  assert.equal(result.rejected.length, 1);
});

test("text-only evidence scores 1; logo-only scores 2", () => {
  assert.equal(scoreTopicVideoFit({ assets: [asset("text")] }).score, 1);
  assert.equal(scoreTopicVideoFit({ assets: [asset("logo")] }).score, 2);
});

test("1-2 entity assets cannot exceed 2", () => {
  const result = scoreTopicVideoFit({
    assets: [asset("person"), asset("chart")],
    hook: "person photo + chart",
  });
  assert.equal(result.score, 2);
});

test("3 entity stills are explainer-ready (3)", () => {
  const result = scoreTopicVideoFit({
    assets: [asset("person"), asset("company"), asset("chart")],
    hook: "person photo + company logo + chart",
  });
  assert.equal(result.score, 3);
});

test("dynamic asset plus two entity visuals scores 4", () => {
  const result = scoreTopicVideoFit({
    assets: [asset("demo", { official: false, dynamic: true }), asset("person"), asset("chart")],
    format: "demo-led",
    hook: "demo clip + person photo + chart",
  });
  assert.equal(result.score, 4);
});

test("official dynamic demo plus three entity visuals scores 5", () => {
  const result = scoreTopicVideoFit({
    assets: [
      asset("demo", { official: true, dynamic: true }),
      asset("person"),
      asset("product"),
      asset("chart"),
    ],
    format: "demo-led",
    hook: "official demo clip + founder photo + benchmark chart",
  });
  assert.equal(result.score, 5);
});

test("a text-card hook caps a rich topic at 2", () => {
  const result = scoreTopicVideoFit({
    assets: [asset("demo", { official: true }), asset("person"), asset("chart")],
    hook: "TEXT CARD: 770B / 49B / 1M",
  });
  assert.equal(result.score, 2);
});

test("evaluate keeps assetEvidence traceable and assetReady at 0", () => {
  const result = evaluateTopicVideoFit({
    slug: "tencent-hy4",
    assets: [
      asset("person", { label: "姚顺雨", url: "https://example.com/yao.jpg" }),
      asset("chart", { label: "benchmark", url: "https://example.com/bench.png" }),
      asset("company", { label: "腾讯混元", url: "https://hunyuan.tencent.com/" }),
    ],
    format: "explainer",
    hook: "姚顺雨照片 + benchmark 图表 overlay",
  });
  assert.equal(result.videoFit, 3);
  assert.equal(result.assetReady, 0);
  assert.match(result.assetEvidence, /person:姚顺雨/);
  assert.match(result.assetEvidence, /chart:benchmark/);
});

test("an event screenshot can opt out of dynamic and still count as an entity visual", () => {
  const result = scoreTopicVideoFit({
    assets: [asset("event", { dynamic: false }), asset("person"), asset("chart")],
    format: "explainer",
    hook: "event screenshot + person photo + chart",
  });
  assert.equal(result.dynamicCount, 0);
  assert.equal(result.score, 3);
});
