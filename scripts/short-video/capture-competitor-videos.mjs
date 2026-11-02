/**
 * Competitor benchmark capture (#300 stage 2, account gate #748)
 *
 * Discovers each bench account's top videos (by plays) from its logged-in
 * profile page, then downloads each one to a structured directory. This is the
 * discovery+download half of the benchmark pipeline; per-video scene analysis
 * (WhisperX + VLM, schema v1) consumes the manifest afterwards.
 *
 * Three code gates run before anything is fetched, because all three failure
 * modes are silent — each makes every later verdict a projection of the wrong
 * account or environment (2026-09-22, 2026-10-16 and 2026-11-02 incidents):
 *   1. The CDP port must carry the automation profile (cdp-profile-guard.mjs).
 *   2. The browser exit must not be HK: tiktok.com serves an "unavailable in
 *      your region" page from there, with no error to distinguish it.
 *   3. The profile behind each handle must be the expected person: the page's
 *      own `uniqueId` must equal the requested handle and its nickname must
 *      match the declared display name. Before #748 this gate did not exist,
 *      so `@allsiekmiller` (a handle that does not exist) and `@natebjones`
 *      (a 35-follower stranger) both landed in the corpus as `videos: []` /
 *      off-niche samples with `error: null`.
 *
 * Niche membership is a human verdict, not a page fact: the page cannot tell
 * "AI news" from "US politics". It is recorded per account in BENCH_ACCOUNTS
 * and copied into the manifest, so a consumer can filter the corpus without
 * re-deriving it.
 *
 * Minimal-interaction discipline for the profile-page leg (risk control):
 * read-only, one account per pass, a page that fails is recorded and skipped,
 * silent render waits and jittered pacing between accounts.
 *
 * Verified 2026-11-02 (CDP 9229, automation profile): nine handles re-read,
 * two wrong handles found and replaced (`natebjones` → `nate.b.jones`,
 * `allsiekmiller` → `alliekmiller`), one account reclassified as adjacent.
 * Re-run the same evidence with `--verify-only`.
 *
 * @module capture-competitor-videos
 */

import { fileURLToPath } from "url";
import { mkdirSync, realpathSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { cdpNewTab, cdpEval, cdpCloseTab } from "./lib/cdp-client.mjs";
import { checkAutomationProfile, formatVerdict } from "./lib/cdp-profile-guard.mjs";
import { probeEgressRegion } from "./lib/publish-egress.mjs";
import { downloadVideo } from "./lib/video-downloaders.mjs";

/**
 * English-side bench accounts (#300 §2.1, corrected by #748).
 *
 * Chinese-side TikTok samples are too thin to compare against (max ~32.5K vs
 * 100K-4M), so the ticket scopes the cross-language contrast to the English
 * side.
 *
 * `displayName` is the identity gate's other half: the handle alone is not a
 * person (a stranger can hold the handle), and the display name alone is not a
 * key (it is not unique). `niche` records the human content verdict:
 *   core     — the account's subject is AI; included in the AI medians.
 *   adjacent — tech/science/business frontier, AI is not the subject; kept as
 *              a control arm, excluded from the AI medians.
 * `followers` is the third-party figure recorded in §2.1; the live count the
 * page reports is written to the manifest as `observedFollowers` and is the
 * value to trust when they disagree.
 */
export const BENCH_ACCOUNTS = [
  {
    handle: "marcus.dipaola",
    displayName: "Marcus DiPaola",
    followers: "4.1M",
    niche: "adjacent",
    note: "US news/documentary account; its play-ranked Top 5 is politics, not AI — control arm only",
  },
  { handle: "rileybrown.ai", displayName: "Riley Brown", followers: "636.7K", niche: "core" },
  {
    handle: "nate.b.jones",
    displayName: "Nate B. Jones",
    aliases: ["Nate"],
    followers: "488K",
    niche: "core",
    note: "replaced the wrong @natebjones handle (35 followers, lifestyle) on 2026-11-02 (#748)",
  },
  { handle: "kanekallaway", displayName: "Kallaway", followers: "425.1K", niche: "adjacent" },
  { handle: "maverickgpt", displayName: "Maverick Maltin", followers: "409.6K", niche: "core" },
  { handle: "sineadbovell", displayName: "Sinead Bovell", followers: "313.1K", niche: "core" },
  {
    handle: "shedoesai",
    displayName: "Gunhild Johanne Reumert",
    aliases: ["Johanne"],
    followers: "227K",
    niche: "core",
  },
  { handle: "thechriswinfield", displayName: "Chris Winfield", followers: "120.7K", niche: "core" },
  {
    handle: "alliekmiller",
    displayName: "Allie K. Miller",
    followers: "112.3K",
    niche: "core",
    note: "replaced the non-existent @allsiekmiller handle on 2026-11-02 (#748)",
  },
];

const DEFAULT_TOP_N = 5;
const LIST_SCROLL_ROUNDS = 3;
const PROFILE_RENDER_WAIT_MS = 9000;
const IDENTITY_WAIT_ROUNDS = 8;
const IDENTITY_WAIT_MS = 3000;
const SCROLL_SETTLE_MS = 1600;

/**
 * A handle becomes a directory name under outDir, so it must not carry path
 * separators or traversal segments. Only the charset TikTok allows in handles
 * survives; anything else is dropped.
 *
 * @param {string} handle
 * @returns {string} the handle reduced to `[A-Za-z0-9._-]`
 */
export function sanitizeHandle(handle) {
  return String(handle ?? "").replace(/[^A-Za-z0-9._-]/g, "");
}

/**
 * Fold a display name to its comparable core: lowercase alphanumerics only.
 * `|`, emoji and punctuation vary per account and must not decide identity.
 *
 * @param {string} name
 * @returns {string}
 */
export function normalizeDisplayName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Shortest token run that can prove a name. Below this, a match is noise. */
const MIN_NAME_MATCH_CHARS = 4;

/**
 * Split a display name into word tokens; punctuation and `|` disappear.
 *
 * @param {string} name
 * @returns {string[]}
 */
export function displayNameTokens(name) {
  return String(name ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Decide whether two display names denote the same person.
 *
 * Substring matching is not enough: a stranger nicknamed "AI" is a substring of
 * "Maverick Maltin | AI & ChatGPT", and an alias "Nate" would accept a nickname
 * of "te". So a short form only counts when it appears as a **contiguous run of
 * whole tokens** ("Nate" inside "Nate B. Jones", "Johanne" inside "Gunhild
 * Johanne Reumert") and is long enough to be evidence. A page that joins words
 * ("MaverickMaltin | AI") therefore needs an explicit alias — the failure is
 * loud on a correct account, which is the direction this gate should err.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function displayNameMatches(a, b) {
  const left = displayNameTokens(a);
  const right = displayNameTokens(b);
  if (!left.length || !right.length) return false;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  if (normalizeDisplayName(a) === normalizeDisplayName(b)) return true;
  if (short.join("").length < MIN_NAME_MATCH_CHARS) return false;
  for (let start = 0; start + short.length <= long.length; start++) {
    if (short.every((token, offset) => long[start + offset] === token)) return true;
  }
  return false;
}

/**
 * Decide whether the page behind a handle is the account we meant to sample.
 *
 * The verdict is deliberately conservative: a missing nickname counts as a
 * mismatch, because "no name" and "someone else's name" both mean the run
 * cannot prove who it sampled. A declared alias covers the cases where the
 * page shows a short form of the name the account is known by ("Nate" for
 * "Nate B. Jones"); see `displayNameMatches` for why a plain substring test
 * would let a stranger nicknamed "AI" through.
 *
 * @param {{handle: string, displayName?: string, aliases?: string[]}} expected
 * @param {{uniqueId?: string|null, nickname?: string|null, notFound?: boolean}} observed
 * @returns {{status: "ok"|"unverified"|"not-found"|"handle-mismatch"|"nickname-mismatch", reason: string}}
 */
export function identityVerdict(expected, observed) {
  if (observed?.notFound) {
    return {
      status: "not-found",
      reason: `TikTok has no profile at @${expected.handle} (handle moved or deleted)`,
    };
  }
  const observedHandle = sanitizeHandle(observed?.uniqueId).toLowerCase();
  const requestedHandle = sanitizeHandle(expected.handle).toLowerCase();
  if (observedHandle !== requestedHandle) {
    return {
      status: "handle-mismatch",
      reason: `page reports uniqueId "${forTerminal(observed?.uniqueId)}", expected "${forTerminal(expected.handle)}"`,
    };
  }
  const declaredNames = [expected.displayName, ...(expected.aliases ?? [])].filter((n) =>
    normalizeDisplayName(n),
  );
  if (!declaredNames.length) {
    // The handle alone proves "this page is @x", not "this page is the person
    // we meant" — a stranger can hold the handle. Ad-hoc runs must declare a
    // name (`--accounts handle=Display Name`) or be added to BENCH_ACCOUNTS.
    return {
      status: "unverified",
      reason:
        "no display name declared — pass --accounts handle=Display Name or add the account to BENCH_ACCOUNTS",
    };
  }
  if (!normalizeDisplayName(observed?.nickname)) {
    return {
      status: "nickname-mismatch",
      reason: `page reports no nickname; expected one of ${declaredNames.map((n) => forTerminal(n)).join(", ")}`,
    };
  }
  const matched = declaredNames.some((name) => displayNameMatches(name, observed?.nickname));
  if (matched)
    return { status: "ok", reason: `nickname matches "${forTerminal(observed?.nickname)}"` };
  // A page that uses its own handle as its display name carries no independent
  // name, and there is nothing to contradict: the exact folded comparison that
  // decides the declared names would accept "natebjones" for "Nate B. Jones"
  // anyway. Rejecting it would only fail accounts whose display name is their
  // handle, so record why the evidence is weaker and move on.
  if (normalizeDisplayName(observed?.nickname) === normalizeDisplayName(expected.handle)) {
    return {
      status: "ok",
      reason: `page display name is its own handle ("${forTerminal(observed?.nickname)}") — no independent name`,
    };
  }
  return {
    status: "nickname-mismatch",
    reason: `page reports "${forTerminal(observed?.nickname)}", expected one of ${declaredNames.map((n) => forTerminal(n)).join(", ")} — update BENCH_ACCOUNTS if the account was renamed`,
  };
}

/** Unwrap a CDP eval response. The proxy answers `{result:{value}}`; older
 *  callers/tests hand back the bare value, so both shapes are accepted. */
function cdpValue(raw, fallback) {
  if (typeof raw === "string") return raw;
  return raw?.result?.value ?? raw?.value ?? fallback;
}

/**
 * TikTok renders play counts with K/M suffixes ("177.5K", "2.1M") and plain
 * integers below 1,000. Sorting by plays needs the number, not the label.
 *
 * @param {string} label
 * @returns {number}
 */
export function parsePlayCount(label) {
  if (typeof label !== "string") return 0;
  const m = label
    .trim()
    .replace(/,/g, "")
    .match(/^(\d+(?:\.\d+)?)\s*([KMB])?/i);
  if (!m) return 0;
  const scale = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || "").toUpperCase()] || 1;
  return Math.round(Number.parseFloat(m[1]) * scale);
}

/**
 * The profile grid hands back hrefs that are already absolute
 * (`https://www.tiktok.com/@user/video/<id>`). Building the URL as
 * `origin + href` therefore produced `https://www.tiktok.comhttps://…` — a host
 * no adapter recognises, so the batch saved 0 of the 36 listed videos on
 * 2026-10-17 with `unsupported-by-downloader:www.tiktok.comhttps`. Normalise
 * instead of blindly prefixing: absolute hrefs pass through, relative ones get
 * the origin.
 *
 * @param {string} href
 * @returns {string}
 */
export function normalizeTikTokVideoUrl(href) {
  if (typeof href !== "string") return "";
  const path = href.split("?")[0].trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `https://www.tiktok.com${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * The page copy that means "this handle has no profile". Declared once and
 * interpolated into both page scripts: readiness and extraction must agree, or
 * a page can be "ready" for the probe and "not-found" for the extractor.
 */
const NOT_FOUND_COPY = "找不到此账号|Couldn't find this account|Couldn’t find this account";

/**
 * Readiness probe: the profile page first renders a "Please wait..." shell, so
 * a fixed wait can extract from a page that has no identity block yet — which
 * is how a healthy account became "0 videos" on 2026-11-01, and how the first
 * `--verify-only` run on 2026-11-02 read `uniqueId: ""` for two accounts that
 * were merely still loading. The condition that counts as "the page answered"
 * is therefore an identity signal (the DOM block or the hydration payload), not
 * a body length: chrome and nav text exceed any length threshold long before
 * the profile renders.
 */
const READY_SCRIPT = `
(() => {
  const text = document.body ? document.body.innerText : '';
  if (/${NOT_FOUND_COPY}/i.test(text)) return 'not-found';
  if (document.querySelector('[data-e2e="user-title"]')) return 'ready';
  try {
    const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
    const info = el ? JSON.parse(el.textContent).__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo : null;
    if (info?.user?.uniqueId) return 'ready';
  } catch (e) {
    /* hydration payload absent or not yet written */
  }
  return 'waiting';
})()
`;

/**
 * The in-page extractor: one pass over the rendered grid, no interaction.
 * Kept as a script string (not a function) because it runs inside the page.
 * It returns the raw `href`; normalisation happens on the Node side so the
 * rewriting lives in one testable place.
 *
 * Identity is read from the page's own hydration payload when present, so the
 * values are the account's, not a selector's guess; the DOM selectors are the
 * fallback for the cases where that payload is absent.
 */
const EXTRACT_PROFILE_SCRIPT = `
(() => {
  const items = [...document.querySelectorAll('[data-e2e="user-post-item"]')];
  const out = items.map((it) => {
    const a = it.querySelector('a[href*="/video/"]');
    const href = a ? a.getAttribute('href') || '' : '';
    const id = href ? (href.split('/video/')[1] || '').split('?')[0] : '';
    return {
      id,
      views: it.querySelector('[data-e2e="video-views"]')?.textContent?.trim() || '',
      href,
    };
  }).filter((x) => x.id && x.href);
  let userInfo = null;
  try {
    const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
    userInfo = el ? JSON.parse(el.textContent).__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo ?? null : null;
  } catch (e) {
    userInfo = null;
  }
  const body = document.body ? document.body.innerText : '';
  return JSON.stringify({
    count: items.length,
    regionBlocked: /unavailable in your region|已停止在/.test(body) || location.pathname.startsWith('/hk'),
    gridError: /出错了|Something went wrong|please try again/i.test(body),
    notFound: /${NOT_FOUND_COPY}/i.test(body),
    uniqueId: userInfo?.user?.uniqueId ?? document.querySelector('[data-e2e="user-subtitle"]')?.textContent?.trim() ?? null,
    nickname: userInfo?.user?.nickname ?? document.querySelector('[data-e2e="user-title"]')?.textContent?.trim() ?? null,
    followerCount: userInfo?.stats?.followerCount ?? null,
    videoCount: userInfo?.stats?.videoCount ?? null,
    items: out,
  });
})()
`;

const SCROLL_SCRIPT = `
(() => { window.scrollBy(0, window.innerHeight * 3); return 'scrolled'; })()
`;

/**
 * Read the browser exit location through the shared egress probe (#964).
 * The probe opens the trace page, reads the body, and closes the tab; this
 * wrapper only maps its structured result onto the existing "unknown" contract.
 * @returns {Promise<string>} two-letter country code, or "unknown"
 */
async function browserExitLocation() {
  const probe = await probeEgressRegion({
    newTab: cdpNewTab,
    readText: async (tabId) => {
      // The trace page is plain text; the old reader used the same 3s settle.
      await new Promise((r) => setTimeout(r, 3000));
      return cdpValue(await cdpEval(tabId, "document.body.innerText"), "");
    },
    closeTab: cdpCloseTab,
  });
  return probe.trace?.loc ?? "unknown";
}

/**
 * Read one already-open profile tab: wait for it to answer, then extract the
 * identity block and the video grid in the same scroll pass.
 *
 * @param {string} tabId - an open tab already navigated to the profile
 * @returns {Promise<{
 *   identity: {uniqueId: string|null, nickname: string|null, followerCount: number|null, videoCount: number|null},
 *   items: Array<{id: string, views: string, url: string}>,
 *   regionBlocked: boolean,
 *   gridError: boolean,
 *   notFound: boolean,
 * }>}
 */
async function readProfileInTab(tabId) {
  await new Promise((r) => setTimeout(r, PROFILE_RENDER_WAIT_MS));
  let ready = "waiting";
  for (let round = 0; round < IDENTITY_WAIT_ROUNDS; round++) {
    ready = cdpValue(await cdpEval(tabId, READY_SCRIPT), "waiting");
    if (ready === "ready" || ready === "not-found") break;
    await new Promise((r) => setTimeout(r, IDENTITY_WAIT_MS));
  }

  let last = {
    identity: { uniqueId: null, nickname: null, followerCount: null, videoCount: null },
    items: [],
    regionBlocked: false,
    gridError: false,
    notFound: ready === "not-found",
  };
  for (let round = 0; round < LIST_SCROLL_ROUNDS; round++) {
    const raw = await cdpEval(tabId, EXTRACT_PROFILE_SCRIPT);
    const text = cdpValue(raw, "{}");
    try {
      const parsed = JSON.parse(text);
      const items = (parsed.items || [])
        .map((it) => ({ ...it, url: normalizeTikTokVideoUrl(it.href) }))
        .filter((it) => it.url);
      const snapshot = {
        identity: {
          uniqueId: parsed.uniqueId ?? last.identity.uniqueId,
          nickname: parsed.nickname ?? last.identity.nickname,
          followerCount: parsed.followerCount ?? last.identity.followerCount,
          videoCount: parsed.videoCount ?? last.identity.videoCount,
        },
        items,
        regionBlocked: Boolean(parsed.regionBlocked),
        gridError: Boolean(parsed.gridError),
        notFound: Boolean(parsed.notFound),
      };
      if (snapshot.items.length >= last.items.length) last = snapshot;
    } catch {
      /* transient render state — keep the previous snapshot */
    }
    await cdpEval(tabId, SCROLL_SCRIPT);
    await new Promise((r) => setTimeout(r, SCROLL_SETTLE_MS));
  }
  return last;
}

/**
 * Wait for the profile page to answer, then read identity + grid in one pass.
 *
 * A page that never renders its identity block is retried once in a fresh tab:
 * TikTok regularly leaves a tab on the "Please wait..." shell past any fixed
 * wait (observed on `@shedoesai`, 2026-11-02), and a healthy account that reads
 * as `uniqueId: null` would be recorded as an identity failure. Two attempts
 * bound the cost; after that the verdict is `handle-mismatch`, i.e. fail closed
 * rather than sample something unprovable.
 *
 * @param {string} handle
 * @returns {Promise<{
 *   identity: {uniqueId: string|null, nickname: string|null, followerCount: number|null, videoCount: number|null},
 *   items: Array<{id: string, views: string, url: string}>,
 *   regionBlocked: boolean,
 *   gridError: boolean,
 *   notFound: boolean,
 * }>}
 */
async function readAccountProfile(handle) {
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const tabId = await cdpNewTab(`https://www.tiktok.com/@${handle}`);
    try {
      last = await readProfileInTab(tabId);
    } finally {
      await cdpCloseTab(tabId);
    }
    if (last.notFound || last.identity.uniqueId) return last;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  return last;
}

/**
 * Turn a profile read into the account's identity record, or the reason the
 * run must not treat it as a sample of the expected account.
 *
 * @param {{handle: string, displayName?: string, aliases?: string[], followers?: string, niche?: string}} expected
 * @param {Awaited<ReturnType<typeof readAccountProfile>>} observed
 * @returns {{verdict: {status: string, reason: string}, record: object}}
 */
export function verifyAccount(expected, observed) {
  const verdict = identityVerdict(expected, {
    uniqueId: observed?.identity?.uniqueId,
    nickname: observed?.identity?.nickname,
    notFound: observed?.notFound,
  });
  return {
    verdict,
    record: {
      handle: expected.handle,
      expectedDisplayName: expected.displayName ?? null,
      nickname: observed?.identity?.nickname ?? null,
      uniqueId: observed?.identity?.uniqueId ?? null,
      declaredFollowers: expected.followers ?? null,
      observedFollowers: observed?.identity?.followerCount ?? null,
      observedVideos: observed?.identity?.videoCount ?? null,
      niche: expected.niche ?? null,
      url: `https://www.tiktok.com/@${expected.handle}`,
      verifiedAt: new Date().toISOString(),
      status: verdict.status,
      reason: verdict.reason,
      gridError: Boolean(observed?.gridError),
      listedVideos: observed?.items?.length ?? 0,
    },
  };
}

/**
 * Gates 1-2, shared by both entry points so a gap cannot exist in one and not
 * the other: the CDP port must carry the automation profile, and the browser
 * exit must not be HK (TikTok serves a region page there and reports no error).
 *
 * @returns {Promise<string>} the exit location, e.g. "SG"
 */
async function assertPreflightGates() {
  const profile = await checkAutomationProfile();
  if (profile.status !== "ok") {
    throw new Error(`CDP profile gate failed\n${formatVerdict(profile)}`);
  }
  const loc = await browserExitLocation();
  if (loc === "HK") {
    throw new Error(
      `exit gate failed: browser exits via HK (TikTok is unavailable there). ` +
        `Point the system proxy at a non-HK node and re-run.`,
    );
  }
  return loc;
}

/**
 * Make a page-supplied string safe to print and to store. A nickname is written
 * by whoever holds the account — precisely the impersonator this gate targets —
 * and an ANSI escape in it would rewrite the operator's terminal (or a CI log)
 * rather than show up as data. Control characters are dropped and the length is
 * capped so one hostile field cannot flood the output.
 *
 * @param {string} text
 * @param {number} [max]
 * @returns {string}
 */
export function forTerminal(text, max = 120) {
  return String(text ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .slice(0, max);
}

/** Niche verdicts a declared account may carry. */
export const NICHE_VALUES = ["core", "adjacent"];

/**
 * Fail closed on a malformed niche: it is a human verdict copied into every
 * downstream record, so a typo (`adjecent`) or a stale value silently changes
 * which samples the AI medians consume.
 *
 * @param {{handle: string, niche?: string}} entry
 * @returns {{status: "ok"|"niche-invalid", reason: string}}
 */
export function nicheVerdict(entry) {
  if (entry?.niche === undefined) {
    return { status: "ok", reason: "no niche declared (ad-hoc account)" };
  }
  if (NICHE_VALUES.includes(entry.niche)) {
    return { status: "ok", reason: `niche "${entry.niche}"` };
  }
  return {
    status: "niche-invalid",
    reason: `niche "${entry.niche}" is not one of ${NICHE_VALUES.join(" / ")}`,
  };
}

/**
 * Run gates 1-2 (CDP profile, exit region), then verify every account's
 * identity and write the audit artifact. No video is downloaded, so this is the
 * safe pre-flight for a sampling round — and the evidence trail #748 asks for.
 *
 * @param {object} [opts]
 * @param {Array<object>} [opts.accounts] - BENCH_ACCOUNTS-shaped entries
 * @param {string} [opts.outDir]
 * @returns {Promise<{exit: string, capturedAt: string, results: object[]}>}
 */
export async function verifyCompetitorProfiles({
  accounts = BENCH_ACCOUNTS,
  outDir = join(process.cwd(), "scripts/short-video/output/competitor-benchmarks"),
} = {}) {
  const loc = await assertPreflightGates();

  mkdirSync(outDir, { recursive: true });
  const artifact = { capturedAt: new Date().toISOString(), exit: loc, results: [] };
  for (const expected of accounts) {
    const handle = sanitizeHandle(expected.handle);
    const niche = nicheVerdict(expected);
    let record;
    try {
      const observed = await readAccountProfile(handle);
      record = verifyAccount({ ...expected, handle }, observed).record;
      if (niche.status !== "ok") {
        record.status = niche.status;
        record.reason = niche.reason;
      }
    } catch (err) {
      record = {
        handle,
        expectedDisplayName: expected.displayName ?? null,
        niche: expected.niche ?? null,
        url: `https://www.tiktok.com/@${handle}`,
        verifiedAt: new Date().toISOString(),
        status: "probe-failed",
        reason: err.message,
      };
    }
    artifact.results.push(record);
    writeFileSync(join(outDir, "profile-verification.json"), JSON.stringify(artifact, null, 2));
    console.log(`@${forTerminal(record.handle)}: ${record.status} — ${record.reason}`);
    await new Promise((r) => setTimeout(r, 2500));
  }
  return artifact;
}

/**
 * Sample one account: gate, list, download. Returns the manifest entry for the
 * account, or null when the handle sanitises away to nothing.
 *
 * A failed gate returns the entry with `error` set and no videos — never an
 * empty `videos: []` with `error: null`, which is what made a missing account
 * look like an account without videos. The caller owns persistence and pacing,
 * so every path (gate failure included) keeps the between-account delay.
 *
 * @param {object} expected - BENCH_ACCOUNTS-shaped entry
 * @param {{topN: number, outDir: string}} opts
 * @returns {Promise<object|null>}
 */
async function sampleAccount(expected, { topN, outDir }) {
  const handle = sanitizeHandle(expected.handle);
  if (!handle) return null;
  const dir = join(outDir, handle);
  mkdirSync(dir, { recursive: true });
  const entry = {
    handle,
    displayName: expected.displayName ?? null,
    niche: expected.niche ?? null,
    followers: expected.followers ?? null,
    observedFollowers: null,
    observedNickname: null,
    identity: null,
    videos: [],
    error: null,
  };

  // Gate 3a: the declared niche must be a value downstream can filter on.
  const niche = nicheVerdict(expected);
  if (niche.status !== "ok") {
    entry.error = `niche gate failed: ${niche.reason}`;
    return entry;
  }

  try {
    const observed = await readAccountProfile(handle);
    // A region-blocked page has no hydration payload, so its identity block
    // reads as empty and the identity gate would report "wrong handle" —
    // sending the operator to fix a handle when the actual fault is the exit
    // node. Diagnose the environment before blaming the account.
    if (observed.regionBlocked) {
      throw new Error("region-blocked page (check exit node)");
    }
    const { verdict, record } = verifyAccount(expected, observed);
    entry.observedFollowers = record.observedFollowers;
    entry.observedNickname = record.nickname;
    entry.identity = record;

    // Gate 3b: identity. A run that samples a stranger is worse than a run
    // that samples nothing, because the corpus cannot tell afterwards.
    if (verdict.status !== "ok") {
      entry.error = `identity gate failed: ${verdict.reason}`;
      return entry;
    }
    if (!observed.items.length) {
      entry.error = observed.gridError
        ? "profile grid failed to render (TikTok reported an error; no video list)"
        : "profile listed 0 videos (refusing to record an empty sample)";
      return entry;
    }

    const ranked = observed.items
      .map((it) => ({ ...it, plays: parsePlayCount(it.views) }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, topN);

    for (const video of ranked) {
      const dest = join(dir, `${video.id}.mp4`);
      // downloadVideo returns the bytes (the ytdlp adapter owns its temp file),
      // so the structured path is written here.
      const result = await downloadVideo(video.url);
      let savedFile = null;
      if (result.buffer) {
        writeFileSync(dest, result.buffer);
        savedFile = dest;
      }
      entry.videos.push({
        id: video.id,
        url: video.url,
        views: video.views,
        plays: video.plays,
        file: savedFile,
        status: result.status,
        reason: result.reason ?? null,
        byteLength: result.byteLength,
      });
      // Human-like pacing between downloads (minimal-interaction discipline).
      await new Promise((r) => setTimeout(r, 3000 + Math.floor(Math.random() * 4000)));
    }
  } catch (err) {
    entry.error = err.message;
  }
  return entry;
}

/**
 * Capture the bench accounts: verify identity → list top plays → download →
 * manifest.
 *
 * Every account that cannot be proven to be the expected person is recorded as
 * an error and skipped. That is the #748 gate: an empty grid used to be written
 * as `videos: []` with `error: null`, which reads downstream as "this account
 * has no videos" instead of "this run sampled nothing".
 *
 * @param {object} [opts]
 * @param {Array<object>|string[]} [opts.accounts] - entries or handles; defaults to BENCH_ACCOUNTS
 * @param {number} [opts.topN]
 * @param {string} [opts.outDir]
 * @returns {Promise<object>} manifest
 */
export async function captureCompetitorVideos({
  accounts = BENCH_ACCOUNTS,
  topN = DEFAULT_TOP_N,
  outDir = join(process.cwd(), "scripts/short-video/output/competitor-benchmarks"),
} = {}) {
  // Gates 1-2 shared with `--verify-only`.
  const loc = await assertPreflightGates();

  // String entries resolve through the same parser the CLI uses, so an API
  // caller and `--accounts` cannot classify the same handle differently.
  const expectedAccounts = accounts.flatMap((entry) =>
    typeof entry === "string" ? parseAccountsArg(entry) : [entry],
  );

  const manifest = { capturedAt: new Date().toISOString(), exit: loc, accounts: [] };

  for (const expected of expectedAccounts) {
    const entry = await sampleAccount(expected, { topN, outDir });
    if (!entry) continue;
    manifest.accounts.push(entry);
    writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    // Jittered pacing between accounts. Every path must reach it: the gate
    // failures used to `continue` past this sleep, so a run where several
    // accounts failed issued back-to-back profile loads with no delay — the
    // opposite of the minimal-interaction discipline in the module doc.
    await new Promise((r) => setTimeout(r, 4000 + Math.floor(Math.random() * 4000)));
  }

  return manifest;
}

// ─── CLI ───

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : fallback;
}

/**
 * Parse `--accounts`. Two forms are accepted:
 *   `handle`                 — must exist in BENCH_ACCOUNTS (inherits its name)
 *   `handle=Display Name`    — ad-hoc account; the declared name is what the
 *                              identity gate compares against, so it is
 *                              required for handles outside BENCH_ACCOUNTS.
 *
 * @param {string} value
 * @returns {Array<object>} BENCH_ACCOUNTS-shaped entries
 */
export function parseAccountsArg(value) {
  return String(value)
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const eq = token.indexOf("=");
      const rawHandle = (eq === -1 ? token : token.slice(0, eq)).trim().replace(/^@/, "");
      const declaredName = eq === -1 ? "" : token.slice(eq + 1).trim();
      const known = BENCH_ACCOUNTS.find((a) => a.handle === rawHandle);
      if (known) {
        return declaredName ? { ...known, displayName: declaredName, aliases: [] } : known;
      }
      // No followers/niche: an ad-hoc handle is outside the bench list, so it
      // carries no declared figures. `displayName` is the whole point of the
      // declaration form — without it the identity gate returns `unverified`.
      return { handle: rawHandle, displayName: declaredName || undefined };
    });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const topN = Number.parseInt(argValue("--top", String(DEFAULT_TOP_N)), 10);
  const accountsArg = argValue("--accounts");
  const selected = accountsArg ? parseAccountsArg(accountsArg) : BENCH_ACCOUNTS;
  const outDir = resolve(argValue("--out", "scripts/short-video/output/competitor-benchmarks"));
  const verifyOnly = process.argv.includes("--verify-only");

  const run = verifyOnly
    ? verifyCompetitorProfiles({ accounts: selected, outDir }).then((artifact) => {
        console.log(
          `exit: ${artifact.exit} · artifact: ${join(outDir, "profile-verification.json")}`,
        );
        const bad = artifact.results.filter((r) => r.status !== "ok");
        if (bad.length) {
          console.error(
            `\n${bad.length}/${artifact.results.length} accounts failed verification — ` +
              `fix BENCH_ACCOUNTS before sampling.`,
          );
          process.exitCode = 1;
        }
      })
    : captureCompetitorVideos({ accounts: selected, topN, outDir }).then((manifest) => {
        console.log(`exit: ${manifest.exit} · out: ${outDir}`);
        for (const a of manifest.accounts) {
          console.log(
            a.error
              ? `  @${a.handle}: ERROR ${a.error}`
              : `  @${a.handle}: ${a.videos.filter((v) => v.file).length}/${a.videos.length} downloaded`,
          );
        }
        // A sampling run that dropped an account is a partial corpus, and the
        // manifest cannot say so to a shell. Exit non-zero so a caller (CI, a
        // wrapper script, a human reading `$?`) sees it without parsing JSON.
        const dropped = manifest.accounts.filter((a) => a.error);
        if (dropped.length) {
          console.error(
            `\n${dropped.length}/${manifest.accounts.length} accounts produced no sample — ` +
              `treat this corpus as partial.`,
          );
          process.exitCode = 1;
        }
      });

  run.catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
