/**
 * Decode/probe ffmpeg resolution (#1118).
 *
 * The audit path (`avatar-frame-audit` → `digital-human audit`) only decodes
 * frames and probes dimensions, so it does not need the libass build. It used
 * to import unconditional `/opt/homebrew/opt/ffmpeg-full/bin/*` constants and
 * died with ENOENT before its first assertion on the CI runner, which has brew
 * ffmpeg on PATH and no ffmpeg-full.
 *
 * The absence branch cannot be produced on this machine by deleting the
 * Homebrew keg, so `resolveMediaBinary` takes `exists` as a seam and the
 * integration proof runs the real audit suite against PATH binaries via
 * `FFMPEG_BIN`/`FFPROBE_BIN` (see the session evidence in #1118). The ASS burn
 * boundary is asserted in a child process: it must NOT see the override.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { resolveMediaBinary } from "../ffmpeg-bins.mjs";

// The one thing these tests need from the module private to it: which build the
// resolver prefers. Spelled out here rather than exported only for tests.
const HOMEBREW_FFMPEG = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
const HOMEBREW_FFPROBE = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";

const LIB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("resolveMediaBinary (#1118)", () => {
  it("prefers the Homebrew ffmpeg-full build when it exists", () => {
    const bin = resolveMediaBinary({
      preferred: HOMEBREW_FFMPEG,
      fallback: "ffmpeg",
      envKey: "FFMPEG_BIN",
      env: {},
      exists: () => true,
    });
    expect(bin).toBe(HOMEBREW_FFMPEG);
  });

  it("falls back to the PATH binary when ffmpeg-full is absent — the CI case", () => {
    const exists = () => false;
    expect(
      resolveMediaBinary({
        preferred: HOMEBREW_FFMPEG,
        fallback: "ffmpeg",
        envKey: "FFMPEG_BIN",
        env: {},
        exists,
      }),
    ).toBe("ffmpeg");
    expect(
      resolveMediaBinary({
        preferred: HOMEBREW_FFPROBE,
        fallback: "ffprobe",
        envKey: "FFPROBE_BIN",
        env: {},
        exists,
      }),
    ).toBe("ffprobe");
  });

  it("lets FFMPEG_BIN / FFPROBE_BIN override the preference, so the fallback branch is runnable on this machine", () => {
    const env = { FFMPEG_BIN: "/tmp/ffmpeg", FFPROBE_BIN: "/tmp/ffprobe" };
    expect(
      resolveMediaBinary({
        preferred: HOMEBREW_FFMPEG,
        fallback: "ffmpeg",
        envKey: "FFMPEG_BIN",
        env,
        exists: () => true,
      }),
    ).toBe("/tmp/ffmpeg");
    expect(
      resolveMediaBinary({
        preferred: HOMEBREW_FFPROBE,
        fallback: "ffprobe",
        envKey: "FFPROBE_BIN",
        env,
        exists: () => true,
      }),
    ).toBe("/tmp/ffprobe");
  });

  it("ignores an empty override instead of resolving to a nameless binary", () => {
    expect(
      resolveMediaBinary({
        preferred: HOMEBREW_FFMPEG,
        fallback: "ffmpeg",
        envKey: "FFMPEG_BIN",
        env: { FFMPEG_BIN: "  " },
        exists: () => false,
      }),
    ).toBe("ffmpeg");
  });
});

describe("upscale.mjs binary constants (#1118)", () => {
  // Behaviour, not a restatement of the export line: a child process sets the
  // override the way an operator would and the module must hand it back.
  it("resolves FFMPEG_PATH / FFPROBE_PATH through the seam, override included", () => {
    const moduleUrl = pathToFileURL(join(LIB_DIR, "upscale.mjs")).href;
    const program = `const m = await import(${JSON.stringify(moduleUrl)}); process.stdout.write([m.FFMPEG_PATH, m.FFPROBE_PATH].join("\\n"));`;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", program], {
      encoding: "utf8",
      env: {
        ...process.env,
        FFMPEG_BIN: "/tmp/override-ffmpeg",
        FFPROBE_BIN: "/tmp/override-ffprobe",
      },
    });
    expect(out.split("\n")).toEqual(["/tmp/override-ffmpeg", "/tmp/override-ffprobe"]);
  });

  it("carries no second copy of the Homebrew path", () => {
    const src = readFileSync(join(LIB_DIR, "upscale.mjs"), "utf8");
    expect(src).not.toContain("/opt/homebrew");
  });
});

describe("ASS burn boundary (#1118)", () => {
  it("post-process keeps its own unconditional ffmpeg-full and never sees FFMPEG_BIN", () => {
    const moduleUrl = pathToFileURL(join(LIB_DIR, "post-process.mjs")).href;
    const program = `import { FFMPEG_FULL } from ${JSON.stringify(moduleUrl)}; process.stdout.write(FFMPEG_FULL);`;
    const resolved = execFileSync(process.execPath, ["--input-type=module", "-e", program], {
      encoding: "utf8",
      env: { ...process.env, FFMPEG_BIN: "/tmp/not-libass" },
    });
    // The burn consumes libass, which only ffmpeg-full carries. A PATH fallback
    // here would turn a missing install into a broken render at the last step.
    expect(resolved).toBe(HOMEBREW_FFMPEG);
  });

  it("the burn path imports neither the seam nor its env override", () => {
    // A comment can claim the boundary; this rejects the wiring that would
    // break it. The preflight probes post-process's binary, so it is covered
    // transitively.
    for (const file of ["post-process.mjs", "ffmpeg-preflight.mjs"]) {
      const src = readFileSync(join(LIB_DIR, file), "utf8");
      expect(src, `${file} must not adopt the decode/probe fallback`).not.toMatch(
        /ffmpeg-bins|FFMPEG_BIN|FFPROBE_BIN/,
      );
    }
  });
});
