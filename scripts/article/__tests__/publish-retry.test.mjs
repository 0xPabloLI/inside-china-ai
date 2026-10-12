/**
 * #426 — bounded retry & idempotent write reconciliation for upsertPost.
 *
 * Unit-level behavioral tests with injected seams ({ fetchFn, sleep, now,
 * retry }). Global fetch is guarded so a missing seam fails the test instead
 * of reaching the network. Real-socket variants (actual TCP resets) live in
 * publish-article-cli.test.mjs.
 *
 * Scenario numbers (18–29) map to the Behavioral Scenarios matrix recorded in
 * #426's delivery record (closing issue comment).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { upsertPost, formatPublishError, PublishError } from "../lib/publish-utils.mjs";

const URL_BASE = "https://example.supabase.co";
const KEY = "sb_publishable_test";
const AUTH = { access_token: "tok", user: { id: "u1" } };

const parsed = {
  title: "Retry Me",
  slug: "retry-me",
  excerpt: "Desc",
  content: "Body",
  published: false,
};

// ─── helpers ───

const okResponse = (json) => ({ ok: true, status: 200, json: async () => json });
const errorResponse = (status, message) => ({
  ok: false,
  status,
  json: async () => ({ message }),
});

function networkError(code, causeMessage = `read ${code}`) {
  const cause = Object.assign(new Error(causeMessage), { code });
  const err = new TypeError("fetch failed");
  err.cause = cause;
  return err;
}

const rowFromBody = (body, id = "row-1") => ({ id, ...body });
const methodOf = (init) => init?.method ?? "GET";

/** Deterministic clock: sleep() advances now(); nothing waits on real time. */
function makeClock() {
  let t = 0;
  const delays = [];
  return {
    now: () => t,
    sleep: async (ms) => {
      delays.push(ms);
      t += ms;
    },
    delays,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("unit test attempted a real fetch — the fetchFn seam was not used");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── transient retries ───

describe("upsertPost — transient failure classification (#426)", () => {
  it("retries a classified transient query failure before submitting (scenario 18)", async () => {
    const clock = makeClock();
    let queryCalls = 0;
    const fetchFn = vi.fn(async (url, init) => {
      if (methodOf(init) === "GET") {
        queryCalls += 1;
        if (queryCalls === 1) throw networkError("ETIMEDOUT");
        return okResponse([]);
      }
      return okResponse([rowFromBody(JSON.parse(init.body))]);
    });

    const result = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock });

    expect(result.id).toBe("row-1");
    expect(result.mode).toBe("insert");
    expect(result.reconciled).toBeUndefined();
    expect(queryCalls).toBe(2);
    expect(clock.delays).toEqual([1000]);
  });

  it("retries a 429 rate limit and succeeds on the next write (scenario 25)", async () => {
    const clock = makeClock();
    let postCalls = 0;
    const fetchFn = vi.fn(async (url, init) => {
      if (methodOf(init) === "GET") return okResponse([]);
      postCalls += 1;
      if (postCalls === 1) return errorResponse(429, "Too many requests");
      return okResponse([rowFromBody(JSON.parse(init.body))]);
    });

    const result = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock });

    expect(result.mode).toBe("insert");
    expect(postCalls).toBe(2);
    expect(clock.delays).toEqual([1000]);
  });

  it("does not retry a validation failure (400) — single write attempt (scenario 24)", async () => {
    const clock = makeClock();
    let postCalls = 0;
    const fetchFn = vi.fn(async (url, init) => {
      if (methodOf(init) === "GET") return okResponse([]);
      postCalls += 1;
      return errorResponse(400, "Invalid request");
    });

    const err = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(PublishError);
    expect(err.context).toMatchObject({
      stage: "insert",
      category: "http",
      status: 400,
      attempts: 1,
    });
    expect(err.message).toContain("Invalid request");
    expect(postCalls).toBe(1);
    expect(clock.delays).toEqual([]);
  });

  it("does not retry an auth failure on the query (401) (scenario 24)", async () => {
    const clock = makeClock();
    const fetchFn = vi.fn(async () => errorResponse(401, "JWT expired"));

    const err = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(PublishError);
    expect(err.context).toMatchObject({ stage: "query", status: 401, attempts: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// ─── write reconciliation ───

describe("upsertPost — committed writes with lost responses (#426)", () => {
  it("reconciles after a write that died before commit, then replays it (scenario 19)", async () => {
    const clock = makeClock();
    let committed = null;
    let postCalls = 0;
    const fetchFn = vi.fn(async (url, init) => {
      if (methodOf(init) === "GET") return okResponse(committed ? [committed] : []);
      postCalls += 1;
      if (postCalls === 1) throw networkError("ECONNRESET"); // never reached the database
      committed = rowFromBody(JSON.parse(init.body), "row-9");
      return okResponse([committed]);
    });

    const result = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock });

    expect(result.id).toBe("row-9");
    expect(result.reconciled).toBeUndefined();
    expect(postCalls).toBe(2);
    expect(clock.delays).toEqual([1000]);
  });

  it("treats a committed insert with a lost response as success — no duplicate POST (scenario 20)", async () => {
    const clock = makeClock();
    let committed = null;
    let postCalls = 0;
    const fetchFn = vi.fn(async (url, init) => {
      if (methodOf(init) === "GET") return okResponse(committed ? [committed] : []);
      postCalls += 1;
      committed = rowFromBody(JSON.parse(init.body));
      throw networkError("ECONNRESET"); // committed, response lost
    });

    const result = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock });

    expect(result).toMatchObject({
      id: "row-1",
      slug: "retry-me",
      mode: "insert",
      reconciled: true,
    });
    expect(postCalls).toBe(1);
    expect(clock.delays).toEqual([]); // reconciled — no backoff sleep needed
  });

  it("treats a committed update with a lost response as success — no duplicate PATCH (scenario 21)", async () => {
    const existing = {
      id: "post-1",
      slug: "retry-me",
      title: "Old title",
      excerpt: null,
      content: "Old body",
      published: true,
      published_at: "2026-07-01T00:00:00Z",
    };
    const clock = makeClock();
    let current = existing;
    let patchCalls = 0;
    const fetchFn = vi.fn(async (url, init) => {
      if (methodOf(init) === "GET") return okResponse([current]);
      patchCalls += 1;
      current = { ...existing, ...JSON.parse(init.body) };
      throw networkError("ECONNRESET"); // committed, response lost
    });

    const result = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock });

    expect(result).toMatchObject({ id: "post-1", mode: "update", reconciled: true });
    expect(patchCalls).toBe(1);
    expect(current.published).toBe(false); // draft intent held
    expect(current.published_at).toBe("2026-07-01T00:00:00Z"); // not overwritten (scenario 28)
  });

  it("verifies by slug when a 2xx write returns no representation (scenario 20b)", async () => {
    const clock = makeClock();
    let committed = null;
    let postCalls = 0;
    const fetchFn = vi.fn(async (url, init) => {
      if (methodOf(init) === "GET") return okResponse(committed ? [committed] : []);
      postCalls += 1;
      committed = rowFromBody(JSON.parse(init.body));
      return okResponse([]); // 2xx but empty representation
    });

    const result = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock });

    expect(result).toMatchObject({ id: "row-1", mode: "insert", reconciled: true });
    expect(postCalls).toBe(1);
  });

  it("reconciles even for an unclassified network failure before deciding (scenario 19)", async () => {
    const clock = makeClock();
    let committed = null;
    const fetchFn = vi.fn(async (url, init) => {
      if (methodOf(init) === "GET") return okResponse(committed ? [committed] : []);
      committed = rowFromBody(JSON.parse(init.body));
      throw new TypeError("fetch failed"); // no cause, no code
    });

    const result = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock });

    expect(result).toMatchObject({ mode: "insert", reconciled: true });
  });

  it("does not replay an unclassified network failure (scenario 24)", async () => {
    const clock = makeClock();
    let postCalls = 0;
    const fetchFn = vi.fn(async (url, init) => {
      if (methodOf(init) === "GET") return okResponse([]);
      postCalls += 1;
      throw new TypeError("fetch failed"); // not classifiable as transient
    });

    const err = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(PublishError);
    expect(err.context).toMatchObject({ stage: "insert", category: "network", attempts: 1 });
    expect(postCalls).toBe(1);
    expect(clock.delays).toEqual([]);
  });
});

// ─── slug UNIQUE conflict ───

describe("upsertPost — slug uniqueness is never treated as transient (#426)", () => {
  it("converges a 409 through the update path when the existing row differs (scenario 22)", async () => {
    const conflicting = {
      id: "post-7",
      slug: "retry-me",
      title: "Concurrent writer",
      excerpt: "theirs",
      content: "their body",
      published: true,
      published_at: "2026-06-01T00:00:00Z",
    };
    const clock = makeClock();
    let queryCount = 0;
    let postCalls = 0;
    let patched = null;
    const fetchFn = vi.fn(async (url, init) => {
      const method = methodOf(init);
      if (method === "GET") {
        queryCount += 1;
        if (queryCount === 1) return okResponse([]);
        return okResponse([patched ?? conflicting]);
      }
      if (method === "POST") {
        postCalls += 1;
        return errorResponse(
          409,
          'duplicate key value violates unique constraint "posts_slug_key"',
        );
      }
      patched = { ...conflicting, ...JSON.parse(init.body) };
      return okResponse([patched]);
    });

    const result = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock });

    expect(result).toMatchObject({ id: "post-7", mode: "update" });
    expect(postCalls).toBe(1); // no blind POST replay
    const patchCall = fetchFn.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall[0]).toContain("id=eq.post-7");
    expect(patched.published).toBe(false);
    expect(patched.published_at).toBe("2026-06-01T00:00:00Z"); // preserved across convergence
  });

  it("treats a 409 as reconciled success when the existing row already matches (scenario 23)", async () => {
    const insertBody = {
      title: parsed.title,
      slug: parsed.slug,
      excerpt: parsed.excerpt,
      content: parsed.content,
      published: false,
      published_at: null,
      author_id: "u1",
    };
    const clock = makeClock();
    let queryCount = 0;
    const fetchFn = vi.fn(async (url, init) => {
      if (methodOf(init) === "GET") {
        queryCount += 1;
        if (queryCount === 1) return okResponse([]);
        return okResponse([rowFromBody(insertBody)]);
      }
      return errorResponse(409, 'duplicate key value violates unique constraint "posts_slug_key"');
    });

    const result = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock });

    expect(result).toMatchObject({ id: "row-1", mode: "insert", reconciled: true });
  });
});

// ─── budget & failure-closed ───

describe("upsertPost — bounded budgets fail closed (#426)", () => {
  it("fails closed when write attempts are exhausted (scenario 26a)", async () => {
    const clock = makeClock();
    let postCalls = 0;
    const fetchFn = vi.fn(async (url, init) => {
      if (methodOf(init) === "GET") return okResponse([]);
      postCalls += 1;
      throw networkError("ECONNRESET");
    });

    const err = await upsertPost(parsed, AUTH, URL_BASE, KEY, {
      fetchFn,
      ...clock,
      retry: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 40 },
    }).catch((e) => e);

    expect(err).toBeInstanceOf(PublishError);
    expect(err.context).toMatchObject({
      stage: "insert",
      category: "network",
      code: "ECONNRESET",
      attempts: 3,
      exhausted: "attempts",
    });
    expect(postCalls).toBe(3);
    expect(clock.delays).toEqual([10, 20]);
  });

  it("fails closed when the wall-clock budget is exhausted (scenario 26b)", async () => {
    const clock = makeClock();
    const fetchFn = vi.fn(async (url, init) => {
      if (methodOf(init) === "GET") return okResponse([]);
      throw networkError("ECONNRESET");
    });

    const err = await upsertPost(parsed, AUTH, URL_BASE, KEY, {
      fetchFn,
      ...clock,
      retry: { maxAttempts: 10, baseDelayMs: 1000, maxDelayMs: 8000, totalBudgetMs: 5000 },
    }).catch((e) => e);

    expect(err).toBeInstanceOf(PublishError);
    expect(err.context).toMatchObject({ category: "budget", exhausted: "budget", attempts: 3 });
    expect(clock.delays).toEqual([1000, 2000]);
  });

  it("fails closed at the global attempt guard (scenario 26c)", async () => {
    const clock = makeClock();
    const fetchFn = vi.fn(async (url, init) => {
      if (methodOf(init) === "GET") return okResponse([]);
      throw networkError("ECONNRESET");
    });

    const err = await upsertPost(parsed, AUTH, URL_BASE, KEY, {
      fetchFn,
      ...clock,
      retry: { maxAttempts: 100, maxTotalAttempts: 2, baseDelayMs: 10, maxDelayMs: 10 },
    }).catch((e) => e);

    expect(err).toBeInstanceOf(PublishError);
    expect(err.context.exhausted).toBe("total-attempts");
  });

  it("fails closed when the query response shape is not an array (contract violation)", async () => {
    const clock = makeClock();
    const fetchFn = vi.fn(async () => okResponse({ message: "weird" }));

    const err = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(PublishError);
    expect(err.context).toMatchObject({ stage: "query", category: "invalid-response" });
  });
});

// ─── diagnostics ───

describe("formatPublishError — sanitized diagnostics (#426)", () => {
  it("keeps secrets out of diagnostics — code only, never cause text (scenario 27)", async () => {
    const clock = makeClock();
    const leaky = networkError(
      "ECONNRESET",
      "connect failed: Bearer sb_secret_LIVE_TOKEN_123 at https://secret.example.co",
    );
    const fetchFn = vi.fn(async () => {
      throw leaky;
    });

    const err = await upsertPost(parsed, AUTH, URL_BASE, KEY, {
      fetchFn,
      ...clock,
      retry: { maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 10 },
    }).catch((e) => e);

    const formatted = formatPublishError(err);
    expect(formatted).toContain("ECONNRESET");
    expect(formatted).toContain("stage=query");
    expect(formatted).not.toContain("sb_secret_LIVE_TOKEN_123");
    expect(formatted).not.toContain("secret.example.co");
    expect(formatted).not.toContain("Bearer");
    expect(err.cause).toBeUndefined(); // raw cause is never attached
  });

  it("redacts secrets from service messages and passes plain errors through", () => {
    const direct = new PublishError("Supabase insert failed: Bearer sb_secret_XYZ leaked", {
      stage: "insert",
    });

    expect(formatPublishError(direct)).not.toContain("sb_secret_XYZ");
    expect(formatPublishError(direct)).toContain("[REDACTED]");
    expect(formatPublishError(new Error("plain boom"))).toBe("plain boom");
  });
});

// ─── review hardening (2026-10-12) ───

describe("upsertPost — review hardening (#426)", () => {
  it("re-targets a row replaced mid-write and replays against the fresh identity", async () => {
    const original = {
      id: "post-1",
      slug: "retry-me",
      title: "Old",
      excerpt: null,
      content: "Old body",
      published: false,
      published_at: null,
      author_id: "u1",
    };
    const replacement = {
      id: "post-2",
      slug: "retry-me",
      title: "Replaced",
      excerpt: null,
      content: "Replaced body",
      published: true,
      published_at: "2026-05-05T00:00:00Z",
      author_id: "u1",
    };
    const clock = makeClock();
    let queryCalls = 0;
    const patchUrls = [];
    const fetchFn = vi.fn(async (url, init) => {
      const method = methodOf(init);
      if (method === "GET") {
        queryCalls += 1;
        return okResponse(queryCalls === 1 ? [original] : [replacement]);
      }
      patchUrls.push(url);
      if (patchUrls.length === 1) throw networkError("ECONNRESET"); // did not land
      return okResponse([{ ...replacement, ...JSON.parse(init.body) }]);
    });

    const result = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock });

    expect(result.id).toBe("post-2"); // re-targeted, not the stale post-1
    expect(result.mode).toBe("update");
    expect(patchUrls[0]).toContain("id=eq.post-1");
    expect(patchUrls[1]).toContain("id=eq.post-2");
    expect(clock.delays).toEqual([1000]);
  });

  it("does not retry a refused connection — ECONNREFUSED is not a reset/timeout", async () => {
    const clock = makeClock();
    const fetchFn = vi.fn(async () => {
      throw networkError("ECONNREFUSED");
    });

    const err = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(PublishError);
    expect(err.context).toMatchObject({
      stage: "query",
      category: "network",
      code: "ECONNREFUSED",
      attempts: 1,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(clock.delays).toEqual([]);
  });

  it("does not claim a foreign-author row as our own insert", async () => {
    const foreign = {
      id: "row-x",
      slug: "retry-me",
      title: parsed.title,
      excerpt: parsed.excerpt,
      content: parsed.content,
      published: false,
      published_at: null,
      author_id: "someone-else",
    };
    const clock = makeClock();
    let committed = null;
    const patchUrls = [];
    const fetchFn = vi.fn(async (url, init) => {
      const method = methodOf(init);
      if (method === "GET") return okResponse(committed ? [committed] : []);
      if (method === "POST") {
        committed = foreign;
        throw networkError("ECONNRESET");
      }
      patchUrls.push(url);
      committed = { ...committed, ...JSON.parse(init.body) };
      return okResponse([committed]);
    });

    const result = await upsertPost(parsed, AUTH, URL_BASE, KEY, { fetchFn, ...clock });

    expect(result.mode).toBe("update"); // never claimed as "insert reconciled"
    expect(patchUrls[0]).toContain("id=eq.row-x");
    expect(committed.author_id).toBe("someone-else"); // author identity preserved
  });
});
