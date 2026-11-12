/**
 * Tests for the #305 C canary's verdict logic (pure part).
 *
 * The canary's job: catch, on a schedule and independently of business runs,
 * the two silent-drift classes the wire fixtures caught by hand —
 *   1. url/link vocabulary drift → the pool parses nothing (parse-drop), and
 *   2. date-field vocabulary drift → articles parse but silently lose
 *      publishedAt (the jina `publishedTime` catch, 2026-09-20). The
 *      signature is 0/N dated; partial coverage is upstream shape, not drift
 *      (#416/#1121 — Serper organic / Tavily news mixes).
 * A must-hit query guarantees the raw side is healthy, so any delivery loss
 * is the engine's fault, not the query's.
 */
import { describe, it, expect } from "vitest";
import { evaluateEngineRun, issueBody, CANARY_ENGINES } from "../pool-canary.mjs";

const datedArticle = (url) => ({ url, publishedAt: "2026-09-20T00:00:00.000Z" });

describe("CANARY_ENGINES", () => {
  it("covers the three newsCapable engines and excludes jina (token economics)", () => {
    // Jina's single call burns ~59k tokens ≈ 6% of its monthly free quota
    // (#309 probe) — a daily canary would drain it in ~17 days. Its drift
    // surface is covered by the zero streak (B) + wire fixtures.
    expect(CANARY_ENGINES.map((e) => e.name)).toEqual(["serper", "brave", "tavily"]);
    expect(CANARY_ENGINES.every((e) => e.newsCapable === true)).toBe(true);
  });
});

describe("evaluateEngineRun", () => {
  it("passes a healthy run: delivered articles with 100% publishedAt coverage", () => {
    const findings = evaluateEngineRun(
      { name: "serper" },
      { ok: true, articles: [datedArticle("https://a"), datedArticle("https://b")] },
    );
    expect(findings).toEqual([]);
  });

  it("flags a parse-drop attempt (url/link vocabulary drift)", () => {
    const findings = evaluateEngineRun(
      { name: "brave" },
      { ok: false, error: "parse-drop: 12 entries dropped (HTTP 200)" },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("parse-drop");
    expect(findings[0].detail).toContain("12 entries dropped");
  });

  it("flags an engine that returned nothing on a must-hit query", () => {
    const findings = evaluateEngineRun({ name: "brave" }, { ok: true, articles: [] });
    expect(findings.map((f) => f.type)).toEqual(["no-results"]);
  });

  it("flags date drift — 0/N dated is the vocabulary-drift signature (the jina class)", () => {
    const findings = evaluateEngineRun(
      { name: "tavily" },
      { ok: true, articles: [{ url: "https://b" }, { url: "https://c" }] },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("date-drift");
    expect(findings[0].detail).toContain("0/2");
    expect(findings[0].detail).toContain("vocabulary drift");
  });

  it("passes partial upstream coverage — 9/11 is a real Tavily shape (#1121)", () => {
    const articles = Array.from({ length: 11 }, (_, i) =>
      i < 9 ? datedArticle(`https://d${i}`) : { url: `https://u${i}` },
    );
    expect(evaluateEngineRun({ name: "tavily" }, { ok: true, articles })).toEqual([]);
  });

  it("passes any partial coverage — even 4/10 never files (Round CLXXVIII ruling, #416)", () => {
    const mixed = (dated, total) =>
      Array.from({ length: total }, (_, i) =>
        i < dated ? datedArticle(`https://d${i}`) : { url: `https://u${i}` },
      );
    expect(evaluateEngineRun({ name: "serper" }, { ok: true, articles: mixed(5, 10) })).toEqual([]);
    expect(evaluateEngineRun({ name: "serper" }, { ok: true, articles: mixed(1, 3) })).toEqual([]);
  });

  it("flags connectivity loss as its own finding type", () => {
    const findings = evaluateEngineRun({ name: "serper" }, { ok: false, error: "fetch failed" });
    expect(findings.map((f) => f.type)).toEqual(["unreachable"]);
  });

  it("flags a missing API key — a silently unconfigured engine must not pass silently", () => {
    const findings = evaluateEngineRun(
      { name: "serper" },
      { ok: false, error: "missing SERPER_API_KEY" },
    );
    expect(findings.map((f) => f.type)).toEqual(["missing-key"]);
  });
});

describe("issueBody", () => {
  it("opens with the write-once notice every issue body must carry (issue-tracker.md)", () => {
    const body = issueBody("serper", [{ type: "date-drift", detail: "0/10" }], "DeepSeek");
    expect(body.split("\n")[0]).toContain("正文是创建时的规格（write-once，永不改写）");
  });

  it("points at the adapter for 0/N and says partial coverage never files", () => {
    const body = issueBody("serper", [{ type: "date-drift", detail: "0/10" }], "DeepSeek");
    expect(body).toContain("0/N");
    expect(body).toContain("logged as INFO and never files a ticket");
  });
});
