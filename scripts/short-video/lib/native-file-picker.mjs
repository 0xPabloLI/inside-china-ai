/**
 * Native macOS file picker for the TikTok upload path.
 *
 * `input[type="file"]` can be filled with a CDP `setFiles` call, but that is the
 * one remaining machine-shaped input on the publish path: the page never sees
 * the OS open panel, and the file input's `change` event is produced by the
 * debugger rather than by a person choosing a file. This module drives the real
 * NSOpenPanel instead: the driver clicks a visible trigger, then we open the
 * panel's own “Go to folder” sheet (Cmd+Shift+G) and write the absolute path
 * directly into its text field. Writing the field (rather than keystroking the
 * path) keeps spaces and non-ASCII paths intact even when the operator's input
 * source is a CJK IME; `keystroke` in that state turns `/` into `、` and drops
 * spaces.
 *
 * The page-side probe (armed by the driver) reads back the selected File object
 * and hashes it; `verifyFileSelection` compares name, byte size and SHA-256
 * against the local file so a wrong pick cannot silently upload.
 *
 * Boundaries:
 *   - macOS only; this is the machine the publish path runs on.
 *   - Requires Accessibility permission for the process running Node (System
 *     Events UI scripting). A missing permission fails closed with an
 *     actionable message; it is not retried into a `setFiles` fallback.
 *   - The app is addressed by PID, not by name, because several Chrome
 *     instances can be open at once.
 *
 * @module native-file-picker
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

/** How long the AppleScript waits for the NSOpenPanel to appear. */
export const NATIVE_PICKER_TIMEOUT_MS = 8_000;

/** Extra time Node gives AppleScript beyond the panel wait. */
const APPLESCRIPT_TIMEOUT_PAD_MS = 6_000;

/**
 * Resolve the main Chrome process for the automation profile.
 *
 * `ps` is used rather than `pgrep` because helper processes also carry the
 * remote-debugging flag in some launches; the main process is the one with the
 * `Google Chrome` executable and without `Helper`.
 *
 * @param {{ port?: number, psOutput?: string }} [opts]
 * @returns {number}
 */
export function resolveChromePid({ port = 9229, psOutput } = {}) {
  const out =
    psOutput ??
    execFileSync("ps", ["-axo", "pid=,command="], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
  const matches = out
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        /Google Chrome/.test(line) &&
        line.includes(`--remote-debugging-port=${port}`) &&
        !line.includes("Helper"),
    );
  if (!matches.length) {
    throw new Error(
      `no Chrome process is listening on the automation port ${port}; ` +
        "run `npm run cdp:ensure` and retry",
    );
  }
  const pid = Number.parseInt(matches[0].split(/\s+/)[0], 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    throw new Error(`could not parse the Chrome PID from: ${matches[0]}`);
  }
  return pid;
}

/**
 * Build the AppleScript that drives the already-open NSOpenPanel.
 *
 * The panel is a sheet on the frontmost Chrome window. We wait for it, open
 * “Go to folder” (which is a nested sheet), write the path directly into that
 * sheet's text field, press Return to navigate/select, then click Open. The
 * direct write is deliberate: `keystroke` is corrupted by a CJK input source
 * (`/` becomes `、` and spaces vanish), and pasting into a remembered field
 * can append instead of replace. The last Escape closes a panel that refused
 * to close, so a failed run does not leave a modal dialog on the operator's
 * screen.
 *
 * @returns {string}
 */
export function buildNativePickerScript() {
  return `
on run argv
  set targetPid to (item 1 of argv) as integer
  set waitSeconds to (item 2 of argv) as integer
  set filePath to (item 3 of argv) as text
  tell application "System Events"
    tell (first process whose unix id is targetPid)
      set frontmost to true
      set deadline to (current date) + waitSeconds
      repeat until (exists sheet 1 of window 1) or ((current date) > deadline)
        delay 0.2
      end repeat
      if not (exists sheet 1 of window 1) then error "native file picker did not open"
      try
        keystroke "g" using {command down, shift down}
        set goDeadline to (current date) + 3
        repeat until (exists text field 1 of sheet 1 of sheet 1 of window 1) or ((current date) > goDeadline)
          delay 0.1
        end repeat
        if not (exists text field 1 of sheet 1 of sheet 1 of window 1) then error "Go to folder field did not open"
        set value of text field 1 of sheet 1 of sheet 1 of window 1 to filePath
        delay (0.2 + (random number) * 0.2)
        key code 36
        delay (0.5 + (random number) * 0.3)
        repeat 3 times
          if not (exists sheet 1 of window 1) then exit repeat
          try
            click button "Open" of splitter group 1 of sheet 1 of window 1
          on error
            try
              click button "打开" of splitter group 1 of sheet 1 of window 1
            on error
              key code 36
            end try
          end try
          delay (0.5 + (random number) * 0.3)
        end repeat
        if exists sheet 1 of window 1 then
          key code 53
          error "native file picker did not close after selection"
        end if
      on error errMsg
        try
          key code 53
        end try
        error errMsg
      end try
    end tell
  end tell
  return "ok"
end run
`;
}

/**
 * Run the AppleScript. Errors are given a stable, searchable message so the
 * driver can distinguish “panel never opened” (safe to retry after a
 * programmatic input click) from “panel opened but selection failed” (abort).
 *
 * @param {string} script
 * @param {string[]} args
 * @param {number} timeoutMs
 */
function runAppleScript(script, args, timeoutMs) {
  try {
    execFileSync("osascript", ["-e", script, ...args], {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
  } catch (err) {
    const detail = String(err.stderr || err.stdout || err.message || err).trim();
    throw new Error(`native file picker AppleScript failed: ${detail}`, { cause: err });
  }
}

/**
 * Pick a file through the real macOS open panel.
 *
 * The caller must have already clicked the file input (or its visible trigger)
 * so the panel is open.
 *
 * @param {{
 *   filePath: string,
 *   pid?: number,
 *   port?: number,
 *   timeoutMs?: number,
 *   runScript?: (script: string, args: string[], timeoutMs: number) => void,
 * }} opts
 * @returns {{ mode: "native-picker", pid: number, chars: number, timeoutMs: number }}
 */
export function pickFileNative({
  filePath,
  pid,
  port = 9229,
  timeoutMs = NATIVE_PICKER_TIMEOUT_MS,
  runScript = runAppleScript,
} = {}) {
  if (process.platform !== "darwin") {
    throw new Error("native file picker is macOS-only; the publish path must run on macOS");
  }
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error("pickFileNative needs a file path");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`pickFileNative needs a positive timeout, got ${timeoutMs}`);
  }

  const targetPid = pid ?? resolveChromePid({ port });
  const waitSeconds = Math.max(1, Math.round(timeoutMs / 1000));
  runScript(
    buildNativePickerScript(),
    [String(targetPid), String(waitSeconds), filePath],
    timeoutMs,
  );
  return {
    mode: "native-picker",
    pid: targetPid,
    chars: filePath.length,
    timeoutMs,
  };
}

/**
 * Fingerprint the local file before it is handed to the picker.
 *
 * @param {string} filePath
 * @returns {{ name: string, size: number, hash: string }}
 */
export function fingerprintFile(filePath) {
  const bytes = readFileSync(filePath);
  return {
    name: basename(filePath),
    size: bytes.length,
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
}

/**
 * Compare the page's selected File against the local fingerprint.
 *
 * @param {{ name: string, size: number, hash: string }} expected
 * @param {{ ready?: boolean, name?: string, size?: number, hash?: string }} actual
 * @returns {{ ok: boolean, checks: { name: boolean, size: boolean, hash: boolean }, reason: string|null }}
 */
export function verifyFileSelection(expected, actual) {
  const checks = {
    name: !!actual?.name && actual.name === expected.name,
    size:
      Number.isFinite(actual?.size) &&
      Number.isFinite(expected?.size) &&
      actual.size === expected.size,
    hash:
      typeof actual?.hash === "string" &&
      /^[0-9a-f]{64}$/i.test(actual.hash) &&
      actual.hash.toLowerCase() === expected?.hash?.toLowerCase(),
  };
  if (!actual?.ready) {
    return { ok: false, checks, reason: "the page did not report a selected file" };
  }
  if (!checks.name) {
    return {
      ok: false,
      checks,
      reason: `file name mismatch: expected ${expected.name}, got ${actual.name ?? "none"}`,
    };
  }
  if (!checks.size) {
    return {
      ok: false,
      checks,
      reason: `file size mismatch: expected ${expected.size}, got ${actual.size ?? "none"}`,
    };
  }
  if (!checks.hash) {
    return {
      ok: false,
      checks,
      reason: "SHA-256 mismatch or unavailable; the page could not prove it has the local file",
    };
  }
  return { ok: true, checks, reason: null };
}
