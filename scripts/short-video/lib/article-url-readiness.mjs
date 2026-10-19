/**
 * Article URL readiness seam (#429).
 *
 * One question, two stages — "will the article link we are about to publish
 * actually serve the article?":
 *
 *   1. Package/draft stage (pure, no network): `validateArticleUrl` checks
 *      scheme, origin and the /posts/<slug> shape. A draft article may 404
 *      legitimately (docs/content-pipeline.md Stage 2b saves drafts that are
 *      not public yet), so no liveness is required here — but the 2026-09-30
 *      incident (chinaainews.com parked → 410 Gone written into a pinned
 *      comment) was a wrong-ORIGIN URL, which shape alone catches.
 *   2. Final delivery stage (network): `checkArticleUrlReachable` HEADs the
 *      URL, re-checks with a limited GET on 405/501, and classifies the
 *      result ok / unreachable / unknown. `resolveArticleLinkReadiness` runs
 *      every consumer surface (manual publish guide URL + pinned comment)
 *      through the check and applies the user-adjudicated policy
 *      (2026-10-19, 分级处置):
 *        - unreachable (404/410/off-site redirect) → BLOCK: the content is
 *          wrong; fix the root cause (republish the article / correct the
 *          slug) and re-run.
 *        - unknown (reset/timeout/TLS/429/suspicious 403/5xx) → DEGRADE:
 *          strip the link and warn loudly — environment noise must not
 *          punish delivery, but an unverified link must never ship.
 *
 * Pure builders (caption-utils.derivePinnedComment,
 * generate-publish-package.buildPublishPackage) stay pure: they only run the
 * stage-1 shape check; every network effect lives here and is injected by
 * the CLI consumer (publish-tiktok.mjs).
 */

/** The one live origin of this site (Lovable custom domain; #434). */
export const ARTICLE_SITE_ORIGIN = "https://chinaai.news";

const ARTICLE_PATH_RE = /^\/posts\/([^/?#]+)\/?$/;

/** Statuses that are inconclusive rather than a definite wrong-URL signal. */
const UNKNOWN_STATUSES = new Set([401, 403, 429, 500, 502, 503, 504]);

/**
 * Stage 1 — shape validation. No network, safe at package/draft time.
 *
 * @param {string} url
 * @param {{ expectedSlug?: string|null }} [options]
 * @returns {{ ok: true, slug: string } | { ok: false, reason: string }}
 */
export function validateArticleUrl(url, { expectedSlug = null } = {}) {
  if (typeof url !== "string" || url.trim() === "") {
    return { ok: false, reason: "articleUrl is empty" };
  }
  const trimmed = url.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: `articleUrl is not a valid URL: ${trimmed.slice(0, 80)}` };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: `articleUrl must be https (got ${parsed.protocol})` };
  }
  if (parsed.origin !== ARTICLE_SITE_ORIGIN) {
    return {
      ok: false,
      reason: `articleUrl origin must be ${ARTICLE_SITE_ORIGIN} (got ${parsed.origin})`,
    };
  }
  const match = ARTICLE_PATH_RE.exec(parsed.pathname);
  if (!match) {
    return { ok: false, reason: `articleUrl path must be /posts/<slug> (got ${parsed.pathname})` };
  }
  const slug = decodeURIComponent(match[1]);
  if (expectedSlug && slug !== expectedSlug) {
    return {
      ok: false,
      reason: `articleUrl slug "${slug}" does not match expected slug "${expectedSlug}"`,
    };
  }
  return { ok: true, slug };
}

function classifyStatus(status) {
  if (status >= 200 && status < 300) return "ok";
  if (UNKNOWN_STATUSES.has(status)) return "unknown";
  if (status >= 400) return "unreachable";
  // 1xx/3xx finals are not expected with redirect:"follow" — inconclusive.
  return "unknown";
}

function truncateUrl(url) {
  return String(url).slice(0, 120);
}

/**
 * Human diagnosis for an inconclusive (unknown) result. A single fetch
 * failure cannot reliably assert "site down" vs "local egress broken"
 * (2026-09-30 lesson: both were misdiagnosed before DoH cross-checks), so
 * the wording stays honest about that and carries e.cause for forensics.
 */
function describeNetworkError(e, url, timeoutMs) {
  const cause = e?.cause;
  const causeCode = cause?.code ?? null;
  const causeMessage =
    cause instanceof Error ? cause.message : typeof cause === "string" ? cause : null;
  const parts = [];
  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    parts.push(`timed out after ${timeoutMs}ms`);
  } else {
    parts.push(e?.message ? String(e.message) : "unknown fetch failure");
  }
  if (causeCode) parts.push(`cause=${causeCode}`);
  else if (causeMessage) parts.push(`cause=${causeMessage}`);
  return (
    `${parts.join(", ")} [url=${truncateUrl(url)}] — inconclusive: this could be ` +
    `site-side or local-egress; the link was NOT verified`
  );
}

/**
 * Stage 2 — reachability with verdict classification.
 *
 * HEAD first; 405/501 (HEAD not implemented) triggers one limited GET
 * re-check. Redirects are followed, but a final URL that left our origin
 * does not count as a pass.
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{verdict: "ok"|"unreachable"|"unknown", status: number|null, reason: string|null, diagnosis: string|null}>}
 */
export async function checkArticleUrlReachable(url, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const attempt = async (method) => {
    const res = await fetchImpl(url, {
      method,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    return res;
  };

  let res;
  try {
    res = await attempt("HEAD");
    if (res.status === 405 || res.status === 501) {
      res = await attempt("GET");
    }
  } catch (e) {
    return {
      verdict: "unknown",
      status: null,
      reason: "network error",
      diagnosis: describeNetworkError(e, url, timeoutMs),
    };
  }

  const finalUrl = typeof res.url === "string" && res.url ? res.url : String(url);
  let finalOrigin = null;
  try {
    finalOrigin = new URL(finalUrl).origin;
  } catch {
    finalOrigin = null;
  }
  if (finalOrigin && finalOrigin !== ARTICLE_SITE_ORIGIN) {
    return {
      verdict: "unreachable",
      status: res.status,
      reason: "redirects off-site",
      diagnosis: `final URL left our origin: ${truncateUrl(finalUrl)} [url=${truncateUrl(url)}]`,
    };
  }

  const verdict = classifyStatus(res.status);
  if (verdict === "ok") {
    return { verdict: "ok", status: res.status, reason: null, diagnosis: null };
  }
  if (verdict === "unknown") {
    return {
      verdict: "unknown",
      status: res.status,
      reason: `HTTP ${res.status}`,
      diagnosis:
        `server answered HTTP ${res.status} [url=${truncateUrl(url)}] — inconclusive: ` +
        `not a definite wrong-URL signal; the link was NOT verified`,
    };
  }
  return {
    verdict: "unreachable",
    status: res.status,
    reason: `HTTP ${res.status}`,
    diagnosis: `server answered HTTP ${res.status} [url=${truncateUrl(url)}] — the URL does not serve the article`,
  };
}

/**
 * Policy mapping — user verdict 2026-10-19 (分级处置).
 * ok → pass · unreachable → block · unknown → degrade.
 */
export function resolveReadinessAction(verdict) {
  if (verdict === "unreachable") return "block";
  if (verdict === "unknown") return "degrade";
  return "pass";
}

/**
 * Degrade copy: drop the "Full analysis: <url>" promise that
 * derivePinnedComment appends. The whole promise goes — a dangling
 * "full article in the pinned comment" claim with no link is the exact
 * inconsistency the review forbids (contract 4).
 */
export function stripArticleLinkPromise(pinnedComment) {
  if (typeof pinnedComment !== "string") return "";
  return pinnedComment.replace(/\n\nFull analysis: \S+\s*$/, "").trimEnd();
}

/**
 * Resolve every article-link surface of a publish run through the seam and
 * apply the policy. Surfaces:
 *   - the manual publish guide URL (built from --slug; never fabricated)
 *   - the pinned comment URL (scene-data metadata.articleUrl)
 *
 * @param {object} opts
 * @param {string|null} [opts.articleUrl] scene-data metadata.articleUrl
 * @param {string|null} [opts.guideSlug] --slug passed to publish-tiktok.mjs
 * @param {string} [opts.pinnedComment] current pinned comment text
 * @param {typeof fetch} [opts.fetchImpl] injected fetch (tests)
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{action: "pass"|"block"|"degrade", guideSlug: string|null, pinnedComment: string, warnings: string[], error: string|null, checks: object[]}>}
 */
export async function resolveArticleLinkReadiness({
  articleUrl = null,
  guideSlug = null,
  pinnedComment = "",
  fetchImpl = fetch,
  timeoutMs,
} = {}) {
  const commentUrl = typeof articleUrl === "string" && articleUrl.trim() ? articleUrl.trim() : null;
  const guideUrl = guideSlug
    ? `${ARTICLE_SITE_ORIGIN}/posts/${encodeURIComponent(guideSlug)}`
    : null;

  // Cross-surface consistency: the guide and the pinned comment pointing at
  // different articles is a definite packaging error — block, do not probe.
  if (guideUrl && commentUrl) {
    const guideShape = validateArticleUrl(guideUrl);
    const commentShape = validateArticleUrl(commentUrl);
    if (guideShape.ok && commentShape.ok && guideShape.slug !== commentShape.slug) {
      return {
        action: "block",
        guideSlug,
        pinnedComment,
        warnings: [],
        error:
          `article link mismatch: manual guide slug "${guideShape.slug}" vs pinned ` +
          `comment URL slug "${commentShape.slug}" — fix one of them, then re-run`,
        checks: [],
      };
    }
  }

  const urls = [...new Set([guideUrl, commentUrl].filter(Boolean))];
  if (urls.length === 0) {
    return {
      action: "pass",
      guideSlug,
      pinnedComment,
      warnings: [],
      error: null,
      checks: [],
    };
  }

  const checks = [];
  for (const url of urls) {
    const shape = validateArticleUrl(url);
    if (!shape.ok) {
      checks.push({
        url,
        verdict: "unreachable",
        status: null,
        reason: shape.reason,
        diagnosis: null,
      });
      continue;
    }
    const result = await checkArticleUrlReachable(url, { fetchImpl, timeoutMs });
    checks.push({ url, ...result });
  }

  const action = resolveReadinessAction(
    checks.some((c) => c.verdict === "unreachable")
      ? "unreachable"
      : checks.some((c) => c.verdict === "unknown")
        ? "unknown"
        : "ok",
  );

  if (action === "block") {
    const bad = checks.find((c) => c.verdict === "unreachable");
    const detail = bad.diagnosis ? ` — ${bad.diagnosis}` : "";
    return {
      action: "block",
      guideSlug,
      pinnedComment,
      warnings: [],
      error: `article link is not servable: ${bad.reason}${detail}`,
      checks,
    };
  }

  if (action === "degrade") {
    const degraded = stripArticleLinkPromise(pinnedComment);
    const unknownCheck = checks.find((c) => c.verdict === "unknown");
    const warnings = [];
    if (degraded !== pinnedComment) {
      warnings.push("pinned comment link removed — the article URL could not be verified");
    }
    warnings.push(
      `article URL check inconclusive: ${unknownCheck.diagnosis ?? unknownCheck.reason}`,
    );
    warnings.push("verify the link manually before posting, or re-run once the network is stable");
    return {
      action: "degrade",
      guideSlug: null,
      pinnedComment: degraded,
      warnings,
      error: null,
      checks,
    };
  }

  return { action: "pass", guideSlug, pinnedComment, warnings: [], error: null, checks };
}
