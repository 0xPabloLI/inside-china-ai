import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MAX_ROUNDS,
  REPORT_FILENAME,
  emptyReport,
  readReport,
  writeReport,
  promptHash,
  decideCache,
  nextRound,
  shouldRefuse,
  summarizeBrollReport,
} from "../b-roll/report.mjs";

describe("promptHash", () => {
  test("returns a 12-char hex sha1 prefix, stable for the same prompt", () => {
    const h = promptHash("a rich b-roll prompt");
    expect(h).toMatch(/^[0-9a-f]{12}$/);
    expect(promptHash("a rich b-roll prompt")).toBe(h);
  });

  test("differs when the prompt changes", () => {
    expect(promptHash("prompt v1")).not.toBe(promptHash("prompt v2"));
  });
});

describe("report read/write", () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "broll-report-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("report path lives under the output dir with a fixed filename", () => {
    expect(REPORT_FILENAME).toBe("b-roll-report.json");
  });

  test("emptyReport carries content, threshold and an empty scenes map", () => {
    const report = emptyReport("qwen4-preview", 60);
    expect(report.content).toBe("qwen4-preview");
    expect(report.threshold).toBe(60);
    expect(report.scenes).toEqual({});
  });

  test("readReport returns null when the file does not exist", () => {
    expect(readReport(join(dir, "missing", REPORT_FILENAME))).toBeNull();
  });

  test("readReport returns null for corrupt JSON", () => {
    const corrupt = join(dir, "corrupt.json");
    writeFileSync(corrupt, "{ not json");
    expect(readReport(corrupt)).toBeNull();
  });

  test("writeReport stamps updatedAt and round-trips through readReport", () => {
    const file = join(dir, REPORT_FILENAME);
    const report = emptyReport("demo", 60);
    report.scenes["6"] = {
      strategy: "b-roll",
      promptHash: promptHash("p"),
      round: 1,
      status: "won",
      prompt: "p",
      voiceover: "v",
      candidates: [],
      winner: { seed: 1024, file: "scene-6-seed1024.mp4" },
    };

    writeReport(file, report);
    expect(existsSync(file)).toBe(true);

    const loaded = readReport(file);
    expect(loaded.content).toBe("demo");
    expect(loaded.threshold).toBe(60);
    expect(loaded.scenes["6"].status).toBe("won");
    expect(typeof loaded.updatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(loaded.updatedAt))).toBe(false);
  });

  test("writeReport creates the parent directory when missing", () => {
    const file = join(dir, "nested", "output", REPORT_FILENAME);
    writeReport(file, emptyReport("demo", 60));
    expect(existsSync(file)).toBe(true);
  });
});

describe("decideCache (scenario #18, #19)", () => {
  const prompt = "eight-dimension b-roll prompt";
  const wonEntry = {
    strategy: "b-roll",
    promptHash: promptHash(prompt),
    round: 1,
    status: "won",
    prompt,
    voiceover: "v",
    candidates: [{ seed: 1024, file: "scene-6-seed1024.mp4", relevance: 72, reason: "ok" }],
    winner: { seed: 1024, file: "scene-6-seed1024.mp4" },
  };

  test("#18 cache hit: won + winner file exists + prompt unchanged -> reuse", () => {
    const decision = decideCache(wonEntry, prompt, true);
    expect(decision.reuse).toBe(true);
  });

  test("#19 winner file deleted -> cache miss", () => {
    const decision = decideCache(wonEntry, prompt, false);
    expect(decision.reuse).toBe(false);
  });

  test("#19 prompt changed -> cache miss", () => {
    const decision = decideCache(wonEntry, "a rewritten prompt", true);
    expect(decision.reuse).toBe(false);
  });

  test("no prior entry -> cache miss", () => {
    expect(decideCache(null, prompt, true).reuse).toBe(false);
    expect(decideCache(undefined, prompt, true).reuse).toBe(false);
  });

  test("non-won status never reuses", () => {
    expect(decideCache({ ...wonEntry, status: "failed" }, prompt, true).reuse).toBe(false);
    expect(decideCache({ ...wonEntry, status: "pending" }, prompt, true).reuse).toBe(false);
    expect(decideCache({ ...wonEntry, status: "escalated" }, prompt, true).reuse).toBe(false);
  });
});

describe("rounds (scenario #21, #22)", () => {
  test("MAX_ROUNDS is 3", () => {
    expect(MAX_ROUNDS).toBe(3);
  });

  test("a brand-new scene starts at round 1", () => {
    expect(nextRound(null)).toBe(1);
    expect(nextRound(undefined)).toBe(1);
  });

  test("#21 failed round + prompt change -> next round is round+1 and allowed", () => {
    const failed = {
      status: "failed",
      round: 1,
      promptHash: promptHash("old prompt"),
      candidates: [],
    };
    const round = nextRound(failed);
    expect(round).toBe(2);
    expect(shouldRefuse(round)).toBe(false);
  });

  test("#22 requesting a generation beyond MAX_ROUNDS is refused", () => {
    const exhausted = { status: "failed", round: 3, candidates: [] };
    const round = nextRound(exhausted);
    expect(round).toBe(4);
    expect(shouldRefuse(round)).toBe(true);
  });

  test("round counts cumulative generations regardless of prior status", () => {
    expect(nextRound({ status: "won", round: 2 })).toBe(3);
    expect(shouldRefuse(3)).toBe(false);
    expect(shouldRefuse(MAX_ROUNDS)).toBe(false);
    expect(shouldRefuse(MAX_ROUNDS + 1)).toBe(true);
  });
});

// ── verify-video summary block (scenario #27) ──

describe("summarizeBrollReport", () => {
  const entry = (overrides = {}) => ({
    strategy: "b-roll",
    promptHash: "abc123def456",
    round: 1,
    status: "won",
    prompt: "p",
    voiceover: "v",
    candidates: [{ seed: 1024, file: "scene-6-seed1024.mp4", relevance: 72, reason: "matches" }],
    winner: { seed: 1024, file: "scene-6-seed1024.mp4" },
    ...overrides,
  });
  const reportOf = (scenes) => ({ content: "demo", threshold: 60, scenes });

  test("returns nothing when there is no report or no scene entries", () => {
    expect(summarizeBrollReport(null)).toEqual([]);
    expect(summarizeBrollReport(undefined)).toEqual([]);
    expect(summarizeBrollReport({})).toEqual([]);
    expect(summarizeBrollReport(reportOf({}))).toEqual([]);
  });

  test("#27 won scene -> pass line with strategy, status, winner and score", () => {
    const [line] = summarizeBrollReport(reportOf({ 6: entry() }));
    expect(line.level).toBe("pass");
    expect(line.check).toContain("6");
    expect(line.detail).toContain("b-roll");
    expect(line.detail).toContain("won");
    expect(line.detail).toContain("scene-6-seed1024.mp4");
    expect(line.detail).toContain("72");
  });

  test("#27 failed scene -> warning with every candidate score and the threshold", () => {
    const [line] = summarizeBrollReport(
      reportOf({
        6: entry({
          status: "failed",
          winner: null,
          candidates: [
            { seed: 1024, file: "a.mp4", relevance: 41, reason: "off-topic" },
            { seed: 1025, file: "b.mp4", relevance: 55, reason: "generic glow" },
          ],
        }),
      }),
    );
    expect(line.level).toBe("warn");
    expect(line.detail).toContain("41");
    expect(line.detail).toContain("55");
    expect(line.detail).toContain("60");
    expect(line.fix).toContain("prompt");
  });

  test("#27 escalated scene -> warning naming the round and the escalation", () => {
    const [line] = summarizeBrollReport(reportOf({ 8: entry({ status: "escalated", round: 4 }) }));
    expect(line.level).toBe("warn");
    expect(line.detail).toContain("escalated");
    expect(line.detail).toContain("4");
  });

  test("missing relevance is reported as degraded rather than blank", () => {
    const [line] = summarizeBrollReport(
      reportOf({
        6: entry({
          status: "failed",
          winner: null,
          candidates: [{ seed: 1024, file: "a.mp4", relevance: null, reason: "analyzer error" }],
        }),
      }),
    );
    expect(line.detail).toContain("n/a");
  });

  test("orders scenes by id so the report reads deterministically", () => {
    const lines = summarizeBrollReport(reportOf({ 10: entry(), 5: entry(), 6: entry() }));
    expect(lines.map((l) => l.check)).toEqual([
      "Scene 5 B-roll",
      "Scene 6 B-roll",
      "Scene 10 B-roll",
    ]);
  });

  test("#27/#19 a won scene whose clip vanished on disk degrades to a warning", () => {
    const [line] = summarizeBrollReport(reportOf({ 6: entry() }), {
      fileExists: () => false,
    });
    expect(line.level).toBe("warn");
    expect(line.detail).toContain("missing");
    expect(line.detail).toContain("scene-6-seed1024.mp4");
  });

  test("a won scene whose clip is present stays a pass", () => {
    const [line] = summarizeBrollReport(reportOf({ 6: entry() }), {
      fileExists: (file) => file === "scene-6-seed1024.mp4",
    });
    expect(line.level).toBe("pass");
  });
});
