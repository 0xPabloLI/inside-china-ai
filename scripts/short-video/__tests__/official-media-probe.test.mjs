import { readFileSync } from "node:fs";

import { test, expect } from "vitest";

import {
  extractPageMediaCandidates,
  probeOfficialPageMedia,
} from "../lib/official-media-probe.mjs";

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/official-media/${name}`, import.meta.url), "utf8");

const AGIBOT_PAGE = "https://www.agibot.com.cn/products/A3Ultra";

test("extracts file and embed candidates from official product page HTML", () => {
  const candidates = extractPageMediaCandidates(fixture("agibot-a3ultra.html"), AGIBOT_PAGE);
  const urls = candidates.map((candidate) => candidate.url);

  expect(urls).toContain(
    "https://cms-tos.agibot.com/editorial/cn/a3-ultra-hero-20261106/7a42d99233f39523-hero-h264.mp4",
  );
  expect(urls).toContain(
    "https://cms-tos.agibot.com/editorial/en/a3-ultra-feedback-20261106/2a017a298b5e-reliability.mp4",
  );
  // Relative and protocol-relative srcs resolve against the page URL.
  expect(urls).toContain(
    "https://www.agibot.com.cn/legacy/cn/public/static/index/video/products/A3Ultra/A3Ultra-2.mp4",
  );
  expect(urls).toContain("https://cdn.agibot.com/live/a3-ultra/index.m3u8");
  // Embeds survive as playable evidence.
  expect(urls).toContain("https://player.bilibili.com/player.html?bvid=BV1xx411c7mD");
  expect(urls).toContain("https://www.youtube.com/embed/abc123XYZ");
  expect(urls).toContain("https://channels.weixin.qq.com/web/pages/feed?export_id=abc");
  // Stills are not dynamic evidence.
  expect(urls.some((url) => /\.(?:jpg|jpeg|png|webp)/i.test(url))).toBe(false);

  const hero = candidates.find((candidate) => candidate.url.includes("hero-h264"));
  expect(hero.label).toBe("A3 Ultra hero");
  const reliability = candidates.find((candidate) => candidate.url.includes("reliability"));
  expect(reliability.label).toBe("reliability");
  expect(candidates.some((candidate) => candidate.kind === "embed")).toBe(true);
});

test("a still-only product page yields no dynamic candidates", () => {
  const candidates = extractPageMediaCandidates(
    fixture("still-product.html"),
    "https://official.example.com/product",
  );
  expect(candidates).toEqual([]);
});

test("probe marks page media official only when the caller declares the page official", async () => {
  const html = fixture("agibot-a3ultra.html");
  const official = await probeOfficialPageMedia({
    pageUrl: AGIBOT_PAGE,
    official: true,
    fetchImpl: async () => ({ ok: true, method: "static", text: html }),
  });

  expect(official.ok).toBe(true);
  expect(official.assets).toHaveLength(9);
  expect(official.assets.every((asset) => asset.type === "demo")).toBe(true);
  expect(official.assets.every((asset) => asset.official === true)).toBe(true);
  expect(official.assets.every((asset) => asset.dynamic === true)).toBe(true);

  const thirdParty = await probeOfficialPageMedia({
    pageUrl: "https://repost.example.com/news",
    official: false,
    fetchImpl: async () => ({
      ok: true,
      method: "static",
      text: fixture("third-party-repost.html"),
    }),
  });
  expect(thirdParty.assets).toHaveLength(1);
  expect(thirdParty.assets[0].official).toBe(false);
});

test("probe reports fetch failures instead of pretending the page has no media", async () => {
  const result = await probeOfficialPageMedia({
    pageUrl: "https://official.example.com/404",
    official: true,
    fetchImpl: async () => ({
      ok: false,
      method: "static",
      text: "",
      status: 404,
      error: "HTTP 404",
    }),
  });
  expect(result.ok).toBe(false);
  expect(result.error).toContain("HTTP 404");
  expect(result.assets).toEqual([]);
});
