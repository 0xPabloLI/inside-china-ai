/**
 * Wire-contract locks for the API media sources and progressive image parsers
 * (#778).
 *
 * Fixtures under `fixtures/source-contracts/` are REAL responses captured on
 * 2026-10-25 by `scripts/short-video/probe-source-contracts.mjs` (keyword
 * "artificial intelligence robot"): Pexels/Unsplash/Pixabay/Coverr/Brave/
 * Tavily/SearXNG from their production endpoints, SearXNG from the local
 * instance (`npm run searxng:ensure`), DuckDuckGo from its i.js endpoint
 * (landing page first for the dynamic vqd). Each fixture keeps the first two
 * entries of its response container with every content field and value
 * untouched — nothing is hand-authored or pruned, so the fixture can disprove
 * our assumptions (e.g. Pexels video entries really have no `description`).
 * DuckDuckGo's ephemeral anti-bot tokens (`vqd`, `image_token`,
 * `thumbnail_token`) are the only removals, as credential hygiene; none are
 * contract fields.
 *
 * Each test runs the real adapter over its fixture and locks:
 *   - every kept wire entry parses into the candidate the wire implies:
 *     exact url, resolution, duration, author and title — not just "non-empty";
 *   - a title that equals the keyword is the adapter fallback, so a dropped
 *     wire title field fails instead of hiding behind `title || keyword`
 *     (#547: attribution must never pose as content evidence);
 *   - Pexels video's empty title, Wikimedia's unresolved url and Tavily's
 *     string images with keyword-only title are the documented real wire
 *     behavior, not violations;
 *   - renaming the response container or any consumed wire field (including
 *     type changes and fallback-masked fields) fails with the source and field
 *     named, so an external schema change cannot resurface as a silent
 *     "0 results".
 *
 * A new API media source or progressive image parser must ship a fixture here
 * — the missing-fixture guard fails until one is captured (same rule as the
 * pool contract, #305).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STOCK_MEDIA_SOURCES } from "../lib/source-registry.mjs";
import * as progressiveSearch from "../lib/progressive-search.mjs";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "source-contracts");
const KEYWORD = "artificial intelligence robot";

const isHttp = (v) => typeof v === "string" && /^https?:\/\//.test(v);
const isWxH = (v) => typeof v === "string" && /^\d+x\d+$/.test(v);
const isNonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const titleFromWire = (v) => isNonEmpty(v) && v !== KEYWORD;
const isPositiveNumber = (v) => typeof v === "number" && v > 0;

const CONTRACTS = [
  {
    registry: { name: "pexels", kind: "images" },
    fixture: "pexels-images",
    container: ["photos"],
    wireField: "src.original",
    required: [
      { label: "url (wire: src.original|src.large)", get: (c) => c.url, check: isHttp },
      { label: "resolution (wire: width+height)", get: (c) => c.resolution, check: isWxH },
      { label: "title (wire: alt)", get: (c) => c.title, check: titleFromWire },
    ],
    assert: (candidates, entries) => {
      for (const [i, c] of candidates.entries()) {
        const entry = entries[i];
        expect(c.url).toBe(entry.src.original ?? entry.src.large);
        expect(c.resolution).toBe(`${entry.width}x${entry.height}`);
        expect(c.title).toBe(entry.alt);
      }
    },
    drifts: [
      { field: "src", mutate: (body) => renameInEntries(body, ["photos"], "src", "src_v2") },
      { field: "alt", mutate: (body) => renameInEntries(body, ["photos"], "alt", "alt_v2") },
    ],
  },
  {
    registry: { name: "pexels-video", kind: "videos" },
    fixture: "pexels-video",
    container: ["videos"],
    wireField: "video_files[].link",
    wireRequired: [
      {
        field: "video_files",
        check: (entry) => Array.isArray(entry.video_files) && entry.video_files.length > 0,
      },
    ],
    required: [
      { label: "url (wire: video_files[].link)", get: (c) => c.url, check: isHttp },
      {
        label: "resolution (wire: video_files[].width+height)",
        get: (c) => c.resolution,
        check: isWxH,
      },
      { label: "duration (wire: duration)", get: (c) => c.duration, check: isPositiveNumber },
      // #547: this endpoint ships no description. A synthesised title made
      // every result look like a keyword match, so the adapter keeps it empty.
      { label: "title stays empty (#547)", get: (c) => c.title, check: (v) => v === "" },
      { label: "author (wire: user.name)", get: (c) => c.author, check: isNonEmpty },
    ],
    assert: (candidates, entries) => {
      for (const [i, c] of candidates.entries()) {
        const entry = entries[i];
        const best = [...entry.video_files].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
        expect(c.type).toBe("video");
        expect(c.title).toBe("");
        expect(c.url).toBe(best.link);
        expect(c.resolution).toBe(`${best.width}x${best.height}`);
        expect(c.duration).toBe(entry.duration);
        expect(c.author).toBe(entry.user.name);
      }
    },
    drifts: [
      {
        field: "video_files",
        mutate: (body) => renameInEntries(body, ["videos"], "video_files", "videoFiles"),
      },
      {
        field: "duration",
        mutate: (body) => {
          for (const entry of entriesAt(body, ["videos"])) entry.duration = String(entry.duration);
        },
      },
    ],
  },
  {
    registry: { name: "unsplash", kind: "images" },
    fixture: "unsplash",
    container: ["results"],
    wireField: "urls.full",
    required: [
      { label: "url (wire: urls.full|urls.regular)", get: (c) => c.url, check: isHttp },
      { label: "resolution (wire: width+height)", get: (c) => c.resolution, check: isWxH },
      { label: "title (wire: alt_description)", get: (c) => c.title, check: titleFromWire },
    ],
    assert: (candidates, entries) => {
      for (const [i, c] of candidates.entries()) {
        const entry = entries[i];
        expect(c.url).toBe(entry.urls.full ?? entry.urls.regular);
        expect(c.resolution).toBe(`${entry.width}x${entry.height}`);
        expect(c.title).toBe(entry.alt_description);
      }
    },
    drifts: [
      { field: "urls", mutate: (body) => renameInEntries(body, ["results"], "urls", "links") },
      {
        field: "alt_description",
        mutate: (body) => renameInEntries(body, ["results"], "alt_description", "altDescription"),
      },
    ],
  },
  {
    registry: { name: "wikimedia", kind: "images" },
    fixture: "wikimedia",
    container: ["query", "search"],
    wireField: "title",
    required: [
      { label: "title (wire: title)", get: (c) => c.title, check: isNonEmpty },
      { label: "fileTitle (wire: title)", get: (c) => c.fileTitle, check: isNonEmpty },
      // The search list only returns File: page titles; the file URL is
      // resolved later from the title, so this adapter does not emit one.
    ],
    assert: (candidates, entries) => {
      for (const [i, c] of candidates.entries()) {
        // `asset-sourcer` queries Commons by this exact page title, so the
        // "File:" prefix must survive verbatim.
        expect(c.fileTitle).toBe(entries[i].title);
        expect(c.title).toBe(entries[i].title);
        expect(c.url).toBeNull();
      }
    },
    drifts: [
      {
        field: "title",
        mutate: (body) => renameInEntries(body, ["query", "search"], "title", "page_title"),
      },
    ],
  },
  {
    registry: { name: "coverr", kind: "videos" },
    fixture: "coverr",
    container: ["hits"],
    wireField: "base_filename",
    wireRequired: [
      { field: "is_vertical", check: (entry) => typeof entry.is_vertical === "boolean" },
    ],
    required: [
      { label: "url (wire: base_filename)", get: (c) => c.url, check: isHttp },
      {
        label: "baseFilename (wire: base_filename)",
        get: (c) => c.baseFilename,
        check: isNonEmpty,
      },
      { label: "title (wire: title)", get: (c) => c.title, check: titleFromWire },
      // Orientation, not pixels: is_vertical maps to "vertical"/"horizontal".
      { label: "resolution (wire: is_vertical)", get: (c) => c.resolution, check: isNonEmpty },
    ],
    assert: (candidates, entries) => {
      for (const [i, c] of candidates.entries()) {
        const entry = entries[i];
        expect(c.type).toBe("video");
        expect(c.url).toBe(`https://cdn.coverr.co/videos/${entry.base_filename}/1080p.mp4`);
        expect(c.baseFilename).toBe(entry.base_filename);
        expect(c.title).toBe(entry.title);
        expect(c.resolution).toBe(entry.is_vertical ? "vertical" : "horizontal");
      }
    },
    drifts: [
      {
        field: "base_filename",
        mutate: (body) => renameInEntries(body, ["hits"], "base_filename", "baseFilename"),
      },
      { field: "title", mutate: (body) => renameInEntries(body, ["hits"], "title", "title_v2") },
      {
        field: "is_vertical",
        mutate: (body) => renameInEntries(body, ["hits"], "is_vertical", "isVertical"),
      },
    ],
  },
  {
    registry: { name: "pixabay", kind: "images" },
    fixture: "pixabay-images",
    container: ["hits"],
    wireField: "largeImageURL",
    required: [
      { label: "url (wire: largeImageURL|webformatURL)", get: (c) => c.url, check: isHttp },
      {
        label: "resolution (wire: imageWidth+imageHeight)",
        get: (c) => c.resolution,
        check: isWxH,
      },
      { label: "title (wire: tags)", get: (c) => c.title, check: titleFromWire },
      { label: "author (wire: user)", get: (c) => c.author, check: isNonEmpty },
    ],
    assert: (candidates, entries) => {
      for (const [i, c] of candidates.entries()) {
        const entry = entries[i];
        expect(c.url).toBe(entry.largeImageURL ?? entry.webformatURL);
        // Quality-first: the large rendition, not the 426x640 preview.
        expect(c.resolution).toBe(`${entry.imageWidth}x${entry.imageHeight}`);
        expect(c.resolution).not.toBe(`${entry.webformatWidth}x${entry.webformatHeight}`);
        expect(c.title).toBe(entry.tags);
        expect(c.author).toBe(entry.user);
      }
    },
    drifts: [
      {
        field: "largeImageURL",
        mutate: (body) => {
          renameInEntries(body, ["hits"], "largeImageURL", "largeImageURL_v2");
          renameInEntries(body, ["hits"], "webformatURL", "webformatURL_v2");
        },
      },
      { field: "tags", mutate: (body) => renameInEntries(body, ["hits"], "tags", "tags_v2") },
    ],
  },
  {
    registry: { name: "brave_image", kind: "images" },
    fixture: "brave-image",
    container: ["results"],
    wireField: "properties.url",
    // The adapter drops entries without a url, so the expected count is the
    // number of wire entries that actually carry one.
    hasUrl: (entry) => isNonEmpty(entry?.properties?.url),
    required: [
      { label: "url (wire: properties.url)", get: (c) => c.url, check: isHttp },
      {
        label: "resolution (wire: properties.width+height)",
        get: (c) => c.resolution,
        check: isWxH,
      },
      { label: "title (wire: title)", get: (c) => c.title, check: titleFromWire },
    ],
    assert: (candidates, entries) => {
      for (const [i, c] of candidates.entries()) {
        const entry = entries[i];
        expect(c.url).toBe(entry.properties.url);
        expect(c.resolution).toBe(`${entry.properties.width}x${entry.properties.height}`);
        expect(c.title).toBe(entry.title);
      }
    },
    drifts: [
      {
        field: "properties.url",
        mutate: (body) => {
          for (const entry of entriesAt(body, ["results"])) {
            entry.properties.imageUrl = entry.properties.url;
            delete entry.properties.url;
          }
        },
      },
      { field: "title", mutate: (body) => renameInEntries(body, ["results"], "title", "title_v2") },
    ],
  },
  {
    registry: { name: "searxng_image", kind: "images" },
    fixture: "searxng-image",
    container: ["results"],
    wireField: "img_src",
    hasUrl: (entry) => isNonEmpty(entry?.img_src),
    required: [
      { label: "url (wire: img_src)", get: (c) => c.url, check: isHttp },
      { label: "resolution (wire: resolution)", get: (c) => c.resolution, check: isNonEmpty },
      { label: "title (wire: title)", get: (c) => c.title, check: titleFromWire },
    ],
    assert: (candidates, entries) => {
      for (const [i, c] of candidates.entries()) {
        expect(c.url).toBe(entries[i].img_src);
        expect(c.resolution).toBe(entries[i].resolution);
        expect(c.title).toBe(entries[i].title);
      }
    },
    drifts: [
      {
        field: "img_src",
        mutate: (body) => renameInEntries(body, ["results"], "img_src", "imgSrc"),
      },
      { field: "title", mutate: (body) => renameInEntries(body, ["results"], "title", "title_v2") },
    ],
  },
  {
    parser: "parseBraveImageResponse",
    label: "brave_image",
    fixture: "brave-image",
    container: ["results"],
    wireField: "properties.url",
    hasUrl: (entry) => isNonEmpty(entry?.properties?.url),
    required: [
      { label: "url (wire: properties.url)", get: (c) => c.url, check: isHttp },
      {
        label: "resolution (wire: properties.width+height)",
        get: (c) => c.resolution,
        check: isWxH,
      },
      { label: "title (wire: title)", get: (c) => c.title, check: titleFromWire },
    ],
    assert: (candidates, entries) => {
      for (const [i, c] of candidates.entries()) {
        expect(c.source).toBe("brave_image");
        expect(c.url).toBe(entries[i].properties.url);
        expect(c.resolution).toBe(`${entries[i].properties.width}x${entries[i].properties.height}`);
        expect(c.title).toBe(entries[i].title);
      }
    },
    drifts: [
      {
        field: "properties.url",
        mutate: (body) => {
          for (const entry of entriesAt(body, ["results"])) {
            entry.properties.imageUrl = entry.properties.url;
            delete entry.properties.url;
          }
        },
      },
      { field: "title", mutate: (body) => renameInEntries(body, ["results"], "title", "title_v2") },
    ],
  },
  {
    parser: "parseSearXngImageResponse",
    label: "searxng_image",
    fixture: "searxng-image",
    container: ["results"],
    wireField: "img_src",
    hasUrl: (entry) => isNonEmpty(entry?.img_src),
    required: [
      { label: "url (wire: img_src)", get: (c) => c.url, check: isHttp },
      { label: "resolution (wire: resolution)", get: (c) => c.resolution, check: isNonEmpty },
      { label: "title (wire: title)", get: (c) => c.title, check: titleFromWire },
    ],
    assert: (candidates, entries) => {
      for (const [i, c] of candidates.entries()) {
        expect(c.source).toBe("searxng_image");
        expect(c.url).toBe(entries[i].img_src);
        expect(c.resolution).toBe(entries[i].resolution);
        expect(c.title).toBe(entries[i].title);
      }
    },
    drifts: [
      {
        field: "img_src",
        mutate: (body) => renameInEntries(body, ["results"], "img_src", "imgSrc"),
      },
      { field: "title", mutate: (body) => renameInEntries(body, ["results"], "title", "title_v2") },
    ],
  },
  {
    parser: "parseDuckDuckGoImagesResponse",
    label: "duckduckgo_images",
    fixture: "duckduckgo-images",
    container: ["results"],
    wireField: "image",
    hasUrl: (entry) => isNonEmpty(entry?.image),
    required: [
      { label: "url (wire: image)", get: (c) => c.url, check: isHttp },
      { label: "resolution (wire: width+height)", get: (c) => c.resolution, check: isWxH },
      { label: "title (wire: title)", get: (c) => c.title, check: titleFromWire },
    ],
    assert: (candidates, entries) => {
      for (const [i, c] of candidates.entries()) {
        expect(c.source).toBe("duckduckgo_images");
        expect(c.url).toBe(entries[i].image);
        expect(c.resolution).toBe(`${entries[i].width}x${entries[i].height}`);
        expect(c.title).toBe(entries[i].title);
      }
    },
    drifts: [
      { field: "image", mutate: (body) => renameInEntries(body, ["results"], "image", "imageUrl") },
      { field: "title", mutate: (body) => renameInEntries(body, ["results"], "title", "title_v2") },
    ],
  },
  {
    // Tavily's real wire form is a string array (no title/description), so the
    // keyword fallback in the title is the contract here. The parser's
    // object-entry branch is defensive for an unobserved API variant and is
    // deliberately not fixtured: a hand-written object sample would only test
    // our own assumption (#778).
    parser: "parseTavilyImagesResponse",
    label: "tavily_images",
    fixture: "tavily-images",
    container: ["images"],
    wireField: "images[] string|entry.url",
    hasUrl: (entry) => (typeof entry === "string" ? isNonEmpty(entry) : isHttp(entry?.url)),
    required: [
      { label: "url (wire: images[] string|entry.url)", get: (c) => c.url, check: isHttp },
      { label: "title (wire: description | keyword)", get: (c) => c.title, check: isNonEmpty },
    ],
    assert: (candidates, entries) => {
      for (const [i, c] of candidates.entries()) {
        expect(c.source).toBe("tavily_images");
        expect(c.url).toBe(entries[i]);
        expect(c.title).toBe(KEYWORD);
      }
    },
    drifts: [
      {
        field: "images",
        // The endpoint switching to objects with an unrecognised url key.
        mutate: (body) => {
          body.images = body.images.map((url) => ({ src: url }));
        },
      },
    ],
  },
];

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf8"));
}

function entriesAt(body, path) {
  let node = body;
  for (const key of path) node = node?.[key];
  return Array.isArray(node) ? node : [];
}

function sourceOf(contract) {
  return contract.registry?.name ?? contract.label;
}

function capability(name, kind) {
  const source = STOCK_MEDIA_SOURCES.find((s) => s.name === name);
  const cap = source?.capabilities?.[kind];
  if (!cap?.parseResponse) {
    throw new Error(`[${name}] has no ${kind} API capability — the contract table is stale`);
  }
  return cap;
}

/** Entries the adapter is expected to keep: all of them, minus url-less drops. */
function keptEntries(contract, body) {
  const entries = entriesAt(body, contract.container);
  return contract.hasUrl ? entries.filter(contract.hasUrl) : entries;
}

/** Fallback-masked fields (e.g. Coverr's is_vertical) must exist on the wire. */
function assertWireShape(contract, body) {
  for (const [i, entry] of entriesAt(body, contract.container).entries()) {
    for (const rule of contract.wireRequired ?? []) {
      if (!rule.check(entry)) {
        throw new Error(
          `[${sourceOf(contract)}] wire drift: entry ${i} lost "${rule.field}" ` +
            `(container "${contract.container.join(".")}")`,
        );
      }
    }
  }
}

/**
 * Runs the adapter and fails with the source and culprit field named. This is
 * the CI signal: any external schema change must surface here, not as a
 * downstream empty candidate pool.
 */
function assertContract(contract, body, expectedCount) {
  assertWireShape(contract, body);
  const candidates = contract.parser
    ? progressiveSearch[contract.parser](body, KEYWORD)
    : capability(contract.registry.name, contract.registry.kind).parseResponse(body, KEYWORD);

  if (candidates.length !== expectedCount) {
    throw new Error(
      `[${sourceOf(contract)}] wire drift: parsed ${candidates.length} of ${expectedCount} entries ` +
        `from container "${contract.container.join(".")}" — expected each entry to expose ` +
        `"${contract.wireField}", which is missing or renamed`,
    );
  }

  for (const [i, candidate] of candidates.entries()) {
    for (const rule of contract.required) {
      if (!rule.check(rule.get(candidate))) {
        throw new Error(
          `[${sourceOf(contract)}] wire drift: entry ${i} failed "${rule.label}" ` +
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

function sourcePattern(contract, field) {
  return new RegExp(`${escapeRegExp(sourceOf(contract))}.*${escapeRegExp(field)}`);
}

describe("media source wire contracts (#778)", () => {
  it("every API media source and progressive image parser ships a fixture", () => {
    const covered = new Set(
      CONTRACTS.filter((c) => c.registry).map((c) => `${c.registry.name}:${c.registry.kind}`),
    );
    const missingSources = STOCK_MEDIA_SOURCES.flatMap((source) =>
      Object.entries(source.capabilities ?? {})
        .filter(([kind, cap]) => cap?.method === "api" && (kind === "images" || kind === "videos"))
        .map(([kind]) => `${source.name}:${kind}`),
    ).filter((id) => !covered.has(id));

    const coveredParsers = new Set(CONTRACTS.filter((c) => c.parser).map((c) => c.parser));
    const missingParsers = Object.keys(progressiveSearch).filter(
      (name) =>
        /^parse\w*Images?Response$/.test(name) &&
        typeof progressiveSearch[name] === "function" &&
        !coveredParsers.has(name),
    );

    const gaps = [...missingSources, ...missingParsers.map((n) => `progressive ${n}`)];
    if (gaps.length > 0) {
      throw new Error(
        `missing wire fixture for ${gaps.join(", ")} — capture the production response with ` +
          `scripts/short-video/probe-source-contracts.mjs and add a contract row before shipping`,
      );
    }
  });

  for (const contract of CONTRACTS) {
    const fixturePath = join(FIXTURE_DIR, `${contract.fixture}.json`);

    describe(`${sourceOf(contract)} contract`, () => {
      if (!existsSync(fixturePath)) {
        it("has a captured wire fixture", () => {
          throw new Error(
            `missing fixture ${fixturePath} — recapture the source response before shipping`,
          );
        });
        return;
      }

      it("parses every wire entry into the candidate the wire implies", () => {
        const body = loadFixture(contract.fixture);
        const entries = keptEntries(contract, body);
        expect(entries.length).toBeGreaterThan(0);

        const candidates = assertContract(contract, body, entries.length);
        contract.assert(candidates, entries);
      });

      it("a renamed response container fails with source + field named", () => {
        const body = loadFixture(contract.fixture);
        const expectedCount = keptEntries(contract, body).length;
        expect(expectedCount).toBeGreaterThan(0);

        renameContainer(body, contract.container);

        expect(() => assertContract(contract, body, expectedCount)).toThrow(
          sourcePattern(contract, contract.container.join(".")),
        );
      });

      for (const drift of contract.drifts) {
        it(`a drifted "${drift.field}" fails with source + field named`, () => {
          const body = loadFixture(contract.fixture);
          const expectedCount = keptEntries(contract, body).length;
          expect(expectedCount).toBeGreaterThan(0);

          drift.mutate(body);

          expect(() => assertContract(contract, body, expectedCount)).toThrow(
            sourcePattern(contract, drift.field),
          );
        });
      }
    });
  }
});
