/**
 * Tests for lib/remote-task.mjs — remote task state machine (#212).
 *
 * Pattern source: #207 research (docs/research/muapi-async-task-patterns.md):
 * submit → task_id → poll → result, with the task ID persisted to disk so a
 * dead driver process can resume harvesting a kernel that is still running
 * remotely. Errors are three-classified: submit-failed (nothing to resume),
 * execution-failed (terminal), timeout-resumable (kernel likely still running).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  classifyTaskError,
  loadTaskLog,
  recordTask,
  markTask,
  resumableTasks,
} from "../lib/remote-task.mjs";

let tmpDir;
let tasksPath;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "remote-task-"));
  tasksPath = join(tmpDir, "remote-tasks.json");
  return () => rmSync(tmpDir, { recursive: true, force: true });
});

describe("classifyTaskError", () => {
  it("classifies push failures as submit-failed (nothing to resume)", () => {
    expect(classifyTaskError("Kaggle push failed: 403 Forbidden")).toBe("submit-failed");
    expect(classifyTaskError("kaggle: command not found")).toBe("submit-failed");
  });

  it("classifies kernel error/cancel as execution-failed (terminal)", () => {
    expect(classifyTaskError("Kaggle kernel finished with status: error")).toBe(
      "execution-failed",
    );
  });

  it("classifies timeouts as timeout-resumable", () => {
    expect(classifyTaskError("Kaggle timeout after 1800s (last status: running)")).toBe(
      "timeout-resumable",
    );
  });

  it("returns unknown for unrecognized stderr", () => {
    expect(classifyTaskError("something exploded")).toBe("unknown");
  });
});

describe("recordTask / loadTaskLog", () => {
  it("creates a fresh log on first record", () => {
    const record = recordTask(tasksPath, {
      id: "xPabloLI/my-script-abc",
      backend: "kaggle",
      state: "running",
      outputDir: "/tmp/out",
    });
    expect(record.state).toBe("running");
    expect(record.pushedAt).toBeTypeOf("number");

    const log = loadTaskLog(tasksPath);
    expect(log.tasks["xPabloLI/my-script-abc"].backend).toBe("kaggle");
  });

  it("fail-opens to an empty log on missing or corrupt file", () => {
    expect(loadTaskLog(join(tmpDir, "absent.json"))).toEqual({ version: 1, tasks: {} });
  });
});

describe("markTask", () => {
  it("updates state without losing prior fields", () => {
    recordTask(tasksPath, { id: "k1", backend: "kaggle", state: "running" });
    const updated = markTask(tasksPath, "k1", "timeout", { lastStatus: "running" });
    expect(updated.state).toBe("timeout");
    expect(updated.backend).toBe("kaggle");
    expect(updated.lastStatus).toBe("running");
  });

  it("returns null for unknown task ids", () => {
    expect(markTask(tasksPath, "ghost", "complete")).toBeNull();
  });
});

describe("resumableTasks", () => {
  it("returns running and timeout tasks, excludes terminal ones", () => {
    recordTask(tasksPath, { id: "running-1", backend: "kaggle", state: "running" });
    recordTask(tasksPath, { id: "timeout-1", backend: "kaggle", state: "timeout" });
    recordTask(tasksPath, { id: "complete-1", backend: "kaggle", state: "complete" });
    recordTask(tasksPath, { id: "failed-1", backend: "kaggle", state: "failed" });

    const ids = resumableTasks(tasksPath).map((t) => t.id).sort();
    expect(ids).toEqual(["running-1", "timeout-1"]);
  });

  it("returns [] on a fresh log", () => {
    expect(resumableTasks(join(tmpDir, "absent.json"))).toEqual([]);
  });
});
