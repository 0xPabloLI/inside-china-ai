import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const FIXTURE = join(import.meta.dirname, "fixtures", "fake-vlm.py");
const PYTHON = "/usr/bin/python3";

const DEGRADED_DESC = "";

function parseLog(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [kind, ts, rid, path] = l.split(":");
      return { kind, ts: Number(ts), rid, path: path || "" };
    });
}

async function loadModule(env) {
  vi.resetModules();
  for (const k of [
    "VLM_ANALYZER_PYTHON_BIN",
    "VLM_ANALYZER_SCRIPT",
    "VLM_CONCURRENCY",
    "VLM_RESPONSE_TIMEOUT_MS",
    "FAKE_VLM_LOG",
    "FAKE_VLM_DELAY_MS",
    "FAKE_VLM_RANDOM_DELAY",
    "FAKE_VLM_NO_REQUEST_ID",
    "FAKE_VLM_EXIT_AFTER",
  ]) {
    delete process.env[k];
  }
  Object.assign(process.env, env, { VLM_ANALYZER_SCRIPT: FIXTURE });
  return await import("../visual-analyzer.mjs");
}

describe("visual-analyzer worker pool (#189)", () => {
  let workDir;
  let logPath;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "vlm-pool-test-"));
    logPath = join(workDir, "fake-vlm.log");
  });

  afterEach(async () => {
    rmSync(workDir, { recursive: true, force: true });
    const m = globalThis.__vlmModule;
    if (m) await m.closeVisualAnalyzer();
  });

  it("runs 2 requests concurrently with 2 workers", async () => {
    const m = await loadModule({
      VLM_ANALYZER_PYTHON_BIN: PYTHON,
      VLM_CONCURRENCY: "2",
      VLM_RESPONSE_TIMEOUT_MS: "10000",
      FAKE_VLM_LOG: logPath,
      FAKE_VLM_DELAY_MS: "600",
    });
    globalThis.__vlmModule = m;

    const t0 = Date.now();
    const [r1, r2] = await Promise.all([
      m.analyzeAssetSemantics("/a/one.png"),
      m.analyzeAssetSemantics("/a/two.png"),
    ]);
    const total = Date.now() - t0;

    expect(r1.description).toContain("one.png");
    expect(r2.description).toContain("two.png");

    const starts = parseLog(logPath).filter((e) => e.kind === "START");
    expect(starts.length).toBe(2);
    const gap = Math.abs(starts[1].ts - starts[0].ts);
    expect(gap).toBeLessThan(400);
    expect(total).toBeLessThan(1000);
  }, 20000);

  it("caps in-flight at pool size", async () => {
    const m = await loadModule({
      VLM_ANALYZER_PYTHON_BIN: PYTHON,
      VLM_CONCURRENCY: "2",
      VLM_RESPONSE_TIMEOUT_MS: "10000",
      FAKE_VLM_LOG: logPath,
      FAKE_VLM_DELAY_MS: "400",
    });
    globalThis.__vlmModule = m;

    const t0 = Date.now();
    await Promise.all([
      m.analyzeAssetSemantics("/a/one.png"),
      m.analyzeAssetSemantics("/a/two.png"),
      m.analyzeAssetSemantics("/a/three.png"),
    ]);
    const total = Date.now() - t0;

    const events = parseLog(logPath);
    const starts = events.filter((e) => e.kind === "START");
    const ends = events.filter((e) => e.kind === "END");
    expect(starts.length).toBe(3);
    expect(ends.length).toBe(3);
    const firstTwoEnds = ends
      .map((e) => e.ts)
      .sort((a, b) => a - b)
      .slice(0, 2);
    const thirdStart = starts.map((e) => e.ts).sort((a, b) => a - b)[2];
    expect(thirdStart).toBeGreaterThanOrEqual(firstTwoEnds[0]);
    expect(total).toBeLessThan(1100);
  }, 20000);

  it("routes responses correctly under random delays (no mismatch)", async () => {
    const m = await loadModule({
      VLM_ANALYZER_PYTHON_BIN: PYTHON,
      VLM_CONCURRENCY: "2",
      VLM_RESPONSE_TIMEOUT_MS: "10000",
      FAKE_VLM_LOG: logPath,
      FAKE_VLM_DELAY_MS: "300",
      FAKE_VLM_RANDOM_DELAY: "1",
    });
    globalThis.__vlmModule = m;

    const paths = ["/a/alpha.png", "/a/beta.png", "/a/gamma.png", "/a/delta.png"];
    const results = await Promise.all(paths.map((p) => m.analyzeAssetSemantics(p)));
    paths.forEach((p, i) => {
      expect(results[i].description).toContain(p.split("/").pop());
    });
  }, 20000);

  it("FIFO fallback works for legacy python without requestId echo", async () => {
    const m = await loadModule({
      VLM_ANALYZER_PYTHON_BIN: PYTHON,
      VLM_CONCURRENCY: "2",
      VLM_RESPONSE_TIMEOUT_MS: "10000",
      FAKE_VLM_LOG: logPath,
      FAKE_VLM_DELAY_MS: "300",
      FAKE_VLM_NO_REQUEST_ID: "1",
    });
    globalThis.__vlmModule = m;

    const [r1, r2] = await Promise.all([
      m.analyzeAssetSemantics("/a/one.png"),
      m.analyzeAssetSemantics("/a/two.png"),
    ]);
    expect(r1.description).toContain("one.png");
    expect(r2.description).toContain("two.png");
  }, 20000);

  it("isolates worker crash — remaining requests still served", async () => {
    const m = await loadModule({
      VLM_ANALYZER_PYTHON_BIN: PYTHON,
      VLM_CONCURRENCY: "2",
      VLM_RESPONSE_TIMEOUT_MS: "10000",
      FAKE_VLM_LOG: logPath,
      FAKE_VLM_DELAY_MS: "100",
      FAKE_VLM_EXIT_AFTER: "1",
    });
    globalThis.__vlmModule = m;

    const results = await Promise.all([
      m.analyzeAssetSemantics("/a/one.png"),
      m.analyzeAssetSemantics("/a/two.png"),
      m.analyzeAssetSemantics("/a/three.png"),
    ]);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(typeof r.description).toBe("string");
    }
    const served = results.filter((r) => r.description.includes("fake analysis"));
    expect(served.length).toBeGreaterThanOrEqual(2);
  }, 20000);

  it("times out unresponsive worker and keeps serving", async () => {
    const m = await loadModule({
      VLM_ANALYZER_PYTHON_BIN: PYTHON,
      VLM_CONCURRENCY: "2",
      VLM_RESPONSE_TIMEOUT_MS: "800",
      FAKE_VLM_LOG: logPath,
      FAKE_VLM_DELAY_MS: "10000",
    });
    globalThis.__vlmModule = m;

    const [r1] = await Promise.all([
      m.analyzeAssetSemantics("/a/slow.png"),
      m.analyzeAssetSemantics("/a/slow2.png"),
    ]);
    expect(r1.description).toBe(DEGRADED_DESC);

    process.env.FAKE_VLM_DELAY_MS = "50";
    const r3 = await m.analyzeAssetSemantics("/a/fast.png");
    expect(r3.description).toContain("fast.png");
  }, 30000);

  it("pool size 1 preserves legacy serial behavior", async () => {
    const m = await loadModule({
      VLM_ANALYZER_PYTHON_BIN: PYTHON,
      VLM_CONCURRENCY: "1",
      VLM_RESPONSE_TIMEOUT_MS: "10000",
      FAKE_VLM_LOG: logPath,
      FAKE_VLM_DELAY_MS: "300",
    });
    globalThis.__vlmModule = m;

    const t0 = Date.now();
    const [r1, r2] = await Promise.all([
      m.analyzeAssetSemantics("/a/one.png"),
      m.analyzeAssetSemantics("/a/two.png"),
    ]);
    const total = Date.now() - t0;
    expect(r1.description).toContain("one.png");
    expect(r2.description).toContain("two.png");
    expect(total).toBeGreaterThanOrEqual(550);
  }, 20000);

  it("closeVisualAnalyzer closes all workers and is idempotent", async () => {
    const m = await loadModule({
      VLM_ANALYZER_PYTHON_BIN: PYTHON,
      VLM_CONCURRENCY: "2",
      VLM_RESPONSE_TIMEOUT_MS: "10000",
      FAKE_VLM_LOG: logPath,
      FAKE_VLM_DELAY_MS: "50",
    });
    globalThis.__vlmModule = m;

    await Promise.all([
      m.analyzeAssetSemantics("/a/one.png"),
      m.analyzeAssetSemantics("/a/two.png"),
    ]);
    await m.closeVisualAnalyzer();
    await m.closeVisualAnalyzer();
    const events = parseLog(logPath).filter((e) => e.kind === "EXIT");
    expect(events.length).toBeGreaterThanOrEqual(1);
  }, 20000);
});
