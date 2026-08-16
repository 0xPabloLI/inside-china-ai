/**
 * Tests for scripts/cloud-gpu/run-gpu.mjs — Cloud GPU Fallback Pool.
 *
 * TDD: Tests written first (red), implementation second (green).
 *
 * These are interface/contract tests with mocked child_process — they verify
 * the fallback chain, argument parsing, timeout handling, Kaggle metadata
 * generation, and quota detection logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock child_process at module level
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  exec: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  copyFileSync: vi.fn(),
}));

import { execSync, exec } from "child_process";
import { existsSync, writeFileSync } from "fs";

// Import after mocks are set up
import {
  parseArgs,
  runColab,
  runKaggle,
  isKaggleQuotaExhausted,
  generateKernelMetadata,
  fallbackChain,
  KAGGLE_USERNAME,
  DEFAULT_TIMEOUT_SEC,
  KAGGLE_POLL_INTERVAL_SEC,
  QUOTA_KEYWORDS,
} from "../run-gpu.mjs";

// ─── parseArgs ───

describe("parseArgs", () => {
  it("parses basic script path", () => {
    const result = parseArgs(["script.py"]);
    expect(result.scriptPath).toBe("script.py");
    expect(result.outputDir).toBe("./output");
    expect(result.timeoutSec).toBe(DEFAULT_TIMEOUT_SEC);
  });

  it("parses --output flag", () => {
    const result = parseArgs(["script.py", "--output", "./results"]);
    expect(result.outputDir).toBe("./results");
  });

  it("parses --timeout flag", () => {
    const result = parseArgs(["script.py", "--timeout", "600"]);
    expect(result.timeoutSec).toBe(600);
  });

  it("parses all flags together", () => {
    const result = parseArgs([
      "echomimic-v3-infer.py",
      "--output",
      "./gpu-output",
      "--timeout",
      "1800",
    ]);
    expect(result.scriptPath).toBe("echomimic-v3-infer.py");
    expect(result.outputDir).toBe("./gpu-output");
    expect(result.timeoutSec).toBe(1800);
  });

  it("throws on missing script path", () => {
    expect(() => parseArgs([])).toThrow(/script/i);
  });

  it("throws on non-.py file", () => {
    expect(() => parseArgs(["script.js"])).toThrow(/\.py/i);
  });
});

// ─── generateKernelMetadata ───

describe("generateKernelMetadata", () => {
  it("generates valid metadata with GPU enabled", () => {
    const slug = "test-infer-abc123";
    const meta = generateKernelMetadata(slug);

    expect(meta.id).toBe(`${KAGGLE_USERNAME}/${slug}`);
    expect(meta.title).toBe(slug);
    expect(meta.language).toBe("python");
    expect(meta.kernel_type).toBe("script");
    expect(meta.enable_gpu).toBe(true);
    expect(meta.enable_tpu).toBe(false);
    expect(meta.enable_internet).toBe(true);
    expect(meta.is_private).toBe(true);
  });

  it("uses code_file from slug", () => {
    const meta = generateKernelMetadata("my-script");
    expect(meta.code_file).toBe("my-script.py");
  });
});

// ─── isKaggleQuotaExhausted ───

describe("isKaggleQuotaExhausted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  QUOTA_KEYWORDS.forEach((keyword) => {
    it(`detects quota keyword: "${keyword}"`, () => {
      const stderr = `Error: ${keyword} — please try again later`;
      expect(isKaggleQuotaExhausted(stderr)).toBe(true);
    });
  });

  it("returns false for non-quota errors", () => {
    expect(isKaggleQuotaExhausted("Error: network timeout")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isKaggleQuotaExhausted("")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isKaggleQuotaExhausted("QUOTA EXCEEDED")).toBe(true);
  });
});

// ─── runColab ───

describe("runColab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns success on exit code 0", async () => {
    exec.mockImplementation((cmd, opts, cb) => {
      cb(null, "GPU test passed", "");
      return { kill: vi.fn(), pid: 12345 };
    });

    const result = await runColab("test.py", { timeoutSec: 300, outputDir: "./output" });

    expect(result.platform).toBe("colab");
    expect(result.success).toBe(true);
    expect(result.stdout).toBe("GPU test passed");
    expect(result.elapsedSec).toBeGreaterThanOrEqual(0);
  });

  it("returns failure on non-zero exit code", async () => {
    exec.mockImplementation((cmd, opts, cb) => {
      cb(new Error("exit code 1"), "partial output", "some error");
      return { kill: vi.fn(), pid: 12345 };
    });

    const result = await runColab("test.py", { timeoutSec: 300, outputDir: "./output" });

    expect(result.platform).toBe("colab");
    expect(result.success).toBe(false);
    expect(result.stderr).toBe("some error");
  });

  it("returns failure on timeout", async () => {
    exec.mockImplementation((cmd, opts, cb) => {
      // Never calls callback — simulate hang
      return {
        kill: vi.fn(),
        pid: 12345,
      };
    });

    const result = await runColab("test.py", { timeoutSec: 0.1, outputDir: "./output" });

    expect(result.platform).toBe("colab");
    expect(result.success).toBe(false);
    expect(result.stderr).toMatch(/timeout/i);
  }, 10000);

  it("uses --auth=adc and --gpu T4 flags", async () => {
    let capturedCmd = "";
    exec.mockImplementation((cmd, opts, cb) => {
      capturedCmd = cmd;
      cb(null, "done", "");
      return { kill: vi.fn(), pid: 12345 };
    });

    await runColab("test.py", { timeoutSec: 300, outputDir: "./output" });

    expect(capturedCmd).toContain("--auth=adc");
    expect(capturedCmd).toContain("--gpu");
    expect(capturedCmd).toContain("T4");
  });
});

// ─── runKaggle ───

describe("runKaggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockReturnValue(true);
    execSync.mockReturnValue("");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns success when kernel completes", async () => {
    // push succeeds
    // status returns "complete"
    // output download succeeds
    execSync.mockImplementation((cmd) => {
      if (cmd.includes("kernels push")) return "";
      if (cmd.includes("kernels status")) return "status complete";
      if (cmd.includes("kernels output")) return "";
      return "";
    });

    const result = await runKaggle("test.py", {
      timeoutSec: 300,
      outputDir: "./kaggle-output",
      pollIntervalSec: 0.01,
    });

    expect(result.platform).toBe("kaggle");
    expect(result.success).toBe(true);
  }, 10000);

  it("detects quota exhaustion on push failure", async () => {
    execSync.mockImplementation((cmd) => {
      if (cmd.includes("kernels push")) {
        throw new Error("You have exceeded your weekly GPU quota");
      }
      return "";
    });

    const result = await runKaggle("test.py", {
      timeoutSec: 300,
      outputDir: "./kaggle-output",
    });

    expect(result.platform).toBe("kaggle");
    expect(result.success).toBe(false);
    expect(result.quotaExhausted).toBe(true);
  });

  it("returns failure on timeout (status never becomes complete)", async () => {
    execSync.mockImplementation((cmd) => {
      if (cmd.includes("kernels push")) return "";
      if (cmd.includes("kernels status")) return "status running";
      if (cmd.includes("kernels output")) return "";
      return "";
    });

    const result = await runKaggle("test.py", {
      timeoutSec: 1,
      outputDir: "./kaggle-output",
      pollIntervalSec: 0.1,
    });

    expect(result.platform).toBe("kaggle");
    expect(result.success).toBe(false);
    expect(result.stderr).toMatch(/timeout/i);
  }, 10000);

  it("creates kernel-metadata.json in temp dir", async () => {
    execSync.mockImplementation((cmd) => {
      if (cmd.includes("kernels push")) return "";
      if (cmd.includes("kernels status")) return "status complete";
      if (cmd.includes("kernels output")) return "";
      return "";
    });

    await runKaggle("test.py", {
      timeoutSec: 300,
      outputDir: "./kaggle-output",
      pollIntervalSec: 0.01,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("kernel-metadata.json"),
      expect.any(String),
    );
  }, 10000);
});

// ─── fallbackChain ───

describe("fallbackChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("succeeds on first platform (Colab)", async () => {
    exec.mockImplementation((cmd, opts, cb) => {
      cb(null, "colab success", "");
      return { kill: vi.fn(), pid: 12345 };
    });

    const { results } = await fallbackChain("test.py", {
      timeoutSec: 300,
      outputDir: "./output",
    });

    expect(results).toHaveLength(1);
    expect(results[0].platform).toBe("colab");
    expect(results[0].success).toBe(true);
  });

  it("falls back to Kaggle when Colab fails", async () => {
    // Colab fails
    exec.mockImplementation((cmd, opts, cb) => {
      cb(new Error("colab failed"), "", "error");
      return { kill: vi.fn(), pid: 12345 };
    });

    // Kaggle succeeds
    execSync.mockImplementation((cmd) => {
      if (cmd.includes("kernels push")) return "";
      if (cmd.includes("kernels status")) return "status complete";
      if (cmd.includes("kernels output")) return "";
      return "";
    });

    const { results } = await fallbackChain("test.py", {
      timeoutSec: 300,
      outputDir: "./output",
      pollIntervalSec: 0.01,
    });

    expect(results).toHaveLength(2);
    expect(results[0].platform).toBe("colab");
    expect(results[0].success).toBe(false);
    expect(results[1].platform).toBe("kaggle");
    expect(results[1].success).toBe(true);
  }, 10000);

  it("stops and returns all failures when both platforms fail", async () => {
    // Colab fails
    exec.mockImplementation((cmd, opts, cb) => {
      cb(new Error("colab failed"), "", "error");
      return { kill: vi.fn(), pid: 12345 };
    });

    // Kaggle fails (non-quota)
    execSync.mockImplementation((cmd) => {
      if (cmd.includes("kernels push")) {
        throw new Error("network error");
      }
      return "";
    });

    const { results } = await fallbackChain("test.py", {
      timeoutSec: 300,
      outputDir: "./output",
    });

    expect(results).toHaveLength(2);
    expect(results.every((r) => !r.success)).toBe(true);
  });

  it("includes manual fallback message when all platforms fail", async () => {
    // Both fail
    exec.mockImplementation((cmd, opts, cb) => {
      cb(new Error("colab failed"), "", "error");
      return { kill: vi.fn(), pid: 12345 };
    });

    execSync.mockImplementation((cmd) => {
      if (cmd.includes("kernels push")) {
        throw new Error("You have exceeded your weekly GPU quota");
      }
      return "";
    });

    const { results, manualMessage } = await fallbackChain("test.py", {
      timeoutSec: 300,
      outputDir: "./output",
    });

    expect(results.every((r) => !r.success)).toBe(true);
    expect(manualMessage).toBeDefined();
    expect(manualMessage).toMatch(/AutoDL|Colab CDP|manual/i);
  });
});
