import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHART_IMG_V2_URL,
  CHART_PARAM_FALLBACKS,
  buildChartAssets,
  fetchChartAsset,
  loadChartSymbolMap,
  resolveChartEntity,
  resolveChartParams,
} from "../lib/chart-asset.mjs";
import { admissionSource, isRelevanceAdmitted } from "../lib/relevance-verdict.mjs";
import { assignAssetsToScenes } from "../lib/asset-sourcer.mjs";
import { probeChartHydration } from "../lib/chart-asset.mjs";
import { PNG as PNGImage } from "pngjs";

/**
 * Build a real 800×600 chart PNG with vertical bars painted in the given
 * plot-band columns (probe band: x 16-720 → 16 columns of 44px, y 72-552).
 * The background is white; bars are strong red so they clear the 90 diff.
 */
function chartPng(paintedColumns) {
  const png = new PNGImage({ width: 800, height: 600 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255;
    png.data[i + 1] = 255;
    png.data[i + 2] = 255;
    png.data[i + 3] = 255;
  }
  for (const c of paintedColumns) {
    const x0 = 16 + c * 44 + 4;
    for (let x = x0; x < x0 + 36; x++) {
      for (let y = 100; y < 400; y++) {
        const i = (y * 800 + x) * 4;
        png.data[i] = 200;
        png.data[i + 1] = 30;
        png.data[i + 2] = 30;
      }
    }
  }
  return PNGImage.sync.write(png);
}

/** Every column painted — passes the hydration probe. */
const GOOD_PNG = chartPng([...Array(16).keys()]);
/** Middle run of 8 empty columns — fails coverage AND empty-run thresholds. */
const BAD_PNG = chartPng([0, 1, 2, 3, 12, 13, 14, 15]);

const symbolMap = (over = {}) => ({
  version: "test",
  defaults: { interval: "1D", range: "6M", theme: "light" },
  entities: [
    {
      key: "zhipu",
      symbol: "HKEX:2513",
      label: "Zhipu (Z. AI Co., Ltd.)",
      exchange: "HKEX",
      aliases: ["zhipu", "智谱"],
    },
    {
      key: "minimax",
      symbol: "HKEX:100",
      label: "MiniMax Group",
      exchange: "HKEX",
      aliases: ["minimax", "稀宇科技"],
    },
    {
      key: "hang-seng-tech",
      symbol: "HSI:HSTECH",
      label: "Hang Seng TECH Index",
      exchange: "HSI",
      aliases: ["hang seng tech", "恒生科技", "hstech"],
    },
    ...(over.entities ?? []),
  ],
});

// ── loadChartSymbolMap ──

describe("loadChartSymbolMap", () => {
  it("rejects a symbol that is not the full EXCHANGE:SYMBOL form", () => {
    // Bare numeric symbols resolve to arbitrary instruments (2513 → a
    // FOREX.com CFD, probed 2026-11-15) — the map must refuse them.
    const dir = mkdtempSync(join(tmpdir(), "chart-map-"));
    try {
      const p = join(dir, "map.json");
      writeTemp(p, {
        version: "t",
        entities: [{ key: "x", symbol: "2513", aliases: [] }],
      });
      expect(() => loadChartSymbolMap(p)).toThrow(/EXCHANGE:SYMBOL/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws on a missing map (config bug, not a runtime condition)", () => {
    expect(() => loadChartSymbolMap(join(tmpdir(), "nope", "map.json"))).toThrow(/not found/);
  });
});

// ── resolveChartEntity ──

describe("resolveChartEntity", () => {
  const map = symbolMap();

  it("matches the exact entity key first", () => {
    expect(resolveChartEntity("zhipu", map).symbol).toBe("HKEX:2513");
  });

  it("matches latin aliases on word boundaries", () => {
    expect(resolveChartEntity("Hang Seng TECH Index chart", map).key).toBe("hang-seng-tech");
    // "hstech" must not fire inside an unrelated longer word — boundary rule
    expect(resolveChartEntity("hstech", map).key).toBe("hang-seng-tech");
    expect(resolveChartEntity("hstech-inc", map).key).toBe("hang-seng-tech");
  });

  it("matches CJK aliases by substring", () => {
    expect(resolveChartEntity("智谱上市表现", map).symbol).toBe("HKEX:2513");
    expect(resolveChartEntity("恒生科技指数暴跌", map).key).toBe("hang-seng-tech");
  });

  it("returns null for unknown entities — scene-data cannot free-text a symbol", () => {
    expect(resolveChartEntity("some-random-company", map)).toBeNull();
    expect(resolveChartEntity("", map)).toBeNull();
    expect(resolveChartEntity(undefined, map)).toBeNull();
  });
});

// ── fetchChartAsset ──

describe("fetchChartAsset", () => {
  const entity = symbolMap().entities[0];
  let dir;
  let fetchCalls;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chart-fetch-"));
    fetchCalls = [];
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    globalThis.fetch = undefined;
  });

  const mockFetch = (status, body) => async (url, init) => {
    fetchCalls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
      arrayBuffer: async () =>
        typeof body === "string"
          ? new TextEncoder().encode(body).buffer
          : new Uint8Array(body).buffer,
    };
  };

  it("POSTs the v2 JSON body with the key as query param and writes the PNG", async () => {
    globalThis.fetch = mockFetch(200, GOOD_PNG);
    const asset = await fetchChartAsset({
      entity,
      sceneId: 3,
      chart: { entity: "zhipu", range: "6M" },
      assetsDir: dir,
      apiKey: "test-key",
      // The map's `defaults` are the source for interval/range/theme — passed
      // explicitly here because this unit test calls the fetch seam directly
      // (buildChartAssets is what supplies them in production).
      defaults: symbolMap().defaults,
    });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(`${CHART_IMG_V2_URL}?key=test-key`);
    expect(fetchCalls[0].init.method).toBe("POST");
    const sentBody = JSON.parse(fetchCalls[0].init.body);
    expect(sentBody).toEqual({
      symbol: "HKEX:2513",
      interval: "1D",
      range: "6M",
      theme: symbolMap().defaults.theme,
    });

    expect(asset.chartPin).toBe(true);
    expect(asset.contentKind).toBe("chart");
    expect(asset.claimSceneId).toBe(3);
    expect(asset.source).toBe("chart-img");
    expect(asset.type).toBe("image");
    expect(asset.width).toBe(800);
    expect(asset.height).toBe(600);
    expect(asset.chart.delayed).toBe(true); // HKEX is Delayed on v2
    expect(asset.chart.label).toBe("Zhipu (Z. AI Co., Ltd.)");
    expect(existsSync(asset.path)).toBe(true);
    expect(readFileSync(asset.path).subarray(0, 8)).toEqual(GOOD_PNG.subarray(0, 8));
    // Charts opt out of the render-stage Real-ESRGAN pass (#1382: it drops
    // tiles on line-art charts).
    expect(asset.upscale).toBe(false);
  });

  it("honors map defaults for omitted chart fields (single source of truth)", async () => {
    globalThis.fetch = mockFetch(200, GOOD_PNG);
    const asset = await fetchChartAsset({
      entity,
      sceneId: 5,
      chart: { entity: "zhipu" }, // nothing set — defaults must fill in
      assetsDir: dir,
      apiKey: "test-key",
      defaults: { interval: "1W", range: "1Y", theme: "dark" },
    });
    const sentBody = JSON.parse(fetchCalls[0].init.body);
    expect(sentBody).toEqual({ symbol: "HKEX:2513", interval: "1W", range: "1Y", theme: "dark" });
    expect(asset.path).toContain("chart-img-zhipu-s5-1W-1Y.png");
  });

  it("serializes an object range ({from,to}) verbatim into the request body", async () => {
    globalThis.fetch = mockFetch(200, GOOD_PNG);
    const range = { from: "2026-06-01T00:00:00.000Z", to: "2026-11-14T00:00:00.000Z" };
    await fetchChartAsset({
      entity,
      sceneId: 6,
      chart: { entity: "zhipu", range },
      assetsDir: dir,
      apiKey: "test-key",
    });
    const sentBody = JSON.parse(fetchCalls[0].init.body);
    expect(sentBody.range).toEqual(range); // peak-to-now precision window
    expect(sentBody.range.from).toBe("2026-06-01T00:00:00.000Z");
  });

  it("throws with the API status for a non-200 (config/quota errors are loud)", async () => {
    globalThis.fetch = mockFetch(422, { error: "Invalid Symbol" });
    await expect(
      fetchChartAsset({ entity, sceneId: 1, assetsDir: dir, apiKey: "k" }),
    ).rejects.toThrow(/422.*Invalid Symbol/);
    expect(existsSync(join(dir, `chart-img-${entity.key}-s1-1D-6M.png`))).toBe(false);
  });

  it("throws when the body is not a PNG (error JSON behind a 200)", async () => {
    globalThis.fetch = mockFetch(200, '{"surprise":true}');
    await expect(
      fetchChartAsset({ entity, sceneId: 1, assetsDir: dir, apiKey: "k" }),
    ).rejects.toThrow(/non-PNG/);
  });

  it("retries once and succeeds when the first frame is unhydrated", async () => {
    const bodies = [BAD_PNG, GOOD_PNG];
    globalThis.fetch = async (url, init) => {
      fetchCalls.push({ url, init });
      const body = bodies[Math.min(fetchCalls.length - 1, bodies.length - 1)];
      return {
        ok: true,
        status: 200,
        text: async () => "",
        arrayBuffer: async () => new Uint8Array(body).buffer,
      };
    };
    const asset = await fetchChartAsset({
      entity,
      sceneId: 7,
      assetsDir: dir,
      apiKey: "k",
    });
    expect(fetchCalls).toHaveLength(2); // exactly one retry, quota is 50/day
    expect(existsSync(asset.path)).toBe(true);
  });

  it("throws after both attempts fail the hydration probe", async () => {
    globalThis.fetch = mockFetch(200, BAD_PNG);
    await expect(
      fetchChartAsset({ entity, sceneId: 8, assetsDir: dir, apiKey: "k" }),
    ).rejects.toThrow(/hydration probe/);
    expect(fetchCalls).toHaveLength(2);
  });
});

// ── hydration probe (unit) ──

describe("probeChartHydration", () => {
  it("passes a fully-painted chart and fails one with a mid-band empty run", () => {
    const good = probeChartHydration(GOOD_PNG);
    expect(good).toMatchObject({ ok: true, coveredCount: 16, cols: 16, maxRun: 0 });
    const bad = probeChartHydration(BAD_PNG);
    expect(bad.ok).toBe(false);
    expect(bad.coveredCount).toBe(8);
    expect(bad.maxRun).toBe(8);
  });
});

// ── buildChartAssets ──

describe("buildChartAssets", () => {
  const scene = (id, chart) => ({ id, voiceover: `v${id}`, ...(chart ? { chart } : {}) });

  it("fetches one asset per declaring scene, pinning each to its scene id", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chart-build-"));
    const mapPath = join(dir, "map.json");
    writeTemp(mapPath, symbolMap());
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => "",
      arrayBuffer: async () => new Uint8Array(GOOD_PNG).buffer,
    });
    try {
      const scenes = [
        scene(1),
        scene(2, { entity: "zhipu" }),
        scene(3, { entity: "恒生科技" }),
        scene(4, { entity: "unknown-co" }),
      ];
      const { assets, failures } = await buildChartAssets(scenes, {
        assetsDir: dir,
        apiKey: "k",
        mapPath,
        logger: { log: () => {}, warn: () => {} },
      });
      expect(assets).toHaveLength(2);
      expect(assets.map((a) => a.claimSceneId).sort()).toEqual([2, 3]);
      // Scene without a chart declaration is not a failure — it just opts out
      expect(failures).toEqual([{ sceneId: 4, error: expect.stringMatching(/not in symbol map/) }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      globalThis.fetch = undefined;
    }
  });

  it("isolates per-scene fetch failures (one bad symbol does not kill the others)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chart-build-"));
    const mapPath = join(dir, "map.json");
    writeTemp(mapPath, symbolMap());
    let call = 0;
    globalThis.fetch = async () => {
      call += 1;
      if (call === 1) {
        return {
          ok: false,
          status: 422,
          text: async () => '{"error":"Invalid Symbol"}',
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => "",
        arrayBuffer: async () => new Uint8Array(GOOD_PNG).buffer,
      };
    };
    try {
      const scenes = [scene(1, { entity: "zhipu" }), scene(2, { entity: "minimax" })];
      const { assets, failures } = await buildChartAssets(scenes, {
        assetsDir: dir,
        apiKey: "k",
        mapPath,
        logger: { log: () => {}, warn: () => {} },
      });
      expect(assets).toHaveLength(1);
      expect(failures).toEqual([{ sceneId: 1, error: expect.stringMatching(/422/) }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      globalThis.fetch = undefined;
    }
  });

  it("two scenes with the same entity fetch ONCE and each get their own pinned file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chart-dedup-"));
    const mapPath = join(dir, "map.json");
    writeTemp(mapPath, symbolMap());
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => "",
        arrayBuffer: async () => new Uint8Array(GOOD_PNG).buffer,
      };
    };
    try {
      const scenes = [
        scene(1, { entity: "zhipu" }),
        scene(2, { entity: "智谱" }), // alias of the same entity
      ];
      const { assets, failures } = await buildChartAssets(scenes, {
        assetsDir: dir,
        apiKey: "k",
        mapPath,
        logger: { log: () => {}, warn: () => {} },
      });
      expect(calls).toBe(1); // shared 50/day free-tier quota
      expect(failures).toEqual([]);
      expect(assets).toHaveLength(2);
      expect(assets.map((a) => a.claimSceneId).sort()).toEqual([1, 2]);
      const paths = new Set(assets.map((a) => a.path));
      expect(paths.size).toBe(2); // distinct paths — the assignment seam's
      // duplicate-path rule must never silently drop the second scene
      for (const p of paths) expect(existsSync(p)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      globalThis.fetch = undefined;
    }
  });
});

// ── Admission + assignment integration ──

describe("chart-pin admission through the relevance gate", () => {
  const scenes = [
    {
      id: 2,
      visualType: "narrative",
      voiceover: "Zhipu peaked at 2,980 Hong Kong dollars.",
      assetNeed: "zhipu stock chart",
    },
  ];
  const chartAsset = {
    type: "image",
    path: "assets/chart-img-zhipu-1D-6M.png",
    source: "chart-img",
    score: 100,
    claimSceneId: 2,
    chartPin: true,
    width: 800,
    height: 600,
    // deliberately NO relevanceScore — there is no VLM judgment on chart pins
  };

  it("admissionSource names chart-pin before any score logic", () => {
    expect(admissionSource(chartAsset)).toBe("chart-pin");
    expect(isRelevanceAdmitted(chartAsset, { threshold: 60 })).toBe(true);
  });

  it("a chart with no VLM score is assigned to its scene, not fail-closed", () => {
    const result = assignAssetsToScenes([chartAsset], scenes, { relevanceThreshold: 60 });
    expect(result[0].status).toBe("assigned");
    expect(result[0].sceneId).toBe(2);
    const rel = result[0].relevance ?? {};
    expect(rel.relevanceAdmittedBy ?? result[0].relevanceAdmittedBy).toBe("chart-pin");
    // The audit trail must not claim the VLM ran on a deterministic asset.
    expect(rel.relevanceSource ?? result[0].relevanceSource).toBe("chart-pin");
  });

  it("an ordinary asset without a score stays fail-closed (chart-pin is opt-in)", () => {
    const ordinary = { ...chartAsset, chartPin: undefined };
    const result = assignAssetsToScenes([ordinary], scenes, { relevanceThreshold: 60 });
    expect(result[0].status).toBe("unassigned");
  });
});

describe("chart parameters have one source (#1375 review)", () => {
  it("the curated map's defaults match the last-resort constants", async () => {
    // The map is the declared single source; the constants exist only for a key
    // the map omits. If they disagree, a scene's effective theme depends on
    // which file a reader opened — the drift this test exists to stop.
    const { readFileSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const map = JSON.parse(
      readFileSync(resolve(here, "..", "config", "chart-symbols.json"), "utf8"),
    );
    expect(map.defaults).toEqual(CHART_PARAM_FALLBACKS);
  });

  it("resolves scene → map defaults → constants, in that order", () => {
    expect(resolveChartParams({ theme: "light" }, { theme: "dark" }).theme).toBe("light");
    expect(resolveChartParams({}, { theme: "dark" }).theme).toBe("dark");
    expect(resolveChartParams({}, {}).theme).toBe(CHART_PARAM_FALLBACKS.theme);
    expect(resolveChartParams({}, {}).theme).toBe("dark");
    expect(resolveChartParams({}, {}).interval).toBe("1D");
    expect(resolveChartParams({}, {}).range).toBe("6M");
    // A range OBJECT (exact window) passes through untouched.
    const range = { from: "2026-06-01T00:00:00.000Z", to: "2026-11-14T00:00:00.000Z" };
    expect(resolveChartParams({ range }, {}).range).toEqual(range);
  });
});

// ── chart.annotations → drawings (#1378) ──

describe("chart.annotations pass through as chart-img drawings (#1378)", () => {
  const entity = symbolMap().entities[0];
  const RANGE = { from: "2026-06-01T00:00:00.000Z", to: "2026-11-14T00:00:00.000Z" };
  const PEAK = 2980;
  const NOW = 454;
  let dir;
  let fetchCalls;

  // The three shapes verified live 2026-11-15 (see the ticket body): the kind
  // lives in `name`, the coordinates in `input`. There is no `type` field —
  // chart-img selects the drawing by name.
  const annotationsFixture = () => [
    {
      name: "Horizontal Line",
      input: { price: PEAK },
      override: { lineColor: "rgb(255,196,0)" },
    },
    {
      name: "Trend Line",
      input: {
        startDatetime: "2026-06-15T00:00:00.000Z",
        startPrice: PEAK,
        endDatetime: "2026-11-14T00:00:00.000Z",
        endPrice: NOW,
      },
    },
    { name: "Arrow Mark Down", input: { datetime: "2026-11-14T00:00:00.000Z", price: NOW } },
  ];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chart-annot-"));
    fetchCalls = [];
    globalThis.fetch = async (url, init) => {
      fetchCalls.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () => "",
        arrayBuffer: async () => new Uint8Array(GOOD_PNG).buffer,
      };
    };
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    globalThis.fetch = undefined;
  });

  it("serializes the three verified drawing kinds verbatim into drawings[]", async () => {
    const annotations = annotationsFixture();
    const asset = await fetchChartAsset({
      entity,
      sceneId: 1,
      chart: { entity: "zhipu", range: RANGE, annotations },
      assetsDir: dir,
      apiKey: "k",
    });
    const body = JSON.parse(fetchCalls[0].init.body);
    // Verbatim: no key renaming, no invented `type` field. A silent rewrite
    // here is exactly the failure this module's docblock keeps warning about.
    expect(body.drawings).toEqual(annotations);
    expect(body.drawings).toHaveLength(3);
    expect(body.drawings.every((d) => !("type" in d))).toBe(true);
    // The audit entry keeps the drawings that produced this PNG.
    expect(asset.chart.drawings).toEqual(annotations);
  });

  it("omits drawings entirely when the scene declares no annotations", async () => {
    // `undefined` and `[]` are both "no drawings": an empty array is a
    // different request body and would drift every existing scene for nothing.
    for (const chart of [
      { entity: "zhipu", range: RANGE },
      { entity: "zhipu", range: RANGE, annotations: [] },
    ]) {
      await fetchChartAsset({ entity, sceneId: 2, chart, assetsDir: dir, apiKey: "k" });
    }
    expect(fetchCalls).toHaveLength(2);
    for (const call of fetchCalls) {
      expect("drawings" in JSON.parse(call.init.body)).toBe(false);
    }
  });

  it("rejects more than the BASIC budget (studies+drawings ≤ 3) instead of silently dropping", () => {
    const annotations = [...annotationsFixture(), { name: "Text", input: { text: "x" } }];
    expect(() => resolveChartParams({ annotations }, {})).toThrow(/at most 3/);
  });

  it("rejects malformed annotations loudly (no silent no-op)", () => {
    expect(() => resolveChartParams({ annotations: "Horizontal Line" }, {})).toThrow(
      /must be an array/,
    );
    expect(() => resolveChartParams({ annotations: [{ input: { price: 1 } }] }, {})).toThrow(
      /name/,
    );
    expect(() =>
      resolveChartParams({ annotations: [{ name: "Horizontal Line", input: 42 }] }, {}),
    ).toThrow(/input/);
    expect(() => resolveChartParams({ annotations: [{ name: "  ", input: {} }] }, {})).toThrow(
      /name/,
    );
  });

  it("one bad scene falls back to web sourcing without taking the others down", async () => {
    const mapDir = mkdtempSync(join(tmpdir(), "chart-annot-build-"));
    const mapPath = join(mapDir, "map.json");
    writeTemp(mapPath, symbolMap());
    try {
      const scenes = [
        {
          id: 1,
          chart: {
            entity: "zhipu",
            annotations: [...annotationsFixture(), { name: "Text", input: { text: "x" } }],
          },
        },
        { id: 2, chart: { entity: "minimax", annotations: [annotationsFixture()[0]] } },
      ];
      const { assets, failures } = await buildChartAssets(scenes, {
        assetsDir: dir,
        apiKey: "k",
        mapPath,
        logger: { log: () => {}, warn: () => {} },
      });
      expect(failures).toEqual([{ sceneId: 1, error: expect.stringMatching(/at most 3/) }]);
      expect(assets.map((a) => a.claimSceneId)).toEqual([2]);
    } finally {
      rmSync(mapDir, { recursive: true, force: true });
    }
  });

  it("annotations are part of the reuse key and the filename", async () => {
    const mapDir = mkdtempSync(join(tmpdir(), "chart-annot-dedup-"));
    const mapPath = join(mapDir, "map.json");
    writeTemp(mapPath, symbolMap());
    try {
      const peakLine = [annotationsFixture()[0]];
      const arrow = [annotationsFixture()[2]];
      // Same entity, same range/interval/theme — only the drawings differ.
      const scenes = [
        { id: 1, chart: { entity: "zhipu", range: RANGE, annotations: peakLine } },
        { id: 2, chart: { entity: "zhipu", range: RANGE, annotations: arrow } },
      ];
      const { assets, failures } = await buildChartAssets(scenes, {
        assetsDir: dir,
        apiKey: "k",
        mapPath,
        logger: { log: () => {}, warn: () => {} },
      });
      expect(failures).toEqual([]);
      // Two different pictures must not share one fetch (the second would get
      // the first one's PNG) ...
      expect(fetchCalls).toHaveLength(2);
      expect(JSON.parse(fetchCalls[0].init.body).drawings).toEqual(peakLine);
      expect(JSON.parse(fetchCalls[1].init.body).drawings).toEqual(arrow);
      // ... nor one filename, or the second write silently clobbers the first.
      const paths = new Set(assets.map((a) => a.path));
      expect(paths.size).toBe(2);
      for (const p of paths) expect(existsSync(p)).toBe(true);
    } finally {
      rmSync(mapDir, { recursive: true, force: true });
    }
  });

  it("identical annotations still share one fetch", async () => {
    const mapDir = mkdtempSync(join(tmpdir(), "chart-annot-same-"));
    const mapPath = join(mapDir, "map.json");
    writeTemp(mapPath, symbolMap());
    try {
      const scenes = [
        { id: 1, chart: { entity: "zhipu", range: RANGE, annotations: annotationsFixture() } },
        { id: 2, chart: { entity: "智谱", range: RANGE, annotations: annotationsFixture() } },
      ];
      const { assets } = await buildChartAssets(scenes, {
        assetsDir: dir,
        apiKey: "k",
        mapPath,
        logger: { log: () => {}, warn: () => {} },
      });
      expect(fetchCalls).toHaveLength(1); // shared free-tier quota still respected
      expect(new Set(assets.map((a) => a.path)).size).toBe(2);
    } finally {
      rmSync(mapDir, { recursive: true, force: true });
    }
  });
});

// ── helpers ──

function writeTemp(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2));
}

describe("probeChartHydration background robustness (droid-review P2)", () => {
  it("stays FAIL when a candle sits on the legacy fixed sample point", () => {
    // (400, 96) is the sample point the probe used before the mode-based fix.
    // A tall candle painted over it would poison that reference and invert
    // the verdict; the modal background must not care.
    const png = new PNGImage({ width: 800, height: 600 });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = 255;
      png.data[i + 1] = 255;
      png.data[i + 2] = 255;
      png.data[i + 3] = 255;
    }
    const paint = (x0, x1, y0, y1) => {
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          const i = (y * 800 + x) * 4;
          png.data[i] = 200;
          png.data[i + 1] = 30;
          png.data[i + 2] = 30;
        }
      }
    };
    paint(16, 192, 100, 400); // columns 0-3 painted
    paint(720 - 44 * 4 + 4, 720, 100, 400); // columns 12-15 painted
    paint(380, 420, 73, 400); // tall candle covering (400, 96)
    const bad = probeChartHydration(PNGImage.sync.write(png));
    expect(bad.ok).toBe(false);
    // 8 painted columns + the tall candle spanning cols 8-9 = 10 covered;
    // still below the 75% floor with an empty run of 4.
    expect(bad.coveredCount).toBe(10);
  });
});
