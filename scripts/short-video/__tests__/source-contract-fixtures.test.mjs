/**
 * Wire-contract locks for the stock/open media sources (#778).
 *
 * Fixtures under `fixtures/source-contracts/` are REAL captured responses:
 * each is the production `searchUrl` for the keyword "artificial intelligence
 * robot", trimmed to two entries (only the fields the adapter reads, all values
 * untouched). Captured 2026-10-25; Pexels/Unsplash/Pixabay/Coverr/Brave/Tavily
 * via curl, DuckDuckGo via the automation Chrome (i.js needs a live vqd),
 * SearXNG from localhost:8888.
 *
 * Each test runs the real adapter over its fixture and locks:
 *   - every wire entry parses into a candidate with a usable url/title
 *     (Pexels video's empty title and Wikimedia's null url are documented
 *     source behavior, not contract violations);
 *   - renaming the response container (photos → items) fails loudly with the
 *     source and field named — an external schema change cannot turn into a
 *     silent "0 results" again;
 *   - renaming the url/title entry field fails the same way.
 *
 * A new API media source must ship a fixture here — the missing-fixture guard
 * fails until one is captured (same rule as the pool contract, #305).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STOCK_MEDIA_SOURCES } from "../lib/source-registry.mjs";
import {
  parseDuckDuckGoImagesResponse,
  parseTavilyImagesResponse,
} from "../lib/progressive-search.mjs";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "source-contracts");
const KEYWORD = "artificial intelligence robot";

const isHttp = (v) => typeof v === "string" && /^https?:\/\//.test(v);
const isWxH = (v) => typeof v === "string" && /^\d+x\d+$/.test(v);
const isNonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const isAbsent = (v) => v === null || v === undefined;

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf8"));
}

function entriesAt(body, path) {
  let node = body;
  for (const key of path) node = node?.[key];
  return Array.isArray(node) ? node : [];
}

function capability(name, kind) {
  const source = STOCK_MEDIA_SOURCES.find((s) => s.name === name);
  const cap = source?.capabilities?.[kind];
  if (!cap?.parseResponse) {
    throw new Error(`[${name}] has no ${kind} API capability — the contract table is stale`);
  }
  return cap;
}

/**
 * The contract table. `required` labels start with the culprit field so a
 * parse drift names both the source and what stopped parsing.
 */
const CONTRACTS = [
  {
    source: "pexels",
    fixture: "pexels-images",
    registry: { name: "pexels", kind: "images" },
    container: ["photos"],
    required: [
      { label: "url (wire: src.original|src.large)", get: (c) => c.url, check: isHttp },
      { label: "resolution (wire: width+height)", get: (c) => c.resolution, check: isWxH },
      { label: "title (wire: alt)", get: (c) => c.title, check: isNonEmpty },
    ],
    drift: (body) => renameInEntries(body, ["photos"], "src", "src_v2"),
  },
  {
    source: "pexels-video",
    fixture: "pexels-video",
    registry: { name: "pexels-video", kind: "videos" },
    container: ["videos"],
    required: [
      { label: "url (wire: video_files[].link)", get: (c) => c.url, check: isHttp },
      {
        label: "resolution (wire: video_files[].width+height)",
        get: (c) => c.resolution,
        check: isWxH,
      },
      // #547: this endpoint ships no description. A synthesised title made
      // every result look like a keyword match, so the adapter keeps it empty.
      { label: "title stays empty (#547)", get: (c) => c.title, check: (v) => v === "" },
      { label: "author (wire: user.name)", get: (c) => c.author, check: isNonEmpty },
    ],
    assert: (candidates) => {
      for (const c of candidates) {
        expect(c.type).toBe("video");
        expect(c.duration).toBeGreaterThan(0);
      }
    },
    drift: (body) => renameInEntries(body, ["videos"], "video_files", "videoFiles"),
  },
  {
    source: "unsplash",
    fixture: "unsplash",
    registry: { name: "unsplash", kind: "images" },
    container: ["results"],
    required: [
      { label: "url (wire: urls.full|urls.regular)", get: (c) => c.url, check: isHttp },
      { label: "resolution (wire: width+height)", get: (c) => c.resolution, check: isWxH },
      { label: "title (wire: alt_description)", get: (c) => c.title, check: isNonEmpty },
    ],
    drift: (body) => renameInEntries(body, ["results"], "urls", "links"),
  },
  {
    source: "wikimedia",
    fixture: "wikimedia",
    registry: { name: "wikimedia", kind: "images" },
    container: ["query", "search"],
    required: [
      { label: "title (wire: title)", get: (c) => c.title, check: isNonEmpty },
      { label: "fileTitle (wire: title)", get: (c) => c.fileTitle, check: isNonEmpty },
      // The search list only returns File: page titles; the file URL is
      // resolved later from the title, so a null url here is the contract.
      { label: "url is resolved later (null here)", get: (c) => c.url, check: isAbsent },
    ],
    drift: (body) => renameInEntries(body, ["query", "search"], "title", "page_title"),
  },
  {
    source: "coverr",
    fixture: "coverr",
    registry: { name: "coverr", kind: "videos" },
    container: ["hits"],
    required: [
      { label: "url (wire: base_filename)", get: (c) => c.url, check: isHttp },
      {
        label: "baseFilename (wire: base_filename)",
        get: (c) => c.baseFilename,
        check: isNonEmpty,
      },
      { label: "title (wire: title)", get: (c) => c.title, check: isNonEmpty },
      // Orientation, not pixels: is_vertical maps to "vertical"/"horizontal".
      { label: "resolution (wire: is_vertical)", get: (c) => c.resolution, check: isNonEmpty },
    ],
    assert: (candidates) => {
      for (const c of candidates) {
        expect(c.type).toBe("video");
        expect(c.url).toContain(`/videos/${c.baseFilename}/1080p.mp4`);
      }
    },
    drift: (body) => renameInEntries(body, ["hits"], "base_filename", "baseFilename"),
  },
  {
    source: "pixabay",
    fixture: "pixabay-images",
    registry: { name: "pixabay", kind: "images" },
    container: ["hits"],
    required: [
      { label: "url (wire: largeImageURL|webformatURL)", get: (c) => c.url, check: isHttp },
      {
        label: "resolution (wire: imageWidth+imageHeight)",
        get: (c) => c.resolution,
        check: isWxH,
      },
      { label: "title (wire: tags)", get: (c) => c.title, check: isNonEmpty },
      { label: "author (wire: user)", get: (c) => c.author, check: isNonEmpty },
    ],
    drift: (body) => {
      renameInEntries(body, ["hits"], "largeImageURL", "largeImageURL_v2");
      renameInEntries(body, ["hits"], "webformatURL", "webformatURL_v2");
    },
  },
  {
    source: "brave_image",
    fixture: "brave-image",
    registry: { name: "brave_image", kind: "images" },
    container: ["results"],
    required: [
      { label: "url (wire: properties.url)", get: (c) => c.url, check: isHttp },
      {
        label: "resolution (wire: properties.width+height)",
        get: (c) => c.resolution,
        check: isWxH,
      },
      { label: "title (wire: title)", get: (c) => c.title, check: isNonEmpty },
    ],
    drift: (body) => {
      for (const entry of entriesAt(body, ["results"])) {
        entry.properties.imageUrl = entry.properties.url;
        delete entry.properties.url;
      }
    },
  },
  {
    source: "searxng_image",
    fixture: "searxng-image",
    registry: { name: "searxng_image", kind: "images" },
    container: ["results"],
    required: [
      { label: "url (wire: img_src)", get: (c) => c.url, check: isHttp },
      { label: "resolution (wire: resolution)", get: (c) => c.resolution, check: isNonEmpty },
      { label: "title (wire: title)", get: (c) => c.title, check: isNonEmpty },
    ],
    drift: (body) => renameInEntries(body, ["results"], "img_src", "imgSrc"),
  },
  {
    source: "duckduckgo_images",
    fixture: "duckduckgo-images",
    container: ["results"],
    parse: (body) => parseDuckDuckGoImagesResponse(body, KEYWORD),
    required: [
      { label: "url (wire: image)", get: (c) => c.url, check: isHttp },
      { label: "resolution (wire: width+height)", get: (c) => c.resolution, check: isWxH },
      { label: "title (wire: title)", get: (c) => c.title, check: isNonEmpty },
    ],
    assert: (candidates) => {
      for (const c of candidates) expect(c.source).toBe("duckduckgo_images");
    },
    drift: (body) => {
      for (const entry of entriesAt(body, ["results"])) {
        entry.width_px = entry.width;
        entry.height_px = entry.height;
        delete entry.width;
        delete entry.height;
      }
    },
  },
  {
    source: "tavily_images",
    fixture: "tavily-images",
    container: ["images"],
    parse: (body) => parseTavilyImagesResponse(body, KEYWORD),
    required: [
      { label: "url (wire: images[] string|entry.url)", get: (c) => c.url, check: isHttp },
      { label: "title (wire: description | keyword)", get: (c) => c.title, check: isNonEmpty },
    ],
    assert: (candidates) => {
      for (const c of candidates) expect(c.source).toBe("tavily_images");
    },
    // Real wire form today is a string array; the drift simulates the endpoint
    // switching to objects with an unrecognised url key.
    drift: (body) => {
      body.images = body.images.map((url) => ({ src: url }));
    },
  },
];

function wireCountOf(body, contract) {
  return entriesAt(body, contract.container).length;
}

/**
 * Runs the adapter and fails with the source and culprit field named. This is
 * the CI signal: any external schema change must surface here, not as a
 * downstream empty candidate pool.
 */
function assertContract(contract, body, wireCount) {
  const candidates = contract.registry
    ? capability(contract.registry.name, contract.registry.kind).parseResponse(body, KEYWORD)
    : contract.parse(body);

  if (candidates.length !== wireCount) {
    throw new Error(
      `[${contract.source}] wire drift: parsed ${candidates.length} of ${wireCount} entries ` +
        `from container "${contract.container.join(".")}" — container renamed, or entries lost their url field`,
    );
  }

  for (const [i, candidate] of candidates.entries()) {
    for (const rule of contract.required) {
      if (!rule.check(rule.get(candidate))) {
        throw new Error(
          `[${contract.source}] wire drift: entry ${i} failed "${rule.label}" ` +
            `(container "${contract.container.join(".")}")`,
        );
      }
    }
  }
  return candidates;
}

function renameInEntries(body, containerPath, from, to) {
  for (const entry of entriesAt(body, containerPath)) {
    entry[to] = entry[from];
    delete entry[from];
  }
}

function renameContainer(body, path) {
  const last = path[path.length - 1];
  let parent = body;
  for (const key of path.slice(0, -1)) parent = parent[key];
  parent[`${last}_v2`] = parent[last];
  delete parent[last];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("media source wire contracts (#778)", () => {
  it("every API media source ships a captured fixture", () => {
    const covered = new Set(
      CONTRACTS.map((c) => c.registry && `${c.registry.name}:${c.registry.kind}`),
    );
    const missing = STOCK_MEDIA_SOURCES.flatMap((source) =>
      Object.entries(source.capabilities ?? {})
        .filter(([kind, cap]) => cap?.method === "api" && (kind === "images" || kind === "videos"))
        .map(([kind]) => `${source.name}:${kind}`),
    ).filter((id) => !covered.has(id));

    if (missing.length > 0) {
      throw new Error(
        `missing wire fixture for ${missing.join(", ")} — capture the production searchUrl response ` +
          `into __tests__/fixtures/source-contracts/ and add a contract row before shipping`,
      );
    }
  });

  for (const contract of CONTRACTS) {
    const fixturePath = join(FIXTURE_DIR, `${contract.fixture}.json`);

    describe(`${contract.source} contract`, () => {
      if (!existsSync(fixturePath)) {
        it("has a captured wire fixture", () => {
          throw new Error(
            `missing fixture ${fixturePath} — recapture the source response before shipping`,
          );
        });
        return;
      }

      it("parses every wire entry into a usable candidate", () => {
        const body = loadFixture(contract.fixture);
        expect(wireCountOf(body, contract)).toBeGreaterThan(0);

        const candidates = assertContract(contract, body, wireCountOf(body, contract));
        expect(candidates).toHaveLength(wireCountOf(body, contract));
        for (const candidate of candidates) {
          expect(candidate).toHaveProperty("type");
        }
        contract.assert?.(candidates);
      });

      it("a renamed response container fails with source + field named", () => {
        const body = loadFixture(contract.fixture);
        const wireCount = wireCountOf(body, contract);
        expect(wireCount).toBeGreaterThan(0);

        renameContainer(body, contract.container);

        expect(() => assertContract(contract, body, wireCount)).toThrow(
          new RegExp(
            `${escapeRegExp(contract.source)}.*${escapeRegExp(contract.container.join("."))}`,
          ),
        );
      });

      it("a renamed url/title wire field fails with source + field named", () => {
        const body = loadFixture(contract.fixture);
        const wireCount = wireCountOf(body, contract);
        contract.drift(body);

        expect(() => assertContract(contract, body, wireCount)).toThrow(
          new RegExp(
            `${escapeRegExp(contract.source)}.*\\b(url|title|resolution|baseFilename|fileTitle)\\b`,
          ),
        );
      });
    });
  }
});
