import { readFileSync } from "node:fs";

import { test, expect } from "vitest";

import { evaluateTopicVideoFit, scoreTopicVideoFit } from "../lib/topic-video-fit.mjs";
import { probeOfficialPageMedia } from "../lib/official-media-probe.mjs";

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
  expect(result.score).toBe(0);
  expect(result.rejected.length).toBe(1);
});

test("text-only evidence scores 1; logo-only scores 2", () => {
  expect(scoreTopicVideoFit({ assets: [asset("text")] }).score).toBe(1);
  expect(scoreTopicVideoFit({ assets: [asset("logo")] }).score).toBe(2);
});

test("1-2 entity assets cannot exceed 2", () => {
  const result = scoreTopicVideoFit({
    assets: [asset("person"), asset("chart")],
    hook: "person photo + chart",
  });
  expect(result.score).toBe(2);
});

test("3 entity stills are explainer-ready (3)", () => {
  const result = scoreTopicVideoFit({
    assets: [asset("person"), asset("company"), asset("chart")],
    hook: "person photo + company logo + chart",
  });
  expect(result.score).toBe(3);
});

test("dynamic asset plus two entity visuals scores 4", () => {
  const result = scoreTopicVideoFit({
    assets: [asset("demo", { official: false, dynamic: true }), asset("person"), asset("chart")],
    format: "demo-led",
    hook: "demo clip + person photo + chart",
  });
  expect(result.score).toBe(4);
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
  expect(result.score).toBe(5);
});

test("a text-card hook caps a rich topic at 2", () => {
  const result = scoreTopicVideoFit({
    assets: [asset("demo", { official: true }), asset("person"), asset("chart")],
    hook: "TEXT CARD: 770B / 49B / 1M",
  });
  expect(result.score).toBe(2);
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
  expect(result.videoFit).toBe(3);
  expect(result.assetReady).toBe(0);
  expect(result.assetEvidence).toMatch(/person:姚顺雨/);
  expect(result.assetEvidence).toMatch(/chart:benchmark/);
});

test("an event screenshot can opt out of dynamic and still count as an entity visual", () => {
  const result = scoreTopicVideoFit({
    assets: [asset("event", { dynamic: false }), asset("person"), asset("chart")],
    format: "explainer",
    hook: "event screenshot + person photo + chart",
  });
  expect(result.dynamicCount).toBe(0);
  expect(result.score).toBe(3);
});

test("a real official product page fixture supplies demo rows and reaches 5", async () => {
  const html = readFileSync(
    new URL("./fixtures/official-media/agibot-a3ultra.html", import.meta.url),
    "utf8",
  );
  const probe = await probeOfficialPageMedia({
    pageUrl: "https://www.agibot.com.cn/products/A3Ultra",
    official: true,
    fetchImpl: async () => ({ ok: true, method: "static", text: html }),
  });

  const result = evaluateTopicVideoFit({
    slug: "agibot-aima-linksoul",
    assets: [
      asset("person", { label: "founder" }),
      asset("product", { label: "A3 Ultra" }),
      asset("company", { label: "Agibot" }),
      ...probe.assets,
    ],
    format: "demo-led",
    hook: "demo：A3 Ultra 官方产品页能力片段，机器人方阵",
  });

  expect(probe.assets.length).toBeGreaterThan(0);
  expect(result.videoFit).toBe(5);
  expect(result.assetEvidence).toMatch(/demo:/);
});

test("a still-only official page adds no demo rows and cannot reach 5", async () => {
  const html = readFileSync(
    new URL("./fixtures/official-media/still-product.html", import.meta.url),
    "utf8",
  );
  const probe = await probeOfficialPageMedia({
    pageUrl: "https://official.example.com/product",
    official: true,
    fetchImpl: async () => ({ ok: true, method: "static", text: html }),
  });

  const result = evaluateTopicVideoFit({
    assets: [
      asset("person", { label: "founder" }),
      asset("product", { label: "product page" }),
      asset("company", { label: "company" }),
      ...probe.assets,
    ],
    format: "explainer",
    hook: "founder photo + product page",
  });

  expect(probe.assets).toEqual([]);
  expect(result.videoFit).toBe(3);
});
