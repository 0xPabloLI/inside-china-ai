#!/usr/bin/env node
/**
 * Recapture the wire fixtures used by
 * `__tests__/source-contract-fixtures.test.mjs` (#778).
 *
 * Calls each source the same way production does and writes
 * `__tests__/fixtures/source-contracts/<name>.json`. Entries keep all of their
 * fields and values — nothing is hand-authored — so a fixture can disprove
 * (not just confirm) our assumptions. Every top-level array is trimmed to its
 * first two entries and the file is stored minified, which keeps each fixture
 * under the 10 KB budget from the #778 triage proposal without dropping any
 * entry field. Only credentials/PII are redacted: DuckDuckGo's ephemeral
 * anti-bot tokens, Coverr's legacy `userToken`, and email addresses
 * (contributor/author bios).
 *
 * Not part of CI: network + API keys live only on the operator machine.
 *
 * Usage:
 *   ENV_FILE=/path/to/inside-china-ai/.env.local node scripts/short-video/probe-source-contracts.mjs
 *   # SearXNG fixture needs the local instance: npm run searxng:ensure
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./lib/load-env.mjs";
import { extractVqd } from "./lib/progressive-search.mjs";
import { STOCK_MEDIA_SOURCES } from "./lib/source-registry.mjs";
import { YTDLP_BROWSER_UA } from "./lib/ytdlp-guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "__tests__", "fixtures", "source-contracts");
const KEYWORD = "artificial intelligence robot";

loadEnv(process.env.ENV_FILE);
const env = process.env;

/**
 * Run curl and surface a sanitized failure. `execFileSync`'s error message
 * embeds the full argv, including API keys in headers or the Pixabay URL, so
 * only the exit status and curl's own stderr may leave this function.
 */
function curlText(args) {
  try {
    return execFileSync(
      "curl",
      ["-sS", "--fail", "--compressed", "--max-time", "45", "-L", ...args],
      {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      },
    );
  } catch (e) {
    throw new Error(`curl exited ${e.status ?? "by signal"}: ${(e.stderr || "").trim()}`);
  }
}

function curlJson(args) {
  return JSON.parse(curlText(args));
}

function headers(map) {
  return Object.entries(map).flatMap(([k, v]) => ["-H", `${k}: ${v}`]);
}

function getJson(url, headerMap = {}) {
  return curlJson([...headers(headerMap), url]);
}

function postJson(url, headerMap, payload) {
  return curlJson([...headers(headerMap), "-X", "POST", "-d", JSON.stringify(payload), url]);
}

/**
 * Build the request exactly as production does: the registry owns the URL,
 * auth header and API-key env name (SSOT, #344). Tavily and DuckDuckGo are not
 * registry capabilities and keep their explicit request builders below.
 */
function captureApi(name, kind, options) {
  const cap = STOCK_MEDIA_SOURCES.find((s) => s.name === name)?.capabilities?.[kind];
  if (!cap?.searchUrl) throw new Error(`no ${kind} API capability for ${name}`);
  const key = cap.apiKeyEnv ? env[cap.apiKeyEnv] : null;
  const headerMap = { Accept: "application/json" };
  if (cap.authHeader) headerMap[cap.authHeader] = cap.authValue ? cap.authValue(key) : key;
  if (cap.userAgent) headerMap["User-Agent"] = cap.userAgent;
  return getJson(cap.searchUrl(KEYWORD, key, options), headerMap);
}

/** Keep the first two entries of the container; every field stays untouched. */
function firstTwo(body, path) {
  let node = body;
  for (const key of path) node = node?.[key];
  if (!Array.isArray(node)) throw new Error(`container "${path.join(".")}" is not an array`);
  node.splice(2);
  return body;
}

/**
 * Trim every top-level array to two entries too (e.g. Tavily's web `results`,
 * DuckDuckGo's `query_expansions`). Keeps the wire shape of each entry while
 * holding each fixture under the ticket's 10 KB budget.
 */
function trimTopLevelArrays(body) {
  for (const value of Object.values(body)) {
    if (Array.isArray(value)) value.splice(2);
  }
  return body;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Redact PII (emails in author bios etc.) recursively; field shape survives. */
function redactEmails(value) {
  if (typeof value === "string") return value.replace(EMAIL, "<redacted>");
  if (Array.isArray(value)) return value.map(redactEmails);
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) value[key] = redactEmails(value[key]);
  }
  return value;
}

function write(name, body, path) {
  const trimmed = trimTopLevelArrays(redactEmails(firstTwo(structuredClone(body), path)));
  const entries = path.reduce((node, key) => node?.[key], trimmed);
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("captured container is empty (challenge page or blocked search)");
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${name}.json`);
  // Minified: the fixture is loaded by tests, never read by hand; keeping it
  // compact holds the 10 KB/file budget from the #778 triage proposal.
  writeFileSync(file, `${JSON.stringify(trimmed)}\n`);
  const bytes = readFileSync(file).length;
  console.log(`${name}: ${entries.length} entries, ${bytes} bytes`);
  if (bytes > 10 * 1024) console.warn(`${name}: fixture exceeds the 10 KB budget (${bytes} bytes)`);
}

function captureDuckDuckGo() {
  const headerMap = {
    "User-Agent": YTDLP_BROWSER_UA,
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  const landing = curlText([
    ...headers(headerMap),
    `https://duckduckgo.com/?q=${encodeURIComponent(KEYWORD)}&iax=images&ia=images`,
  ]);
  const vqd = extractVqd(landing);
  if (!vqd) throw new Error("no vqd token on the landing page");
  const body = getJson(
    `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(KEYWORD)}&vqd=${vqd}&f=,,,&p=1`,
    { ...headerMap, Referer: "https://duckduckgo.com/" },
  );
  // Credential hygiene: vqd / image_token / thumbnail_token are ephemeral
  // anti-bot tokens (the secret scanner flags the hashes). They are not
  // contract fields; every content field stays verbatim.
  delete body.vqd;
  for (const entry of body.results ?? []) {
    delete entry.image_token;
    delete entry.thumbnail_token;
  }
  return body;
}

/**
 * Coverr echoes the request query string in `params`, including the legacy
 * `userToken`. That is a credential, not a contract field; redact it in place
 * so the field shape survives. Contributor emails are handled by the generic
 * `redactEmails` pass.
 */
function sanitizeCoverr(body) {
  if (typeof body.params === "string") {
    body.params = body.params.replace(/(userToken=)[^&]+/, "$1<redacted>");
  }
  return body;
}

const JOBS = [
  {
    name: "pexels-images",
    path: ["photos"],
    capture: () => captureApi("pexels", "images"),
  },
  {
    name: "pexels-video",
    path: ["videos"],
    capture: () => captureApi("pexels-video", "videos"),
  },
  {
    name: "unsplash",
    path: ["results"],
    capture: () => captureApi("unsplash", "images"),
  },
  {
    name: "pixabay-images",
    path: ["hits"],
    capture: () => captureApi("pixabay", "images"),
  },
  {
    name: "wikimedia",
    path: ["query", "search"],
    capture: () => captureApi("wikimedia", "images"),
  },
  {
    name: "coverr",
    path: ["hits"],
    capture: () => sanitizeCoverr(captureApi("coverr", "videos")),
  },
  {
    name: "brave-image",
    path: ["results"],
    capture: () => captureApi("brave_image", "images", { count: 20 }),
  },
  {
    name: "searxng-image",
    path: ["results"],
    capture: () => captureApi("searxng_image", "images", { baseUrl: env.SEARXNG_BASE_URL }),
  },
  {
    name: "tavily-images",
    path: ["images"],
    capture: () =>
      postJson(
        "https://api.tavily.com/search",
        { Authorization: `Bearer ${env.TAVILY_API_KEY}`, "Content-Type": "application/json" },
        { query: KEYWORD, max_results: 20, include_images: true },
      ),
  },
  {
    name: "duckduckgo-images",
    path: ["results"],
    capture: captureDuckDuckGo,
  },
];

let failed = 0;
for (const job of JOBS) {
  try {
    write(job.name, job.capture(), job.path);
  } catch (e) {
    failed += 1;
    console.error(`${job.name}: CAPTURE FAILED — ${e.message}`);
  }
}

const missing = JOBS.filter((job) => !existsSync(join(OUT_DIR, `${job.name}.json`)));
if (missing.length > 0) {
  failed += missing.length;
  console.error(`missing fixtures after capture: ${missing.map((job) => job.name).join(", ")}`);
}

if (failed > 0) process.exitCode = 1;
