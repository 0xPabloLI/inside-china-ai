#!/usr/bin/env node
/**
 * SearXNG resource lifecycle (#891).
 *
 * The self-hosted SearXNG container is part of the default discovery path, but
 * keeping it resident all day costs ~460 MiB and a little CPU. This module
 * parks it when it has been idle (Docker NetIO unchanged) or when the host is
 * under memory pressure, and brings it back before the pipeline uses it.
 *
 * It deliberately stops only the container. colima itself, cobalt, watchtower
 * and buildkit stay up; the VM is shared with other tools.
 *
 * Usage:
 *   node scripts/searxng/lifecycle.mjs ensure [--quiet]   # start if stopped
 *   node scripts/searxng/lifecycle.mjs park [--apply]     # stop when idle/pressure
 *   node scripts/searxng/lifecycle.mjs status
 *
 * Env:
 *   SEARXNG_URL                 config endpoint (default http://localhost:8888/config)
 *   SEARXNG_IDLE_MINUTES        idle window before parking (default 15)
 *   SEARXNG_PRESSURE_FREE_PCT   park when host free memory is below this (default 15)
 *   SEARXNG_PARK_STATE          state file (default ~/.searxng-park-state.json)
 *   SEARXNG_AUTO_START=0        callers skip ensure (pipeline-side opt-out)
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CONTAINER_NAME = "searxng";
export const SEARXNG_URL = process.env.SEARXNG_URL || "http://localhost:8888/config";
export const IDLE_MS = Math.max(0, Number(process.env.SEARXNG_IDLE_MINUTES ?? 15)) * 60_000;
export const PRESSURE_FREE_PCT = Number(process.env.SEARXNG_PRESSURE_FREE_PCT ?? 15);
export const STATE_PATH =
  process.env.SEARXNG_PARK_STATE || path.join(os.homedir(), ".searxng-park-state.json");

const DOCKER_TIMEOUT_MS = 15_000;
const COLIMA_TIMEOUT_MS = 10_000;
const START_TIMEOUT_MS = 30_000;
const MEMORY_PRESSURE_BIN = process.env.MEMORY_PRESSURE_BIN || "/usr/bin/memory_pressure";

/** Normalize Docker's "43.2MB / 15.1MB" NetIO reading for equality checks. */
export function parseNetIo(raw) {
  const text = String(raw ?? "").trim();
  const match = text.match(/^(\S+)\s*\/\s*(\S+)$/);
  return match ? `${match[1]} / ${match[2]}` : null;
}

/** Read the free percentage from macOS `memory_pressure` output. */
export function parseMemoryFreePct(text) {
  const match = String(text ?? "").match(/System-wide memory free percentage:\s*(\d+)\s*%/);
  return match ? Number(match[1]) : null;
}

/**
 * Advance the idle clock. The first sample, or a changed NetIO reading, resets
 * it; an unchanged reading keeps the previous timestamp.
 */
export function nextParkState({ now, netIo, previous } = {}) {
  if (!netIo) return previous ?? null;
  if (!previous || previous.netIo !== netIo) return { netIo, lastChangeAt: now };
  return previous;
}

/**
 * Park when the host is under pressure, or when NetIO has not moved for the
 * idle window. Pressure wins so a busy container still yields memory.
 */
export function decidePark({
  now,
  lastChangeAt,
  netIo,
  lastNetIo,
  freePct,
  idleMs = IDLE_MS,
  pressureFreePct = PRESSURE_FREE_PCT,
} = {}) {
  if (Number.isFinite(freePct) && freePct < pressureFreePct) {
    return { park: true, reason: "pressure" };
  }
  if (
    netIo &&
    lastNetIo &&
    netIo === lastNetIo &&
    Number.isFinite(lastChangeAt) &&
    now - lastChangeAt >= idleMs
  ) {
    return { park: true, reason: "idle" };
  }
  return { park: false, reason: null };
}

async function run(cmd, args, { timeout = DOCKER_TIMEOUT_MS } = {}) {
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    timeout,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      PATH: process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    },
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function docker(args, opts) {
  // The host Docker CLI is not reliable on this machine; colima ssh is.
  return run("colima", ["ssh", "--", "sudo", "docker", ...args], opts);
}

async function colimaRunning() {
  try {
    await run("colima", ["status"], { timeout: COLIMA_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

async function containerRunning() {
  try {
    const { stdout } = await docker(["inspect", "-f", "{{.State.Running}}", CONTAINER_NAME], {
      timeout: COLIMA_TIMEOUT_MS,
    });
    return stdout === "true";
  } catch {
    return false;
  }
}

async function readNetIo() {
  try {
    const { stdout } = await docker(
      ["stats", "--no-stream", "--format", "{{.NetIO}}", CONTAINER_NAME],
      { timeout: DOCKER_TIMEOUT_MS },
    );
    return parseNetIo(stdout);
  } catch {
    return null;
  }
}

async function readMemoryFreePct() {
  try {
    const { stdout } = await run(MEMORY_PRESSURE_BIN, [], { timeout: DOCKER_TIMEOUT_MS });
    return parseMemoryFreePct(stdout);
  } catch {
    return null;
  }
}

async function httpOk() {
  try {
    const res = await fetch(SEARXNG_URL, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function readState(file = STATE_PATH) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeState(state, file = STATE_PATH) {
  await fs.writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
}

async function removeState(file = STATE_PATH) {
  await fs.rm(file, { force: true });
}

/**
 * Idempotently start the container. It never starts colima: the VM is shared
 * with cobalt/watchtower/buildkit and the user chose container-level parking.
 */
export async function ensureSearxng({ quiet = false, log = console.log } = {}) {
  if (process.platform !== "darwin") return { ok: false, skipped: true, reason: "not-macos" };
  if (await httpOk()) return { ok: true, started: false };
  if (!(await colimaRunning())) {
    if (!quiet) log("searxng: colima is not running; not starting the VM");
    return { ok: false, skipped: true, reason: "colima-not-running" };
  }
  try {
    await docker(["start", CONTAINER_NAME], { timeout: START_TIMEOUT_MS });
  } catch (err) {
    if (!quiet) log(`searxng: docker start failed: ${err.stderr || err.message}`);
    return {
      ok: false,
      reason: "docker-start-failed",
      error: String(err.stderr || err.message),
    };
  }
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await httpOk()) {
      if (!quiet) log("searxng: started");
      return { ok: true, started: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!quiet) log("searxng: start timed out");
  return { ok: false, reason: "start-timeout" };
}

/** Stop the container when idle or under memory pressure. */
export async function parkSearxng({
  apply = false,
  now = Date.now(),
  idleMs = IDLE_MS,
  pressureFreePct = PRESSURE_FREE_PCT,
  statePath = STATE_PATH,
  log = console.log,
} = {}) {
  if (process.platform !== "darwin") return { park: false, skipped: true, reason: "not-macos" };
  if (!(await colimaRunning())) {
    return { park: false, skipped: true, reason: "colima-not-running" };
  }
  if (!(await containerRunning())) {
    await removeState(statePath);
    return { park: false, skipped: true, reason: "container-not-running" };
  }

  const netIo = await readNetIo();
  const freePct = await readMemoryFreePct();
  const previous = await readState(statePath);
  const state = nextParkState({ now, netIo, previous });
  if (state && state !== previous) await writeState(state, statePath);

  const decision = decidePark({
    now,
    lastChangeAt: state?.lastChangeAt,
    netIo,
    lastNetIo: state?.netIo,
    freePct,
    idleMs,
    pressureFreePct,
  });
  if (!decision.park) {
    return {
      park: false,
      reason: null,
      netIo,
      freePct,
      idleMinutes: state ? Math.round((now - state.lastChangeAt) / 60_000) : 0,
    };
  }
  if (!apply) return { park: false, wouldPark: true, reason: decision.reason, netIo, freePct };

  try {
    await docker(["stop", CONTAINER_NAME], { timeout: 60_000 });
    await removeState(statePath);
    const message = `searxng: parked (${decision.reason})`;
    log(message);
    return { park: true, reason: decision.reason, netIo, freePct };
  } catch (err) {
    return {
      park: false,
      reason: "stop-failed",
      error: String(err.stderr || err.message),
    };
  }
}

export async function statusSearxng({ statePath = STATE_PATH, now = Date.now() } = {}) {
  const [colima, running, netIo, freePct] = await Promise.all([
    colimaRunning(),
    containerRunning(),
    readNetIo(),
    readMemoryFreePct(),
  ]);
  const http = await httpOk();
  const state = await readState(statePath);
  const decision = decidePark({
    now,
    lastChangeAt: state?.lastChangeAt,
    netIo,
    lastNetIo: state?.netIo,
    freePct,
  });
  return { colima, running, http, netIo, freePct, state, decision };
}

async function main() {
  const command = process.argv[2] || "status";
  const apply = process.argv.includes("--apply");
  const quiet = process.argv.includes("--quiet");

  if (command === "ensure") {
    const result = await ensureSearxng({ quiet });
    console.log(JSON.stringify(result));
    return;
  }
  if (command === "park") {
    const result = await parkSearxng({ apply });
    console.log(JSON.stringify(result));
    return;
  }
  if (command === "status") {
    console.log(JSON.stringify(await statusSearxng(), null, 2));
    return;
  }
  console.error("usage: lifecycle.mjs ensure [--quiet] | park [--apply] | status");
  process.exitCode = 2;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
