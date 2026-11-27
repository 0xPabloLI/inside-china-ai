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

import { resolveMediaBinary, binaryUsable } from "../ffmpeg-bins.mjs";
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

describe("binaryUsable (#1586 preflight)", () => {
  it("checks an absolute path directly, without asking PATH", () => {
    // The incident: `which /opt/homebrew/.../ffmpeg` fails when PATH lacks the
    // keg, even though the file exists and the call site will happily run it.
    expect(binaryUsable(process.execPath)).toBe(true);
    expect(binaryUsable("/definitely/not/a/binary-1586")).toBe(false);
  });

  it("checks a bare command through PATH", () => {
    // `sh` lives in /bin, so this branch still runs under a stripped PATH.
    expect(binaryUsable("sh")).toBe(true);
    expect(binaryUsable("definitely-not-a-binary-1586")).toBe(false);
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

  it("the burn preflight does not adopt the decode/probe fallback", () => {
    // The preflight probes the burn binary; it must keep naming FFMPEG_FULL.
    const src = readFileSync(join(LIB_DIR, "ffmpeg-preflight.mjs"), "utf8");
    expect(src, "ffmpeg-preflight must not adopt the decode/probe fallback").not.toMatch(
      /ffmpeg-bins|FFMPEG_BIN|FFPROBE_BIN/,
    );
  });

  it("only the ASS burn and useAss finalize pass run ffmpeg-full", () => {
    // A comment can claim the boundary; this rejects the wiring. post-process
    // imports the resolver for the non-ASS passes (#1591), so the guard is the
    // call site: every invocation must name FFMPEG_BIN, except the burn and the
    // useAss branch, which must name FFMPEG_FULL.
    const src = readFileSync(join(LIB_DIR, "post-process.mjs"), "utf8");
    expect(src, "post-process must not borrow the decode/probe ffmpeg alias").not.toMatch(
      /\bffmpegCmd\b|\bffprobeCmd\b/,
    );

    const calls = [...src.matchAll(/execFileSync\(\s*([^,\n]+)/g)].map((m) => m[1].trim());
    expect(calls.length, "post-process's ffmpeg invocations moved; re-check the burn sites").toBe(
      6,
    );
    expect(calls).toEqual([
      "FFMPEG_BIN", // loudness repair
      "FFMPEG_FULL", // burnSubtitles (ass=)
      "FFMPEG_BIN", // mixBgm
      "FFMPEG_BIN", // normalizeLoudness
      "FFMPEG_BIN", // concatSegmentsAudio
      "useAss ? FFMPEG_FULL : FFMPEG_BIN", // finalize
    ]);
    expect(calls.some((bin) => /["']ffmpeg["']/.test(bin))).toBe(false);
  });
});

describe("bare ffmpeg/ffprobe sweep (#1586)", () => {
  // The files #1582 left behind and #1586 converted; post-process joined when
  // its non-ASS passes moved to FFMPEG_BIN (#1591). A new bare call fails here,
  // in the gate, instead of at the first `verify-video` / QA / BGM run on a
  // shell whose PATH has no Homebrew bin.
  const SCRIPT_DIR = join(LIB_DIR, "..");
  const SWEPT = [
    "verify-video.mjs",
    "verify-remotion-frames.mjs",
    "compile-series.mjs",
    "qa-final-review.mjs",
    "mix-bgm.mjs",
    "main.mjs",
    "lib/audio/diagnostics.mjs",
    "lib/frame-extract.mjs",
    "lib/qa-final-review.mjs",
    "lib/qa-mechanics.mjs",
    "lib/generate-bgm.mjs",
    "lib/video-downloaders.mjs",
    "lib/post-process.mjs",
  ];
  const BARE =
    /(?:execFileSync|execFileAsync|execFile|spawnSync|spawn|execSync)\(\s*[`"']?(?:ffmpeg|ffprobe)[`"']?\s*[,)]/;

  it("no swept module invokes a PATH-named media binary", () => {
    const offenders = SWEPT.filter((rel) => BARE.test(readFileSync(join(SCRIPT_DIR, rel), "utf8")));
    expect(offenders).toEqual([]);
  });
});
