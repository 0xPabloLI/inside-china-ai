/**
 * Publish Article Utils — Frontmatter parsing, slug validation, and Supabase upsert.
 *
 * Extracted into a lib module for testability. The main publish-article.mjs
 * script imports these functions.
 */

import matter from "gray-matter";
import { execSync } from "child_process";

// ─── Slug helpers ───

/**
 * Convert a title to a URL slug.
 * Matches the slugify logic in admin.tsx:
 *   lowercase → trim → remove non-word/space/hyphen → replace spaces with hyphens → collapse hyphens → truncate to 80
 */
export function slugify(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/**
 * Validate that a slug matches the postInput schema regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
 */
export function validateSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

// ─── Frontmatter parsing ───

/**
 * Parse a frontmatter markdown file into article fields.
 *
 * @param {string} fileContent - Raw file content with YAML frontmatter + markdown body
 * @returns {{ title: string, slug: string, excerpt: string|null, content: string, published: boolean }}
 * @throws {Error} If no frontmatter or title is missing
 */
export function parseArticleFile(fileContent) {
  // Check for frontmatter presence
  if (!fileContent.trimStart().startsWith("---")) {
    throw new Error('Frontmatter is required. Start the file with:\n---\ntitle: "..."\n---');
  }

  const parsed = matter(fileContent);
  const fm = parsed.data || {};
  const content = (parsed.content ?? "").trim();

  // title is required
  if (!fm.title || typeof fm.title !== "string" || !fm.title.trim()) {
    throw new Error("title is required in frontmatter");
  }

  // slug: auto-generate from title if missing
  let slug = fm.slug;
  if (!slug) {
    slug = slugify(fm.title);
  }

  // Validate slug format
  if (!validateSlug(slug)) {
    throw new Error(
      `slug must match [a-z0-9-]+ pattern (got: "${slug}"). Use lowercase letters, numbers, and hyphens only.`,
    );
  }

  return {
    title: fm.title.trim(),
    slug,
    excerpt: fm.excerpt ? String(fm.excerpt).trim() : null,
    content,
    published: fm.published === true,
  };
}

// ─── Post payload builder ───

/**
 * Build the Supabase API payload for insert or update.
 *
 * @param {object} parsed - Output of parseArticleFile
 * @param {string} userId - Authenticated user's UUID
 * @param {object|null} existing - Existing post record (null if new)
 * @returns {{ mode: "insert"|"update", data: object, existingId?: string }}
 */
export function buildPostPayload(parsed, userId, existing) {
  const now = new Date().toISOString();

  if (!existing) {
    // INSERT
    return {
      mode: "insert",
      data: {
        author_id: userId,
        title: parsed.title,
        slug: parsed.slug,
        excerpt: parsed.excerpt,
        content: parsed.content,
        published: parsed.published,
        published_at: parsed.published ? now : null,
      },
    };
  }

  // UPDATE — preserve published_at (don't overwrite)
  // If existing.published_at is null and now publishing, set it
  let published_at = existing.published_at;
  if (parsed.published && !existing.published_at) {
    published_at = now;
  }

  return {
    mode: "update",
    existingId: existing.id,
    data: {
      title: parsed.title,
      slug: parsed.slug,
      excerpt: parsed.excerpt,
      content: parsed.content,
      published: parsed.published,
      published_at,
    },
  };
}

// ─── Supabase REST API upsert ───

function isNewSupabaseApiKey(value) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function buildHeaders(accessToken, supabaseKey) {
  const headers = {
    "Content-Type": "application/json",
    apikey: supabaseKey,
    Authorization: `Bearer ${accessToken}`,
    Prefer: "return=representation",
  };
  return headers;
}

// ─── Bounded retry & idempotent reconciliation (#426) ───

/**
 * Retry policy for `upsertPost` (overridable via `opts.retry` for tests).
 *
 * - maxAttempts:      attempts per HTTP operation (initial try + retries)
 * - maxTotalAttempts: global guard across query + write + reconcile requests
 * - totalBudgetMs:    wall-clock ceiling for the whole upsert, sleeps included
 */
const RETRY_POLICY_DEFAULTS = Object.freeze({
  maxAttempts: 4,
  maxTotalAttempts: 10,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  totalBudgetMs: 60000,
});

/** HTTP statuses worth retrying: request timeout, rate limit, transient 5xx. */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Socket-level error codes classified as transient resets/timeouts. */
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "TimeoutError",
]);

/**
 * Error raised by upsertPost with a sanitized diagnostic surface (#426).
 *
 * `context` carries only safe fields (stage/category/code/status/attempts).
 * The raw underlying error is deliberately NOT attached as `cause`: it can
 * embed request URLs, headers or tokens. Diagnostics go through
 * formatPublishError(), which prints the whitelisted context only.
 */
export class PublishError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "PublishError";
    this.context = {
      stage: context.stage ?? "unknown",
      category: context.category ?? "unknown",
      code: context.code ?? null,
      status: context.status ?? null,
      attempts: context.attempts ?? null,
      exhausted: context.exhausted ?? null,
    };
  }
}

/** Secret shapes that must never reach a log line, even from service messages. */
const SECRET_PATTERNS = [
  /sb_secret_[A-Za-z0-9_-]+/g,
  /sb_publishable_[A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];

function redactSecrets(text) {
  let out = String(text);
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, "[REDACTED]");
  return out;
}

/**
 * Extract a safe, displayable error code from a thrown error's cause chain.
 * Codes must be whitelist-shaped; anything else is dropped rather than echoed.
 */
function extractNetworkCode(err) {
  let current = err;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current.name === "TimeoutError") return "TimeoutError";
    const code = current.code;
    if (typeof code === "string" && /^[A-Za-z][A-Za-z0-9_]{1,39}$/.test(code)) return code;
    current = current.cause;
  }
  return null;
}

function isRetryableNetworkError(err) {
  const code = extractNetworkCode(err);
  return code !== null && RETRYABLE_NETWORK_CODES.has(code);
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUSES.has(status);
}

/** Service message, length-capped and secret-redacted (never details/hint). */
function safeServiceMessage(data, status) {
  const message =
    typeof data?.message === "string" && data.message.trim()
      ? data.message.trim().slice(0, 300)
      : `HTTP ${status}`;
  return redactSecrets(message);
}

function httpFailure(stage, status, data, extra = {}) {
  return new PublishError(`Supabase ${stage} failed: ${safeServiceMessage(data, status)}`, {
    stage,
    category: "http",
    status,
    ...extra,
  });
}

function networkFailure(stage, err, extra = {}) {
  return new PublishError(`Supabase ${stage} failed: network error`, {
    stage,
    category: "network",
    code: extractNetworkCode(err),
    ...extra,
  });
}

/**
 * Format any error for the CLI. Prints the message plus the sanitized context
 * only — never the raw cause, request headers/body or tokens (#426).
 */
export function formatPublishError(err) {
  const message = redactSecrets(err?.message ? String(err.message) : "Unknown error");
  if (!(err instanceof PublishError)) return message;
  const fields = [`stage=${err.context.stage}`];
  if (err.context.category) fields.push(`category=${err.context.category}`);
  if (err.context.code) fields.push(`code=${err.context.code}`);
  if (err.context.status !== null) fields.push(`status=${err.context.status}`);
  if (err.context.attempts !== null) fields.push(`attempt=${err.context.attempts}`);
  if (err.context.exhausted) fields.push(`exhausted=${err.context.exhausted}`);
  return `${message} [${fields.join(", ")}]`;
}

/**
 * Compare an intended write payload against a re-queried row. published_at is
 * compared by null-ness only (timestamp formatting is not stable across
 * reads); inserts verify the author, updates verify the row identity.
 */
function rowMatchesPayload(slug, payload, row) {
  const intended = payload.data;
  if (row.slug !== slug) return false;
  if (row.title !== intended.title) return false;
  if ((row.excerpt ?? null) !== (intended.excerpt ?? null)) return false;
  if (row.content !== intended.content) return false;
  if (Boolean(row.published) !== Boolean(intended.published)) return false;
  if (payload.mode === "insert" && row.author_id !== intended.author_id) return false;
  if (payload.mode === "update" && row.id !== payload.existingId) return false;
  return (row.published_at != null) === (intended.published_at != null);
}

/**
 * Upsert a post to Supabase by slug — idempotent, with bounded retry (#426).
 *
 * 1. Query the post by slug (retrying classified transient failures)
 * 2. If not found → INSERT; if found → UPDATE (preserve published_at)
 * 3. A failed write is never blindly replayed: the row is re-queried by slug
 *    and compared field-by-field against the intended payload.
 *      - row matches the intent → the write landed; return it (reconciled)
 *      - row absent             → replay only when the failure is retryable
 *      - insert + row exists with different content (incl. 409 UNIQUE) →
 *        converge through the normal update path against that row
 * 4. Only classified transient failures are retried (socket reset/timeout,
 *    408/429/500/502/503/504); everything else fails closed immediately with
 *    sanitized diagnostics. Attempts and total wall-clock budget are bounded.
 *
 * @param {object} parsed - Output of parseArticleFile
 * @param {{ access_token: string, user: { id: string } }} auth - Auth result
 * @param {string} supabaseUrl - Supabase project URL
 * @param {string} supabaseKey - Supabase publishable/anon key
 * @param {object} [opts] - Test seams: { fetchFn, sleep, now, retry }
 * @returns {Promise<{ id: string, slug: string, mode: "insert"|"update", reconciled?: boolean }>}
 */
export async function upsertPost(parsed, auth, supabaseUrl, supabaseKey, opts = {}) {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = opts.now ?? (() => Date.now());
  const policy = { ...RETRY_POLICY_DEFAULTS, ...(opts.retry ?? {}) };
  const deadline = now() + policy.totalBudgetMs;
  const headers = buildHeaders(auth.access_token, supabaseKey);

  const select = "id,slug,title,excerpt,content,published,published_at,author_id";
  const queryUrl = `${supabaseUrl}/rest/v1/posts?slug=eq.${encodeURIComponent(parsed.slug)}&select=${select}`;

  let totalAttempts = 0;

  /** Charge one network attempt against the global guard. */
  function charge(stage) {
    totalAttempts += 1;
    if (totalAttempts > policy.maxTotalAttempts) {
      throw new PublishError(`Supabase ${stage} failed: total attempt budget exhausted`, {
        stage,
        category: "budget",
        attempts: totalAttempts,
        exhausted: "total-attempts",
      });
    }
    if (now() >= deadline) {
      throw new PublishError(`Supabase ${stage} failed: retry time budget exhausted`, {
        stage,
        category: "budget",
        attempts: totalAttempts,
        exhausted: "budget",
      });
    }
  }

  function backoffDelay(retryIndex) {
    return Math.min(policy.baseDelayMs * 2 ** (retryIndex - 1), policy.maxDelayMs);
  }

  /** Sleep inside the remaining wall-clock budget; a delay that cannot fit fails closed. */
  async function sleepWithinBudget(ms, stage, attempts) {
    if (ms > deadline - now()) {
      throw new PublishError(`Supabase ${stage} failed: retry time budget exhausted`, {
        stage,
        category: "budget",
        attempts,
        exhausted: "budget",
      });
    }
    await sleep(ms);
  }

  /** Back off before the next attempt; non-retryable or exhausted failures throw. */
  async function backoffOrThrow(stage, err, attempt) {
    if (!isRetryableNetworkError(err)) {
      throw networkFailure(stage, err, { attempts: attempt });
    }
    if (attempt >= policy.maxAttempts) {
      throw networkFailure(stage, err, { attempts: attempt, exhausted: "attempts" });
    }
    await sleepWithinBudget(backoffDelay(attempt), stage, attempt);
  }

  /** Same contract for retryable HTTP statuses (408/429/5xx). */
  async function backoffOrThrowStatus(stage, status, data, attempt) {
    if (attempt >= policy.maxAttempts) {
      throw httpFailure(stage, status, data, { attempts: attempt, exhausted: "attempts" });
    }
    await sleepWithinBudget(backoffDelay(attempt), stage, attempt);
  }

  /** GET the post by slug, retrying classified transient failures. */
  async function queryBySlug(stage) {
    for (let attempt = 1; ; attempt += 1) {
      charge(stage);

      let resp;
      try {
        resp = await fetchFn(queryUrl, { headers });
      } catch (err) {
        await backoffOrThrow(stage, err, attempt);
        continue;
      }

      let data = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      if (resp.ok) {
        if (!Array.isArray(data)) {
          throw new PublishError("Supabase query failed: unexpected response shape", {
            stage,
            category: "invalid-response",
            status: resp.status,
            attempts: attempt,
          });
        }
        return data.length > 0 ? data[0] : null;
      }

      if (isRetryableStatus(resp.status)) {
        await backoffOrThrowStatus(stage, resp.status, data, attempt);
        continue;
      }

      throw httpFailure(stage, resp.status, data, { attempts: attempt });
    }
  }

  /**
   * Verify whether `payload` reached the database after a failed or ambiguous
   * write. Returns one of:
   *   { kind: "done",   result }   — the intended state is on the row
   *   { kind: "replay", payload }  — no matching row; caller may replay
   *   { kind: "update", payload }  — insert collided; converge via update
   */
  async function reconcile(payload) {
    let row;
    try {
      row = await queryBySlug("reconcile");
    } catch (err) {
      if (err instanceof PublishError) {
        throw new PublishError(
          `${err.message} (while verifying the ${payload.mode} outcome)`,
          err.context,
        );
      }
      throw err;
    }

    if (!row) return { kind: "replay", payload };

    if (rowMatchesPayload(parsed.slug, payload, row)) {
      return {
        kind: "done",
        result: { id: row.id, slug: row.slug ?? parsed.slug, mode: payload.mode, reconciled: true },
      };
    }

    if (payload.mode === "insert") {
      // The slug exists but not with the intended state (concurrent writer or
      // a stale row). Converge through the normal update path — same semantics
      // as if the initial query had found it.
      return { kind: "update", payload: buildPostPayload(parsed, auth.user.id, row) };
    }

    // Update that did not land: re-target the fresh identity if the original
    // row was replaced, otherwise replay against the same id.
    return {
      kind: "replay",
      payload:
        row.id === payload.existingId ? payload : buildPostPayload(parsed, auth.user.id, row),
    };
  }

  let payload = buildPostPayload(parsed, auth.user.id, await queryBySlug("query"));
  let writeAttempts = 0;

  for (;;) {
    writeAttempts += 1;
    charge(payload.mode);

    const url =
      payload.mode === "insert"
        ? `${supabaseUrl}/rest/v1/posts`
        : `${supabaseUrl}/rest/v1/posts?id=eq.${payload.existingId}`;
    const init = {
      method: payload.mode === "insert" ? "POST" : "PATCH",
      headers,
      body: JSON.stringify(payload.data),
    };

    let resp = null;
    let data = null;
    let failure = null;
    try {
      resp = await fetchFn(url, init);
      try {
        data = await resp.json();
      } catch {
        data = null;
      }
    } catch (err) {
      failure = err;
    }

    if (failure) {
      // The write may or may not have committed — reconcile before anything else.
      const outcome = await reconcile(payload);
      if (outcome.kind === "done") return outcome.result;
      payload = outcome.payload; // replay/update may carry a re-targeted payload
      if (outcome.kind === "update") continue;
      await backoffOrThrow(payload.mode, failure, writeAttempts);
      continue;
    }

    if (resp.ok) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row && row.id) {
        return { id: row.id, slug: row.slug ?? parsed.slug, mode: payload.mode };
      }
      // 2xx without a representation — confirm by slug before claiming success.
      const outcome = await reconcile(payload);
      if (outcome.kind === "done") return outcome.result;
      if (outcome.kind === "update") {
        payload = outcome.payload;
        continue;
      }
      if (payload.mode === "update" && outcome.payload.existingId !== payload.existingId) {
        // The row was replaced mid-write (reconcile re-targeted it): replay
        // against the fresh identity instead of failing on the stale one.
        payload = outcome.payload;
        continue;
      }
      throw new PublishError(
        `Supabase ${payload.mode} failed: no row returned for slug "${parsed.slug}"`,
        {
          stage: payload.mode,
          category: "invalid-response",
          status: resp.status,
          attempts: writeAttempts,
        },
      );
    }

    if (payload.mode === "insert" && resp.status === 409) {
      // slug UNIQUE conflict — never a transient retry: either our own write
      // landed (reconcile → success) or the row holds someone else's state,
      // in which case converge through the update path.
      const outcome = await reconcile(payload);
      if (outcome.kind === "done") return outcome.result;
      if (outcome.kind === "update") {
        payload = outcome.payload;
        continue;
      }
      throw new PublishError(
        `${httpFailure("insert", resp.status, data).message}; re-query found no matching row`,
        { stage: "insert", category: "conflict", status: 409, attempts: writeAttempts },
      );
    }

    if (isRetryableStatus(resp.status)) {
      const outcome = await reconcile(payload);
      if (outcome.kind === "done") return outcome.result;
      payload = outcome.payload; // replay/update may carry a re-targeted payload
      if (outcome.kind === "update") continue;
      await backoffOrThrowStatus(payload.mode, resp.status, data, writeAttempts);
      continue;
    }

    throw httpFailure(payload.mode, resp.status, data, { attempts: writeAttempts });
  }
}

// ─── RAG Reindex Trigger (Scenario #2) ───

/**
 * Trigger RAG reindex after successful article publish.
 *
 * Default: incremental — only embeds chunks whose text hash changed.
 * Pass { full: true } in options for a full rebuild.
 *
 * Non-blocking: if index.mjs fails, the publish still succeeds.
 * Spec: docs/archive/spec-rag.md §4.6
 *
 * @param {string} projectRoot — Absolute path to project root
 * @param {Object} [options={}] — Options { full: boolean }
 * @param {Function} [execFn=execSync] — Exec function (injectable for testing)
 */
export function triggerRagReindex(projectRoot, options = {}, execFn = execSync) {
  // Support old signature: triggerRagReindex(projectRoot, execFn)
  if (typeof options === "function") {
    execFn = options;
    options = {};
  }

  const fullFlag = options.full ? " --full" : "";
  console.log("  📚 Triggering RAG reindex (incremental)...");
  try {
    execFn(`node scripts/rag/index.mjs${fullFlag}`, {
      stdio: "inherit",
      cwd: projectRoot,
    });
    console.log("  ✅ RAG reindex complete");
  } catch (err) {
    console.warn("  ⚠️  RAG reindex failed (non-blocking):", err.message);
    console.warn("     Run manually: node scripts/rag/index.mjs");
  }
}
