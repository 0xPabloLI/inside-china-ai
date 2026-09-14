import { describe, expect, it, vi } from "vitest";
import { parseSearchPoolCliArgs, runSearchPoolCli } from "../lib/search-pool.mjs";

// #265 — CLI entry tests. The engine is injected via deps.searchPool, so no
// test touches the network; `out`/`log` collectors keep stdout/stderr clean.

/** Run the CLI with a mocked searchPool and collect out/log lines. */
async function runCli(argv, poolResultOrError) {
  const outLines = [];
  const logLines = [];
  const searchPool =
    poolResultOrError instanceof Error
      ? vi.fn(async () => {
          throw poolResultOrError;
        })
      : vi.fn(async () => poolResultOrError);
  const code = await runSearchPoolCli(argv, {
    searchPool,
    out: (line) => outLines.push(line),
    log: (line) => logLines.push(line),
  });
  return { code, outLines, logLines, searchPool };
}

// ─── parseSearchPoolCliArgs ───

describe("parseSearchPoolCliArgs", () => {
  it("parses a bare positional query", () => {
    expect(parseSearchPoolCliArgs(["中国 AI"])).toEqual({
      query: "中国 AI",
      engine: null,
      maxResults: null,
    });
  });

  it("parses --engine and --max-results in flag form", () => {
    const parsed = parseSearchPoolCliArgs(["q", "--engine", "brave", "--max-results", "5"]);
    expect(parsed).toEqual({ query: "q", engine: "brave", maxResults: 5 });
  });

  it("parses --engine= and --max-results= in = form", () => {
    const parsed = parseSearchPoolCliArgs(["q", "--engine=tavily", "--max-results=3"]);
    expect(parsed).toEqual({ query: "q", engine: "tavily", maxResults: 3 });
  });

  it("joins multiple positional tokens into one query", () => {
    expect(parseSearchPoolCliArgs(["deepseek", "v4", "release"]).query).toBe("deepseek v4 release");
  });

  it("throws on unknown options and missing flag values", () => {
    expect(() => parseSearchPoolCliArgs(["q", "--mode", "parallel"])).toThrow(
      "unknown option: --mode",
    );
    expect(() => parseSearchPoolCliArgs(["q", "--engine"])).toThrow("--engine requires a value");
    expect(() => parseSearchPoolCliArgs(["q", "--max-results"])).toThrow(
      "--max-results requires a value",
    );
  });

  it("throws on non-integer or non-positive --max-results", () => {
    expect(() => parseSearchPoolCliArgs(["q", "--max-results", "abc"])).toThrow(/positive integer/);
    expect(() => parseSearchPoolCliArgs(["q", "--max-results", "0"])).toThrow(/positive integer/);
    expect(() => parseSearchPoolCliArgs(["q", "--max-results", "-2"])).toThrow(/positive integer/);
  });
});

// ─── runSearchPoolCli ───

describe("runSearchPoolCli", () => {
  const POOL_HIT = {
    articles: [
      { title: "Hit A", url: "https://example.com/a", snippet: "sa" },
      { title: "Hit B", url: "https://example.com/b", snippet: "sb" },
    ],
    engine: "serper",
    attempts: [],
  };

  it("writes the pure JSON result shape to stdout and exits 0", async () => {
    const { code, outLines, logLines, searchPool } = await runCli(["中国 AI"], POOL_HIT);

    expect(code).toBe(0);
    expect(searchPool).toHaveBeenCalledWith("中国 AI", {});
    expect(logLines).toEqual([]);
    expect(outLines).toHaveLength(1);
    const parsed = JSON.parse(outLines[0]);
    expect(Object.keys(parsed).sort()).toEqual(["articles", "attempts", "engine"]);
    expect(parsed.articles).toEqual(POOL_HIT.articles);
    expect(parsed.engine).toBe("serper");
    expect(parsed.attempts).toEqual([]);
  });

  it("exits 0 on an empty result set (empty result is a valid output)", async () => {
    const { code, outLines } = await runCli(["q"], {
      articles: [],
      engine: null,
      attempts: [{ engine: "brave", ok: false, error: "0 results" }],
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(outLines[0]);
    expect(parsed.articles).toEqual([]);
    expect(parsed.engine).toBeNull();
    expect(parsed.attempts).toHaveLength(1);
  });

  it("passes --engine through as the engines seam and slices --max-results", async () => {
    const { code, searchPool, outLines } = await runCli(
      ["q", "--engine", "brave", "--max-results", "1"],
      POOL_HIT,
    );

    expect(code).toBe(0);
    expect(searchPool).toHaveBeenCalledWith(
      "q",
      expect.objectContaining({ engines: [expect.objectContaining({ name: "brave" })] }),
    );
    expect(JSON.parse(outLines[0]).articles).toHaveLength(1);
  });

  it("exits 1 with a usage hint on stderr for a missing query", async () => {
    const { code, outLines, logLines } = await runCli([], POOL_HIT);

    expect(code).toBe(1);
    expect(outLines).toEqual([]);
    expect(logLines[0]).toContain("query is required");
    expect(logLines.join("\n")).toContain("usage:");
  });

  it("exits 1 for an unknown engine without calling searchPool", async () => {
    const { code, searchPool, logLines } = await runCli(["q", "--engine", "google"], POOL_HIT);

    expect(code).toBe(1);
    expect(searchPool).not.toHaveBeenCalled();
    expect(logLines[0]).toContain('unknown engine "google"');
  });

  it("exits 1 for bad args without calling searchPool", async () => {
    const { code, searchPool, logLines } = await runCli(["q", "--bogus"], POOL_HIT);

    expect(code).toBe(1);
    expect(searchPool).not.toHaveBeenCalled();
    expect(logLines[0]).toContain("unknown option: --bogus");
  });

  it("exits 1 when searchPool throws unexpectedly", async () => {
    const { code, outLines } = await runCli(["q"], new Error("boom"));

    expect(code).toBe(1);
    expect(outLines).toEqual([]);
  });
});
