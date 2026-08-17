/**
 * Vitest wrapper for test_f5_duration.py.
 *
 * Calls the Python test script and asserts all tests passed.
 * This bridges the gap between the project's vitest-based test suite
 * and the Python duration estimation logic.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");
const PYTHON = join(process.env.HOME || "", ".video-tts-env", "bin", "python3");
const TEST_SCRIPT = join(ROOT, "__tests__", "test_f5_duration.py");

describe("F5 duration estimation (Python)", () => {
  it("Python environment exists", () => {
    expect(existsSync(PYTHON)).toBe(true);
  });

  it("test_f5_duration.py passes all assertions", () => {
    expect(existsSync(TEST_SCRIPT)).toBe(true);
    const output = execSync(`"${PYTHON}" "${TEST_SCRIPT}"`, {
      encoding: "utf-8",
      timeout: 30000,
      cwd: ROOT,
    });
    // Check for the summary line
    expect(output).toContain("0 failed");
    expect(output).not.toContain("1 failed");
    expect(output).not.toContain("5 failed");
  });

  it("pure Chinese sentence is not treated as single word", () => {
    const output = execSync(
      `"${PYTHON}" -c "import sys; sys.path.insert(0,'${ROOT}'); from f5_mlx_batch_tts import estimate_target_seconds; print(estimate_target_seconds('大家好今天天气很好'))"`,
      { encoding: "utf-8", timeout: 10000, cwd: ROOT },
    );
    const dur = parseFloat(output.trim());
    // Old formula: 1/2.8 = 0.357s. New formula should be > 1.5s
    expect(dur).toBeGreaterThan(1.5);
  });

  it("mixed CJK+Latin produces reasonable duration", () => {
    const output = execSync(
      `"${PYTHON}" -c "import sys; sys.path.insert(0,'${ROOT}'); from f5_mlx_batch_tts import estimate_target_seconds; print(estimate_target_seconds('DeepSeek 发布了新模型'))"`,
      { encoding: "utf-8", timeout: 10000, cwd: ROOT },
    );
    const dur = parseFloat(output.trim());
    expect(dur).toBeGreaterThan(0.5);
    expect(dur).toBeLessThan(5.0);
  });

  it("punctuation adds pause duration", () => {
    const cmd = `"${PYTHON}" -c "import sys; sys.path.insert(0,'${ROOT}'); from f5_mlx_batch_tts import estimate_target_seconds; print(estimate_target_seconds('大家好，今天天气很好。') - estimate_target_seconds('大家好今天天气很好'))"`;
    const output = execSync(cmd, { encoding: "utf-8", timeout: 10000, cwd: ROOT });
    const diff = parseFloat(output.trim());
    // 2 punctuation marks × 0.15s = 0.30s
    expect(diff).toBeGreaterThan(0.2);
    expect(diff).toBeLessThan(0.4);
  });
});
