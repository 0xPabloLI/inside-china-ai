import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

import {
  groupSourcesByEvidenceRole,
  selectSourcesForRun,
  filterPaidSources,
  deriveCollectionMethod,
  buildDiscoveryOutput,
} from "../search-sources.mjs";
import { ALL_SOURCES, WECHAT_RSS_SOURCES, TELEGRAM_SOURCES } from "../lib/source-registry.mjs";
import { validateDiscovery } from "../lib/research/validate.mjs";

// Articles-capable sources are the universe for evidence grouping
// (stock_media sources only provide images/videos, not articles).
const articlesCapableSources = ALL_SOURCES.filter((s) => s.capabilities?.articles);

describe("groupSourcesByEvidenceRole", () => {
  it("routes the 12 wechat2rss feeds + telegram_aipost (#204) to trackedFeedContext", () => {
    const groups = groupSourcesByEvidenceRole(articlesCapableSources);
    expect(groups.trackedFeedContext.map((s) => s.name).sort()).toEqual(
      [...WECHAT_RSS_SOURCES, ...TELEGRAM_SOURCES].map((s) => s.name).sort(),
    );
  });

  it("keeps keyword-capable sources in directEvidence", () => {
    const groups = groupSourcesByEvidenceRole(articlesCapableSources);
    const directNames = groups.directEvidence.map((s) => s.name);
    expect(directNames).toContain("qbitai");
    expect(directNames).not.toContain("wechat2rss_qbitai");
  });

  it("produces three mutually exclusive groups covering the full input", () => {
    const groups = groupSourcesByEvidenceRole(articlesCapableSources);
    const all = [
      ...groups.directEvidence,
      ...groups.trackedFeedContext,
      ...groups.environmentalSignals,
    ];
    const names = all.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(articlesCapableSources.map((s) => s.name).sort());
  });

  it("classifies a non-keyword non-tracked source as environmental signal", () => {
    const mockSources = [
      { name: "kw_source", supportsKeyword: true },
      { name: "rss_source", sourceRole: "tracked-feed-context" },
      { name: "homepage_source", supportsKeyword: false },
    ];
    const groups = groupSourcesByEvidenceRole(mockSources);
    expect(groups.directEvidence.map((s) => s.name)).toEqual(["kw_source"]);
    expect(groups.trackedFeedContext.map((s) => s.name)).toEqual(["rss_source"]);
    expect(groups.environmentalSignals.map((s) => s.name)).toEqual(["homepage_source"]);
  });

  it("respects capabilities.articles overrides over top-level fields", () => {
    const mockSources = [
      {
        name: "enriched",
        supportsKeyword: false,
        capabilities: { articles: { supportsKeyword: true } },
      },
    ];
    const groups = groupSourcesByEvidenceRole(mockSources);
    expect(groups.directEvidence.map((s) => s.name)).toEqual(["enriched"]);
  });
});

// ─── #309 §C ruling: research mode fetches environmentalSignals for real ───
//
// 裁决（审计 §C）：research 模式此前只抓 directEvidence + trackedFeedContext
// （51 源），3 个 environmentalSignals（weibo_hot/datacube_ai/wechat_dongchabeating
// ——均 supportsKeyword=false、静态/固定 URL）注册不抓。落地 = research 同样
// 抓取（每 run 一次，同 tracked feeds 节奏），证据角色仍是 environmental-signal
// （背景信号，永不做 direct evidence）。

describe("selectSourcesForRun (#309 §C: research fetches environmentalSignals)", () => {
  const ENV_SIGNAL_NAMES = ["weibo_hot", "datacube_ai", "wechat_dongchabeating"];

  it("real registry pins the environmentalSignals group to exactly the 3 audit sources", () => {
    const groups = groupSourcesByEvidenceRole(articlesCapableSources);
    expect(groups.environmentalSignals.map((s) => s.name).sort()).toEqual(
      ENV_SIGNAL_NAMES.slice().sort(),
    );
  });

  it("research selection includes every articles-capable source — the 3 env signals are now fetched", () => {
    const selected = selectSourcesForRun(true, articlesCapableSources);
    expect(selected.map((s) => s.name).sort()).toEqual(
      articlesCapableSources.map((s) => s.name).sort(),
    );
    for (const name of ENV_SIGNAL_NAMES) {
      expect(
        selected.some((s) => s.name === name),
        `${name} fetched`,
      ).toBe(true);
    }
  });

  it("research selection orders direct evidence → tracked feeds → environmental signals", () => {
    const selected = selectSourcesForRun(true, articlesCapableSources);
    const names = selected.map((s) => s.name);
    const groups = groupSourcesByEvidenceRole(articlesCapableSources);
    const expected = [
      ...groups.directEvidence,
      ...groups.trackedFeedContext,
      ...groups.environmentalSignals,
    ].map((s) => s.name);
    expect(names).toEqual(expected);
  });

  it("trend selection is unchanged — all articles-capable sources", () => {
    expect(selectSourcesForRun(false, articlesCapableSources)).toEqual(articlesCapableSources);
  });

  it("collected env-signal articles keep the environmental-signal role in discovery output", () => {
    const groups = groupSourcesByEvidenceRole(articlesCapableSources);
    const discovery = buildDiscoveryOutput(
      [{ title: "热词", url: "https://s.weibo.com/x", source: "weibo_hot" }],
      [],
      {
        contentId: "c1",
        runId: "r1",
        keyword: "DeepSeek",
        sources: selectSourcesForRun(true, articlesCapableSources),
      },
    );
    expect(discovery.evidenceGroups.environmentalSignals).toEqual(
      groups.environmentalSignals.map((s) => s.name),
    );
    const item = discovery.sources.find((s) => s.url === "https://s.weibo.com/x");
    expect(item.sourceRole).toBe("environmental-signal");
  });
});

describe("deriveCollectionMethod", () => {
  it("uses tracking.access for tracked public feeds (issue #97)", () => {
    expect(deriveCollectionMethod(WECHAT_RSS_SOURCES[0])).toBe("public-rss");
  });

  it("falls back to accessMethod.primary for api/cdp/mcp sources", () => {
    expect(deriveCollectionMethod({ accessMethod: { primary: "cdp" } })).toBe("cdp");
    expect(deriveCollectionMethod({ accessMethod: { primary: "api" } })).toBe("api");
    expect(deriveCollectionMethod({ accessMethod: { primary: "mcp" } })).toBe("mcp");
  });

  it("defaults to cdp when no method information exists (backward compatible)", () => {
    expect(deriveCollectionMethod({})).toBe("cdp");
    expect(deriveCollectionMethod(null)).toBe("cdp");
  });
});

describe("buildDiscoveryOutput", () => {
  const sources = [
    articlesCapableSources.find((s) => s.name === "qbitai"),
    WECHAT_RSS_SOURCES.find((s) => s.name === "wechat2rss_qbitai"),
  ];
  const articles = [
    {
      url: "https://qbitai.com/a",
      title: "Direct evidence article",
      snippet: "s",
      source: "qbitai",
      publishedAt: "2026-09-01",
    },
    {
      url: "https://mp.weixin.qq.com/s/rss-a",
      title: "Tracked feed article",
      snippet: "s",
      source: "wechat2rss_qbitai",
      publishedAt: "Mon, 01 Sep 2026 09:00:00 +0800",
    },
  ];
  const failed = [
    { name: "bloomberg", reason: "CDP tab failed: timeout" },
    { name: "wechat2rss_geekpark", reason: "fetch failed: 503" },
  ];

  function build() {
    return buildDiscoveryOutput(articles, failed, {
      contentId: "test-content",
      runId: "run-test-001",
      keyword: "DeepSeek",
      sources,
    });
  }

  it("writes schema-valid discovery.json", () => {
    const discovery = build();
    const result = validateDiscovery(discovery);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("includes evidenceGroups covering this run's sources", () => {
    const discovery = build();
    expect(discovery.evidenceGroups.directEvidence).toEqual(["qbitai"]);
    expect(discovery.evidenceGroups.trackedFeedContext).toEqual(["wechat2rss_qbitai"]);
    expect(discovery.evidenceGroups.environmentalSignals).toEqual([]);
  });

  it("tags each article item with sourceRole and real collectionMethod", () => {
    const discovery = build();
    const direct = discovery.sources.find((s) => s.sourceName === "qbitai");
    const tracked = discovery.sources.find((s) => s.sourceName === "wechat2rss_qbitai");

    expect(direct.sourceRole).toBe("direct-evidence");
    expect(direct.collectionMethod).toBe("cdp");

    expect(tracked.sourceRole).toBe("tracked-feed-context");
    expect(tracked.collectionMethod).toBe("public-rss");
  });

  it("records failed sources with their real reasons", () => {
    const discovery = build();
    expect(discovery.failedSources).toEqual([
      { name: "bloomberg", reason: "CDP tab failed: timeout" },
      { name: "wechat2rss_geekpark", reason: "fetch failed: 503" },
    ]);
  });

  it("preserves per-article metadata passthrough", () => {
    const discovery = build();
    expect(discovery.contentId).toBe("test-content");
    expect(discovery.researchRunId).toBe("run-test-001");
    expect(discovery.sourceCount).toBe(2);
    expect(discovery.runMetadata.keyword).toBe("DeepSeek");
    expect(discovery.runMetadata.mode).toBe("research");
  });
});

// ─── #424: paid-API filter is a value-returning seam (no const reassignment) ───
//
// 修复前真实 CLI 基线（research 与 trend 走到同一条路径）：
//   💰 Skipping 1 paid-API source(s): tiktok_creator
//   ❌ Assignment to constant variable.  (exit 1)
// 成因：main() 对 selectSourcesForRun() 产出的 const 重赋值——付费源存在且未传
// --include-paid 时必然崩。过滤逻辑收进纯函数后，orchestration 与测试消费同一
// 实现（不再各自持有一份「哪些源算 paid」的判断）。

describe("filterPaidSources (#424)", () => {
  const paidWithApiSearch = { name: "api_paid", apiSearch: { paidApi: true } };
  const paidWithCapabilities = {
    name: "cap_paid",
    capabilities: { articles: { paidApi: true } },
  };
  const free = (name) => ({ name, apiSearch: {} });

  it("drops paid sources by default and reports what it skipped", () => {
    const sources = [free("a"), paidWithApiSearch, free("c")];
    const { sources: kept, skipped } = filterPaidSources(sources, false);
    expect(kept.map((s) => s.name)).toEqual(["a", "c"]);
    expect(skipped.map((s) => s.name)).toEqual(["api_paid"]);
  });

  it("keeps paid sources under --include-paid and reports nothing skipped", () => {
    const sources = [free("a"), paidWithCapabilities];
    const { sources: kept, skipped } = filterPaidSources(sources, true);
    expect(kept).toBe(sources);
    expect(skipped).toEqual([]);
  });

  it("leaves the list untouched when no paid source exists", () => {
    const sources = [free("a"), free("b")];
    const { sources: kept, skipped } = filterPaidSources(sources, false);
    expect(kept).toBe(sources);
    expect(skipped).toEqual([]);
  });

  it("reads paidApi from capabilities.articles with the apiSearch fallback (#67)", () => {
    const capOverridesApi = {
      name: "cap_false",
      capabilities: { articles: { paidApi: false } },
      apiSearch: { paidApi: true },
    };
    const { sources: kept, skipped } = filterPaidSources(
      [paidWithCapabilities, paidWithApiSearch, capOverridesApi],
      false,
    );
    expect(kept.map((s) => s.name)).toEqual(["cap_false"]);
    expect(skipped.map((s) => s.name)).toEqual(["cap_paid", "api_paid"]);
  });
});

// ─── #424 matrix: research/trend × paid present/absent × include-paid on/off ───
//
// run() is the exact composition main() runs: selectSourcesForRun() output
// feeds filterPaidSources(). Both modes share the same filter branch, so the
// crash was mode-independent — the matrix pins the boundaries anyway: default
// runs must never reach the paid source's quota; --include-paid may.

describe("paid filter × mode matrix (#424)", () => {
  const run = (isResearch, list, includePaid) =>
    filterPaidSources(selectSourcesForRun(isResearch, list), includePaid);
  const names = (list) => list.map((s) => s.name);

  const withoutPaid = articlesCapableSources.filter((s) => s.name !== "tiktok_creator");

  it("real registry carries exactly the paid source this matrix turns off", () => {
    const { skipped } = run(true, articlesCapableSources, false);
    expect(names(skipped)).toEqual(["tiktok_creator"]);
  });

  it("research + paid present: default excludes it, --include-paid keeps it", () => {
    const selected = names(selectSourcesForRun(true, articlesCapableSources));
    const { sources: defaultRun, skipped } = run(true, articlesCapableSources, false);
    expect(names(defaultRun)).toEqual(selected.filter((n) => n !== "tiktok_creator"));
    expect(names(defaultRun)).toHaveLength(selected.length - skipped.length);

    const optedIn = run(true, articlesCapableSources, true);
    expect(names(optedIn.sources)).toEqual(selected);
    expect(optedIn.skipped).toEqual([]);
  });

  it("research + paid absent: selection and order unchanged", () => {
    const expected = names(selectSourcesForRun(true, withoutPaid));
    expect(names(run(true, withoutPaid, false).sources)).toEqual(expected);
    expect(names(run(true, withoutPaid, true).sources)).toEqual(expected);
  });

  it("trend + paid present: default excludes it, --include-paid keeps it", () => {
    const { sources: defaultRun, skipped } = run(false, articlesCapableSources, false);
    expect(names(defaultRun)).not.toContain("tiktok_creator");
    expect(names(defaultRun)).toHaveLength(articlesCapableSources.length - skipped.length);

    const optedIn = run(false, articlesCapableSources, true);
    expect(names(optedIn.sources)).toEqual(names(articlesCapableSources));
    expect(optedIn.skipped).toEqual([]);
  });

  it("trend + paid absent: selection and order unchanged (both include-paid states)", () => {
    const expected = names(withoutPaid);
    expect(names(run(false, withoutPaid, false).sources)).toEqual(expected);
    expect(names(run(false, withoutPaid, true).sources)).toEqual(expected);
  });
});

// ─── #424 smoke: the real CLI reaches keyword validation instead of crashing ───
//
// `--research` without `--keyword` exits at the keyword check, which sits
// directly AFTER the paid filter and BEFORE the CDP/network work — so this is
// an offline run that still executes the real orchestration branch.

describe("search-sources CLI paid filter smoke (#424)", () => {
  const CLI = fileURLToPath(new URL("../search-sources.mjs", import.meta.url));

  it("--research with a paid source present no longer dies with Assignment to constant variable", () => {
    // timeout is a safety net: a regression that moves the exit past the
    // keyword check would otherwise hang this synchronous spawn forever
    // (vitest's testTimeout cannot preempt blocking code).
    const res = spawnSync(process.execPath, [CLI, "--research"], {
      encoding: "utf8",
      timeout: 10_000,
    });
    const stdout = res.stdout || "";
    const stderr = res.stderr || "";

    expect(stderr).not.toMatch(/Assignment to constant variable/);
    expect(stderr).toMatch(/--research mode requires --keyword/);
    expect(stdout).toMatch(/Skipping 1 paid-API source\(s\): tiktok_creator/);
    expect(res.status).toBe(1);
  });
});
