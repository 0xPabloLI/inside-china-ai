/**
 * Native file picker contract.
 *
 * The publish path used to POST the video path to the CDP proxy's `/setFiles`,
 * which fills `input.files` without opening the OS dialog. These tests pin the
 * replacement: an AppleScript-driven NSOpenPanel, the path written into the
 * “Go to folder” sheet's text field, and a page-side SHA-256 check against the
 * local file.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildNativePickerScript,
  fingerprintFile,
  pickFileNative,
  resolveChromePid,
  verifyFileSelection,
} from "../lib/native-file-picker.mjs";

const PS_OUTPUT = `
 98440 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/Users/x/chrome-tiktok-profile --remote-debugging-port=9229 --no-first-run
 5173 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/1/Helpers/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper --type=renderer --remote-debugging-port=9229
 12345 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/Users/x/other --remote-debugging-port=9300
`;

describe("resolveChromePid", () => {
  it("picks the main Chrome process on the automation port, not a helper", () => {
    expect(resolveChromePid({ port: 9229, psOutput: PS_OUTPUT })).toBe(98440);
  });

  it("fails closed when no process owns the port", () => {
    expect(() => resolveChromePid({ port: 9999, psOutput: PS_OUTPUT })).toThrow(
      /no Chrome process .* 9999/,
    );
  });
});

describe("buildNativePickerScript", () => {
  const script = buildNativePickerScript();

  it("addresses the Chrome instance by PID, not by app name", () => {
    expect(script).toContain("first process whose unix id is targetPid");
    expect(script).toContain("set frontmost to true");
  });

  it("opens Go to folder and writes the path into its text field", () => {
    expect(script).toContain('keystroke "g" using {command down, shift down}');
    expect(script).toContain("exists text field 1 of sheet 1 of sheet 1 of window 1");
    expect(script).toContain(
      "set value of text field 1 of sheet 1 of sheet 1 of window 1 to filePath",
    );
    expect(script).toContain("key code 36");
    // A CJK input source mangles a keystroked path; clipboard paste can append
    // to a remembered field. Neither is allowed on the selection path.
    expect(script).not.toContain('keystroke "v" using {command down}');
    expect(script).not.toContain("clipboard");
  });

  it("clicks Open, and closes a stuck panel instead of leaving a modal", () => {
    expect(script).toContain('click button "Open"');
    expect(script).toContain('click button "打开"');
    expect(script).toContain("key code 53");
    expect(script).toContain("native file picker did not close after selection");
  });

  it("waits for the sheet rather than typing blind", () => {
    expect(script).toContain("exists sheet 1 of window 1");
    expect(script).toContain("native file picker did not open");
  });
});

describe("pickFileNative", () => {
  it("passes the PID, timeout and path to AppleScript", () => {
    const calls = [];
    const result = pickFileNative({
      filePath: "/tmp/a b.mp4",
      pid: 98440,
      timeoutMs: 8000,
      runScript: (script, args, timeoutMs) => calls.push({ script, args, timeoutMs }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(["98440", "8", "/tmp/a b.mp4"]);
    expect(calls[0].timeoutMs).toBe(8000);
    expect(calls[0].script).toContain("first process whose unix id is targetPid");
    expect(result).toMatchObject({
      mode: "native-picker",
      pid: 98440,
      chars: "/tmp/a b.mp4".length,
      timeoutMs: 8000,
    });
  });

  it("propagates a panel that never opened", () => {
    expect(() =>
      pickFileNative({
        filePath: "/tmp/a.mp4",
        pid: 98440,
        runScript: () => {
          throw new Error("native file picker AppleScript failed: native file picker did not open");
        },
      }),
    ).toThrow(/did not open/);
  });

  it("does not run AppleScript when the file path is empty", () => {
    expect(() =>
      pickFileNative({
        filePath: " ",
        pid: 98440,
        runScript: () => {
          throw new Error("should not be called");
        },
      }),
    ).toThrow(/needs a file path/);
  });
});

describe("fingerprintFile", () => {
  it("returns the basename, byte size and SHA-256 the page must match", () => {
    const dir = mkdtempSync(join(tmpdir(), "native-picker-"));
    const file = join(dir, "clip.mp4");
    writeFileSync(file, "fake video bytes");
    const fp = fingerprintFile(file);
    expect(fp.name).toBe("clip.mp4");
    expect(fp.size).toBe("fake video bytes".length);
    expect(fp.hash).toBe(createHash("sha256").update("fake video bytes").digest("hex"));
  });
});

describe("verifyFileSelection", () => {
  const expected = {
    name: "clip.mp4",
    size: 1234,
    hash: "a".repeat(64),
  };

  it("accepts a name/size/hash match", () => {
    expect(verifyFileSelection(expected, { ready: true, ...expected })).toEqual({
      ok: true,
      checks: { name: true, size: true, hash: true },
      reason: null,
    });
  });

  it("rejects a different file even when the name matches", () => {
    const verdict = verifyFileSelection(expected, {
      ready: true,
      ...expected,
      size: 999,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/size mismatch/);
    expect(verdict.checks).toMatchObject({ name: true, size: false, hash: true });
  });

  it("rejects a missing or wrong hash", () => {
    const missing = verifyFileSelection(expected, { ready: true, ...expected, hash: null });
    expect(missing.ok).toBe(false);
    expect(missing.reason).toMatch(/SHA-256/);
    const wrong = verifyFileSelection(expected, {
      ready: true,
      ...expected,
      hash: "b".repeat(64),
    });
    expect(wrong.ok).toBe(false);
    expect(wrong.reason).toMatch(/SHA-256/);
  });

  it("rejects no selection at all", () => {
    const verdict = verifyFileSelection(expected, { ready: false });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/did not report a selected file/);
  });
});
