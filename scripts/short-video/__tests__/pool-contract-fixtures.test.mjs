/**
 * Wire-contract locks for the pool engines (#305 Slice C).
 *
 * Fixtures are REAL captured responses (probe:
 * experiments/probe-305-pool-fixtures.mjs; brave/jina were captured via curl
 * through the local proxy — Node fetch cannot reach those hosts from this
 * network, the #281 environment note). Each test runs the real adapter over
 * its fixture and locks:
 *   - every wire entry parses into the article shape (url/title/snippet);
 *   - the engine's date field maps to ISO publishedAt (#309 news contract —
 *     the jina fixture caught its date field drifting to `publishedTime`);
 *   - a vocabulary drift (renamed url/link field) trips the #305 parse-drop
 *     alert instead of reading as a silent "0 results" quota burn.
 *
 * A new engine must ship a fixture here — the missing-fixture guard fails
 * loudly until one is captured.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { searchPool, POOL_ENGINES } from "../lib/search-pool.mjs";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "pool-contracts");

// The two wire vocabularies the mapping seam normalizes (#281: Serper's
// `link` vs the `url` every other engine uses).
const URL_FIELDS = ["url", "link"];

// Every date-field spelling across the four engines — parseable dates must
// never be dropped on the floor.
const DATE_KEYS = ["published_date", "page_age", "publishedTime", "date", "age"];

// Engine → response body path to its entry list.
const ENTRY_PATHS = {
  serper: ["organic"],
  brave: ["web", "results"],
  tavily: ["results"],
  jina: ["data"],
};

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf8"));
}

function entriesOf(body, engineName) {
  let node = body;
  for (const key of ENTRY_PATHS[engineName]) node = node?.[key];
  return Array.isArray(node) ? node : [];
}

function fetchReturning(body) {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
}

for (const engine of POOL_ENGINES) {
  const fixturePath = join(FIXTURE_DIR, `${engine.name}.json`);

  describe(`pool wire contract: ${engine.name} (#305)`, () => {
    beforeEach(() => {
      vi.stubEnv(engine.apiKeyEnv, "contract-test-key");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    if (!existsSync(fixturePath)) {
      it("has a captured wire fixture", () => {
        throw new Error(
          `missing fixture ${fixturePath} — capture it via the probe (experiments/probe-305-pool-fixtures.mjs) before shipping engine changes`,
        );
      });
      return;
    }

    it("parses every wire entry into the article shape", async () => {
      const body = loadFixture(engine.name);
      const rawEntries = entriesOf(body, engine.name);
      expect(rawEntries.length).toBeGreaterThan(0);
      vi.stubGlobal("fetch", fetchReturning(body));

      const {
        articles,
        engine: winner,
        attempts,
      } = await searchPool("DeepSeek", {
        engines: [engine],
      });
      expect(attempts).toEqual([]);
      expect(winner).toBe(engine.name);
      // Every entry with a usable url parses — no silent drops on the wire shape.
      const parseable = rawEntries.filter((e) =>
        URL_FIELDS.some((f) => typeof e?.[f] === "string" && e[f].startsWith("http")),
      );
      expect(articles).toHaveLength(parseable.length);
      for (const a of articles) {
        expect(typeof a.title).toBe("string");
        expect(a.url).toMatch(/^https?:\/\//);
        expect(a.snippet.length).toBeLessThanOrEqual(200);
      }
    });

    it("maps the engine's date field to ISO publishedAt (#309 news contract)", async () => {
      const body = loadFixture(engine.name);
      const rawEntries = entriesOf(body, engine.name);
      vi.stubGlobal("fetch", fetchReturning(body));

      const { articles } = await searchPool("DeepSeek", { engines: [engine] });
      // A parseable wire date must survive into ISO publishedAt — never
      // dropped on the floor (fail-closed freshness filters need it). Partial
      // coverage is a real contract: the jina fixture documents it (#309
      // probe: ~62.5% dated — that is WHY jina exits the news chain).
      const dated = rawEntries.filter((e) => DATE_KEYS.some((k) => e?.[k] != null)).length;
      expect(articles.filter((a) => a.publishedAt)).toHaveLength(dated);
      for (const a of articles) {
        if (a.publishedAt) expect(a.publishedAt).toMatch(/^20\d\d-/);
      }
    });

    it("vocabulary drift trips parse-drop, not a silent '0 results'", async () => {
      const body = loadFixture(engine.name);
      const rawEntries = entriesOf(body, engine.name);
      // Simulate the #281 class: the engine renames its url/link field.
      const drifted = structuredClone(body);
      let node = drifted;
      for (const key of ENTRY_PATHS[engine.name]) node = node?.[key];
      for (const entry of node ?? []) {
        for (const f of URL_FIELDS) {
          if (f in entry) {
            entry[`_${f}`] = entry[f];
            delete entry[f];
          }
        }
      }
      vi.stubGlobal("fetch", fetchReturning(drifted));

      const { attempts } = await searchPool("DeepSeek", { engines: [engine] });
      expect(attempts[0].ok).toBe(false);
      expect(attempts[0].error).toBe(`parse-drop: ${rawEntries.length} entries dropped (HTTP 200)`);
    });
  });
}
