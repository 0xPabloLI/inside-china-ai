import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findCurrencySpellings,
  normalizeSceneData,
  normalizeSceneDataWithLiveRates,
} from "../lib/normalize-currency.mjs";
import { DEFAULT_RATES, readRateReport } from "../lib/exchange-rates.mjs";

describe("normalizeSceneData", () => {
  // Scenario #10: "445 billion yuan" → "$63 billion (445 billion yuan)"
  it("converts 'X billion yuan' to dual-annotation", () => {
    const scenes = [{ id: 1, voiceover: "China AI spending hit 445 billion yuan in 2024." }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toContain("$62 billion");
    expect(result[0].voiceover).toContain("445 billion yuan");
  });

  // Scenario #11: already has dual annotation → no modification
  it("does not modify when dual annotation already present", () => {
    const scenes = [{ id: 1, voiceover: "That's $62 billion (445 billion yuan) total." }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toBe("That's $62 billion (445 billion yuan) total.");
  });

  // Scenario #17: "¥1100 per share" → "$154 (¥1100) per share" (small amount rounding)
  it("converts '¥1100' to dual-annotation with rounding", () => {
    const scenes = [{ id: 1, voiceover: "Priced at ¥1100 per share." }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toContain("$154");
    expect(result[0].voiceover).toContain("¥1100");
  });

  // No RMB amounts → no-op
  it("does not modify scenes without RMB amounts", () => {
    const scenes = [{ id: 1, voiceover: "China AI spending hit 63 billion dollars." }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toBe("China AI spending hit 63 billion dollars.");
  });

  // Also scans texts fields
  it("scans texts fields for RMB amounts", () => {
    const scenes = [{ id: 1, voiceover: "Look at this.", texts: { stat: "¥445 billion" } }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].texts.stat).toContain("$");
    expect(result[0].texts.stat).toContain("¥445");
  });

  // Multiple RMB amounts in one voiceover
  it("handles multiple RMB amounts in one voiceover", () => {
    const scenes = [{ id: 1, voiceover: "Raised ¥629 million, valued at ¥445 billion." }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toContain("$88 million");
    expect(result[0].voiceover).toContain("¥629");
    expect(result[0].voiceover).toContain("$62 billion");
    expect(result[0].voiceover).toContain("¥445 billion");
  });

  // "million yuan" pattern
  it("converts 'X million yuan' to dual-annotation", () => {
    const scenes = [{ id: 1, voiceover: "They raised 629 million yuan." }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toContain("$88 million");
    expect(result[0].voiceover).toContain("629 million yuan");
  });

  // Does not duplicate when $ already near the ¥ amount
  it("does not duplicate when $ already precedes the yuan amount", () => {
    const scenes = [{ id: 1, voiceover: "That's $88 million, 629 million yuan." }];
    const result = normalizeSceneData(scenes, {});
    // Already has $88 million nearby — no double-insert
    expect(result[0].voiceover).toBe("That's $88 million, 629 million yuan.");
  });

  it("returns original scenes array reference (mutates in place)", () => {
    const scenes = [{ id: 1, voiceover: "No money here." }];
    const result = normalizeSceneData(scenes, {});
    expect(result).toBe(scenes);
  });

  // RMB suffix: "12.4 billion RMB" → "$1.7 billion (12.4 billion RMB)"
  it("converts 'X billion RMB' to dual-annotation", () => {
    const scenes = [{ id: 1, voiceover: "AI product revenue hit 12.4 billion RMB last quarter." }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toContain("$2 billion");
    expect(result[0].voiceover).toContain("12.4 billion RMB");
  });

  // HKD suffix: "80B HKD" → "$10 billion (80B HKD)"
  it("converts 'XB HKD' to dual-annotation", () => {
    const scenes = [{ id: 1, texts: { stat: "80B HKD" } }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].texts.stat).toContain("$10 billion");
    expect(result[0].texts.stat).toContain("80B HKD");
  });

  // RMB in texts field: "67.7B RMB" → "$9 billion (67.7B RMB)"
  it("converts 'XB RMB' in texts field to dual-annotation", () => {
    const scenes = [{ id: 1, texts: { company: "CAPEX: 67.7B RMB" } }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].texts.company).toContain("$9 billion");
    expect(result[0].texts.company).toContain("67.7B RMB");
  });

  // HKD with full word: "80 billion HKD" → "$10 billion (80 billion HKD)"
  it("converts 'X billion HKD' to dual-annotation", () => {
    const scenes = [{ id: 1, voiceover: "They raised 80 billion HKD in the placement." }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toContain("$10 billion");
    expect(result[0].voiceover).toContain("80 billion HKD");
  });

  // zhipu-valuation verification finding (2026-11-14): the on-screen texts use
  // the prefix form and the voiceover spells the currency out — the suffix-only
  // HKD_PATTERN matched neither, so those amounts shipped without USD.
  it("converts 'HK$X' prefix form in texts to dual-annotation", () => {
    const scenes = [
      { id: 1, voiceover: "Look at the close.", texts: { bigNumber: "HK$454 CLOSE" } },
    ];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].texts.bigNumber).toBe("$59 (HK$454) CLOSE");
  });

  it("converts 'X Hong Kong dollars' full-name form to dual-annotation", () => {
    const scenes = [
      { id: 1, voiceover: "From the peak, 2,526 Hong Kong dollars a share vanished." },
    ];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toContain("$328 (2,526 Hong Kong dollars)");
  });

  it("converts 'X Hong Kong dollar' with magnitude", () => {
    const scenes = [{ id: 1, voiceover: "It raised 12.4 billion Hong Kong dollars." }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toContain("$2 billion (12.4 billion Hong Kong dollars)");
  });

  it("does not eat the space after a prefix amount without a magnitude word", () => {
    const scenes = [{ id: 1, voiceover: "Trades at HK$454 today.", texts: {} }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toBe("Trades at $59 (HK$454) today.");
  });
});

describe("DEFAULT_RATES", () => {
  it("keeps the authored fallback constants", () => {
    expect(DEFAULT_RATES.CNY).toBe(0.14);
    expect(DEFAULT_RATES.HKD).toBe(0.13);
  });
});

// #1415: Chinese spellings — Arabic numerals only, the 亿/万 magnitude maps to
// 10^8 / 10^4. Rates are injected so the assertions never depend on a live quote.
describe("Chinese currency spellings", () => {
  const rates = { ...DEFAULT_RATES };
  const run = (voiceover) => {
    const scenes = [{ id: 1, voiceover }];
    normalizeSceneData(scenes, {}, { rates });
    return scenes[0].voiceover;
  };

  it("converts '3,500 亿元' to dual-annotation", () => {
    expect(run("估值为 3,500 亿元")).toBe("估值为 $49 billion (3,500 亿元)");
  });

  it("converts '3500 亿人民币' to dual-annotation", () => {
    expect(run("估值 3500 亿人民币")).toBe("估值 $49 billion (3500 亿人民币)");
  });

  it("converts '120 万元' to dual-annotation", () => {
    expect(run("成本 120 万元")).toBe("成本 $168,000 (120 万元)");
  });

  it("converts '500 万人民币' to dual-annotation", () => {
    expect(run("订单 500 万人民币")).toBe("订单 $700,000 (500 万人民币)");
  });

  it("converts '1,200 元' to dual-annotation", () => {
    expect(run("客单价 1,200 元")).toBe("客单价 $168 (1,200 元)");
  });

  it("converts full-width '￥1,200' to dual-annotation", () => {
    expect(run("预售价 ￥1,200")).toBe("预售价 $168 (￥1,200)");
  });

  it("converts '￥3.5亿' with a magnitude suffix", () => {
    expect(run("营收 ￥3.5亿")).toBe("营收 $49 million (￥3.5亿)");
  });

  it("does not touch Chinese-number spellings", () => {
    expect(run("营收三亿五千万")).toBe("营收三亿五千万");
  });

  it("does not touch non-currency 元 words", () => {
    expect(run("AI 元数据服务")).toBe("AI 元数据服务");
    expect(run("1,200 元素")).toBe("1,200 元素");
  });

  it("does not stack a second annotation on the same amount", () => {
    expect(run("客单价 $168 (1,200 元)")).toBe("客单价 $168 (1,200 元)");
  });

  // Regression: annotations inserted for an earlier amount used to suppress the
  // next amount within 30 chars (the $ fell inside its lookbehind window).
  it("annotates adjacent amounts of different magnitudes", () => {
    expect(run("营收 3,500 亿元，成本 120 万元")).toBe(
      "营收 $49 billion (3,500 亿元)，成本 $168,000 (120 万元)",
    );
    expect(run("成本 120 万元，客单价 1,200 元")).toBe(
      "成本 $168,000 (120 万元)，客单价 $168 (1,200 元)",
    );
  });

  it("routes half-width ¥ with a Chinese magnitude through the magnitude parser", () => {
    expect(run("营收 ¥3.5亿")).toBe("营收 $49 million (¥3.5亿)");
    expect(run("售价 ¥1,200万")).toBe("售价 $2 million (¥1,200万)");
  });

  it("covers bare 人民币 and 港币/港元 spellings", () => {
    expect(run("售价 500 人民币")).toBe("售价 $70 (500 人民币)");
    expect(run("市值 2,980 港币")).toBe("市值 $387 (2,980 港币)");
  });

  it("does not label a sub-billion amount as $1 billion", () => {
    expect(run("估值 36 亿元")).toBe("估值 $504 million (36 亿元)");
  });

  it("uses injected live rates instead of the fallback constants", () => {
    const scenes = [{ id: 1, voiceover: "估值 3,500 亿元" }];
    normalizeSceneData(scenes, {}, { rates: { CNY: 0.1, HKD: 0.13 } });
    expect(scenes[0].voiceover).toBe("估值 $35 billion (3,500 亿元)");
  });
});

// #1415: Step 0.5 wrapper — one live quote per run, recorded on meta, with a
// fallback branch that must never abort the pipeline.
describe("normalizeSceneDataWithLiveRates", () => {
  const okFetch = async () => ({
    ok: true,
    json: async () => ({
      result: "success",
      time_last_update_utc: "Tue, 17 Nov 2026 00:02:31 +0000",
      rates: { CNY: 7.0, HKD: 7.8 },
    }),
  });

  const collectLogger = () => {
    const lines = [];
    return {
      lines,
      log: (msg) => lines.push({ level: "log", msg }),
      warn: (msg) => lines.push({ level: "warn", msg }),
    };
  };

  it("records a live rate report on meta and annotates with it", async () => {
    const meta = {};
    const scenes = [{ id: 1, voiceover: "售价 ¥700" }];
    const logger = collectLogger();

    const report = await normalizeSceneDataWithLiveRates(scenes, meta, {
      fetchImpl: okFetch,
      logger,
      now: () => new Date("2026-11-17T08:00:00Z"),
    });

    expect(report.fallback).toBe(false);
    expect(report.source).toBe("open.er-api.com");
    expect(report.rates.CNY).toBeCloseTo(1 / 7, 10);
    expect(meta.currencyRates).toBe(report);
    expect(meta.currencyAnnotation).toEqual({ annotated: 1 });
    expect(scenes[0].voiceover).toBe("售价 $100 (¥700)");
    expect(logger.lines).toHaveLength(1);
    expect(logger.lines[0].level).toBe("log");
    expect(logger.lines[0].msg).toContain("CNY 0.1429");
    expect(logger.lines[0].msg).toContain("2026-11-17T08:00:00.000Z");
  });

  it("falls back to the constants, marks the log and still annotates", async () => {
    const meta = {};
    const scenes = [{ id: 1, voiceover: "售价 ¥700" }];
    const logger = collectLogger();

    const report = await normalizeSceneDataWithLiveRates(scenes, meta, {
      fetchImpl: async () => {
        throw new Error("socket hang up");
      },
      logger,
    });

    expect(report.fallback).toBe(true);
    expect(report.source).toBe("fallback");
    expect(report.error).toContain("socket hang up");
    expect(report.rates).toEqual({ CNY: 0.14, HKD: 0.13 });
    expect(meta.currencyRates.rates.CNY).toBe(0.14);
    expect(scenes[0].voiceover).toBe("售价 $98 (¥700)");
    expect(logger.lines[0].level).toBe("warn");
    expect(logger.lines[0].msg).toContain("fallback");
  });

  it("stays silent when logger is null", async () => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const calls = [];
    console.log = (...args) => calls.push(args);
    console.warn = (...args) => calls.push(args);
    try {
      await normalizeSceneDataWithLiveRates(
        [{ id: 1, voiceover: "¥700" }],
        {},
        {
          fetchImpl: okFetch,
          logger: null,
        },
      );
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
    }
    expect(calls).toHaveLength(0);
  });

  it("reuses recorded rates, writes the sidecar, and never touches the network", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rates-"));
    const file = join(dir, "currency-rates.json");
    const scenes = [{ id: 1, voiceover: "售价 ¥700" }];
    const meta = {};
    try {
      const report = await normalizeSceneDataWithLiveRates(scenes, meta, {
        rates: { CNY: 0.2, HKD: 0.13 },
        rateSource: "run-artifact:open.er-api.com",
        ratesFile: file,
        fetchImpl: () => {
          throw new Error("must not fetch");
        },
        logger: null,
      });

      expect(scenes[0].voiceover).toBe("售价 $140 (¥700)");
      expect(report.source).toBe("run-artifact:open.er-api.com");
      expect(report.fallback).toBe(false);
      expect(meta.currencyRates).toBe(report);
      expect(readRateReport(file)).toEqual(report);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// 2026-11-17 regression: the DeepSeek pack wrote "0.39 YUAN", "5 YUAN",
// "thirty nine fen" — none matched the magnitude-only patterns, so the rule
// existed on paper while the shipped video stayed in RMB.
describe("bare English amounts", () => {
  it("converts '<n> yuan' without a magnitude word", () => {
    const scenes = [{ id: 1, voiceover: "Speech costs 0.39 yuan an hour." }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toContain("$0.05");
    expect(result[0].voiceover).toContain("0.39 yuan");
  });

  it("converts uppercase on-screen price labels", () => {
    const scenes = [
      { id: 3, voiceover: "Look.", texts: { stat: "5", statLabel: "5 YUAN PER 1,000 SEARCHES" } },
    ];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].texts.statLabel).toContain("$0.70");
    expect(result[0].texts.statLabel).toContain("5 YUAN");
  });

  it("does not double-annotate an amount that already has USD before it", () => {
    const scenes = [{ id: 1, voiceover: "It costs $0.05 (0.39 yuan) per hour." }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toBe("It costs $0.05 (0.39 yuan) per hour.");
  });

  it("flags spelled-out amounts as unfixable instead of silently skipping them", () => {
    const spans = findCurrencySpellings("Speech costs thirty nine fen an hour.");
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe("thirty nine fen");
    expect(spans[0].fixable).toBe(false);

    const scenes = [{ id: 1, voiceover: "Speech costs thirty nine fen an hour." }];
    const result = normalizeSceneData(scenes, {});
    expect(result[0].voiceover).toBe("Speech costs thirty nine fen an hour.");
  });
});
