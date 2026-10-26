import { describe, it, expect } from "vitest";

import {
  verdictReason,
  apiFailureVerdict,
  failureClass,
  applyFallbackTakeover,
  summarizeResultRow,
  classifyAlertBuckets,
  buildHealthReport,
  selectorIssueTitle,
  parseOccurrenceCount,
  syncSelectorHealthIssues,
} from "../selector-health.mjs";

/**
 * #269 (2026-09-23): 两个「时序竞态 ⇒ 假判决」的回归锚点。
 * 判据本身是纯函数，样本就是实测值（zhihu 水合、douyin 反爬插页）。
 */
describe("verdictReason — selector-health 的判决理由", () => {
  it("有结果 ⇒ 健康（null）", () => {
    expect(verdictReason([{ title: "a" }, { title: "b" }], null)).toBe(null);
  });

  it("实测样本：zhihu 水合后 31 条卡 ⇒ 不算失败", () => {
    const zhihu = Array.from({ length: 31 }, (_, i) => ({ title: `q${i}` }));
    expect(verdictReason(zhihu, null)).toBe(null);
  });

  it("空结果 + 无晚到反爬标记 ⇒ zero_results", () => {
    expect(verdictReason([], null)).toBe("zero_results");
  });

  it("实测样本：douyin 空结果 + 晚到 `captcha` ⇒ anti_bot 优先", () => {
    expect(verdictReason([], "captcha")).toBe("anti_bot:captcha");
  });

  it("有结果时反爬标记不改变判决（标记可能是文章正文里的词）", () => {
    expect(verdictReason([{ title: "captcha 识别如何工作" }], "captcha")).toBe(null);
  });

  it("晚到标记是空字符串时退回 zero_results（不产出 `anti_bot:` 空标签）", () => {
    expect(verdictReason([], "")).toBe("zero_results");
  });
});

/**
 * #269 (2026-09-23)：第三轴曾经比第一轴更不懂凭据 —— 从不加载 .env.local、
 * 从不发 `api.headers`，于是「服务端说没给 API key」被记成「端点已死」。
 * 下面锁定的是「这个回答是关于探针还是关于源」这条界线。
 */
describe("apiFailureVerdict — api 探针失败的归因", () => {
  const cap = (over = {}) => ({ requiresApiKey: false, apiKeyEnv: null, ...over });

  it("声明需要 key 但没有 key ⇒ probe-not-authoritative（且点名是哪个变量）", () => {
    const r = apiFailureVerdict({
      status: 400,
      body: '{"message":"no api key"}',
      cap: cap({ requiresApiKey: true, apiKeyEnv: "GNEWS_API_KEY_ABSENT_FOR_TEST" }),
    });
    expect(r.reason).toBe("probe-not-authoritative");
    expect(r.missingKey).toBe("GNEWS_API_KEY_ABSENT_FOR_TEST");
  });

  it("key 已存在时不再拿它做借口（400 仍是关于端点的回答）", () => {
    process.env.KEY_PRESENT_FOR_TEST = "x";
    try {
      const r = apiFailureVerdict({
        status: 400,
        body: "bad request",
        cap: cap({ requiresApiKey: true, apiKeyEnv: "KEY_PRESENT_FOR_TEST" }),
      });
      expect(r.reason).toBe("http-dead");
      expect(r.missingKey).toBe(null);
    } finally {
      delete process.env.KEY_PRESENT_FOR_TEST;
    }
  });

  it("429（限流）与 401/403（边缘/凭据）⇒ probe-not-authoritative，不进死源台账", () => {
    for (const status of [401, 403, 429]) {
      expect(apiFailureVerdict({ status, body: "{}", cap: cap() }).reason).toBe(
        "probe-not-authoritative",
      );
    }
  });

  it("404 ⇒ http-dead：这一条是关于端点的", () => {
    expect(apiFailureVerdict({ status: 404, body: "Not Found", cap: cap() }).reason).toBe(
      "http-dead",
    );
  });
});

describe("failureClass — 只有关于源的失败才算失败", () => {
  it("有结果 ⇒ none", () => {
    expect(failureClass({ ok: true, reason: null })).toBe("none");
  });

  it("zero_results ⇒ source（选择器腐烂，走修复手册）", () => {
    expect(failureClass({ ok: false, reason: "zero_results" })).toBe("source");
  });

  it("anti_bot:captcha ⇒ probe（留给源自己，别去改选择器）", () => {
    expect(failureClass({ ok: false, reason: "anti_bot:captcha" })).toBe("probe");
  });

  it("need_login / login-wall ⇒ probe（答案取决于会话，不取决于源）", () => {
    expect(failureClass({ ok: false, reason: "need_login" })).toBe("probe");
    expect(failureClass({ ok: false, reason: "login-wall" })).toBe("probe");
  });

  it("#346 登录门自报的 captcha ⇒ probe（人工过验证即可，不是源侧缺陷）", () => {
    // 登录门（loginCheckScript）返回 'captcha' 时 selector-health 原样透传成 reason；
    // 若归成 source，退出码会因「读者在 registry 里修不了的事」变红，违反
    // docs/selector-auto-healing.md「只有 source 才让退出码非零」。
    expect(failureClass({ ok: false, reason: "captcha" })).toBe("probe");
  });

  it("probe-not-authoritative ⇒ probe", () => {
    expect(failureClass({ ok: false, reason: "probe-not-authoritative" })).toBe("probe");
  });

  it("network-error ⇒ source（与第一轴口径一致）", () => {
    expect(failureClass({ ok: false, reason: "network-error" })).toBe("source");
  });
});

/**
 * 2026-09-24：生产可用接管（applyFallbackTakeover）——用户口径「只关心最终
 * 能不能抓到数据」。主层 zero_results 但 site: 兜底层能抽出 ⇒ 生产可用
 * （jiqizhixin 实测：主层 0、site: 层 10）。兜底也失败 ⇒ 保留主层判决。
 */
describe("applyFallbackTakeover — 主层失败时的 site: 兜底接管", () => {
  const primary = {
    source: "jiqizhixin",
    ok: false,
    count: 0,
    reason: "zero_results",
    durationMs: 36700,
  };

  it("兜底抽出 >0 ⇒ ok:true + via:site-fallback，保留主层失败原因", () => {
    const merged = applyFallbackTakeover(primary, {
      source: "jiqizhixin",
      ok: true,
      count: 10,
      layer: "fallback",
    });
    expect(merged.ok).toBe(true);
    expect(merged.via).toBe("site-fallback");
    expect(merged.count).toBe(10);
    expect(merged.primaryReason).toBe("zero_results");
  });

  it("兜底抽出 0 ⇒ 原样保留主层失败（不翻转）", () => {
    const merged = applyFallbackTakeover(primary, {
      source: "jiqizhixin",
      ok: true,
      count: 0,
      layer: "fallback",
    });
    expect(merged).toBe(primary);
  });

  it("兜底层也失败 ⇒ 原样保留主层失败", () => {
    const merged = applyFallbackTakeover(primary, {
      source: "jiqizhixin",
      ok: false,
      count: 0,
      reason: "anti_bot:captcha",
      layer: "fallback",
    });
    expect(merged).toBe(primary);
  });
});

/**
 * #353 AC2/AC5：机器可读摘要与三档告警分流（真失败 / probe 忽略 / site-fallback 单列）。
 */
describe("summarizeResultRow & classifyAlertBuckets & buildHealthReport (#353)", () => {
  const checkedAt = "2026-10-26T02:00:00.000Z";
  const sampleResults = [
    { source: "thepaper", ok: true, count: 25, reason: null, durationMs: 4200 },
    {
      source: "jiqizhixin",
      ok: true,
      count: 10,
      via: "site-fallback",
      reason: null,
      primaryReason: "zero_results",
      durationMs: 38100,
    },
    { source: "qbitai", ok: false, count: 0, reason: "zero_results", durationMs: 35000 },
    {
      source: "tiktok_creator",
      ok: false,
      count: 0,
      reason: "probe-no-egress",
      durationMs: 8100,
    },
    { source: "douyin", ok: false, count: 0, reason: "need_login", durationMs: 3200 },
  ];

  it("summarizeResultRow 输出标准字段：source / verdict / count / via / failureClass / timestamp", () => {
    const healthy = summarizeResultRow(sampleResults[0], { checkedAt });
    expect(healthy).toMatchObject({
      source: "thepaper",
      ok: true,
      verdict: "healthy",
      count: 25,
      via: "primary",
      failureClass: "none",
      timestamp: checkedAt,
    });

    const fallback = summarizeResultRow(sampleResults[1], { checkedAt });
    expect(fallback).toMatchObject({
      source: "jiqizhixin",
      ok: true,
      verdict: "site-fallback",
      count: 10,
      via: "site-fallback",
      primaryReason: "zero_results",
      failureClass: "none",
      timestamp: checkedAt,
    });

    const failed = summarizeResultRow(sampleResults[2], { checkedAt });
    expect(failed).toMatchObject({
      source: "qbitai",
      ok: false,
      verdict: "zero_results",
      count: 0,
      via: "primary",
      failureClass: "source",
      timestamp: checkedAt,
    });
  });

  it("classifyAlertBuckets：真失败进 alerting、probe 进 probeIgnored、site-fallback 单列且不进 primaryHealthy", () => {
    const buckets = classifyAlertBuckets(sampleResults);
    expect(buckets.alerting.map((r) => r.source)).toEqual(["qbitai"]);
    expect(buckets.viaSiteFallback.map((r) => r.source)).toEqual(["jiqizhixin"]);
    expect(buckets.probeIgnored.map((r) => r.source)).toEqual(["tiktok_creator", "douyin"]);
    expect(buckets.primaryHealthy.map((r) => r.source)).toEqual(["thepaper"]);
  });

  it("buildHealthReport 生成完整机器可读摘要，供后续 diff 与恢复判定消费", () => {
    const report = buildHealthReport({
      results: sampleResults,
      keyword: "AI大模型",
      keywords: { zh: "AI大模型", en: "artificial intelligence" },
      layer: "primary",
      keyReport: { required: 9, present: 9, missing: [], entries: [] },
      checkedAt,
    });
    expect(report.checkedAt).toBe(checkedAt);
    expect("timestamp" in report).toBe(false);
    expect(report.summary).toEqual({
      none: 2,
      source: 1,
      probe: 2,
      total: 5,
      healthy: 2,
      viaSiteFallback: ["jiqizhixin"],
      alertingSources: ["qbitai"],
      probeSources: ["tiktok_creator", "douyin"],
    });
    expect(report.alerts.viaSiteFallback).toEqual([
      {
        source: "jiqizhixin",
        verdict: "site-fallback",
        primaryReason: "zero_results",
        count: 10,
        via: "site-fallback",
      },
    ]);
    expect(report.results).toHaveLength(5);
    expect(report.results.every((r) => Boolean(r.verdict && r.via && r.timestamp))).toBe(true);
  });
});

/**
 * #353 AC1/AC2/AC3/AC4：运行时告警自动开票、现象原文去重、重复计数累加与恢复自动留言关票。
 */
describe("syncSelectorHealthIssues — #353 开票、去重累加、恢复自动关票", () => {
  const checkedAt = "2026-10-26T02:00:00.000Z";
  const keywords = { zh: "AI大模型", en: "artificial intelligence" };

  it("selectorIssueTitle 按 <source> + verdict 稳定命名", () => {
    expect(selectorIssueTitle("qbitai", "zero_results")).toBe(
      "[selector-health] qbitai: zero_results",
    );
  });

  it("parseOccurrenceCount 从 issue 正文与评论列表提取最大累计次数", () => {
    expect(parseOccurrenceCount([])).toBe(0);
    expect(parseOccurrenceCount(["human opened issue without marker"])).toBe(1);
    expect(
      parseOccurrenceCount([
        "<!-- selector-health:source=qbitai verdict=zero_results occurrences=1 -->",
        "<!-- selector-health:source=qbitai verdict=zero_results occurrences=2 -->",
        "<!-- selector-health:source=qbitai verdict=zero_results occurrences=5 -->",
      ]),
    ).toBe(5);
  });

  it("AC1 & AC2：真失败（source）且无既有 open 票时自动新建；probe、error:* 与 site-fallback 不开票", () => {
    const calls = [];
    const ghRunner = (args) => {
      calls.push(args);
      if (args[0] === "api" && args.includes("search/issues")) {
        return JSON.stringify({ items: [] });
      }
      if (
        args[0] === "api" &&
        args.includes("GET") &&
        args.includes("repos/0xPabloLI/inside-china-ai/issues")
      ) {
        return JSON.stringify([]);
      }
      if (
        args[0] === "api" &&
        args.includes("POST") &&
        args.includes("repos/0xPabloLI/inside-china-ai/issues")
      ) {
        return JSON.stringify({
          number: 999,
          html_url: "https://github.com/0xPabloLI/inside-china-ai/issues/999",
        });
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    };

    const actions = syncSelectorHealthIssues({
      results: [
        { source: "qbitai", ok: false, count: 0, reason: "zero_results", durationMs: 35000 },
        {
          source: "jiqizhixin",
          ok: true,
          count: 10,
          via: "site-fallback",
          reason: null,
          primaryReason: "zero_results",
          durationMs: 38000,
        },
        {
          source: "tiktok_creator",
          ok: false,
          count: 0,
          reason: "probe-no-egress",
          durationMs: 8000,
        },
        {
          source: "36kr",
          ok: false,
          count: 0,
          reason: 'error:CDP proxy disconnected "unexpectedly"',
          durationMs: 1200,
        },
      ],
      keywords,
      checkedAt,
      ghRunner,
    });

    expect(
      failureClass({
        source: "36kr",
        ok: false,
        reason: 'error:CDP proxy disconnected "unexpectedly"',
      }),
    ).toBe("probe");
    expect(actions).toEqual([
      {
        source: "qbitai",
        verdict: "zero_results",
        action: "created",
        issueNumber: 999,
        url: "https://github.com/0xPabloLI/inside-china-ai/issues/999",
        occurrences: 1,
      },
    ]);
    const createCall = calls.find(
      (c) => c.includes("POST") && c.some((a) => a.endsWith("/issues")),
    );
    expect(createCall).toBeTruthy();
    expect(createCall.join(" ")).toContain("title=[selector-health] qbitai: zero_results");
    expect(createCall.join(" ")).toContain("正文是创建时的规格（write-once，永不改写）");
    expect(createCall.join(" ")).toContain("occurrences=1");
  });

  it("AC3：重复运行同一失败不重复开票（命中既有 [selector-health] 或现象原文 open 票，追加计数评论）", () => {
    const calls = [];
    const ghRunner = (args) => {
      calls.push(args);
      const joined = args.join(" ");
      // 第一次批量拉 [selector-health] 标题票：含 qbitai (#501)，不含 ithome
      if (joined.includes('"[selector-health]" in:title')) {
        return JSON.stringify({
          items: [
            {
              number: 501,
              title: "[selector-health] qbitai: zero_results",
              body: "<!-- selector-health:source=qbitai verdict=zero_results occurrences=2 -->",
            },
          ],
        });
      }
      // 第二层现象原文搜重：ithome + http-dead 命中人工已开的 open 票 #502（#338 vs #330 教训）
      if (joined.includes('"ithome"') && joined.includes('"http-dead"')) {
        return JSON.stringify({
          items: [
            {
              number: 502,
              title: "fix: ithome 搜索端点 404 (http-dead)",
              body: "ithome 主层探针报 http-dead",
            },
          ],
        });
      }
      if (joined.includes("issues/501/comments") && !joined.includes("POST")) {
        return JSON.stringify([
          { body: "<!-- selector-health:source=qbitai verdict=zero_results occurrences=2 -->" },
        ]);
      }
      if (joined.includes("issues/502/comments") && !joined.includes("POST")) {
        return JSON.stringify([]);
      }
      if (joined.includes("POST") && joined.includes("/comments")) {
        return JSON.stringify({ id: 1 });
      }
      throw new Error(`unexpected gh call: ${joined}`);
    };

    const actions = syncSelectorHealthIssues({
      results: [
        { source: "qbitai", ok: false, count: 0, reason: "zero_results", durationMs: 32000 },
        { source: "ithome", ok: false, count: 0, reason: "http-dead", durationMs: 1200 },
      ],
      keywords,
      checkedAt,
      ghRunner,
    });

    expect(actions).toEqual([
      {
        source: "qbitai",
        verdict: "zero_results",
        action: "commented",
        issueNumber: 501,
        occurrences: 3,
      },
      {
        source: "ithome",
        verdict: "http-dead",
        action: "commented",
        issueNumber: 502,
        occurrences: 2,
      },
    ]);
    // 绝不调用 POST .../issues 新建重复票
    expect(
      calls.some((c) => c.includes("POST") && c.includes("repos/0xPabloLI/inside-china-ai/issues")),
    ).toBe(false);
  });

  it("AC4：源主层恢复健康后下次运行自动留言（含交付记录标记）并关闭 open 票；site-fallback 与 probe 不误关票", () => {
    const calls = [];
    const ghRunner = (args) => {
      calls.push(args);
      const joined = args.join(" ");
      if (joined.includes('"[selector-health]" in:title')) {
        return JSON.stringify({
          items: [
            {
              number: 601,
              title: "[selector-health] thepaper: zero_results",
              body: "<!-- selector-health:source=thepaper verdict=zero_results occurrences=1 -->",
            },
            {
              number: 602,
              title: "[selector-health] jiqizhixin: zero_results",
              body: "<!-- selector-health:source=jiqizhixin verdict=zero_results occurrences=1 -->",
            },
            {
              number: 603,
              title: "[selector-health] douyin: zero_results",
              body: "<!-- selector-health:source=douyin verdict=zero_results occurrences=1 -->",
            },
            {
              number: 604,
              title: "[selector-health] qbitai: zero_results",
              body: "<!-- selector-health:source=qbitai verdict=zero_results occurrences=1 -->",
            },
          ],
        });
      }
      if (joined.includes("POST") && joined.includes("issues/601/comments")) {
        return JSON.stringify({ id: 10 });
      }
      if (joined.includes("PATCH") && joined.includes("issues/601")) {
        return JSON.stringify({ number: 601, state: "closed" });
      }
      throw new Error(`unexpected gh call: ${joined}`);
    };

    const actions = syncSelectorHealthIssues({
      results: [
        // thepaper 主层真恢复 ⇒ 留言 + 关票 #601
        { source: "thepaper", ok: true, count: 25, reason: null, durationMs: 4100 },
        // jiqizhixin 仅靠 site-fallback 顶住（主层仍 zero_results）⇒ 不误关 #602，也不重开新票
        {
          source: "jiqizhixin",
          ok: true,
          count: 10,
          via: "site-fallback",
          reason: null,
          primaryReason: "zero_results",
          durationMs: 38000,
        },
        // douyin 本次是 need_login（probe）⇒ 测不了，不误关 #603
        { source: "douyin", ok: false, count: 0, reason: "need_login", durationMs: 3000 },
        // qbitai 来自 --fallback 审计层（layer: "fallback"）⇒ 不是主层恢复，不误关 #604
        {
          source: "qbitai",
          ok: true,
          count: 8,
          reason: null,
          layer: "fallback",
          durationMs: 5000,
        },
      ],
      keywords,
      checkedAt,
      ghRunner,
    });

    expect(actions).toEqual([
      {
        source: "thepaper",
        verdict: "healthy",
        action: "closed",
        issueNumber: 601,
      },
    ]);
    const commentCall = calls.find((c) => c.join(" ").includes("issues/601/comments"));
    expect(commentCall.join(" ")).toContain("交付记录");
    const closeCall = calls.find((c) => c.includes("PATCH") && c.join(" ").includes("issues/601"));
    expect(closeCall.join(" ")).toContain("state=closed");
    expect(closeCall.join(" ")).toContain("state_reason=completed");
  });

  it("AC3 索引延迟防护：Search API 尚未索引新建票时，回退直查 repos/<repo>/issues 避免快速重跑重复建票", () => {
    const calls = [];
    const ghRunner = (args) => {
      calls.push(args);
      const joined = args.join(" ");
      if (joined.includes("search/issues")) {
        // 模拟 Search API 索引延迟：两层 search 均返回空
        return JSON.stringify({ items: [] });
      }
      if (args.includes("GET") && joined.includes("repos/0xPabloLI/inside-china-ai/issues")) {
        return JSON.stringify([
          {
            number: 777,
            title: "[selector-health] qbitai: zero_results",
            body: "<!-- selector-health:source=qbitai verdict=zero_results occurrences=1 -->",
          },
        ]);
      }
      if (joined.includes("issues/777/comments") && !joined.includes("POST")) {
        return JSON.stringify([]);
      }
      if (joined.includes("POST") && joined.includes("issues/777/comments")) {
        return JSON.stringify({ id: 22 });
      }
      throw new Error(`unexpected gh call: ${joined}`);
    };

    const actions = syncSelectorHealthIssues({
      results: [
        { source: "qbitai", ok: false, count: 0, reason: "zero_results", durationMs: 5000 },
      ],
      keywords,
      checkedAt,
      ghRunner,
    });

    expect(actions).toEqual([
      {
        source: "qbitai",
        verdict: "zero_results",
        action: "commented",
        issueNumber: 777,
        occurrences: 2,
      },
    ]);
  });

  it("单源 gh 失败按行隔离：后续告警源继续处理且已完成动作不丢失", () => {
    const ghRunner = (args) => {
      const joined = args.join(" ");
      if (joined.includes('"[selector-health]" in:title')) {
        return JSON.stringify({ items: [] });
      }
      if (joined.includes('"qbitai"')) {
        throw new Error("HTTP 403 rate limit exceeded");
      }
      if (joined.includes('"ithome"')) {
        return JSON.stringify({ items: [] });
      }
      if (args.includes("GET") && joined.includes("repos/0xPabloLI/inside-china-ai/issues")) {
        return JSON.stringify([]);
      }
      if (args.includes("POST") && joined.includes("repos/0xPabloLI/inside-china-ai/issues")) {
        return JSON.stringify({
          number: 888,
          html_url: "https://github.com/0xPabloLI/inside-china-ai/issues/888",
        });
      }
      throw new Error(`unexpected gh call: ${joined}`);
    };

    const actions = syncSelectorHealthIssues({
      results: [
        { source: "qbitai", ok: false, count: 0, reason: "zero_results", durationMs: 5000 },
        { source: "ithome", ok: false, count: 0, reason: "http-dead", durationMs: 1200 },
      ],
      keywords,
      checkedAt,
      ghRunner,
    });

    expect(actions).toEqual([
      {
        source: "qbitai",
        verdict: "zero_results",
        action: "error",
        error: "HTTP 403 rate limit exceeded",
      },
      {
        source: "ithome",
        verdict: "http-dead",
        action: "created",
        issueNumber: 888,
        url: "https://github.com/0xPabloLI/inside-china-ai/issues/888",
        occurrences: 1,
      },
    ]);
  });
});
