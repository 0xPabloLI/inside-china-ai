/**
 * Wire-contract locks for the API media sources (#778, registry batch 1).
 *
 * Fixtures under `fixtures/source-contracts/` are REAL responses captured on
 * 2026-10-25 from each source's production `searchUrl` (keyword "artificial
 * intelligence robot"): Pexels/Unsplash/Pixabay/Coverr/Brave via curl, SearXNG
 * from the local instance (`npm run searxng:ensure`). Each fixture keeps two
 * wire entries and the fields the adapter consumes; every kept value is
 * verbatim — nothing is hand-authored. Unconsumed sibling fields are dropped
 * to keep the fixture small.
 *
 * Recapture: call `capabilities[kind].searchUrl(KEYWORD, key)` from
 * `source-registry.mjs`, then trim to two entries without editing values.
 *
 * Each test runs the real adapter over its fixture and locks:
 *   - every wire entry parses into a candidate with a usable url and a title
 *     that came from the wire (not the keyword fallback), so a dropped title
 *     field cannot hide behind `title || keyword`;
 *   - Pexels video's empty title and Wikimedia's unresolved url are the
 *     documented source behavior, not contract violations;
 *   - renaming the response container, an identity field, a title field or a
 *     numeric type fails with the source and field named — an external schema
 *     change cannot resurface as a silent "0 results".
 *
 * A new API media source must ship a fixture here — the missing-fixture guard
 * fails until one is captured (same rule as the pool contract, #305).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STOCK_MEDIA_SOURCES } from "../lib/source-registry.mjs";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "source-contracts");
const KEYWORD = "artificial intelligence robot";

const isHttp = (v) => typeof v === "string" && /^https?:\/\//.test(v);
const isWxH = (v) => typeof v === "string" && /^\d+x\d+$/.test(v);
const isNonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
// A title that equals the search keyword is the adapter's fallback, i.e. the
// wire title field disappeared — #547: a synthesised title must never pass.
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
    drift: {
      field: "src.original",
      mutate: (body) => renameInEntries(body, ["photos"], "src", "src_v2"),
    },
    titleDrift: { mutate: (body) => renameInEntries(body, ["photos"], "alt", "alt_v2") },
  },
  {
    registry: { name: "pexels-video", kind: "videos" },
    fixture: "pexels-video",
    container: ["videos"],
    wireField: "video_files[].link",
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
    assert: (candidates) => {
      for (const c of candidates) expect(c.type).toBe("video");
    },
    drift: {
      field: "video_files[].link",
      mutate: (body) => renameInEntries(body, ["videos"], "video_files", "videoFiles"),
    },
    typeDrift: {
      field: "duration",
      mutate: (body) => {
        for (const entry of entriesAt(body, ["videos"])) entry.duration = String(entry.duration);
      },
    },
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
    drift: {
      field: "urls.full",
      mutate: (body) => renameInEntries(body, ["results"], "urls", "links"),
    },
    titleDrift: {
      mutate: (body) => renameInEntries(body, ["results"], "alt_description", "altDescription"),
    },
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
    // Wikimedia's identity field is its title, so one drift covers it.
    drift: {
      field: "title",
      mutate: (body) => renameInEntries(body, ["query", "search"], "title", "page_title"),
    },
  },
  {
    registry: { name: "coverr", kind: "videos" },
    fixture: "coverr",
    container: ["hits"],
    wireField: "base_filename",
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
    assert: (candidates) => {
      for (const c of candidates) {
        expect(c.type).toBe("video");
        expect(c.url).toContain(`/videos/${c.baseFilename}/1080p.mp4`);
        expect(c.url).not.toContain("/undefined/");
      }
    },
    drift: {
      field: "base_filename",
      mutate: (body) => renameInEntries(body, ["hits"], "base_filename", "baseFilename"),
    },
    titleDrift: { mutate: (body) => renameInEntries(body, ["hits"], "title", "title_v2") },
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
    drift: {
      field: "largeImageURL",
      mutate: (body) => {
        renameInEntries(body, ["hits"], "largeImageURL", "largeImageURL_v2");
        renameInEntries(body, ["hits"], "webformatURL", "webformatURL_v2");
      },
    },
    titleDrift: { mutate: (body) => renameInEntries(body, ["hits"], "tags", "tags_v2") },
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
    drift: {
      field: "properties.url",
      mutate: (body) => {
        for (const entry of entriesAt(body, ["results"])) {
          entry.properties.imageUrl = entry.properties.url;
          delete entry.properties.url;
        }
      },
    },
    titleDrift: { mutate: (body) => renameInEntries(body, ["results"], "title", "title_v2") },
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
    drift: {
      field: "img_src",
      mutate: (body) => renameInEntries(body, ["results"], "img_src", "imgSrc"),
    },
    titleDrift: { mutate: (body) => renameInEntries(body, ["results"], "title", "title_v2") },
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

function capability(name, kind) {
  const source = STOCK_MEDIA_SOURCES.find((s) => s.name === name);
  const cap = source?.capabilities?.[kind];
  if (!cap?.parseResponse) {
    throw new Error(`[${name}] has no ${kind} API capability — the contract table is stale`);
  }
  return cap;
}

/** Entries the adapter is expected to keep: all of them, minus url-less drops. */
function expectedCandidateCount(contract, body) {
  const entries = entriesAt(body, contract.container);
  return contract.hasUrl ? entries.filter(contract.hasUrl).length : entries.length;
}

/**
 * Runs the adapter and fails with the source and culprit field named. This is
 * the CI signal: any external schema change must surface here, not as a
 * downstream empty candidate pool.
 */
function assertContract(contract, body, expectedCount) {
  const source = contract.registry.name;
  const candidates = capability(contract.registry.name, contract.registry.kind).parseResponse(
    body,
    KEYWORD,
  );

  if (candidates.length !== expectedCount) {
    throw new Error(
      `[${source}] wire drift: parsed ${candidates.length} of ${expectedCount} entries ` +
        `from container "${contract.container.join(".")}" — expected each entry to expose ` +
        `"${contract.wireField}", which is missing or renamed`,
    );
  }

  for (const [i, candidate] of candidates.entries()) {
    for (const rule of contract.required) {
      if (!rule.check(rule.get(candidate))) {
        throw new Error(
          `[${source}] wire drift: entry ${i} failed "${rule.label}" ` +
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
  return new RegExp(`${escapeRegExp(contract.registry.name)}.*${escapeRegExp(field)}`);
}

describe("media source wire contracts (#778)", () => {
  it("every API media source ships a captured fixture", () => {
    const covered = new Set(CONTRACTS.map((c) => `${c.registry.name}:${c.registry.kind}`));
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

    describe(`${contract.registry.name} contract`, () => {
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
        const expectedCount = expectedCandidateCount(contract, body);
        expect(expectedCount).toBeGreaterThan(0);

        const candidates = assertContract(contract, body, expectedCount);
        expect(candidates).toHaveLength(expectedCount);
        contract.assert?.(candidates);
      });

      it("a renamed response container fails with source + field named", () => {
        const body = loadFixture(contract.fixture);
        const expectedCount = expectedCandidateCount(contract, body);
        expect(expectedCount).toBeGreaterThan(0);

        renameContainer(body, contract.container);

        expect(() => assertContract(contract, body, expectedCount)).toThrow(
          sourcePattern(contract, contract.container.join(".")),
        );
      });

      it("a renamed identity field fails with source + field named", () => {
        const body = loadFixture(contract.fixture);
        const expectedCount = expectedCandidateCount(contract, body);
        contract.drift.mutate(body);

        expect(() => assertContract(contract, body, expectedCount)).toThrow(
          sourcePattern(contract, contract.drift.field),
        );
      });

      if (contract.titleDrift) {
        it("a dropped title field fails with source + field named", () => {
          const body = loadFixture(contract.fixture);
          const expectedCount = expectedCandidateCount(contract, body);
          contract.titleDrift.mutate(body);

          expect(() => assertContract(contract, body, expectedCount)).toThrow(
            sourcePattern(contract, "title"),
          );
        });
      }

      if (contract.typeDrift) {
        it("a changed field type fails with source + field named", () => {
          const body = loadFixture(contract.fixture);
          const expectedCount = expectedCandidateCount(contract, body);
          contract.typeDrift.mutate(body);

          expect(() => assertContract(contract, body, expectedCount)).toThrow(
            sourcePattern(contract, contract.typeDrift.field),
          );
        });
      }
    });
  }
});
