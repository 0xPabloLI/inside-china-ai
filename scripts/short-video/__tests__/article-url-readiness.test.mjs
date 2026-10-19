/**
 * Tests for the article-URL readiness seam (#429).
 *
 * The seam answers one question at two stages — "will the article link we are
 * about to publish actually serve the article?":
 *   1. package/draft stage (pure): validateArticleUrl — origin / scheme /
 *      /posts/<slug> shape. A draft article may 404 legitimately, so no
 *      liveness is required here.
 *   2. final delivery stage (network): checkArticleUrlReachable — HEAD, with
 *      a limited GET re-check on 405/501, classified ok / unreachable /
 *      unknown. resolveArticleLinkReadiness applies the user-adjudicated
 *      policy (2026-10-19): unreachable → block, unknown → degrade.
 *
 * Acceptance scenarios pinned here (2026-10-04 review list):
 *   normal 200 · 404/410 · HEAD 405+GET 200 · draft 404 (no network at
 *   package stage) · network unknown · cross-site redirect · manual-guide
 *   wrong slug · no-link degraded copy.
 */
import { describe, it, expect } from "vitest";

import {
  ARTICLE_SITE_ORIGIN,
  validateArticleUrl,
  checkArticleUrlReachable,
  resolveReadinessAction,
  stripArticleLinkPromise,
  resolveArticleLinkReadiness,
} from "../lib/article-url-readiness.mjs";

// ─── Mock fetch ───

/** Fetch mock that records the method of every call. */
function recordingFetch(responses) {
  const calls = [];
  const impl = async (input, init) => {
    calls.push(init?.method ?? "GET");
    const spec = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (spec.throws) throw spec.throws;
    return {
      ok: spec.status >= 200 && spec.status < 300,
      status: spec.status,
      url: spec.url ?? String(input),
      redirected: Boolean(spec.url && spec.url !== String(input)),
    };
  };
  impl.calls = calls;
  return impl;
}

const OK_URL = `${ARTICLE_SITE_ORIGIN}/posts/deepseek-harness-desktop`;

// ─── Stage 1: validateArticleUrl (pure, no network) ───

describe("validateArticleUrl (draft/package stage — no network)", () => {
  it("accepts a well-formed https article URL on our origin", () => {
    const r = validateArticleUrl(OK_URL);
    expect(r.ok).toBe(true);
    expect(r.slug).toBe("deepseek-harness-desktop");
  });

  it("accepts a draft-legal URL without any liveness claim (draft may 404)", () => {
    // The 2026-09-30 incident was a wrong-ORIGIN URL; shape alone catches it.
    // A draft article that 404s must not be rejected here.
    const r = validateArticleUrl(`${ARTICLE_SITE_ORIGIN}/posts/some-draft-slug`);
    expect(r.ok).toBe(true);
  });

  it("rejects the parked wrong-domain origin from the incident (chinaainews.com)", () => {
    const r = validateArticleUrl("https://chinaainews.com/posts/deepseek-harness-desktop");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("chinaai.news");
  });

  it("rejects non-https schemes", () => {
    expect(validateArticleUrl("http://chinaai.news/posts/x").ok).toBe(false);
  });

  it("rejects paths outside /posts/<slug>", () => {
    expect(validateArticleUrl(`${ARTICLE_SITE_ORIGIN}/news/x`).ok).toBe(false);
    expect(validateArticleUrl(`${ARTICLE_SITE_ORIGIN}/posts/`).ok).toBe(false);
    expect(validateArticleUrl(`${ARTICLE_SITE_ORIGIN}/posts/a/b`).ok).toBe(false);
  });

  it("rejects empty / non-string input", () => {
    expect(validateArticleUrl("").ok).toBe(false);
    expect(validateArticleUrl(null).ok).toBe(false);
    expect(validateArticleUrl(undefined).ok).toBe(false);
  });

  it("enforces expectedSlug alignment when provided", () => {
    expect(validateArticleUrl(OK_URL, { expectedSlug: "deepseek-harness-desktop" }).ok).toBe(true);
    const bad = validateArticleUrl(OK_URL, { expectedSlug: "other-slug" });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toContain("other-slug");
  });
});

// ─── Stage 2: checkArticleUrlReachable (network, mocked) ───

describe("checkArticleUrlReachable (final delivery stage)", () => {
  it("normal 200 → ok", async () => {
    const fetchImpl = recordingFetch([{ status: 200 }]);
    const r = await checkArticleUrlReachable(OK_URL, { fetchImpl });
    expect(r.verdict).toBe("ok");
    expect(r.status).toBe(200);
  });

  it("404 → unreachable (definite application-level answer)", async () => {
    const fetchImpl = recordingFetch([{ status: 404 }]);
    const r = await checkArticleUrlReachable(OK_URL, { fetchImpl });
    expect(r.verdict).toBe("unreachable");
  });

  it("410 Gone (the incident's parking response) → unreachable", async () => {
    const fetchImpl = recordingFetch([{ status: 410 }]);
    const r = await checkArticleUrlReachable(OK_URL, { fetchImpl });
    expect(r.verdict).toBe("unreachable");
  });

  it("HEAD 405 → limited GET re-check; GET 200 → ok", async () => {
    const fetchImpl = recordingFetch([{ status: 405 }, { status: 200 }]);
    const r = await checkArticleUrlReachable(OK_URL, { fetchImpl });
    expect(r.verdict).toBe("ok");
    expect(fetchImpl.calls).toEqual(["HEAD", "GET"]);
  });

  it("HEAD 501 → limited GET re-check; GET 200 → ok", async () => {
    const fetchImpl = recordingFetch([{ status: 501 }, { status: 200 }]);
    const r = await checkArticleUrlReachable(OK_URL, { fetchImpl });
    expect(r.verdict).toBe("ok");
    expect(fetchImpl.calls).toEqual(["HEAD", "GET"]);
  });

  it("network failure (fetch throws with cause) → unknown, diagnosis carries e.cause", async () => {
    const cause = new Error("connect ECONNRESET 185.158.133.1:443");
    cause.code = "ECONNRESET";
    const err = new TypeError("fetch failed", { cause });
    const fetchImpl = recordingFetch([{ throws: err }]);
    const r = await checkArticleUrlReachable(OK_URL, { fetchImpl });
    expect(r.verdict).toBe("unknown");
    expect(r.diagnosis).toContain("ECONNRESET");
    expect(r.diagnosis).toContain("NOT verified");
  });

  it("timeout → unknown", async () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    const fetchImpl = recordingFetch([{ throws: err }]);
    const r = await checkArticleUrlReachable(OK_URL, { fetchImpl, timeoutMs: 50 });
    expect(r.verdict).toBe("unknown");
    expect(r.diagnosis).toContain("timed out");
  });

  it("429 and suspicious 403 → unknown (not a definite wrong-URL signal)", async () => {
    for (const status of [403, 429]) {
      const fetchImpl = recordingFetch([{ status }]);
      const r = await checkArticleUrlReachable(OK_URL, { fetchImpl });
      expect(r.verdict).toBe("unknown");
    }
  });

  it("5xx → unknown (server-side, possibly transient)", async () => {
    const fetchImpl = recordingFetch([{ status: 503 }]);
    const r = await checkArticleUrlReachable(OK_URL, { fetchImpl });
    expect(r.verdict).toBe("unknown");
  });

  it("cross-site redirect does not count as pass → unreachable", async () => {
    const fetchImpl = recordingFetch([{ status: 200, url: "https://evil.example.com/posts/x" }]);
    const r = await checkArticleUrlReachable(OK_URL, { fetchImpl });
    expect(r.verdict).toBe("unreachable");
    expect(r.reason).toContain("off-site");
  });

  it("same-origin redirect (trailing slash) stays ok", async () => {
    const fetchImpl = recordingFetch([{ status: 200, url: `${OK_URL}/` }]);
    const r = await checkArticleUrlReachable(OK_URL, { fetchImpl });
    expect(r.verdict).toBe("ok");
  });
});

// ─── Policy: resolveReadinessAction (user verdict 2026-10-19) ───

describe("resolveReadinessAction (分级处置)", () => {
  it("ok → pass", () => {
    expect(resolveReadinessAction("ok")).toBe("pass");
  });

  it("unreachable → block (fix the root cause: republish / correct slug)", () => {
    expect(resolveReadinessAction("unreachable")).toBe("block");
  });

  it("unknown → degrade (environment noise must not punish delivery)", () => {
    expect(resolveReadinessAction("unknown")).toBe("degrade");
  });
});

// ─── Degrade copy: stripArticleLinkPromise ───

describe("stripArticleLinkPromise", () => {
  it("drops the 'Full analysis: <url>' promise entirely (no dangling claim)", () => {
    const pinned =
      "DeepSeek shipped a new model today.\n\nFull analysis: https://chinaai.news/posts/x";
    expect(stripArticleLinkPromise(pinned)).toBe("DeepSeek shipped a new model today.");
  });

  it("leaves link-free comments untouched", () => {
    const pinned = "DeepSeek shipped a new model today.";
    expect(stripArticleLinkPromise(pinned)).toBe(pinned);
  });

  it("handles empty / non-string input", () => {
    expect(stripArticleLinkPromise("")).toBe("");
    expect(stripArticleLinkPromise(null)).toBe("");
  });
});

// ─── Orchestration: resolveArticleLinkReadiness ───

describe("resolveArticleLinkReadiness", () => {
  it("no URL surfaces at all (current default: articleUrl empty, no --slug) → pass, zero fetch", async () => {
    let called = 0;
    const fetchImpl = async () => {
      called += 1;
      return { ok: true, status: 200, url: OK_URL, redirected: false };
    };
    const r = await resolveArticleLinkReadiness({
      articleUrl: null,
      guideSlug: null,
      pinnedComment: "Hook only, no link.",
      fetchImpl,
    });
    expect(r.action).toBe("pass");
    expect(called).toBe(0);
    expect(r.pinnedComment).toBe("Hook only, no link.");
  });

  it("live URL → pass, pinned comment and guide slug untouched", async () => {
    const fetchImpl = recordingFetch([{ status: 200 }]);
    const pinned = "Hook.\n\nFull analysis: " + OK_URL;
    const r = await resolveArticleLinkReadiness({
      articleUrl: OK_URL,
      guideSlug: "deepseek-harness-desktop",
      pinnedComment: pinned,
      fetchImpl,
    });
    expect(r.action).toBe("pass");
    expect(r.pinnedComment).toBe(pinned);
    expect(r.guideSlug).toBe("deepseek-harness-desktop");
  });

  it("definitely unreachable URL (404) → block with url+status in the error", async () => {
    const fetchImpl = recordingFetch([{ status: 404 }]);
    const r = await resolveArticleLinkReadiness({
      articleUrl: OK_URL,
      guideSlug: "deepseek-harness-desktop",
      pinnedComment: "Hook.\n\nFull analysis: " + OK_URL,
      fetchImpl,
    });
    expect(r.action).toBe("block");
    expect(r.error).toContain("404");
    expect(r.error).toContain(OK_URL);
  });

  it("wrong-origin articleUrl (the incident shape) → block at shape stage, no fetch", async () => {
    let called = 0;
    const fetchImpl = async () => {
      called += 1;
      return { ok: true, status: 200, url: OK_URL, redirected: false };
    };
    const r = await resolveArticleLinkReadiness({
      articleUrl: "https://chinaainews.com/posts/deepseek-harness-desktop",
      guideSlug: null,
      pinnedComment: "Hook.\n\nFull analysis: https://chinaainews.com/posts/x",
      fetchImpl,
    });
    expect(r.action).toBe("block");
    expect(r.error).toContain("chinaai.news");
    expect(called).toBe(0);
  });

  it("network unknown → degrade: link stripped from pinned comment, guide loses its URL, warnings are loud", async () => {
    const cause = new Error("getaddrinfo ENOTFOUND chinaai.news");
    cause.code = "ENOTFOUND";
    const err = new TypeError("fetch failed", { cause });
    const fetchImpl = recordingFetch([{ throws: err }, { throws: err }]);
    const pinned = "Hook.\n\nFull analysis: " + OK_URL;
    const r = await resolveArticleLinkReadiness({
      articleUrl: OK_URL,
      guideSlug: "deepseek-harness-desktop",
      pinnedComment: pinned,
      fetchImpl,
    });
    expect(r.action).toBe("degrade");
    expect(r.pinnedComment).toBe("Hook.");
    expect(r.guideSlug).toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings.join("\n")).toContain("ENOTFOUND");
  });

  it("guide slug and pinned-comment slug disagree → block (packaging error, not a network unknown)", async () => {
    let called = 0;
    const fetchImpl = async () => {
      called += 1;
      return { ok: true, status: 200, url: OK_URL, redirected: false };
    };
    const r = await resolveArticleLinkReadiness({
      articleUrl: `${ARTICLE_SITE_ORIGIN}/posts/article-a`,
      guideSlug: "article-b",
      pinnedComment: "Hook.\n\nFull analysis: " + `${ARTICLE_SITE_ORIGIN}/posts/article-a`,
      fetchImpl,
    });
    expect(r.action).toBe("block");
    expect(r.error).toContain("mismatch");
    expect(called).toBe(0);
  });

  it("one unreachable + one unknown URL → block wins (definite beats inconclusive)", async () => {
    const cause = new Error("connect ECONNRESET");
    cause.code = "ECONNRESET";
    const err = new TypeError("fetch failed", { cause });
    const fetchImpl = recordingFetch([
      { status: 404 }, // guide URL — definitely not there
      { throws: err }, // comment URL — inconclusive
    ]);
    const r = await resolveArticleLinkReadiness({
      articleUrl: `${ARTICLE_SITE_ORIGIN}/posts/other-article`,
      guideSlug: "deepseek-harness-desktop",
      pinnedComment: "Hook.",
      fetchImpl,
    });
    expect(r.action).toBe("block");
  });

  it("guide-only surface (no articleUrl, --slug given): live → pass", async () => {
    const fetchImpl = recordingFetch([{ status: 200 }]);
    const r = await resolveArticleLinkReadiness({
      articleUrl: null,
      guideSlug: "deepseek-harness-desktop",
      pinnedComment: "",
      fetchImpl,
    });
    expect(r.action).toBe("pass");
    expect(r.guideSlug).toBe("deepseek-harness-desktop");
  });
});
