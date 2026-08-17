/**
 * Tests for lib/ai-analyzer.mjs — VLM-powered asset understanding.
 *
 * TDD: Tests written first (red), implementation second (green).
 *
 * These tests mock child_process.spawn to verify:
 * - Request/response JSON IPC format
 * - Subprocess lifecycle (spawn / reuse / respawn / close)
 * - Serial request queuing
 * - Graceful degradation when VLM unavailable
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter, PassThrough } from "stream";

// ─── Mock helpers ───

/**
 * Create a mock subprocess with controllable stdin/stdout/stderr.
 *
 * - stdin: captures written data via a 'data' listener
 * - stdout: use `emitStdout(data)` to simulate Python output
 * - Call `emitExit(code)` to simulate process termination
 */
function createMockProcess() {
  const proc = new EventEmitter();
  proc.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.pid = 12345;
  proc.killed = false;
  proc.exitCode = null;
  proc.kill = vi.fn((signal) => {
    proc.killed = true;
    // Don't auto-emit exit — let the test control it
  });

  // Helper to emit stdout data (simulating Python response)
  proc.emitStdout = (str) => {
    proc.stdout.push(str);
  };

  // Helper to emit exit event
  proc.emitExit = (code = 0, signal = null) => {
    proc.exitCode = code;
    proc.emit("exit", code, signal);
  };

  return proc;
}

// ─── Mock child_process + fs ───

let mockSpawn = vi.fn();
let mockProc = null;

vi.mock("child_process", () => ({
  spawn: (...args) => mockSpawn(...args),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(() => true),
}));

// Import AFTER mocks are set up — use dynamic import in each test to
// ensure module state is fresh.
let aiAnalyzer;

beforeEach(async () => {
  vi.resetModules();
  // Re-setup mocks after resetModules
  mockSpawn = vi.fn();
  mockProc = createMockProcess();
  mockSpawn.mockReturnValue(mockProc);

  // Re-import ai-analyzer so internal state is fresh
  const mod = await import("../lib/ai-analyzer.mjs");
  aiAnalyzer = mod;
});

afterEach(async () => {
  try {
    await aiAnalyzer.closeAnalyzer();
  } catch {
    // ignore
  }
  vi.restoreAllMocks();
});

// ─── Tests ───

describe("ai-analyzer module", () => {
  describe("exports", () => {
    it("exports describeImage, describeVideo, closeAnalyzer", () => {
      expect(typeof aiAnalyzer.describeImage).toBe("function");
      expect(typeof aiAnalyzer.describeVideo).toBe("function");
      expect(typeof aiAnalyzer.closeAnalyzer).toBe("function");
    });
  });

  describe("describeImage — normal path", () => {
    it("spawns Python subprocess on first call", async () => {
      const promise = aiAnalyzer.describeImage("/abs/path/to/file.jpg");

      // Wait for spawn to be called
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Simulate Python response
      mockProc.emitStdout(
        JSON.stringify({ description: "A robot walking in a lab", error: null }) + "\n",
      );

      const result = await promise;
      expect(result).toBe("A robot walking in a lab");
    });

    it("sends correct JSON request to Python subprocess", async () => {
      const promise = aiAnalyzer.describeImage("/abs/path/to/file.jpg");

      await new Promise((r) => setTimeout(r, 10));

      // Check what was written to stdin
      expect(mockProc.stdin.write).toHaveBeenCalled();
      const writtenData = mockProc.stdin.write.mock.calls[0][0].toString();
      const request = JSON.parse(writtenData.trim());

      expect(request.action).toBe("describe_image");
      expect(request.path).toBe("/abs/path/to/file.jpg");

      mockProc.emitStdout(JSON.stringify({ description: "test", error: null }) + "\n");

      await promise;
    });

    it("reuses running process for subsequent calls (no re-spawn)", async () => {
      // First call
      const promise1 = aiAnalyzer.describeImage("/abs/img1.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(JSON.stringify({ description: "first", error: null }) + "\n");
      await promise1;

      // Second call — should NOT spawn again
      const promise2 = aiAnalyzer.describeImage("/abs/img2.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(JSON.stringify({ description: "second", error: null }) + "\n");
      await promise2;

      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe("describeVideo — normal path", () => {
    it("sends describe_video action for video files", async () => {
      const promise = aiAnalyzer.describeVideo("/abs/clip.mp4");
      await new Promise((r) => setTimeout(r, 10));

      const writtenData = mockProc.stdin.write.mock.calls[0][0].toString();
      const request = JSON.parse(writtenData.trim());

      expect(request.action).toBe("describe_video");
      expect(request.path).toBe("/abs/clip.mp4");

      mockProc.emitStdout(
        JSON.stringify({ description: "A robot demonstration", error: null }) + "\n",
      );

      const result = await promise;
      expect(result).toBe("A robot demonstration");
    });
  });

  describe("process lifecycle — crash + respawn", () => {
    it("detects process exit and respawns on next call", async () => {
      // First call — works
      const promise1 = aiAnalyzer.describeImage("/abs/img1.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(JSON.stringify({ description: "first", error: null }) + "\n");
      await promise1;

      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Simulate crash
      mockProc.emitExit(1, null);

      // Next call should respawn
      const newMockProc = createMockProcess();
      mockSpawn.mockReturnValue(newMockProc);

      const promise2 = aiAnalyzer.describeImage("/abs/img2.jpg");
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      newMockProc.emitStdout(JSON.stringify({ description: "respawned", error: null }) + "\n");
      await promise2;
    });

    it("respawns after idle timeout (process exits with code 0)", async () => {
      // First call
      const promise1 = aiAnalyzer.describeImage("/abs/img1.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(JSON.stringify({ description: "first", error: null }) + "\n");
      await promise1;

      // Simulate idle timeout (graceful exit, code 0)
      mockProc.emitExit(0, null);

      // Next call should respawn
      const newMockProc = createMockProcess();
      mockSpawn.mockReturnValue(newMockProc);

      const promise2 = aiAnalyzer.describeImage("/abs/img2.jpg");
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      newMockProc.emitStdout(JSON.stringify({ description: "after timeout", error: null }) + "\n");
      await promise2;
    });
  });

  describe("closeAnalyzer", () => {
    it("sends exit action and kills subprocess", async () => {
      // Start a process first
      const promise = aiAnalyzer.describeImage("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(JSON.stringify({ description: "test", error: null }) + "\n");
      await promise;

      // Close
      await aiAnalyzer.closeAnalyzer();

      // Should have written exit command to stdin
      const exitCall = mockProc.stdin.write.mock.calls.find((c) => {
        try {
          return JSON.parse(c[0].toString().trim()).action === "exit";
        } catch {
          return false;
        }
      });
      expect(exitCall).toBeDefined();
      expect(mockProc.kill).toHaveBeenCalled();
    });

    it("does not error when no process is running", async () => {
      await expect(aiAnalyzer.closeAnalyzer()).resolves.not.toThrow();
    });
  });

  describe("graceful degradation — VLM unavailable", () => {
    it("returns empty string and logs warning when spawn returns null", async () => {
      // Simulate spawn returning null (e.g., existsSync returns false)
      const { existsSync } = await import("fs");
      existsSync.mockReturnValue(false);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await aiAnalyzer.describeImage("/abs/img.jpg");

      expect(result).toBe("");
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
      // Restore for other tests
      existsSync.mockReturnValue(true);
    });

    it("returns empty string when Python returns error response", async () => {
      const promise = aiAnalyzer.describeImage("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout(
        JSON.stringify({ description: "", error: "Model load failed: No module named 'mlx_vlm'" }) +
          "\n",
      );

      const result = await promise;
      expect(result).toBe("");
    });
  });

  describe("serial request queuing", () => {
    it("processes requests one at a time in order", async () => {
      // Fire 3 calls rapidly
      const promise1 = aiAnalyzer.describeImage("/abs/img1.jpg");
      const promise2 = aiAnalyzer.describeImage("/abs/img2.jpg");
      const promise3 = aiAnalyzer.describeImage("/abs/img3.jpg");

      await new Promise((r) => setTimeout(r, 20));

      // Only first request should be written to stdin
      expect(mockProc.stdin.write).toHaveBeenCalledTimes(1);
      const req1 = JSON.parse(mockProc.stdin.write.mock.calls[0][0].toString().trim());
      expect(req1.path).toBe("/abs/img1.jpg");

      // Respond to first
      mockProc.emitStdout(JSON.stringify({ description: "desc1", error: null }) + "\n");
      const r1 = await promise1;
      expect(r1).toBe("desc1");

      // Second request should now be written
      await new Promise((r) => setTimeout(r, 10));
      expect(mockProc.stdin.write).toHaveBeenCalledTimes(2);
      const req2 = JSON.parse(mockProc.stdin.write.mock.calls[1][0].toString().trim());
      expect(req2.path).toBe("/abs/img2.jpg");

      mockProc.emitStdout(JSON.stringify({ description: "desc2", error: null }) + "\n");
      const r2 = await promise2;
      expect(r2).toBe("desc2");

      // Third request
      await new Promise((r) => setTimeout(r, 10));
      expect(mockProc.stdin.write).toHaveBeenCalledTimes(3);
      const req3 = JSON.parse(mockProc.stdin.write.mock.calls[2][0].toString().trim());
      expect(req3.path).toBe("/abs/img3.jpg");

      mockProc.emitStdout(JSON.stringify({ description: "desc3", error: null }) + "\n");
      const r3 = await promise3;
      expect(r3).toBe("desc3");

      // Only one process spawned
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe("error response from Python", () => {
    it("returns empty string when Python returns error", async () => {
      const promise = aiAnalyzer.describeImage("/abs/nonexistent.jpg");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout(
        JSON.stringify({ description: "", error: "File not found: /abs/nonexistent.jpg" }) + "\n",
      );

      const result = await promise;
      expect(result).toBe("");
    });
  });

  describe("unknown action", () => {
    it("returns empty string for unknown action response", async () => {
      const promise = aiAnalyzer.describeImage("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout(JSON.stringify({ description: "", error: "Unknown action: foo" }) + "\n");

      const result = await promise;
      expect(result).toBe("");
    });
  });
});
