/**
 * Tests for lib/visual-analyzer.mjs — VLM-powered asset understanding.
 *
 * TDD: Tests written first (red), implementation second (green).
 *
 * These tests mock child_process.spawn to verify:
 * - Request/response JSON IPC format (analyze_semantics action)
 * - Subprocess lifecycle (spawn / reuse / respawn / close)
 * - Serial request queuing
 * - Graceful degradation when VLM unavailable
 * - Focus detector subsystem (unchanged from previous version)
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
let visualAnalyzer;

beforeEach(async () => {
  vi.resetModules();
  // Re-setup mocks after resetModules
  mockSpawn = vi.fn();
  mockProc = createMockProcess();
  // For focus_detector.py spawn, create a separate mock process
  const focusMockProc = createMockProcess();
  mockSpawn.mockImplementation((pythonBin, args) => {
    // Return focusMockProc for focus_detector.py, mockProc for everything else
    if (args && args[0] && String(args[0]).includes("focus_detector.py")) {
      mockProc._focusProc = focusMockProc;
      return focusMockProc;
    }
    return mockProc;
  });

  // Re-import visual-analyzer so internal state is fresh
  const mod = await import("../lib/visual-analyzer.mjs");
  visualAnalyzer = mod;
});

afterEach(async () => {
  // Ensure real timers are restored before cleanup (R1/R3 tests use fake timers)
  vi.useRealTimers();
  try {
    await visualAnalyzer.closeVisualAnalyzer();
  } catch {
    // ignore
  }
  vi.restoreAllMocks();
});

// Helper to get the focus mock process for the current test
function getFocusProc() {
  return mockProc._focusProc || mockProc;
}

/**
 * R1: Helper to emit a VLM response with the correct requestId.
 * Reads the requestId from the last stdin write and echoes it back.
 */
function emitVlmResponse(proc, responseObj) {
  const writtenData = proc.stdin.write.mock.calls.at(-1)?.[0]?.toString();
  if (!writtenData) throw new Error("No stdin write found");
  const request = JSON.parse(writtenData.trim());
  proc.emitStdout(JSON.stringify({ ...responseObj, requestId: request.requestId }) + "\n");
}

/**
 * R1: Helper to emit a VLM response with a specific requestId.
 */
function emitVlmResponseWithId(proc, responseObj) {
  proc.emitStdout(JSON.stringify(responseObj) + "\n");
}

// ─── Degraded result constant ───

const DEGRADED = {
  description: "",
  subjects: [],
  contentKind: null,
  fit: null,
  criticalEdgeText: null,
  reason: null,
};

// ─── Tests ───

describe("visual-analyzer module", () => {
  describe("exports", () => {
    it("exports analyzeAssetSemantics, closeVisualAnalyzer, detectFocus, closeFocusDetector", () => {
      expect(typeof visualAnalyzer.analyzeAssetSemantics).toBe("function");
      expect(typeof visualAnalyzer.closeVisualAnalyzer).toBe("function");
      expect(typeof visualAnalyzer.detectFocus).toBe("function");
      expect(typeof visualAnalyzer.closeFocusDetector).toBe("function");
    });

    it("does NOT export old APIs (describeImage, describeVideo, analyzeFit, parseFitResponse)", () => {
      expect(visualAnalyzer.describeImage).toBeUndefined();
      expect(visualAnalyzer.describeVideo).toBeUndefined();
      expect(visualAnalyzer.analyzeFit).toBeUndefined();
      expect(visualAnalyzer.parseFitResponse).toBeUndefined();
    });
  });

  describe("analyzeAssetSemantics — normal path", () => {
    it("spawns Python subprocess on first call", async () => {
      const promise = visualAnalyzer.analyzeAssetSemantics("/abs/path/to/file.jpg");

      // Wait for spawn to be called
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Simulate Python response with full semantics dict
      mockProc.emitStdout(
        JSON.stringify({
          description: "A humanoid robot in a kitchen.",
          subjects: ["robot", "kitchen"],
          contentKind: "product_demo",
          fit: "contain",
          criticalEdgeText: "yes — bottom edge has text",
          reason: "Bottom edge text would be cropped.",
          error: null,
        }) + "\n",
      );

      const result = await promise;
      expect(result.description).toBe("A humanoid robot in a kitchen.");
      expect(result.subjects).toEqual(["robot", "kitchen"]);
      expect(result.contentKind).toBe("product_demo");
      expect(result.fit).toBe("contain");
      expect(result.criticalEdgeText).toContain("bottom edge");
      expect(result.reason).toContain("cropped");
    });

    it("sends analyze_semantics action to Python subprocess", async () => {
      const promise = visualAnalyzer.analyzeAssetSemantics("/abs/path/to/file.jpg");

      await new Promise((r) => setTimeout(r, 10));

      // Check what was written to stdin
      expect(mockProc.stdin.write).toHaveBeenCalled();
      const writtenData = mockProc.stdin.write.mock.calls[0][0].toString();
      const request = JSON.parse(writtenData.trim());

      expect(request.action).toBe("analyze_semantics");
      expect(request.path).toBe("/abs/path/to/file.jpg");

      mockProc.emitStdout(JSON.stringify({ ...DEGRADED, description: "test", error: null }) + "\n");

      await promise;
    });

    it("reuses running process for subsequent calls (no re-spawn)", async () => {
      // First call
      const promise1 = visualAnalyzer.analyzeAssetSemantics("/abs/img1.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(
        JSON.stringify({ ...DEGRADED, description: "first", error: null }) + "\n",
      );
      await promise1;

      // Second call — should NOT spawn again
      const promise2 = visualAnalyzer.analyzeAssetSemantics("/abs/img2.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(
        JSON.stringify({ ...DEGRADED, description: "second", error: null }) + "\n",
      );
      await promise2;

      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it("handles video assets (no fit/criticalEdgeText in response)", async () => {
      const promise = visualAnalyzer.analyzeAssetSemantics("/abs/clip.mp4");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout(
        JSON.stringify({
          description: "A robot walking in a factory.",
          subjects: ["robot", "factory"],
          contentKind: "talking_head",
          fit: null,
          criticalEdgeText: null,
          reason: null,
          error: null,
        }) + "\n",
      );

      const result = await promise;
      expect(result.description).toBe("A robot walking in a factory.");
      expect(result.fit).toBeNull();
      expect(result.criticalEdgeText).toBeNull();
      expect(result.reason).toBeNull();
    });
  });

  describe("analyzeAssetSemantics — degradation", () => {
    it("returns degraded result when VLM returns error", async () => {
      const promise = visualAnalyzer.analyzeAssetSemantics("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout(JSON.stringify({ ...DEGRADED, error: "VLM failed" }) + "\n");

      const result = await promise;
      expect(result.description).toBe("");
      expect(result.subjects).toEqual([]);
      expect(result.fit).toBeNull();
      expect(result.contentKind).toBeNull();
    });

    it("returns degraded result when VLM returns malformed JSON", async () => {
      const promise = visualAnalyzer.analyzeAssetSemantics("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout("This is not JSON at all\n");

      const result = await promise;
      expect(result.description).toBe("");
      expect(result.subjects).toEqual([]);
    });

    it("returns degraded result when spawn returns null (VLM unavailable)", async () => {
      const { existsSync } = await import("fs");
      existsSync.mockReturnValue(false);

      const result = await visualAnalyzer.analyzeAssetSemantics("/abs/img.jpg");
      expect(result.description).toBe("");
      expect(result.subjects).toEqual([]);
      expect(result.fit).toBeNull();

      existsSync.mockReturnValue(true);
    });

    it("returns degraded result when Python returns model load error", async () => {
      const promise = visualAnalyzer.analyzeAssetSemantics("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout(
        JSON.stringify({ ...DEGRADED, error: "Model load failed: No module named 'mlx_vlm'" }) +
          "\n",
      );

      const result = await promise;
      expect(result.description).toBe("");
    });
  });

  describe("process lifecycle — crash + respawn", () => {
    it("detects process exit and respawns on next call", async () => {
      // First call — works
      const promise1 = visualAnalyzer.analyzeAssetSemantics("/abs/img1.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(
        JSON.stringify({ ...DEGRADED, description: "first", error: null }) + "\n",
      );
      await promise1;

      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Simulate crash
      mockProc.emitExit(1, null);

      // Next call should respawn
      const newMockProc = createMockProcess();
      mockSpawn.mockReturnValue(newMockProc);

      const promise2 = visualAnalyzer.analyzeAssetSemantics("/abs/img2.jpg");
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      newMockProc.emitStdout(
        JSON.stringify({ ...DEGRADED, description: "respawned", error: null }) + "\n",
      );
      await promise2;
    });

    it("respawns after idle timeout (process exits with code 0)", async () => {
      // First call
      const promise1 = visualAnalyzer.analyzeAssetSemantics("/abs/img1.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(
        JSON.stringify({ ...DEGRADED, description: "first", error: null }) + "\n",
      );
      await promise1;

      // Simulate idle timeout (graceful exit, code 0)
      mockProc.emitExit(0, null);

      // Next call should respawn
      const newMockProc = createMockProcess();
      mockSpawn.mockReturnValue(newMockProc);

      const promise2 = visualAnalyzer.analyzeAssetSemantics("/abs/img2.jpg");
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      newMockProc.emitStdout(
        JSON.stringify({ ...DEGRADED, description: "after timeout", error: null }) + "\n",
      );
      await promise2;
    });
  });

  describe("closeVisualAnalyzer", () => {
    it("sends exit action and kills subprocess", async () => {
      // Start a process first
      const promise = visualAnalyzer.analyzeAssetSemantics("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(JSON.stringify({ ...DEGRADED, description: "test", error: null }) + "\n");
      await promise;

      // Close
      await visualAnalyzer.closeVisualAnalyzer();

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
      await expect(visualAnalyzer.closeVisualAnalyzer()).resolves.not.toThrow();
    });
  });

  describe("graceful degradation — VLM unavailable", () => {
    it("returns degraded result and logs warning when spawn returns null", async () => {
      const { existsSync } = await import("fs");
      existsSync.mockReturnValue(false);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await visualAnalyzer.analyzeAssetSemantics("/abs/img.jpg");

      expect(result.description).toBe("");
      expect(result.subjects).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
      existsSync.mockReturnValue(true);
    });

    it("returns degraded result when Python returns error response", async () => {
      const promise = visualAnalyzer.analyzeAssetSemantics("/abs/nonexistent.jpg");
      await new Promise((r) => setTimeout(r, 10));

      emitVlmResponse(mockProc, {
        ...DEGRADED,
        error: "File not found: /abs/nonexistent.jpg",
      });

      const result = await promise;
      expect(result.description).toBe("");
    });
  });

  describe("serial request queuing", () => {
    it("processes requests one at a time in order", async () => {
      // Fire 3 calls rapidly
      const promise1 = visualAnalyzer.analyzeAssetSemantics("/abs/img1.jpg");
      const promise2 = visualAnalyzer.analyzeAssetSemantics("/abs/img2.jpg");
      const promise3 = visualAnalyzer.analyzeAssetSemantics("/abs/img3.jpg");

      await new Promise((r) => setTimeout(r, 20));

      // Only first request should be written to stdin
      expect(mockProc.stdin.write).toHaveBeenCalledTimes(1);
      const req1 = JSON.parse(mockProc.stdin.write.mock.calls[0][0].toString().trim());
      expect(req1.path).toBe("/abs/img1.jpg");

      // Respond to first
      mockProc.emitStdout(
        JSON.stringify({ ...DEGRADED, description: "desc1", error: null }) + "\n",
      );
      const r1 = await promise1;
      expect(r1.description).toBe("desc1");

      // Second request should now be written
      await new Promise((r) => setTimeout(r, 10));
      expect(mockProc.stdin.write).toHaveBeenCalledTimes(2);
      const req2 = JSON.parse(mockProc.stdin.write.mock.calls[1][0].toString().trim());
      expect(req2.path).toBe("/abs/img2.jpg");

      mockProc.emitStdout(
        JSON.stringify({ ...DEGRADED, description: "desc2", error: null }) + "\n",
      );
      const r2 = await promise2;
      expect(r2.description).toBe("desc2");

      // Third request
      await new Promise((r) => setTimeout(r, 10));
      expect(mockProc.stdin.write).toHaveBeenCalledTimes(3);
      const req3 = JSON.parse(mockProc.stdin.write.mock.calls[2][0].toString().trim());
      expect(req3.path).toBe("/abs/img3.jpg");

      mockProc.emitStdout(
        JSON.stringify({ ...DEGRADED, description: "desc3", error: null }) + "\n",
      );
      const r3 = await promise3;
      expect(r3.description).toBe("desc3");

      // Only one process spawned
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe("error response from Python", () => {
    it("returns degraded result when Python returns error", async () => {
      const promise = visualAnalyzer.analyzeAssetSemantics("/abs/nonexistent.jpg");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout(
        JSON.stringify({ ...DEGRADED, error: "File not found: /abs/nonexistent.jpg" }) + "\n",
      );

      const result = await promise;
      expect(result.description).toBe("");
      expect(result.subjects).toEqual([]);
    });
  });

  describe("unknown action", () => {
    it("returns degraded result for unknown action response", async () => {
      const promise = visualAnalyzer.analyzeAssetSemantics("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout(JSON.stringify({ ...DEGRADED, error: "Unknown action: foo" }) + "\n");

      const result = await promise;
      expect(result.description).toBe("");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Focus Detector Tests (detectFocus / closeFocusDetector) ───
  // ═══════════════════════════════════════════════════════════════

  describe("detectFocus — normal path", () => {
    it("spawns focus_detector.py subprocess and sends analyze with requestId", async () => {
      const promise = visualAnalyzer.detectFocus("/abs/image.jpg");
      await new Promise((r) => setTimeout(r, 10));

      const focusProc = getFocusProc();

      // Check stdin write — should contain requestId + analyze action
      const writtenData = focusProc.stdin.write.mock.calls[0][0].toString();
      const request = JSON.parse(writtenData.trim());
      expect(request.action).toBe("analyze");
      expect(request.requestId).toBeDefined();
      expect(request.path).toBe("/abs/image.jpg");

      // Simulate Python response with matching requestId
      const resp = {
        requestId: request.requestId,
        result: {
          status: "ok",
          errorCode: null,
          frame: {
            width: 1920,
            height: 1080,
            orientation: "landscape",
            orientationNormalized: true,
          },
          protectedRegions: [
            {
              rect: [0.1, 0.2, 0.3, 0.4],
              kind: "face",
              confidence: null,
              confidenceKind: "not_provided",
            },
          ],
          saliency: { available: true, dispersion: 0.05, centroid: [0.5, 0.5] },
        },
      };
      focusProc.emitStdout(JSON.stringify(resp) + "\n");

      const result = await promise;
      expect(result.status).toBe("ok");
      expect(result.protectedRegions).toHaveLength(1);
      expect(result.saliency.available).toBe(true);
    });

    it("returns schema-complete result on ok status", async () => {
      const promise = visualAnalyzer.detectFocus("/abs/portrait.png");
      await new Promise((r) => setTimeout(r, 10));

      const focusProc = getFocusProc();
      const writtenData = focusProc.stdin.write.mock.calls[0][0].toString();
      const request = JSON.parse(writtenData.trim());

      focusProc.emitStdout(
        JSON.stringify({
          requestId: request.requestId,
          result: {
            status: "ok",
            errorCode: null,
            frame: {
              width: 1080,
              height: 1920,
              orientation: "portrait",
              orientationNormalized: true,
            },
            protectedRegions: [],
            saliency: { available: true, dispersion: 0.02, centroid: [0.4, 0.6] },
          },
        }) + "\n",
      );

      const result = await promise;
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("errorCode");
      expect(result).toHaveProperty("frame");
      expect(result).toHaveProperty("protectedRegions");
      expect(result).toHaveProperty("saliency");
      expect(result.saliency).toHaveProperty("available");
      expect(result.saliency).toHaveProperty("dispersion");
      expect(result.saliency).toHaveProperty("centroid");
    });
  });

  describe("detectFocus — never rejects", () => {
    it("returns degraded when spawn returns null (focus unavailable)", async () => {
      const { existsSync } = await import("fs");
      existsSync.mockReturnValue(false);

      const result = await visualAnalyzer.detectFocus("/abs/img.jpg");
      expect(result.status).toBe("degraded");
      expect(result.errorCode).toBe("focus_dependency_not_available");
      expect(result.protectedRegions).toEqual([]);
      expect(result.saliency.available).toBe(false);

      existsSync.mockReturnValue(true);
    });

    it("returns degraded on timeout", async () => {
      vi.useFakeTimers();
      const promise = visualAnalyzer.detectFocus("/abs/img.jpg");
      // Let microtasks flush so spawn happens
      await vi.waitFor(() => expect(getFocusProc()).toBeDefined(), { timeout: 1000 });

      // Fast-forward past FOCUS_RESPONSE_TIMEOUT_MS (10s)
      vi.advanceTimersByTime(11000);

      const result = await promise;
      expect(result.status).toBe("degraded");
      expect(result.errorCode).toBe("focus_timeout");

      vi.useRealTimers();
      await visualAnalyzer.closeFocusDetector();
    }, 10000);

    it("returns degraded with focus_worker_reset on process exit", async () => {
      const promise = visualAnalyzer.detectFocus("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));

      const focusProc = getFocusProc();
      // Simulate process crash before responding
      focusProc.emitExit(1, null);

      const result = await promise;
      expect(result.status).toBe("degraded");
      expect(result.errorCode).toBe("focus_worker_reset");
    });
  });

  describe("detectFocus — requestId matching", () => {
    it("discards response with unknown requestId", async () => {
      const promise = visualAnalyzer.detectFocus("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));

      const focusProc = getFocusProc();

      // Send a response with a WRONG requestId
      focusProc.emitStdout(
        JSON.stringify({
          requestId: "wrong-id-12345",
          result: {
            status: "ok",
            errorCode: null,
            frame: null,
            protectedRegions: [],
            saliency: { available: false, dispersion: 0, centroid: [0.5, 0.5] },
          },
        }) + "\n",
      );

      // The promise should NOT resolve yet (still pending)
      // Send the CORRECT response
      const writtenData = focusProc.stdin.write.mock.calls[0][0].toString();
      const request = JSON.parse(writtenData.trim());

      focusProc.emitStdout(
        JSON.stringify({
          requestId: request.requestId,
          result: {
            status: "ok",
            errorCode: null,
            frame: null,
            protectedRegions: [],
            saliency: { available: false, dispersion: 0, centroid: [0.5, 0.5] },
          },
        }) + "\n",
      );

      const result = await promise;
      expect(result.status).toBe("ok");
    }, 10000);
  });

  describe("closeFocusDetector", () => {
    it("sends exit and kills focus subprocess", async () => {
      // Start a focus process
      const promise = visualAnalyzer.detectFocus("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));

      const focusProc = getFocusProc();

      // Respond to the request so it completes
      const writtenData = focusProc.stdin.write.mock.calls[0][0].toString();
      const request = JSON.parse(writtenData.trim());
      focusProc.emitStdout(
        JSON.stringify({
          requestId: request.requestId,
          result: {
            status: "ok",
            errorCode: null,
            frame: null,
            protectedRegions: [],
            saliency: { available: false, dispersion: 0, centroid: [0.5, 0.5] },
          },
        }) + "\n",
      );
      await promise;

      // Close focus detector
      await visualAnalyzer.closeFocusDetector();

      // Should have written exit command to focus proc
      const exitCall = focusProc.stdin.write.mock.calls.find((c) => {
        try {
          return JSON.parse(c[0].toString().trim()).action === "exit";
        } catch {
          return false;
        }
      });
      expect(exitCall).toBeDefined();
    }, 10000);

    it("is idempotent — multiple calls don't throw", async () => {
      await expect(visualAnalyzer.closeFocusDetector()).resolves.not.toThrow();
      await expect(visualAnalyzer.closeFocusDetector()).resolves.not.toThrow();
    });

    it("settles pending requests as focus_worker_reset on close", async () => {
      const promise = visualAnalyzer.detectFocus("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));

      // Close without responding — pending should be settled
      await visualAnalyzer.closeFocusDetector();

      const result = await promise;
      expect(result.status).toBe("degraded");
      expect(result.errorCode).toBe("focus_worker_reset");
    }, 10000);
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── R1: VLM timeout late-response mismatch (Review R1) ─────────
  // ═══════════════════════════════════════════════════════════════

  describe("R1 — VLM timeout late-response mismatch", () => {
    it("does NOT give A's late response to B after A times out", async () => {
      vi.useFakeTimers();

      // Request A — will time out
      const promiseA = visualAnalyzer.analyzeAssetSemantics("/abs/imgA.jpg");
      await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1), { timeout: 1000 });

      // Fast-forward past RESPONSE_TIMEOUT_MS (180s)
      vi.advanceTimersByTime(181_000);

      // A should resolve with degraded
      const resultA = await promiseA;
      expect(resultA.description).toBe("");

      // Now spawn a new mock for request B (worker was killed on timeout)
      const newMockProc = createMockProcess();
      mockSpawn.mockReturnValue(newMockProc);

      // Request B
      const promiseB = visualAnalyzer.analyzeAssetSemantics("/abs/imgB.jpg");
      await vi.waitFor(() => expect(newMockProc.stdin.write).toHaveBeenCalled(), { timeout: 1000 });

      // Simulate A's LATE response arriving on the OLD proc (should be discarded)
      mockProc.emitStdout(
        JSON.stringify({ ...DEGRADED, description: "This is A's result", error: null }) + "\n",
      );

      // Simulate B's correct response on the NEW proc
      newMockProc.emitStdout(
        JSON.stringify({ ...DEGRADED, description: "This is B's result", error: null }) + "\n",
      );

      const resultB = await promiseB;
      expect(resultB.description).toBe("This is B's result");
      expect(resultB.description).not.toBe("This is A's result");

      vi.useRealTimers();
      // Don't call closeVisualAnalyzer here — afterEach handles cleanup
    }, 10000);
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── R3: Focus timeout resets worker (Review R3) ──────────────
  // ═══════════════════════════════════════════════════════════════

  describe("R3 — Focus timeout resets worker", () => {
    it("kills focus worker on timeout and respawns for next request", async () => {
      vi.useFakeTimers();

      // First request — will time out
      const promise1 = visualAnalyzer.detectFocus("/abs/img.jpg");
      await vi.waitFor(() => expect(getFocusProc()).toBeDefined(), { timeout: 1000 });

      const firstProc = getFocusProc();

      // Fast-forward past FOCUS_RESPONSE_TIMEOUT_MS (10s)
      vi.advanceTimersByTime(11_000);

      const result1 = await promise1;
      expect(result1.status).toBe("degraded");
      expect(result1.errorCode).toBe("focus_timeout");

      // First worker should have been killed
      expect(firstProc.kill).toHaveBeenCalled();

      // Create a new mock process for the respawned focus worker
      const newFocusProc = createMockProcess();
      // Update mockSpawn to return the new focus proc for subsequent calls
      mockSpawn.mockImplementation((pythonBin, args) => {
        if (args && args[0] && String(args[0]).includes("focus_detector.py")) {
          mockProc._focusProc = newFocusProc;
          return newFocusProc;
        }
        return mockProc;
      });

      // Second request — should spawn a NEW process
      const promise2 = visualAnalyzer.detectFocus("/abs/img2.jpg");
      await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2), { timeout: 1000 });

      // Get the new focus proc
      const secondProc = getFocusProc();
      expect(secondProc).not.toBe(firstProc);

      // Respond to second request on the new proc
      const writtenData = secondProc.stdin.write.mock.calls.find((c) => {
        try {
          return JSON.parse(c[0].toString().trim()).action === "analyze";
        } catch {
          return false;
        }
      });
      expect(writtenData).toBeDefined();
      const request = JSON.parse(writtenData[0].toString().trim());

      secondProc.emitStdout(
        JSON.stringify({
          requestId: request.requestId,
          result: {
            status: "ok",
            errorCode: null,
            frame: null,
            protectedRegions: [],
            saliency: { available: false, dispersion: 0, centroid: [0.5, 0.5] },
          },
        }) + "\n",
      );

      const result2 = await promise2;
      expect(result2.status).toBe("ok");

      vi.useRealTimers();
      // Don't call closeFocusDetector here — afterEach handles cleanup
    }, 10000);
  });
});
