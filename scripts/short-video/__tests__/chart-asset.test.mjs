import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHART_IMG_V2_URL,
  buildChartAssets,
  fetchChartAsset,
  loadChartSymbolMap,
  resolveChartEntity,
} from "../lib/chart-asset.mjs";
import { admissionSource, isRelevanceAdmitted } from "../lib/relevance-verdict.mjs";
import { assignAssetsToScenes } from "../lib/asset-sourcer.mjs";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

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
    globalThis.fetch = mockFetch(200, PNG_BYTES);
    const asset = await fetchChartAsset({
      entity,
      sceneId: 3,
      chart: { entity: "zhipu", range: "6M" },
      assetsDir: dir,
      apiKey: "test-key",
    });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(`${CHART_IMG_V2_URL}?key=test-key`);
    expect(fetchCalls[0].init.method).toBe("POST");
    const sentBody = JSON.parse(fetchCalls[0].init.body);
    expect(sentBody).toEqual({ symbol: "HKEX:2513", interval: "1D", range: "6M", theme: "light" });

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
    expect(readFileSync(asset.path).subarray(0, 8)).toEqual(PNG_BYTES.subarray(0, 8));
  });

  it("honors map defaults for omitted chart fields (single source of truth)", async () => {
    globalThis.fetch = mockFetch(200, PNG_BYTES);
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
    globalThis.fetch = mockFetch(200, PNG_BYTES);
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
      arrayBuffer: async () => new Uint8Array(PNG_BYTES).buffer,
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
        arrayBuffer: async () => new Uint8Array(PNG_BYTES).buffer,
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
        arrayBuffer: async () => new Uint8Array(PNG_BYTES).buffer,
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

// ── helpers ──

function writeTemp(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2));
}
