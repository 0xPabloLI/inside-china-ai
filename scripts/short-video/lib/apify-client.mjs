/**
 * Apify Client for TikTok Hashtag Research
 *
 * Lightweight JS client for Apify's run-sync-get-dataset-items endpoint.
 * Used by research-hashtags.mjs (CLI) for quarterly/triggered hashtag library
 * maintenance — NOT used in the per-video pipeline.
 *
 * Design decisions (review 2026-08-26):
 * - Endpoint: POST /v2/actors/:actorId/run-sync-get-dataset-items
 * - Actor ID: owner~actor-name format (e.g. clockworks~tiktok-scraper)
 * - Auth: Authorization: Bearer <token> (header, not query param)
 * - Timeout: configurable, default 180s (max 300s for sync endpoint)
 * - Cost guard: maxTotalChargeUsd parameter
 * - Caching: in-memory LRU with TTL (6h default)
 * - Retries: 3 attempts with exponential backoff on 429/5xx
 * - Default: dry-run/mock mode; remote requests require explicit opt-in
 *
 * Reference: docs/refs/tiktok-skills/lib/apify_client.py (Python original)
 * Review: docs/reviews/handoff-hashtag-pipeline-gaps-review-2026-08-26.md
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Constants ───

const API_BASE = "https://api.apify.com/v2";
const TIKTOK_SCRAPER = "clockworks~tiktok-scraper";
const SIGNUP_URL = "https://console.apify.com/account/integrations";
const DEFAULT_TIMEOUT_MS = 180_000; // 180s (sync endpoint max is 300s)
const MAX_TIMEOUT_MS = 300_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_CACHE_MAX = 256;

// ─── Error classes ───

export class ApifyError extends Error {
  constructor(message, { status = null, actor = null, context = null } = {}) {
    super(message);
    this.name = "ApifyError";
    this.status = status;
    this.actor = actor;
    this.context = context;
  }
}

export class ApifyAuthError extends ApifyError {
  constructor(message = null) {
    const msg =
      message ||
      `No APIFY_TOKEN configured. Get a free token at ${SIGNUP_URL}. ` +
        `Set it in .env.local as APIFY_TOKEN=your_token`;
    super(msg, { status: 401 });
    this.name = "ApifyAuthError";
  }
}

export class ApifyTimeoutError extends ApifyError {
  constructor(actor, timeoutMs) {
    super(`Actor ${actor} timed out after ${timeoutMs}ms (sync endpoint returns 408 at >300s)`, {
      status: 408,
      actor,
    });
    this.name = "ApifyTimeoutError";
  }
}

// ─── Token resolution ───

/**
 * Resolve APIFY_TOKEN from .env.local or environment variable.
 * Does NOT use process.env.APIFY_TOKEN directly in error messages.
 * @returns {string|null}
 */
function resolveToken() {
  // 1. Check process.env (set by caller or .env.local loader)
  if (process.env.APIFY_TOKEN) return process.env.APIFY_TOKEN;

  // 2. Try .env.local in project root
  const envLocalPath = join(__dirname, "..", "..", "..", ".env.local");
  if (existsSync(envLocalPath)) {
    const content = readFileSync(envLocalPath, "utf-8");
    const match = content.match(/^APIFY_TOKEN\s*=\s*(.+)$/m);
    if (match) {
      const token = match[1].trim().replace(/^["']|["']$/g, "");
      if (token) return token;
    }
  }

  return null;
}

// ─── Simple LRU cache ───

class LRUCache {
  constructor(maxEntries = DEFAULT_CACHE_MAX, ttlMs = DEFAULT_CACHE_TTL_MS) {
    this.max = maxEntries;
    this.ttl = ttlMs;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.time > this.ttl) {
      this.store.delete(key);
      return null;
    }
    // Move to end (most recently used)
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    this.store.set(key, { value, time: Date.now() });
    while (this.store.size > this.max) {
      const firstKey = this.store.keys().next().value;
      this.store.delete(firstKey);
    }
  }
}

// ─── Video normalization (aligned with Python _video()) ───

/**
 * Normalize a raw TikTok scraper dataset item into a consistent video object.
 * Aligned with Python reference: docs/refs/tiktok-skills/lib/apify_client.py _video()
 * @param {Object} v - Raw dataset item from clockworks~tiktok-scraper
 * @returns {Object|null} Normalized video or null if invalid
 */
export function normalizeVideo(v) {
  if (!v || typeof v !== "object" || !v.id) return null;
  const au = v.authorMeta || {};
  return {
    id: v.id,
    text: v.text || "",
    author: au.name || null,
    authorFollowers: au.fans || 0,
    plays: v.playCount || 0,
    likes: v.diggCount || 0,
    comments: v.commentCount || 0,
    shares: v.shareCount || 0,
    url: v.webVideoUrl || null,
    createdAt: v.createTimeISO || null,
    music: v.musicMeta?.musicName || null,
  };
}

// ─── Main client ───

/**
 * Create an Apify client instance.
 * @param {Object} [options]
 * @param {string} [options.token] - APIFY_TOKEN (if not provided, resolved from env/.env.local)
 * @param {number} [options.timeoutMs] - Request timeout (default 180000, max 300000)
 * @param {number} [options.maxRetries] - Max retry attempts (default 3)
 * @param {number} [options.cacheTtlMs] - Cache TTL in ms (default 21600000 = 6h)
 * @param {boolean} [options.dryRun] - If true, never make remote requests (default true)
 */
export function createApifyClient(options = {}) {
  const token = options.token !== undefined ? options.token || null : resolveToken();
  const timeoutMs = Math.min(options.timeoutMs || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const dryRun = options.dryRun ?? true;
  const cache = new LRUCache(DEFAULT_CACHE_MAX, options.cacheTtlMs || DEFAULT_CACHE_TTL_MS);

  /**
   * Require token or throw ApifyAuthError.
   * Token is never included in error messages.
   */
  function requireToken() {
    if (!token) throw new ApifyAuthError();
    return token;
  }

  /**
   * Build the full URL for an actor run.
   * Uses encodeURIComponent for the actor ID (contains ~).
   */
  function buildUrl(actorRef) {
    const encoded = encodeURIComponent(actorRef);
    return `${API_BASE}/actors/${encoded}/run-sync-get-dataset-items`;
  }

  /**
   * Run an Apify actor synchronously and get dataset items.
   *
   * @param {string} actorRef - Actor reference (e.g. "clockworks~tiktok-scraper")
   * @param {Object} input - Actor input payload
   * @param {Object} [callOptions]
   * @param {number} [callOptions.maxTotalChargeUsd] - Cost guard (default 0.10)
   * @param {boolean} [callOptions.forceRefresh] - Bypass cache (default false)
   * @returns {Promise<Object[]>} Array of dataset items
   */
  async function runActor(actorRef, input, callOptions = {}) {
    const costCap = callOptions.maxTotalChargeUsd ?? 0.1;

    // Check cache
    const cacheKey = `${actorRef}:${JSON.stringify(input)}`;
    if (!callOptions.forceRefresh) {
      const cached = cache.get(cacheKey);
      if (cached) return cached;
    }

    // Dry run mode — no remote request
    if (dryRun) {
      throw new ApifyError(
        `Dry-run mode active: remote request to ${actorRef} blocked. ` +
          `Set dryRun: false to enable remote calls.`,
        { actor: actorRef },
      );
    }

    // Require token (throws if missing)
    const authToken = requireToken();

    // Build request
    const url = buildUrl(actorRef);
    const payload = { ...input, maxTotalChargeUsd: costCap };

    // Retry loop
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 408) {
          throw new ApifyTimeoutError(actorRef, timeoutMs);
        }

        if (response.status >= 400) {
          const body = await response.text();
          // Sanitize error: never include token in message
          const err = new ApifyError(
            `Actor ${actorRef} returned ${response.status}: ${body.slice(0, 200)}`,
            { status: response.status, actor: actorRef },
          );

          if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxRetries) {
            throw err;
          }
          lastError = err;
        } else {
          const data = await response.json();
          if (!Array.isArray(data)) {
            throw new ApifyError(`Unexpected response shape: expected array, got ${typeof data}`, {
              actor: actorRef,
              context: "schema_error",
            });
          }
          cache.set(cacheKey, data);
          return data;
        }
      } catch (error) {
        if (error instanceof ApifyError || error instanceof ApifyAuthError) {
          throw error; // Don't retry auth/schema errors
        }

        if (error.name === "AbortError") {
          throw new ApifyTimeoutError(actorRef, timeoutMs);
        }

        // Network error
        const netErr = new ApifyError(`Network error: ${error.message}`, {
          status: 503,
          actor: actorRef,
        });

        if (attempt === maxRetries) {
          throw netErr;
        }
        lastError = netErr;
      }

      // Exponential backoff with jitter
      const delay = 600 * Math.pow(2, attempt) + Math.random() * 300;
      await new Promise((r) => setTimeout(r, delay));
    }

    throw lastError;
  }

  /**
   * Fetch normalized video samples for a hashtag.
   * Uses clockworks~tiktok-scraper with hashtags input.
   * @param {string} hashtag - Hashtag without # (e.g. "deepseek")
   * @param {Object} [options]
   * @param {number} [options.maxItems] - Max videos to fetch (default 20)
   * @param {number} [options.maxTotalChargeUsd] - Cost guard (default 0.10)
   * @param {boolean} [options.forceRefresh] - Bypass cache (default false)
   * @returns {Promise<Object[]>} Normalized video objects
   */
  async function fetchHashtagVideos(hashtag, options = {}) {
    const tag = hashtag.replace(/^#/, "").toLowerCase();
    const maxItems = options.maxItems ?? 20;
    const input = {
      hashtags: [tag],
      resultsPerPage: maxItems,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    };

    const raw = await runActor(TIKTOK_SCRAPER, input, options);
    return raw
      .filter((v) => typeof v === "object" && v.id)
      .map(normalizeVideo)
      .filter(Boolean);
  }

  return {
    runActor,
    fetchHashtagVideos,
    // Exposed for testing
    _resolveToken: resolveToken,
    _buildUrl: buildUrl,
    _cache: cache,
  };
}
