import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { FOCUS_PYTHON_BIN, probeFocusRuntime } from "../visual-analyzer.mjs";

const SCRIPT = join(process.cwd(), "scripts/short-video/lib/focus_detector.py");

// Same interpreter the production subprocess spawns (#396) — never a second
// venv that merely has the APIs.
const PYTHON_BIN = FOCUS_PYTHON_BIN;

let proc = null;
let tmpDir = null;
let seq = 0;
let stdoutBuffer = "";
const pending = new Map();

function startSubprocess(timeout = "60") {
  return spawn(PYTHON_BIN, [SCRIPT], {
    env: {
      ...process.env,
      FOCUS_IDLE_TIMEOUT_SECONDS: timeout,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function send(req) {
  return new Promise((resolve, reject) => {
    const id = req.requestId || randomUUID();
    if (!req.requestId) req.requestId = id;
    pending.set(id, { resolve, reject });
    proc.stdin.write(JSON.stringify(req) + "\n");
  });
}

function setupStdout() {
  proc.stdout.on("data", (chunk) => {
    // Child-process stdout is a byte stream, not a message stream. Retain the
    // final partial NDJSON line until the next chunk rather than dropping it.
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() || "";
    for (const line of lines.filter(Boolean)) {
      try {
        const resp = JSON.parse(line);
        const id = resp.requestId;
        if (id && pending.has(id)) {
          const { resolve, reject } = pending.get(id);
          pending.delete(id);
          resolve(resp);
        }
      } catch {
        // ignore non-JSON
      }
    }
  });
  proc.stderr.on("data", (chunk) => {
    // Log for debugging but don't fail tests
    if (process.env.DEBUG_FOCUS) {
      console.error("[focus_detector stderr]", chunk.toString());
    }
  });
  proc.on("error", (err) => {
    // reject all pending on connection error
    for (const [, { reject }] of pending) {
      reject(err);
    }
    pending.clear();
  });
}

// Skip when the production focus runtime is incomplete (no venv, no
// FaceDetectorYN, missing YuNet weights). The probe is the same one main.mjs
// runs, so this suite cannot stay green while production degrades (#396).
const maybeDescribe =
  PYTHON_BIN && existsSync(PYTHON_BIN) && existsSync(SCRIPT) && probeFocusRuntime().ok
    ? describe
    : describe.skip;

maybeDescribe("focus_detector.py IPC", () => {
  beforeAll(async () => {
    stdoutBuffer = "";
    pending.clear();
    tmpDir = mkdtempSync(join(tmpdir(), "focus-test-"));
    proc = startSubprocess("15");
    setupStdout();
    // Wait for spawn or error
    await new Promise((resolve) => {
      const onSpawn = () => resolve();
      const onError = () => resolve();
      proc.once("spawn", onSpawn);
      proc.once("error", onError);
      // Timeout fallback — don't block forever
      setTimeout(resolve, 5000);
    });
  }, 15000);

  afterAll(() => {
    if (proc) {
      try {
        proc.stdin.write(JSON.stringify({ action: "exit" }) + "\n");
      } catch {
        // ignore
      }
      proc.kill("SIGKILL");
    }
    if (tmpDir) {
      try {
        rmSync(tmpDir, { recursive: true });
      } catch {
        // ignore
      }
    }
  });

  test("valid analyze request returns envelope with matching requestId", async () => {
    const id = randomUUID();
    const resp = await send({
      requestId: id,
      action: "analyze",
      path: "/nonexistent/path/image.jpg",
    });
    expect(resp.requestId).toBe(id);
    expect(resp.result).toBeDefined();
    expect(resp.result.status).toMatch(/^(ok|degraded|partial|low_information)$/);
    expect(resp.result.frame).toBeDefined();
    expect(resp.result.protectedRegions).toBeInstanceOf(Array);
    expect(resp.result.saliency).toBeDefined();
  }, 20000);

  test("result schema has all required fields", async () => {
    const resp = await send({
      requestId: randomUUID(),
      action: "analyze",
      path: "/nonexistent/path/image.jpg",
    });
    const r = resp.result;
    // Required top-level fields
    expect(r).toHaveProperty("status");
    expect(r).toHaveProperty("errorCode");
    expect(r).toHaveProperty("frame");
    expect(r).toHaveProperty("protectedRegions");
    expect(r).toHaveProperty("saliency");
    // Saliency schema
    expect(r.saliency).toHaveProperty("available");
    expect(r.saliency).toHaveProperty("dispersion");
    expect(r.saliency).toHaveProperty("centroid");
    expect(r.saliency.centroid).toHaveLength(2);
  }, 20000);

  test("non-existent image returns status=degraded", async () => {
    const resp = await send({
      requestId: randomUUID(),
      action: "analyze",
      path: "/tmp/does-not-exist-" + Date.now() + ".jpg",
    });
    expect(resp.result.status).toBe("degraded");
    expect(resp.result.errorCode).toBe("cannot_read_image");
  }, 20000);

  test("unsupported file type returns status=unsupported", async () => {
    const resp = await send({
      requestId: randomUUID(),
      action: "analyze",
      path: "/tmp/test.txt",
    });
    expect(resp.result.status).toBe("unsupported");
    expect(resp.result.errorCode).toBe("unsupported_media_type");
  }, 20000);

  test("video file returns status=unsupported", async () => {
    const resp = await send({
      requestId: randomUUID(),
      action: "analyze",
      path: "/tmp/test.mp4",
    });
    expect(resp.result.status).toBe("unsupported");
    expect(resp.result.errorCode).toBe("video_not_supported");
  }, 20000);

  test("unknown action returns degraded with focus_protocol_error", async () => {
    const id = randomUUID();
    const resp = await send({
      requestId: id,
      action: "bogus",
      path: "/tmp/test.jpg",
    });
    expect(resp.requestId).toBe(id);
    expect(resp.result.status).toBe("degraded");
    expect(resp.result.errorCode).toBe("focus_protocol_error");
  }, 20000);

  test("exit action terminates gracefully (no response)", async () => {
    const exitPromise = new Promise((resolve) => {
      proc.on("exit", (code) => resolve(code));
    });
    proc.stdin.write(JSON.stringify({ action: "exit" }) + "\n");
    const code = await exitPromise;
    expect(code).toBe(0);
    // Mark proc as null so afterAll doesn't try to kill it
    proc = null;
  }, 10000);
});
