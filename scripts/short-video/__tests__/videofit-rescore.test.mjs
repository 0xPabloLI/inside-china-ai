import { readFileSync } from "node:fs";

import { test, expect } from "vitest";

import { buildRescoreMarkdown, rescoreTopics } from "../lib/videofit-rescore.mjs";

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/official-media/${name}`, import.meta.url), "utf8");

const agibotTopic = () => ({
  slug: "agibot-aima-linksoul",
  title: "智元 AIMA / 灵心 LinkSoul",
  score: 7.5,
  videoFit: 3,
  format: "explainer",
  hook: "智元官网产品/活动图开场，机器人方阵",
  assets: [
    {
      type: "product",
      label: "LinkSoul 灵心平台官网",
      url: "https://linksoul-sg.agibot.com/zh-cn",
      official: true,
    },
    {
      type: "product",
      label: "AIMA 百大创作者计划页",
      url: "https://open.agibot.com/creator-plan",
      official: true,
    },
    {
      type: "company",
      label: "智元官网产品/活动图",
      url: "https://www.agibot.com.cn/",
      official: true,
    },
    {
      type: "event",
      label: "量子位发布会稿",
      url: "https://example.com/qbit-agibot",
      official: false,
      dynamic: false,
    },
  ],
  probe: {
    format: "demo-led",
    hook: "demo：A3 Ultra 机器人方阵，官方产品页能力片段",
  },
});

const fakeFetch = (html) => async () => ({ ok: true, method: "static", text: html });

test("an official product page with clips upgrades 3 → 5 and records the evidence delta", async () => {
  const result = await rescoreTopics({
    topics: [agibotTopic()],
    date: "2026-11-27",
    maxPagesPerTopic: 1,
    fetchImpl: fakeFetch(fixture("agibot-a3ultra.html")),
  });

  expect(result.rows).toHaveLength(1);
  const row = result.rows[0];
  expect(row.original.videoFit).toBe(3);
  expect(row.rescored.videoFit).toBe(5);
  expect(row.rescored.format).toBe("demo-led");
  expect(row.evidenceChange).toMatch(/\+9 demo/);
  expect(row.decision).toMatch(/升分/);
});

test("a still-only official page keeps the original score with an explicit reason", async () => {
  const topic = agibotTopic();
  topic.assets = [
    {
      type: "product",
      label: "纯静图产品页",
      url: "https://official.example.com/product",
      official: true,
    },
    {
      type: "company",
      label: "公司主页",
      url: "https://official.example.com/",
      official: true,
    },
    {
      type: "event",
      label: "发布会稿",
      url: "https://example.com/event",
      official: false,
      dynamic: false,
    },
  ];
  const result = await rescoreTopics({
    topics: [topic],
    date: "2026-11-27",
    fetchImpl: fakeFetch(fixture("still-product.html")),
  });

  const row = result.rows[0];
  expect(row.original.videoFit).toBe(3);
  expect(row.rescored.videoFit).toBe(3);
  expect(row.decision).toMatch(/未探到/);
  expect(row.decision).toMatch(/保留原分/);
});

test("topics already at 4-5 are not probed at all", async () => {
  let calls = 0;
  const topic = { ...agibotTopic(), videoFit: 5, format: "demo-led" };
  const result = await rescoreTopics({
    topics: [topic],
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, method: "static", text: fixture("agibot-a3ultra.html") };
    },
  });

  expect(calls).toBe(0);
  expect(result.rows[0].decision).toMatch(/无需探针/);
});

test("third-party product rows are never probed or promoted to official dynamic", async () => {
  let calls = 0;
  const topic = agibotTopic();
  topic.assets[0].official = false;
  topic.assets[1].official = false;
  const result = await rescoreTopics({
    topics: [topic],
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, method: "static", text: fixture("agibot-a3ultra.html") };
    },
  });

  expect(calls).toBe(0);
  expect(result.rows[0].decision).toMatch(/无官方产品页/);
});

test("a failed probe keeps the original score and says so", async () => {
  const result = await rescoreTopics({
    topics: [agibotTopic()],
    fetchImpl: async () => ({
      ok: false,
      method: "static",
      text: "",
      status: 503,
      error: "HTTP 503",
    }),
  });

  const row = result.rows[0];
  expect(row.rescored.videoFit).toBe(3);
  expect(row.decision).toMatch(/探针失败/);
  expect(row.decision).toMatch(/HTTP 503/);
});

test("markdown audit carries date, before/after and evidence row", async () => {
  const result = await rescoreTopics({
    topics: [agibotTopic()],
    date: "2026-11-27",
    maxPagesPerTopic: 1,
    fetchImpl: fakeFetch(fixture("agibot-a3ultra.html")),
  });
  const markdown = buildRescoreMarkdown(result, { date: "2026-11-27" });

  expect(markdown).toContain("# VideoFit 重打分审计（2026-11-27）");
  expect(markdown).toContain("| Topic |");
  expect(markdown).toContain("| 智元 AIMA / 灵心 LinkSoul | 7.5 | 3 / explainer | 5 / demo-led |");
  expect(markdown).toContain("+9 demo");
});
