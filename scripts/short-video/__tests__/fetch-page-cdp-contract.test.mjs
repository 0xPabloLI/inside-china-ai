// #1022: contract test that does NOT mock `cdp-client.mjs`.
//
// The bug this file guards: `fetchCdp` handed a string-returning script to
// `extractFromTab`, which narrows every non-array value to `[]`. The old unit
// test could not see it because it mocked `extractFromTab` to return a string
// — a value the real function can never produce.
//
// So this file stubs the *transport* (global.fetch → the CDP proxy) and lets
// the real `evalInTab` run: async-IIFE wrapping, envelope unwrapping, the
// JSON.parse pass for string values, and `fetchCdp`'s read path all execute.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { CDP_BASE } from "../lib/cdp-client.mjs";
import { fetchCdp } from "../lib/fetch-page.mjs";

/** Minimal Response stand-in for the proxy's JSON answers. */
function jsonResponse(data) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
}

/**
 * A CDP proxy that actually evaluates the script it is given, the way Chrome
 * plus the proxy would: the script arrives as an expression, so evaluate it as
 * one and await its promise, then answer with the `{ value }` envelope.
 *
 * @param {{body: {innerText: string} | null}} page - Fake page state
 * @returns {import("vitest").Mock} fetch stub
 */
function cdpTransport(page) {
  return vi.fn(async (url, init = {}) => {
    const target = String(url);
    if (target === `${CDP_BASE}/new`) return jsonResponse({ targetId: "tab-real" });
    if (target.startsWith(`${CDP_BASE}/eval`)) {
      const script = init.body;
      // waitForPageLoad polls this exact expression.
      if (script === "document.readyState") return jsonResponse({ value: "complete" });
      const value = await new Function("document", `return ${script}`)(page);
      return jsonResponse({ value });
    }
    if (target.startsWith(`${CDP_BASE}/close`)) return jsonResponse({ ok: true });
    throw new Error(`unexpected CDP call: ${target}`);
  });
}

beforeEach(() => {
  // The per-domain limiter is covered by rate-limiter.test.mjs; keep this file
  // free of real waits and state writes.
  vi.stubEnv("RATE_LIMITER_DISABLED", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fetchCdp through the real evalInTab", () => {
  it("returns the page text instead of losing it to the array narrowing", async () => {
    const fetchMock = cdpTransport({ body: { innerText: "rendered page text" } });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCdp("https://example.com/heavy-js");

    expect(result).toEqual({ ok: true, method: "cdp", text: "rendered page text" });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `${CDP_BASE}/new`,
      `${CDP_BASE}/eval?target=tab-real`,
      `${CDP_BASE}/eval?target=tab-real`,
      `${CDP_BASE}/close?target=tab-real`,
    ]);
  });

  it("keeps a JSON-looking innerText as text, not as a parsed JSON value", async () => {
    // evalInTab JSON-parses string results, so a bare-string script would turn
    // this page's "123" into the number 123 and then be discarded as non-text.
    vi.stubGlobal("fetch", cdpTransport({ body: { innerText: "123" } }));

    const result = await fetchCdp("https://example.com/numeric");

    expect(result).toEqual({ ok: true, method: "cdp", text: "123" });
  });

  it("reports a page with no body as empty rather than throwing", async () => {
    vi.stubGlobal("fetch", cdpTransport({ body: null }));

    const result = await fetchCdp("https://example.com/no-body");

    expect(result).toEqual({
      ok: false,
      method: "cdp",
      text: "",
      error: "empty extraction result",
    });
  });
});
