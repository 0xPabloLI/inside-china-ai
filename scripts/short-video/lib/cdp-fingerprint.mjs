/**
 * Runtime fingerprint probe for the CDP publish path (#1181, 2026-11-13).
 *
 * Anti-detection posture, in one place:
 *
 * **已加**
 * - Real Chrome + the fixed automation profile (`~/chrome-tiktok-profile`,
 *   port 9229, `lib/cdp-profile-guard.mjs`). UA, `navigator.platform`,
 *   languages and timezone therefore come from the operator's actual browser
 *   and OS — nothing is overridden. Reusing one long-lived profile also means
 *   cookies, history and storage look like a returning user.
 * - Human-shaped input (`lib/human-input.mjs`): Bézier pointer travel before a
 *   trusted press, typed caption instead of one synthetic paste, jittered
 *   waits. `human-input-selftest.mjs` asserts the page receives trusted events
 *   and zero paste.
 * - The publish session sends no `Runtime.enable` / `Page.enable`; it uses
 *   `Runtime.evaluate` and `Input.*` only. There is no "CDP enabled" flag for a
 *   page to read.
 * - Step pacing (`lib/publish-pacing.mjs`): 1.5–4.5 s jittered gaps between
 *   actions, so the run does not look like a burst.
 * - This probe: it reads the values the page actually sees and writes them to
 *   `publish-log.jsonl`, so a regression (a Chrome relaunched with
 *   `--enable-automation`, a profile swap) is visible in the log instead of
 *   being assumed away.
 *
 * **未加（原因）**
 * - `navigator.webdriver` erasure via `Page.addScriptToEvaluateOnNewDocument`.
 *   Chrome launched without `--enable-automation` already reports `false`; a
 *   script getter would itself be a detectable patch (`Function.prototype.
 *   toString` no longer matches). If the probe ever sees `true`, the fix is to
 *   relaunch Chrome without the flag, not to patch the page.
 * - UA / language / platform / timezone overrides. The real Chrome is already
 *   the reference. `Emulation.setUserAgentOverride` and
 *   `Emulation.setTimezoneOverride` are themselves CDP traces and create
 *   internal inconsistencies (UA says one OS, WebGL/platform says another).
 * - WebGL/canvas/audio spoofing: heavy, brittle, and a mismatch here is a
 *   stronger signal than the unspoofed values.
 * - Cross-run throttling: one run prepares one post, and a hard cooldown would
 *   block legitimate retries after a failure. The per-action jitter stays.
 * - Avoiding `Emulation.setFocusEmulationEnabled`: it is only used when Chrome
 *   throttles input on an occluded window (a measured ~5 s/event failure). It
 *   is a real trace (`document.hasFocus()`), but the alternative is an
 *   unusable run; the driver already tries window re-hosting first and logs
 *   every use.
 *
 * Verification (reproducible): the driver evaluates `FINGERPRINT_PROBE` once
 * after the session opens and logs the classified result. To read it by hand:
 *
 *   curl -s -X POST "http://localhost:3456/eval?target=<tabId>" \
 *     -d "$(node -e 'import("./scripts/short-video/lib/cdp-fingerprint.mjs").then(m=>process.stdout.write(m.FINGERPRINT_PROBE))')"
 *
 * Expected: `"webdriver":false` and a UA/platform/timezone triple that matches
 * the real Chrome the operator is looking at.
 */

/** Values a page can observe without any hook. */
export const FINGERPRINT_PROBE = `
(() => {
  const tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
  })();
  return JSON.stringify({
    webdriver: navigator.webdriver,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 4) : [],
    timezone: tz,
    plugins: navigator.plugins ? navigator.plugins.length : 0,
    hasFocus: document.hasFocus(),
    visibility: document.visibilityState,
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    screen: { w: screen.width, h: screen.height },
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: navigator.deviceMemory ?? null
  });
})()`;

/**
 * Does the UA's OS token agree with `navigator.platform`?
 *
 * This is the one cross-check worth failing on: an override that changes one
 * but not the other is exactly the inconsistency a fingerprint looks for.
 *
 * @param {string} userAgent
 * @param {string} platform
 * @returns {boolean}
 */
export function uaPlatformMatches(userAgent, platform) {
  const ua = String(userAgent || "");
  const p = String(platform || "");
  if (!ua || !p) return false;
  if (/Windows/i.test(ua)) return /^Win/i.test(p);
  if (/Macintosh|Mac OS X/i.test(ua)) return p === "MacIntel";
  if (/Android/i.test(ua)) return /^(Linux arm|Android)/i.test(p);
  if (/CrOS/i.test(ua)) return /^Linux/i.test(p);
  if (/Linux/i.test(ua)) return /^Linux/i.test(p);
  return false;
}

/**
 * Classify a raw probe result into the checks the publish log carries.
 *
 * Pure and tolerant: an unreadable probe is a failed check, not an exception —
 * the caller is about to make a draft, and a broken probe must not be mistaken
 * for a clean fingerprint.
 *
 * @param {unknown} raw - parsed `FINGERPRINT_PROBE` value
 * @returns {{ok: boolean, checks: Array<{id: string, ok: boolean, value: unknown}>, note: string|null}}
 */
export function classifyFingerprint(raw) {
  const value = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  if (!value) {
    return {
      ok: false,
      checks: [{ id: "probe", ok: false, value: "unreadable" }],
      note: "fingerprint probe returned no object — treat the run as unverified",
    };
  }

  const checks = [
    { id: "webdriver", ok: value.webdriver === false, value: value.webdriver },
    {
      id: "ua-platform",
      ok: uaPlatformMatches(value.userAgent, value.platform),
      value: `${value.userAgent ?? "?"} / ${value.platform ?? "?"}`,
    },
    {
      id: "timezone",
      ok: typeof value.timezone === "string" && value.timezone.length > 0,
      value: value.timezone,
    },
    {
      id: "languages",
      ok: Array.isArray(value.languages) && value.languages.length > 0,
      value: value.languages,
    },
  ];

  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    note: failed.length
      ? `failed: ${failed.map((c) => c.id).join(", ")} — see the anti-detection list in lib/cdp-fingerprint.mjs`
      : null,
  };
}
