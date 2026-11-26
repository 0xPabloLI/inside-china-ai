/**
 * #1528 R2: batch order, reuse flags, failure isolation and teardown.
 *
 * `tts-batch.mjs` is a thin CLI; the decisions that actually go wrong live in
 * `lib/tts-batch-run.mjs` and are driven here with fake engines/packs — no
 * Kaggle, no GPU, no content directory.
 */
import { describe, it, expect, vi } from "vitest";
import { parseBatchArgs, runTtsBatch } from "../lib/tts-batch-run.mjs";

function fakeEngine() {
  return {
    setBatchMode: vi.fn(),
    endLiveSession: vi.fn(async () => {}),
  };
}

const packs = {
  a: { meta: { pipelineId: "pack-a" }, scenes: [{ id: 1 }, { id: 2 }] },
  b: { meta: { pipelineId: "pack-b" }, scenes: [{ id: 1 }, { id: 2 }, { id: 3 }] },
  c: { meta: {}, scenes: [{ id: 1 }] },
};

describe("parseBatchArgs", () => {
  it("collects repeated --content values", () => {
    expect(parseBatchArgs(["--content", "a", "--content", "b", "--content", "c"]).contents).toEqual(
      ["a", "b", "c"],
    );
  });

  it("rejects a missing value and a single pack", () => {
    expect(parseBatchArgs(["--content"]).error).toBe("--content needs a value");
    expect(parseBatchArgs(["--content", "--content", "b"]).error).toBe("--content needs a value");
    expect(parseBatchArgs(["--content", "a"]).error).toMatch(/usage/);
  });
});

describe("runTtsBatch", () => {
  it("opens on pack 1, reuses the kernel after it, and closes once at the end", async () => {
    const engine = fakeEngine();
    const modes = [];
    const runPack = vi.fn(async (pack) => {
      modes.push(pack.reuseLiveSession);
      pack.onRunCreated(`run-${pack.contentDir}`);
      return { runId: `run-${pack.contentDir}` };
    });

    const { summary, ok } = await runTtsBatch({
      contents: ["a", "b", "c"],
      engine,
      loadPack: async (dir) => packs[dir],
      runPack,
    });

    expect(ok).toBe(true);
    expect(summary.map((row) => row.runId)).toEqual(["run-a", "run-b", "run-c"]);
    // First pack opens the session; the rest ride it.
    expect(engine.setBatchMode.mock.calls.map(([mode]) => mode.reuseLiveSession)).toEqual([
      false,
      true,
      true,
    ]);
    // Every pack but the last leaves the kernel open; the driver closes it once.
    expect(runPack.mock.calls.map(([pack]) => pack.keepLiveSession)).toEqual([true, true, false]);
    expect(engine.endLiveSession).toHaveBeenCalledTimes(1);
    // pipelineId falls back to the content dir when meta has none.
    expect(summary[2].pipelineId).toBe("c");
  });

  it("isolates one failing pack, records its run, and still runs the next", async () => {
    const engine = fakeEngine();
    const failures = [];
    const seen = [];
    const runPack = vi.fn(async (pack) => {
      seen.push(pack.contentDir);
      if (pack.contentDir === "b") {
        pack.onRunCreated("run-b-half");
        throw new Error("kernel died mid-batch");
      }
      return { runId: `run-${pack.contentDir}` };
    });

    const { summary, ok } = await runTtsBatch({
      contents: ["a", "b", "c"],
      engine,
      loadPack: async (dir) => packs[dir],
      runPack,
      onPackFailed: (failure) => failures.push(failure),
    });

    expect(seen).toEqual(["a", "b", "c"]);
    expect(ok).toBe(false);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ pipelineId: "pack-b", runId: "run-b-half" });
    expect(summary.find((row) => row.contentDir === "b")).toMatchObject({
      status: "failed",
      runId: "run-b-half",
    });
    // A failure still costs time; the summary must not report 0 s.
    expect(summary.find((row) => row.contentDir === "b").seconds).toBeGreaterThanOrEqual(0);
    expect(engine.endLiveSession).toHaveBeenCalledTimes(1);
  });

  it("treats an empty pack as a failure without calling runPack", async () => {
    const engine = fakeEngine();
    const runPack = vi.fn(async (pack) => ({ runId: `run-${pack.contentDir}` }));
    const { summary, ok } = await runTtsBatch({
      contents: ["a", "empty"],
      engine,
      loadPack: async (dir) =>
        dir === "empty" ? { meta: { pipelineId: "pack-empty" }, scenes: [] } : packs[dir],
      runPack,
    });

    expect(ok).toBe(false);
    expect(runPack).toHaveBeenCalledTimes(1);
    expect(summary.find((row) => row.contentDir === "empty").status).toBe("failed");
    expect(engine.endLiveSession).toHaveBeenCalledTimes(1);
  });

  it("still closes the kernel when every pack fails", async () => {
    const engine = fakeEngine();
    const { ok } = await runTtsBatch({
      contents: ["a", "b"],
      engine,
      loadPack: async () => {
        throw new Error("import blew up");
      },
      runPack: async () => {},
    });

    expect(ok).toBe(false);
    expect(engine.endLiveSession).toHaveBeenCalledTimes(1);
  });
});
