/**
 * Remote task state machine (#212).
 *
 * Pattern from #207 research (docs/research/muapi-async-task-patterns.md):
 * submit → task_id → poll → result, with the task ID persisted so a dead
 * driver process can resume harvesting a job that is still running remotely
 * (Kaggle kernels outlive the process that pushed them). Error handling is
 * three-classified: submit-failed (nothing exists remotely), execution-failed
 * (terminal), timeout-resumable (kernel likely still running — the resume
 * entry point can pick it up later).
 *
 * Persistence is a single JSON file of task records keyed by remote task id.
 * Fail-open everywhere: bookkeeping must never break a run.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

/** Terminal states can never be resumed. */
const TERMINAL_STATES = new Set(["complete", "failed"]);

/**
 * Classify a run failure into the three-way error taxonomy (#207 §1).
 *
 * @param {string} stderr - the failure text from the runner
 * @returns {"submit-failed"|"execution-failed"|"timeout-resumable"|"unknown"}
 */
export function classifyTaskError(stderr) {
  const text = String(stderr ?? "");
  if (/push failed|command not found|401|403/i.test(text)) return "submit-failed";
  if (/status: (error|cancel)/i.test(text)) return "execution-failed";
  if (/timeout/i.test(text)) return "timeout-resumable";
  return "unknown";
}

/** Load the task log, fail-open to an empty log. */
export function loadTaskLog(filePath) {
  try {
    if (!existsSync(filePath)) return { version: 1, tasks: {} };
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" && parsed.tasks
      ? parsed
      : { version: 1, tasks: {} };
  } catch {
    return { version: 1, tasks: {} };
  }
}

/**
 * Upsert a task record by id.
 *
 * @param {string} filePath
 * @param {{id: string, backend: string, state: string, [k: string]: unknown}} record
 * @returns {object} the stored record (pushedAt/updatedAt stamped)
 */
export function recordTask(filePath, record) {
  const log = loadTaskLog(filePath);
  const now = Date.now();
  const stored = { ...record, pushedAt: record.pushedAt ?? now, updatedAt: now };
  log.tasks[record.id] = stored;
  persist(filePath, log);
  return stored;
}

/**
 * Move a task to a new state. Returns null if the id is unknown.
 */
export function markTask(filePath, id, state, extras = {}) {
  const log = loadTaskLog(filePath);
  if (!log.tasks[id]) return null;
  const updated = { ...log.tasks[id], state, ...extras, updatedAt: Date.now() };
  log.tasks[id] = updated;
  persist(filePath, log);
  return updated;
}

/**
 * Tasks that may still be alive remotely and can be resumed: anything not in
 * a terminal state (running / timeout / submitted).
 */
export function resumableTasks(filePath) {
  const log = loadTaskLog(filePath);
  return Object.values(log.tasks).filter((t) => !TERMINAL_STATES.has(t.state));
}

function persist(filePath, log) {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(log, null, 2) + "\n", "utf8");
  } catch {
    // Fail-open: bookkeeping failures must not break the run.
  }
}
