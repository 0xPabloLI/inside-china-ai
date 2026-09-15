/**
 * Structured logger for pipeline scripts.
 *
 * Why: the pipeline is driven by agents and cron, and its logs used to be
 * free-form console.error lines — impossible to filter programmatically and
 * unsafe around credentials (API keys arrive via env, emails flow through
 * the newsletter path; see docs/conventions/data-handling.md rule 2).
 *
 * Behavior:
 * - Writes JSON lines to stderr (stdout stays reserved for command output).
 * - LOG_FORMAT=text gives human-readable single lines for interactive runs;
 *   JSON is the default so callers (CI, agents) can parse reliably.
 * - Every field value passes through redact() before formatting: sensitive
 *   keys are dropped and string values matching secret/PII patterns are
 *   masked. Scrubbing is centralized here so call sites can't forget it.
 *
 * Usage:
 *   import { createLogger } from "./lib/logger.mjs";
 *   const log = createLogger("publish-tiktok");
 *   log.info("uploaded", { contentId, attempts: 2 });
 *   const log2 = log.child({ contentId });
 */

const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "authorization",
  "password",
  "secret",
  "secret_key",
  "access_token",
  "refresh_token",
  "token",
]);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

/** Mask anything secret-looking inside a string. */
export function redactString(value) {
  return value.replace(BEARER_RE, "Bearer [REDACTED]").replace(EMAIL_RE, (email) => {
    const [local, domain] = email.split("@");
    return `${local[0]}***@${domain}`;
  });
}

/**
 * Deep-copy `value` with sensitive keys removed and secret-looking strings
 * masked. Arrays and nested objects are traversed; primitives are returned
 * masked if they are strings. Cycles are not supported (log fields must be
 * plain data — a thrown TypeError here is better than an infinite loop).
 */
export function redact(value) {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item));
  const out = {};
  for (const [key, field] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
    out[key] = redact(field);
  }
  return out;
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveLevel(envLevel) {
  const level = (envLevel ?? "").toLowerCase();
  return level in LEVELS ? LEVELS[level] : LEVELS.info;
}

function resolveFormat(envFormat) {
  return (envFormat ?? "").toLowerCase() === "text" ? "text" : "json";
}

export function createLogger(name, bindings = {}) {
  const bindingsRedacted = redact(bindings);
  let threshold = resolveLevel(process.env.LOG_LEVEL);
  let format = resolveFormat(process.env.LOG_FORMAT);
  let stream = process.stderr;

  function emit(level, message, fields) {
    if (LEVELS[level] < threshold) return;
    const safeMessage = redactString(message);
    const record = {
      ts: new Date().toISOString(),
      level,
      name,
      ...bindingsRedacted,
      ...redact(fields ?? {}),
    };
    if (format === "json") {
      stream.write(`${JSON.stringify({ message: safeMessage, ...record })}\n`);
    } else {
      const context = Object.entries(record)
        .filter(([k]) => !["ts", "level", "name", "message"].includes(k))
        .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(" ");
      stream.write(
        `${record.ts} ${level.toUpperCase().padEnd(5)} ${name}: ${safeMessage}${context ? ` ${context}` : ""}\n`,
      );
    }
  }

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
    child(extraBindings) {
      const child = createLogger(name, { ...bindings, ...extraBindings });
      child.setStream(stream);
      child.setLevel(threshold);
      return child;
    },
    /** Test/programmatic seam: route output away from stderr. */
    setStream(s) {
      stream = s;
    },
    /** Test/programmatic seam: override the threshold by level name or number. */
    setLevel(levelOrName) {
      if (typeof levelOrName === "number") {
        if (LEVELS.debug <= levelOrName && levelOrName <= LEVELS.error) {
          threshold = levelOrName;
        }
        return;
      }
      threshold = LEVELS[levelOrName] ?? threshold;
    },
    setFormat(f) {
      format = resolveFormat(f);
    },
  };
}
