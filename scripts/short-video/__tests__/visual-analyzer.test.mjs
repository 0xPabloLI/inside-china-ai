/**
 * Tests for lib/visual-analyzer.mjs — VLM-powered asset understanding.
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

// ─── Tests ───

describe("visual-analyzer module", () => {
  describe("exports", () => {
    it("exports describeImage, describeVideo, analyzeFit, closeVisualAnalyzer, detectFocus, closeFocusDetector", () => {
      expect(typeof visualAnalyzer.describeImage).toBe("function");
      expect(typeof visualAnalyzer.describeVideo).toBe("function");
      expect(typeof visualAnalyzer.analyzeFit).toBe("function");
      expect(typeof visualAnalyzer.closeVisualAnalyzer).toBe("function");
      expect(typeof visualAnalyzer.detectFocus).toBe("function");
      expect(typeof visualAnalyzer.closeFocusDetector).toBe("function");
    });
  });

  describe("parseFitResponse", () => {
    it("parses valid JSON response", () => {
      const text = '{"fit": "cover", "focus": "top", "reason": "subject in upper frame"}';
      const result = visualAnalyzer.parseFitResponse(text);
      expect(result).toEqual({
        fit: "cover",
        focus: "top",
        reason: "subject in upper frame",
      });
    });

    it("parses JSON wrapped in markdown code block", () => {
      const text = '```json\n{"fit": "contain", "focus": "center", "reason": "text at edges"}\n```';
      const result = visualAnalyzer.parseFitResponse(text);
      expect(result.fit).toBe("contain");
      expect(result.focus).toBe("center");
    });

    it("parses JSON with extra text around it", () => {
      const text = 'Here is my analysis:\n{"fit": "cover", "focus": "bottom", "reason": "subject below"}\nHope this helps!';
      const result = visualAnalyzer.parseFitResponse(text);
      expect(result.fit).toBe("cover");
      expect(result.focus).toBe("bottom");
    });

    it("returns empty object for invalid fit value", () => {
      const text = '{"fit": "invalid", "focus": "center", "reason": "..."}';
      const result = visualAnalyzer.parseFitResponse(text);
      expect(result).toEqual({});
    });

    it("preserves fit when focus is invalid (spec §4.8: fit required, focus optional)", () => {
      const text = '{"fit": "cover", "focus": "left", "reason": "..."}';
      const result = visualAnalyzer.parseFitResponse(text);
      expect(result).toEqual({ fit: "cover", reason: "..." });
    });

    it("preserves fit when focus is absent (spec §4.8 regression test)", () => {
      const text = '{"fit": "cover"}';
      const result = visualAnalyzer.parseFitResponse(text);
      expect(result).toEqual({ fit: "cover", reason: "" });
    });

    it("preserves fit when focus is null", () => {
      const text = '{"fit": "contain", "focus": null, "reason": "text at edges"}';
      const result = visualAnalyzer.parseFitResponse(text);
      expect(result).toEqual({ fit: "contain", reason: "text at edges" });
    });

    it("returns empty object for empty string", () => {
      const result = visualAnalyzer.parseFitResponse("");
      expect(result).toEqual({});
    });

    it("returns empty object for whitespace-only string", () => {
      const result = visualAnalyzer.parseFitResponse("   \n  \t ");
      expect(result).toEqual({});
    });

    it("returns empty object when no JSON found", () => {
      const result = visualAnalyzer.parseFitResponse("I cannot analyze this image");
      expect(result).toEqual({});
    });

    it("returns empty object for null input", () => {
      const result = visualAnalyzer.parseFitResponse(null);
      expect(result).toEqual({});
    });
  });

  describe("analyzeFit — normal path", () => {
    it("sends analyze_fit action to Python subprocess", async () => {
      const promise = visualAnalyzer.analyzeFit("/abs/landscape.jpg");
      await new Promise((r) => setTimeout(r, 10));

      const writtenData = mockProc.stdin.write.mock.calls[0][0].toString();
      const request = JSON.parse(writtenData.trim());

      expect(request.action).toBe("analyze_fit");
      expect(request.path).toBe("/abs/landscape.jpg");

      mockProc.emitStdout(
        JSON.stringify({
          fit: "cover",
          focus: "top",
          reason: "main subject in upper portion",
          error: null,
        }) + "\n",
      );

      const result = await promise;
      expect(result).toEqual({
        fit: "cover",
        focus: "top",
        reason: "main subject in upper portion",
      });
    });

    it("returns object with fit, focus, reason on valid VLM response", async () => {
      const promise = visualAnalyzer.analyzeFit("/abs/wide.mp4");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout(
        JSON.stringify({
          fit: "contain",
          focus: "center",
          reason: "UI elements at edges must not be cropped",
          error: null,
        }) + "\n",
      );

      const result = await promise;
      expect(result.fit).toBe("contain");
      expect(result.focus).toBe("center");
      expect(result.reason).toContain("UI elements");
    });
  });

  describe("analyzeFit — fit-only response (spec §4.8 decoupling)", () => {
    it("resolves with fit when VLM returns fit but no focus", async () => {
      const promise = visualAnalyzer.analyzeFit("/abs/landscape.jpg");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout(
        JSON.stringify({
          fit: "cover",
          focus: null,
          reason: "",
          error: null,
        }) + "\n",
      );

      const result = await promise;
      expect(result.fit).toBe("cover");
      expect(result.reason).toBe("");
      expect(result.focus).toBeUndefined();
    });

    it("resolves with fit when VLM returns fit with invalid focus", async () => {
      const promise = visualAnalyzer.analyzeFit("/abs/wide.jpg");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout(
        JSON.stringify({
          fit: "contain",
          focus: "left",  // invalid — not in top|center|bottom
          reason: "UI elements",
          error: null,
        }) + "\n",
      );

      const result = await promise;
      expect(result.fit).toBe("contain");
      expect(result.reason).toBe("UI elements");
      expect(result.focus).toBeUndefined();
    });
  });

  describe("analyzeFit — degradation", () => {
    it("returns empty object when VLM returns error", async () => {
      const promise = visualAnalyzer.analyzeFit("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout(
        JSON.stringify({ fit: null, focus: null, reason: "", error: "VLM failed" }) + "\n",
      );

      const result = await promise;
      expect(result).toEqual({});
    });

    it("returns empty object when VLM returns malformed JSON", async () => {
      const promise = visualAnalyzer.analyzeFit("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout("This is not JSON at all\n");

      const result = await promise;
      expect(result).toEqual({});
    });

    it("returns empty object when spawn returns null (VLM unavailable)", async () => {
      const { existsSync } = await import("fs");
      existsSync.mockReturnValue(false);

      const result = await visualAnalyzer.analyzeFit("/abs/img.jpg");
      expect(result).toEqual({});

      existsSync.mockReturnValue(true);
    });
  });

  describe("describeImage — normal path", () => {
    it("spawns Python subprocess on first call", async () => {
      const promise = visualAnalyzer.describeImage("/abs/path/to/file.jpg");

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
      const promise = visualAnalyzer.describeImage("/abs/path/to/file.jpg");

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
      const promise1 = visualAnalyzer.describeImage("/abs/img1.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(JSON.stringify({ description: "first", error: null }) + "\n");
      await promise1;

      // Second call — should NOT spawn again
      const promise2 = visualAnalyzer.describeImage("/abs/img2.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(JSON.stringify({ description: "second", error: null }) + "\n");
      await promise2;

      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe("describeVideo — normal path", () => {
    it("sends describe_video action for video files", async () => {
      const promise = visualAnalyzer.describeVideo("/abs/clip.mp4");
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
      const promise1 = visualAnalyzer.describeImage("/abs/img1.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(JSON.stringify({ description: "first", error: null }) + "\n");
      await promise1;

      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Simulate crash
      mockProc.emitExit(1, null);

      // Next call should respawn
      const newMockProc = createMockProcess();
      mockSpawn.mockReturnValue(newMockProc);

      const promise2 = visualAnalyzer.describeImage("/abs/img2.jpg");
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      newMockProc.emitStdout(JSON.stringify({ description: "respawned", error: null }) + "\n");
      await promise2;
    });

    it("respawns after idle timeout (process exits with code 0)", async () => {
      // First call
      const promise1 = visualAnalyzer.describeImage("/abs/img1.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(JSON.stringify({ description: "first", error: null }) + "\n");
      await promise1;

      // Simulate idle timeout (graceful exit, code 0)
      mockProc.emitExit(0, null);

      // Next call should respawn
      const newMockProc = createMockProcess();
      mockSpawn.mockReturnValue(newMockProc);

      const promise2 = visualAnalyzer.describeImage("/abs/img2.jpg");
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      newMockProc.emitStdout(JSON.stringify({ description: "after timeout", error: null }) + "\n");
      await promise2;
    });
  });

  describe("closeVisualAnalyzer", () => {
    it("sends exit action and kills subprocess", async () => {
      // Start a process first
      const promise = visualAnalyzer.describeImage("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));
      mockProc.emitStdout(JSON.stringify({ description: "test", error: null }) + "\n");
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
    it("returns empty string and logs warning when spawn returns null", async () => {
      // Simulate spawn returning null (e.g., existsSync returns false)
      const { existsSync } = await import("fs");
      existsSync.mockReturnValue(false);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await visualAnalyzer.describeImage("/abs/img.jpg");

      expect(result).toBe("");
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
      // Restore for other tests
      existsSync.mockReturnValue(true);
    });

    it("returns empty string when Python returns error response", async () => {
      const promise = visualAnalyzer.describeImage("/abs/img.jpg");
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
      const promise1 = visualAnalyzer.describeImage("/abs/img1.jpg");
      const promise2 = visualAnalyzer.describeImage("/abs/img2.jpg");
      const promise3 = visualAnalyzer.describeImage("/abs/img3.jpg");

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
      const promise = visualAnalyzer.describeImage("/abs/nonexistent.jpg");
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
      const promise = visualAnalyzer.describeImage("/abs/img.jpg");
      await new Promise((r) => setTimeout(r, 10));

      mockProc.emitStdout(JSON.stringify({ description: "", error: "Unknown action: foo" }) + "\n");

      const result = await promise;
      expect(result).toBe("");
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
          frame: { width: 1920, height: 1080, orientation: "landscape", orientationNormalized: true },
          protectedRegions: [{ rect: [0.1, 0.2, 0.3, 0.4], kind: "face", confidence: null, confidenceKind: "not_provided" }],
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

      focusProc.emitStdout(JSON.stringify({
        requestId: request.requestId,
        result: {
          status: "ok",
          errorCode: null,
          frame: { width: 1080, height: 1920, orientation: "portrait", orientationNormalized: true },
          protectedRegions: [],
          saliency: { available: true, dispersion: 0.02, centroid: [0.4, 0.6] },
        },
      }) + "\n");

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
      focusProc.emitStdout(JSON.stringify({
        requestId: "wrong-id-12345",
        result: { status: "ok", errorCode: null, frame: null, protectedRegions: [], saliency: { available: false, dispersion: 0, centroid: [0.5, 0.5] } },
      }) + "\n");

      // The promise should NOT resolve yet (still pending)
      // Send the CORRECT response
      const writtenData = focusProc.stdin.write.mock.calls[0][0].toString();
      const request = JSON.parse(writtenData.trim());

      focusProc.emitStdout(JSON.stringify({
        requestId: request.requestId,
        result: { status: "ok", errorCode: null, frame: null, protectedRegions: [], saliency: { available: false, dispersion: 0, centroid: [0.5, 0.5] } },
      }) + "\n");

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
      focusProc.emitStdout(JSON.stringify({
        requestId: request.requestId,
        result: { status: "ok", errorCode: null, frame: null, protectedRegions: [], saliency: { available: false, dispersion: 0, centroid: [0.5, 0.5] } },
      }) + "\n");
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
});
