/**
 * Browser egress-region gate (#964).
 *
 * Why this exists
 * ---------------
 * The 2026-10-25 CDP post was the first one published through the web Studio
 * and sat at 0 plays; its browser exited from Tokyo (Zouter/AS205548) while the
 * account's target route was Singapore. The repo's own ban-cause list names VPN
 * use, and the zero-view checklist names a mismatched geographic signal — but
 * nothing checked the exit country before publishing. This module turns that
 * check into a publish-time gate.
 *
 * Why the probe runs in the browser
 * ---------------------------------
 * The shell's `http_proxy` and Chrome's proxy route are not the same
 * measurement, and Chrome's exit is what TikTok sees. Cloudflare's
 * `/cdn-cgi/trace` returns `ip=`, `loc=` and `colo=` as plain text with no key
 * or API quota, so the driver opens it in the automation browser, reads the
 * body, and closes the tab.
 *
 * Fail-closed boundary
 * --------------------
 * `--publish` is blocked when the country cannot be determined (probe failure,
 * timeout, `loc=XX`) as well as on a mismatch: "we could not verify" is not
 * evidence that the route is safe. Prepare-only runs warn instead — nothing is
 * published, but the operator can still click 发布 in the open tab, so the
 * warning says that too.
 */

export const EGRESS_TRACE_URL = "https://www.cloudflare.com/cdn-cgi/trace";

/**
 * The region the account is expected to publish from. Singapore is the route
 * the 2026-10-25 run was supposed to use; it is a default, not a hard-coded
 * truth — `--expect-region <CC>` overrides it when the intended region really
 * changes.
 */
export const DEFAULT_EXPECTED_REGION = "SG";

/** Two-letter ISO 3166-1 alpha-2 shape. `XX` is accepted here and treated as unknown later. */
export function isRegionCode(value) {
  return typeof value === "string" && /^[A-Za-z]{2}$/.test(value.trim());
}

function normalizeRegion(value) {
  return isRegionCode(value) ? value.trim().toUpperCase() : null;
}

/**
 * Whether this is a usable target region. Cloudflare returns `loc=XX` when it
 * cannot resolve the exit country; that sentinel must not be accepted as a
 * target, or `--expect-region XX` would disable the gate in the one case it
 * exists to catch.
 */
export function isExpectedRegion(value) {
  const code = normalizeRegion(value);
  return !!code && code !== "XX";
}

/**
 * Parse Cloudflare's plain-text trace payload.
 *
 * @param {unknown} text
 * @returns {{ip: string|null, loc: string|null, colo: string|null}|null}
 */
export function parseCloudflareTrace(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const fields = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    fields[line.slice(0, eq)] = line.slice(eq + 1);
  }
  const ip = fields.ip?.trim() || null;
  const loc = normalizeRegion(fields.loc);
  const colo = fields.colo?.trim() || null;
  if (!ip && !loc) return null;
  return { ip, loc, colo };
}

/**
 * Decide whether this run may publish.
 *
 * `level: "block"` is the only outcome the driver must refuse to publish on;
 * `"warn"` is printed loudly but does not stop a prepare-only run.
 *
 * @param {Object} opts
 * @param {string} [opts.expectedRegion]
 * @param {{ip: string|null, loc: string|null, colo: string|null}|null} [opts.trace]
 * @param {boolean} [opts.publish=false]
 * @param {boolean} [opts.reachable=true]
 * @param {string|null} [opts.reason]
 * @returns {{status: "ok"|"mismatch"|"unknown", level: "ok"|"warn"|"block", expectedRegion: string, actualRegion: string|null, ip: string|null, colo: string|null, reason: string|null}}
 */
export function evaluateEgress({
  expectedRegion = DEFAULT_EXPECTED_REGION,
  trace = null,
  publish = false,
  reachable = true,
  reason = null,
} = {}) {
  if (!isExpectedRegion(expectedRegion)) {
    // A malformed value must not fall back to SG: that turns a typo into a
    // silently weaker gate. `XX` is Cloudflare's unknown sentinel and must not
    // be usable as a target. The driver validates first; this protects other
    // callers of the pure function.
    throw new Error(
      `evaluateEgress: invalid expected region ${JSON.stringify(expectedRegion)} — use a two-letter code other than XX`,
    );
  }
  const expected = normalizeRegion(expectedRegion);
  const blockedLevel = publish ? "block" : "warn";
  const base = {
    expectedRegion: expected,
    actualRegion: trace?.loc ?? null,
    ip: trace?.ip ?? null,
    colo: trace?.colo ?? null,
  };

  if (!reachable || !trace || !trace.loc) {
    return {
      ...base,
      status: "unknown",
      level: blockedLevel,
      reason: reason || "the browser's exit country could not be determined",
    };
  }

  if (trace.loc === "XX") {
    return {
      ...base,
      status: "unknown",
      level: blockedLevel,
      reason: "Cloudflare could not resolve the exit country (loc=XX)",
    };
  }

  if (trace.loc === expected) {
    return { ...base, status: "ok", level: "ok", reason: null };
  }

  const where = trace.ip ? ` (${trace.ip}${trace.colo ? `, ${trace.colo}` : ""})` : "";
  return {
    ...base,
    status: "mismatch",
    level: blockedLevel,
    reason: `the browser exits from ${trace.loc}${where}, but the expected region is ${expected}`,
  };
}

/**
 * Open the trace page in the automation browser, read it, and close the tab.
 *
 * The IO functions are injected so the timeout/close behaviour can be tested
 * without a browser (the driver wires `cdpNewTab`, `cdpEval` and
 * `cdpCloseTab`).
 *
 * @param {Object} opts
 * @param {(url: string) => Promise<string>} opts.newTab
 * @param {(tabId: string) => Promise<string>} opts.readText
 * @param {(tabId: string) => Promise<void>|void} opts.closeTab
 * @param {number} [opts.timeoutMs=20000]
 * @returns {Promise<{reachable: boolean, trace: Object|null, reason: string|null}>}
 */
export async function probeEgressRegion({ newTab, readText, closeTab, timeoutMs = 20_000 } = {}) {
  if (
    typeof newTab !== "function" ||
    typeof readText !== "function" ||
    typeof closeTab !== "function"
  ) {
    return {
      reachable: false,
      trace: null,
      reason: "egress probe requires newTab, readText and closeTab",
    };
  }

  let tab = null;
  let abandoned = false;
  let timer = null;

  const work = (async () => {
    const opened = await newTab(EGRESS_TRACE_URL);
    if (abandoned) {
      // The timeout already fired; this tab would otherwise leak.
      try {
        await closeTab(opened);
      } catch {
        // Closing is best-effort.
      }
      throw new Error(`egress probe timed out after ${timeoutMs}ms`);
    }
    tab = opened;
    const text = await readText(opened);
    const trace = parseCloudflareTrace(text);
    if (!trace) throw new Error("trace page returned no ip/loc fields");
    return trace;
  })();
  // The race consumes the rejection while it is pending; this guard covers the
  // case where the work settles after the timeout has already won.
  work.catch(() => {});

  try {
    const trace = await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`egress probe timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
    return { reachable: true, trace, reason: null };
  } catch (err) {
    abandoned = true;
    return { reachable: false, trace: null, reason: err?.message || String(err) };
  } finally {
    if (timer) clearTimeout(timer);
    if (tab) {
      try {
        await closeTab(tab);
      } catch {
        // Closing is best-effort; the verdict already carries the result.
      }
    }
  }
}
