import { describe, it, expect, vi } from "vitest";

import { createRateLimiter, SITE_RATE_CONFIG, WINDOW_MS } from "../lib/rate-limiter.mjs";

// ─── Helpers ───

/**
 * Build a limiter with injected clock/sleep/state so no test waits real time.
 * sleepCalls records (ms) of every sleep; advanceClock lets tests push time forward.
 */
function makeTestLimiter({ config = {}, random = () => 0.5, ...overrides } = {}) {
  const sleepCalls = [];
  let currentTime = 1_000_000;
  const memState = { domains: {} };

  const limiter = createRateLimiter({
    now: () => currentTime,
    sleep: async (ms) => {
      sleepCalls.push(ms);
      currentTime += ms;
    },
    random,
    loadState: () => JSON.parse(JSON.stringify(memState)),
    saveState: (s) => Object.assign(memState, JSON.parse(JSON.stringify(s))),
    ...overrides,
  });

  return {
    limiter,
    sleepCalls,
    memState,
    advanceClock: (ms) => {
      currentTime += ms;
    },
    now: () => currentTime,
  };
}

// ─── First request & wait interval (scenarios 1–3, 7, 15) ───

describe("rate-limiter: first request and wait interval", () => {
  it("scenario 1: first request to a domain does not sleep", async () => {
    const { limiter, sleepCalls } = makeTestLimiter();
    const result = await limiter.wait("https://www.google.com/search?q=test");

    expect(result.action).toBe("pass");
    expect(sleepCalls).toHaveLength(0);
  });

  it("scenario 2: second request within interval sleeps the remaining difference", async () => {
    const cfg = SITE_RATE_CONFIG["google.com"];
    const { limiter, sleepCalls, now } = makeTestLimiter();
    // random()=0.5 → jitter factor = mid of [0.5, 1.5] = 1.0 → interval = baseDelay
    await limiter.wait("https://www.google.com/search?q=a");

    await limiter.wait("https://www.google.com/search?q=b");
    const expectedInterval = cfg.baseDelay * 1.0;
    // Last recorded ts = first wait() time; second call happens at same now → sleep ≈ full interval
    expect(sleepCalls[0]).toBe(Math.round(expectedInterval));
    expect(now() - 1_000_000).toBeGreaterThanOrEqual(expectedInterval);
  });

  it("scenario 3: interval stays within jitter bounds [min, max] × baseDelay", async () => {
    const cfg = SITE_RATE_CONFIG["google.com"];
    const minFactor = 0 + (cfg.jitter[0] + 0 * (cfg.jitter[1] - cfg.jitter[0]));
    // random = () => 0 → factor = jitter min; random = () => 1 → factor = jitter max
    const lo = makeTestLimiter({ random: () => 0 });
    await lo.limiter.wait("https://google.com/?q=1");
    await lo.limiter.wait("https://google.com/?q=2");
    expect(lo.sleepCalls[0]).toBe(Math.round(cfg.baseDelay * cfg.jitter[0]));

    const hi = makeTestLimiter({ random: () => 1 });
    await hi.limiter.wait("https://google.com/?q=1");
    await hi.limiter.wait("https://google.com/?q=2");
    expect(hi.sleepCalls[0]).toBe(Math.round(cfg.baseDelay * cfg.jitter[1]));
  });

  it("scenario 7: unknown domain and unparseable URL fall back to _default without crashing", async () => {
    const cfg = SITE_RATE_CONFIG._default;
    const { limiter, sleepCalls, advanceClock } = makeTestLimiter();

    const r1 = await limiter.wait("https://some-unknown-site.example/news?q=x");
    expect(r1.action).toBe("pass");

    await limiter.wait("https://some-unknown-site.example/news?q=y");
    expect(sleepCalls[0]).toBe(Math.round(cfg.baseDelay * 1.25)); // jitter mid of [0.5, 2.0]

    // Advance past the _default interval so the third request isn't gated
    advanceClock(SITE_RATE_CONFIG._default.baseDelay * 2);
    const r2 = await limiter.wait("not-a-url");
    expect(r2.action).toBe("pass");
    expect(r2.domain).toBe("_default");
  });

  it("scenario 15: RATE_LIMITER_DISABLED=1 → zero sleep, zero state writes", async () => {
    let saved = 0;
    const { limiter, sleepCalls } = makeTestLimiter({
      disabled: true,
      saveState: () => {
        saved += 1;
      },
    });

    await limiter.wait("https://google.com/?q=1");
    await limiter.wait("https://google.com/?q=2");

    expect(sleepCalls).toHaveLength(0);
    expect(saved).toBe(0);
  });
});

// ─── Domain buckets (scenarios 4–6) ───

describe("rate-limiter: domain buckets", () => {
  it("scenario 4: www.google.com and google.com share one bucket", async () => {
    const { limiter, sleepCalls } = makeTestLimiter();
    await limiter.wait("https://www.google.com/search?q=a");
    await limiter.wait("https://google.com/search?q=b");
    expect(sleepCalls).toHaveLength(1);
    expect(sleepCalls[0]).toBe(SITE_RATE_CONFIG["google.com"].baseDelay);
  });

  it("scenario 5: direct google URL and google site:-fallback URL aggregate into the same bucket", async () => {
    const { limiter, sleepCalls } = makeTestLimiter();
    await limiter.wait("https://google.com/search?q=DeepSeek");
    // googleSiteFallback-style URL — different path/params, same domain
    await limiter.wait("https://www.google.com/search?q=site:36kr.com+DeepSeek");
    expect(sleepCalls).toHaveLength(1);
  });

  it("scenario 6: google and baidu buckets are independent", async () => {
    const { limiter, sleepCalls } = makeTestLimiter();
    const r1 = await limiter.wait("https://www.google.com/search?q=a");
    const r2 = await limiter.wait("https://www.baidu.com/s?wd=a");
    expect(r1.action).toBe("pass");
    expect(r2.action).toBe("pass");
    expect(sleepCalls).toHaveLength(0);

    // Second baidu request gates on baidu's own interval, google is irrelevant
    await limiter.wait("https://www.baidu.com/s?wd=b");
    expect(sleepCalls).toHaveLength(1);
    expect(sleepCalls[0]).toBe(SITE_RATE_CONFIG["baidu.com"].baseDelay);
  });
});

// ─── Hourly sliding window (scenarios 8–10, 14) ───

describe("rate-limiter: hourly sliding window", () => {
  const GOOGLE = SITE_RATE_CONFIG["google.com"];
  const GOOGLE_URL = "https://google.com/search?q=";

  async function fillWindow(limiter) {
    for (let i = 0; i < GOOGLE.maxPerHour; i++) {
      await limiter.wait(`${GOOGLE_URL}${i}`);
    }
  }

  it("scenario 8: cap reached — waits until oldest timestamp leaves the window, then proceeds", async () => {
    const { limiter, sleepCalls, advanceClock } = makeTestLimiter();
    await fillWindow(limiter);
    // Simulated time is now firstTs + 29×8000 = 1_232_000 (first request has
    // no sleep). Advance so the oldest entry leaves the window in 60s.
    advanceClock(WINDOW_MS - 60_000 - (GOOGLE.maxPerHour - 1) * GOOGLE.baseDelay);

    const r = await limiter.wait(`${GOOGLE_URL}overflow`);
    expect(r.action).toBe("waited");
    expect(sleepCalls.at(-1)).toBe(60_000);
  });

  it("scenario 9: cap reached and required wait exceeds 10min cap → skip, no navigation", async () => {
    const { limiter, sleepCalls } = makeTestLimiter();
    await fillWindow(limiter);

    const r = await limiter.wait(`${GOOGLE_URL}overflow`);
    expect(r.action).toBe("skip");
    // No additional sleep beyond the 30 interval sleeps from filling
    expect(sleepCalls).toHaveLength(GOOGLE.maxPerHour - 1);
  });

  it("scenario 10: timestamps older than 1h are pruned — capacity is released", async () => {
    const { limiter, advanceClock } = makeTestLimiter();
    await fillWindow(limiter);
    advanceClock(WINDOW_MS + 1000);

    const r = await limiter.wait(`${GOOGLE_URL}fresh`);
    expect(r.action).toBe("pass");
  });

  it("scenario 14: timestamp is recorded before navigation — failed navigations still count", async () => {
    const { limiter, memState } = makeTestLimiter();
    await limiter.wait(`${GOOGLE_URL}only`);
    // Caller "fails" after wait() returns — the attempt is already counted
    expect(memState.domains["google.com"]).toHaveLength(1);
  });
});

// ─── Persistence (scenarios 11–13, 17) ───

describe("rate-limiter: persistence", () => {
  const GOOGLE_URL = "https://google.com/search?q=";

  it("scenario 11: missing state file (loadState → null) starts empty; saveState writes window structure", async () => {
    let saved = null;
    const { limiter } = makeTestLimiter({
      loadState: () => null,
      saveState: (s) => {
        saved = s;
      },
    });
    const r = await limiter.wait(GOOGLE_URL + "first");
    expect(r.action).toBe("pass");
    expect(saved).toEqual({ domains: { "google.com": expect.any(Array) } });
    expect(saved.domains["google.com"]).toHaveLength(1);
  });

  it("scenario 12: unreadable state (loadState throws) degrades to empty state without crashing", async () => {
    const { limiter, sleepCalls } = makeTestLimiter({
      loadState: () => {
        throw new Error("corrupt json");
      },
    });
    const r = await limiter.wait(GOOGLE_URL + "first");
    expect(r.action).toBe("pass");
    expect(sleepCalls).toHaveLength(0);
  });

  it("scenario 13: a new instance loads persisted timestamps — cross-run aggregation works", async () => {
    const store = { domains: {} };
    const deps = {
      loadState: () => JSON.parse(JSON.stringify(store)),
      saveState: (s) => {
        store.domains = JSON.parse(JSON.stringify(s.domains));
      },
    };
    // Run 1: one request recorded
    const run1 = makeTestLimiter({ ...deps });
    await run1.limiter.wait(GOOGLE_URL + "a");

    // Run 2 (fresh instance, same persisted state): gated by run 1's timestamp
    const run2 = makeTestLimiter({ ...deps });
    const r = await run2.limiter.wait(GOOGLE_URL + "b");
    expect(r.action).toBe("waited");
    expect(run2.sleepCalls[0]).toBe(SITE_RATE_CONFIG["google.com"].baseDelay);
  });

  it("scenario 17: save/load roundtrip preserves window timestamps exactly", async () => {
    let saved = null;
    const first = makeTestLimiter({
      loadState: () => null,
      saveState: (s) => {
        saved = s;
      },
    });
    await first.limiter.wait(GOOGLE_URL + "a");

    const second = makeTestLimiter({
      loadState: () => saved,
      saveState: () => {},
    });
    await second.limiter.wait(GOOGLE_URL + "b");
    // Second instance waited based on the exact timestamp from the first
    expect(second.sleepCalls[0]).toBe(SITE_RATE_CONFIG["google.com"].baseDelay);
  });
});
