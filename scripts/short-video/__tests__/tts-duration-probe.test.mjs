/**
 * #1599: `say` / `edge-tts` decided ffprobe availability with `which ffprobe`
 * on PATH. In a clean worktree the resolved FFPROBE_BIN is an absolute
 * Homebrew path while PATH has no Homebrew, so the engines silently replaced
 * a real probe with `words / 2.5` and the scene timeline drifted.
 *
 * The behavioural cases run the real engine modules in a child process whose
 * PATH is stripped to `/usr/bin:/bin` (macOS: no ffmpeg/ffprobe) and only
 * FFPROBE_BIN (+ FFMPEG_BIN for post-processing) is supplied.
 * edge-tts is driven by a shim binary so the assertion does not depend on the
 * network; `say` is real and skipped where the Daniel voice is unavailable.
 */
import { describe, it, expect, afterAll, vi } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { FFMPEG_BIN, FFPROBE_BIN } from "../lib/ffmpeg-bins.mjs";
import { estimateDurationSeconds, getDuration } from "../lib/tts/ffmpeg-cmd.mjs";
import { planTtsScenes, sceneCacheKey, writeSceneMeta } from "../lib/tts/cache.mjs";

const LIB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "lib");
const STRIPPED_PATH = "/usr/bin:/bin";

/** Resolve an absolute binary: keep an absolute one, else ask PATH. */
function absoluteBin(bin) {
  if (bin.startsWith("/")) return existsSync(bin) ? bin : null;
  const r = spawnSync("which", [bin], { encoding: "utf8" });
  const p = r.stdout?.trim();
  return r.status === 0 && p && existsSync(p) ? p : null;
}

const FFMPEG_ABS = absoluteBin(FFMPEG_BIN);
const FFPROBE_ABS = absoluteBin(FFPROBE_BIN);
const SAY_AVAILABLE =
  process.platform === "darwin" &&
  spawnSync("say", ["-v", "?"], { encoding: "utf8" }).stdout?.includes("Daniel") === true;

let dirs = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function tempDir(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

/** Run a module program in a child process; returns stdout parsed as JSON (or raw). */
function runChild(program, env, { json = true } = {}) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", program], {
    encoding: "utf8",
    env: { ...process.env, PATH: STRIPPED_PATH, ...env },
  });
  if (r.status !== 0) {
    throw new Error(`child exited ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  }
  return json ? lastJson(r.stdout) : r;
}

/** Engines log their per-scene line before printing the JSON payload. */
function lastJson(stdout) {
  const lines = stdout.trim().split("\n").filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

function moduleUrl(relative) {
  return pathToFileURL(join(LIB_DIR, relative)).href;
}

describe("ffprobe availability follows FFPROBE_BIN, not PATH (#1599)", () => {
  const program = `const { binaryUsable, FFPROBE_BIN } = await import(${JSON.stringify(
    moduleUrl("ffmpeg-bins.mjs"),
  )}); process.stdout.write(String(binaryUsable(FFPROBE_BIN)));`;

  it.skipIf(!FFPROBE_ABS)(
    "reports usable with an absolute FFPROBE_BIN and a PATH without Homebrew",
    () => {
      const r = spawnSync(process.execPath, ["--input-type=module", "-e", program], {
        encoding: "utf8",
        env: { ...process.env, PATH: STRIPPED_PATH, FFPROBE_BIN: FFPROBE_ABS },
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toBe("true");
    },
  );

  it("reports unusable when the FFPROBE_BIN override is missing, even if PATH has ffprobe", () => {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", program], {
      encoding: "utf8",
      env: { ...process.env, FFPROBE_BIN: "/tmp/does-not-exist-ffprobe-1599" },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("false");
  });
});

describe("say engine under a PATH without Homebrew (#1599)", () => {
  const VOICEOVER =
    "Hello from the timing probe. This sentence is long enough to measure precisely.";

  function program(outDir) {
    return `
const { createSayEngine } = await import(${JSON.stringify(moduleUrl("tts/say.mjs"))});
const engine = await createSayEngine();
if (!engine) throw new Error("say engine unavailable");
const results = await engine.generate(
  [{ id: 1, voiceover: ${JSON.stringify(VOICEOVER)} }],
  ${JSON.stringify(outDir)},
);
process.stdout.write(JSON.stringify(results));
`;
  }

  it.skipIf(!(SAY_AVAILABLE && FFMPEG_ABS && FFPROBE_ABS))(
    "returns a real probed duration from the absolute FFPROBE_BIN",
    async () => {
      const outDir = tempDir("say-1599-probe-");
      const child = runChild(
        program(outDir),
        {
          FFMPEG_BIN: FFMPEG_ABS,
          FFPROBE_BIN: FFPROBE_ABS,
          TTS_SILENCE_FLOOR_MS: "120",
        },
        { json: false },
      );
      expect(child.stderr).not.toMatch(/ffprobe unusable/);
      const results = lastJson(child.stdout);
      expect(results[0].durationMethod).toBe("ffprobe");
      expect(results[0].duration).toBeGreaterThan(0.5);
      // The engine's number must be the probe result, not a word estimate.
      const measured = await getDuration(results[0].audioPath);
      expect(Math.abs(results[0].duration - measured)).toBeLessThan(0.01);
    },
    60000,
  );

  it("keeps the legacy word estimate available as an explicit helper", () => {
    // A truly missing ffprobe already fails inside postProcessAudio's silence
    // trim, so the fallback branch is a defence for the engine's own decision;
    // its shape is pinned here and in the static case below.
    expect(estimateDurationSeconds("one two three four five")).toBe(2);
    expect(estimateDurationSeconds("  ")).toBe(0);
  });
});

describe("edge-tts engine under a PATH without Homebrew (#1599)", () => {
  /** Shim `edge-tts` so the test needs no network; it copies a fixture mp3. */
  function makeShim(fixture) {
    const bin = tempDir("edge-shim-1599-");
    const path = join(bin, "edge-tts");
    writeFileSync(
      path,
      `#!/bin/sh
out=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --write-media) out="$2"; shift 2 ;;
    *) shift ;;
  esac
done
cp "$EDGE_TTS_FIXTURE" "$out"
`,
    );
    chmodSync(path, 0o755);
    return { dir: bin, fixture };
  }

  function fixture() {
    const d = tempDir("edge-fixture-1599-");
    const mp3 = join(d, "fixture.mp3");
    execFileSync(
      FFMPEG_ABS,
      ["-y", "-f", "lavfi", "-i", "anoisesrc=d=1.6:c=pink:a=0.4", "-t", "1.6", mp3],
      { stdio: "pipe" },
    );
    return mp3;
  }

  it.skipIf(!(FFMPEG_ABS && FFPROBE_ABS))(
    "returns a real probed duration with only FFPROBE_BIN available",
    async () => {
      const shim = makeShim(fixture());
      const outDir = tempDir("edge-1599-probe-");
      const program = `
const { createEdgeTTSEngine } = await import(${JSON.stringify(moduleUrl("tts/edge-tts.mjs"))});
const engine = await createEdgeTTSEngine();
if (!engine) throw new Error("edge-tts engine unavailable");
const results = await engine.generate(
  [{ id: 1, voiceover: "This edge-tts duration comes from ffprobe, not from the word count." }],
  ${JSON.stringify(outDir)},
);
process.stdout.write(JSON.stringify(results));
`;
      const r = runChild(program, {
        PATH: `${STRIPPED_PATH}:${shim.dir}`,
        FFMPEG_BIN: FFMPEG_ABS,
        FFPROBE_BIN: FFPROBE_ABS,
        EDGE_TTS_FIXTURE: shim.fixture,
      });
      expect(r[0].durationMethod).toBe("ffprobe");
      expect(r[0].duration).toBeGreaterThan(1.3);
      const measured = await getDuration(r[0].audioPath);
      expect(Math.abs(r[0].duration - measured)).toBeLessThan(0.01);
    },
    60000,
  );
});

describe("duration method reaches the scene sidecar (#1599)", () => {
  const engine = { name: "say", info: "test" };
  const scene = { id: 1, voiceover: "one two three" };

  function seedSidecar(dir, durationMethod, metaVersion) {
    const audioPath = join(dir, "scene-1.mp3");
    writeFileSync(audioPath, "fake audio bytes");
    const key = sceneCacheKey(engine, scene);
    if (metaVersion === undefined) {
      expect(
        writeSceneMeta(dir, 1, {
          key,
          duration: 1.23,
          engine: engine.name,
          durationMethod,
          audioPath,
        }),
      ).toBe(true);
    } else {
      writeFileSync(
        join(dir, "scene-1.tts-meta.json"),
        JSON.stringify({
          key,
          duration: 1.23,
          engine: engine.name,
          durationMethod,
          metaVersion,
          audioPath,
        }),
      );
    }
    return audioPath;
  }

  it("writeSceneMeta persists durationMethod", () => {
    const dir = tempDir("tts-meta-1599-");
    seedSidecar(dir, "word-estimate");
    const meta = JSON.parse(readFileSync(join(dir, "scene-1.tts-meta.json"), "utf8"));
    expect(meta.durationMethod).toBe("word-estimate");
  });

  it("planTtsScenes carries durationMethod into an approved hit and warns", () => {
    const dir = tempDir("tts-plan-1599-");
    seedSidecar(dir, "word-estimate");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const plan = planTtsScenes(dir, [scene], engine);
      expect(plan.approved).toHaveLength(1);
      expect(plan.approved[0].durationMethod).toBe("word-estimate");
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/cached duration is a word estimate/),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("planTtsScenes carries durationMethod into a candidate re-verification", () => {
    const dir = tempDir("tts-plan-candidate-1599-");
    seedSidecar(dir, "word-estimate", 0); // stale metaVersion → untrusted candidate
    const plan = planTtsScenes(dir, [scene], engine);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0].durationMethod).toBe("word-estimate");
  });

  it("registry carries the engine's durationMethod into the meta it writes", () => {
    const src = readFileSync(join(LIB_DIR, "tts", "registry.mjs"), "utf8");
    expect(src).toMatch(/durationMethod:\s*result\.durationMethod/);
  });
});

describe("no PATH-based ffprobe gate remains in the legacy engines", () => {
  it.each(["tts/say.mjs", "tts/edge-tts.mjs"])("%s uses the resolver seam", (file) => {
    const src = readFileSync(join(LIB_DIR, file), "utf8");
    expect(src).toMatch(/binaryUsable\(FFPROBE_BIN\)/);
    expect(src).not.toMatch(/isCommandAvailable\(\s*["']ffprobe["']\s*\)/);
    expect(src).toMatch(/durationMethod/);
    expect(src).toMatch(/console\.warn/);
  });
});
