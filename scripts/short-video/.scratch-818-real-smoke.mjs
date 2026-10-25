/**
 * #818 Real Data Smoke — Step 6 (Gate 2) on real packages.
 *
 * Runs the REAL verifySubtitles (ffmpeg silencedetect + cross-correlation +
 * word-sequence compare) against REAL shipped videos, their REAL
 * subtitles.ass and the REAL subtitle-timing.json. Everything is copied to a
 * scratch dir first, so packages under output/ are never written to.
 *
 *   --sweep        Every real package: the Gate 2 verdict and failure category.
 *                  This is AC1's corpus observation — does any real package
 *                  carry a word-sequence mismatch, and which word is it?
 *   --determinism  AC1's "cannot self-heal" measurement: run the real
 *                  runForcedAlignment twice on unchanged real takes and
 *                  compare sha256 of subtitle-timing.json. Byte-identical
 *                  means the retry's only lever cannot move the verdict.
 *   (default)      One package, three arms:
 *     A. Healthy path — the real triple's verdict and repairs dispatched.
 *     B. The fix — a word-sequence mismatch: classified `subtitle-alignment`,
 *        loop stops after ONE verify, zero repairs. Pre-#818 code spent both
 *        retries re-verifying and logged "Errors: 1 → 1 (rolled back)".
 *        NOTE: arm B injects the mismatch by rewriting the timing text, because
 *        no real package currently carries one (see --sweep). It models the
 *        disagreement, not a captured incident.
 *     C. The crash path — a repair that throws, as the real one did (it called
 *        a `generateSubtitles` main.mjs never imported).
 *
 * Usage:
 *   node scripts/short-video/.scratch-818-real-smoke.mjs [flags]
 *
 *   --pack <name>          package to drive (default: deepseek-v41-flash-1017)
 *   --code-root <dir>      the scripts/short-video directory whose lib/ is
 *                          UNDER TEST (default: this script's own tree). Point
 *                          it at the main checkout to A/B the fix against the
 *                          pre-#818 code.
 *   --content-root <dir>   the scripts/short-video directory holding real
 *                          content/ + output/ (default: code-root). From a
 *                          session worktree, point this at the MAIN checkout —
 *                          output/ is gitignored, so a fresh worktree has no
 *                          rendered packages to measure.
 *   --sweep                run the corpus sweep instead of the A/B arms
 *   --determinism          run the forced-alignment determinism measurement
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const HERE = import.meta.dirname;
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const pack = flag("pack", "deepseek-v41-flash-1017");
const ROOT = resolve(flag("code-root", HERE));
const CONTENT = resolve(flag("content-root", ROOT));
const OUTPUT = join(CONTENT, "output");
const sweepMode = has("sweep");
const determinismMode = has("determinism");

const { verifySubtitles } = await import(join(ROOT, "lib/verify-subtitles.mjs"));
const retryMod = await import(join(ROOT, "lib/verify-retry.mjs"));
const { verifyWithRetry, classifyFailure } = retryMod;
// Absent before this fix — that absence is the A/B's control arm.
const isRetryable = retryMod.isRetryable ?? (() => "n/a (pre-#818 code)");

/** ffprobe lives on PATH for a normal shell; fall back to the brew prefix. */
const FFPROBE = (() => {
  for (const candidate of [process.env.FFPROBE, "ffprobe", "/opt/homebrew/bin/ffprobe"]) {
    if (!candidate) continue;
    try {
      execFileSync(candidate, ["-version"], { stdio: "ignore" });
      return candidate;
    } catch {
      /* try the next one */
    }
  }
  throw new Error("ffprobe not found — set FFPROBE to its path");
})();

const duration = (p) =>
  Number(
    execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p])
      .toString()
      .trim(),
  );
const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

console.log(`codeRoot=${ROOT}`);
console.log(`contentRoot=${CONTENT}`);

/** Copy one package's Gate 2 inputs into a scratch dir. */
function stage(name) {
  const src = join(OUTPUT, name);
  const work = join(tmpdir(), `818-smoke-${name}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, "audio"), { recursive: true });
  const video = readdirSync(src)
    .filter((f) => f.endsWith("-short.mp4"))
    .sort()
    .at(-1);
  copyFileSync(join(src, video), join(work, video));
  copyFileSync(join(src, "subtitles.ass"), join(work, "subtitles.ass"));
  for (const f of readdirSync(join(src, "audio"))) {
    if (/^(scene-\d+\.wav|scene-durations\.json|subtitle-timing\.json)$/.test(f)) {
      copyFileSync(join(src, "audio", f), join(work, "audio", f));
    }
  }
  const timingData = JSON.parse(readFileSync(join(work, "audio/subtitle-timing.json"), "utf8"));
  const sceneDurations = JSON.parse(readFileSync(join(work, "audio/scene-durations.json"), "utf8"));
  return {
    work,
    video,
    videoPath: join(work, video),
    assPath: join(work, "subtitles.ass"),
    timingData,
    sceneDurations,
    audioPaths: sceneDurations.map((d) => join(work, "audio", `scene-${d.sceneId}.wav`)),
  };
}

/** Packages that can drive Gate 2 at all. */
const packNames = () =>
  readdirSync(OUTPUT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .filter(
      (n) =>
        existsSync(join(OUTPUT, n, "subtitles.ass")) &&
        existsSync(join(OUTPUT, n, "audio/subtitle-timing.json")) &&
        readdirSync(join(OUTPUT, n)).some((f) => f.endsWith("-short.mp4")),
    );

/** Real scenes + meta for a package, from its content dir. */
async function loadScenes(name) {
  const sceneData = await import(join(CONTENT, "content", name, "scene-data.mjs"));
  const metaMod = existsSync(join(CONTENT, "content", name, "meta.mjs"))
    ? await import(join(CONTENT, "content", name, "meta.mjs"))
    : {};
  return { scenes: sceneData.scenes ?? sceneData.default?.scenes ?? [], meta: metaMod.meta ?? {} };
}

// ── --determinism: is the retry's only lever deterministic? ──
if (determinismMode) {
  const { runForcedAlignment } = await import(join(ROOT, "lib/tts/post-process.mjs"));
  const { scenes, meta } = await loadScenes(pack);
  const audioDir = join(OUTPUT, pack, "audio");
  const work = join(tmpdir(), `818-determinism-${pack}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, "audio"), { recursive: true });

  const ttsResults = [];
  for (const scene of scenes) {
    const src = join(audioDir, `scene-${scene.id}.wav`);
    if (!existsSync(src)) continue;
    const audioPath = join(work, "audio", `scene-${scene.id}.wav`);
    copyFileSync(src, audioPath);
    ttsResults.push({ sceneId: scene.id, audioPath, duration: duration(audioPath) });
  }

  console.log(`pack=${pack} takes=${ttsResults.length} (real wavs copied to ${work})`);
  const hashes = [];
  for (const run of [1, 2]) {
    const t0 = Date.now();
    const out = await runForcedAlignment(scenes, ttsResults, join(work, "audio"), {
      force: true,
      keyEntities: meta.keyEntities,
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const timingPath = join(work, "audio", "subtitle-timing.json");
    const h = existsSync(timingPath) ? sha256(timingPath) : "(no subtitle-timing.json)";
    hashes.push(h);
    console.log(
      `run ${run}: ${secs}s sha256=${h.slice(0, 16)} ` +
        `skipped=${out?.skipped ?? "?"} cuts=${out?.guards?.cuts?.length ?? 0} refused=${out?.guards?.refusedCuts?.length ?? 0}`,
    );
  }
  console.log(
    `\nverdict: ${hashes[0] === hashes[1] ? "BYTE-IDENTICAL" : "DIFFERS"} — ` +
      `${hashes[0] === hashes[1] ? "re-running forced alignment cannot change the verdict (AC1: not self-healable)" : "the lever is non-deterministic; re-measure before concluding"}`,
  );
  rmSync(work, { recursive: true, force: true });
}

// ── --sweep: Gate 2 across every real package ──
else if (sweepMode) {
  const names = packNames();
  console.log(`packages with a .ass + timing + rendered video: ${names.length}\n`);
  const rows = [];
  for (const name of names) {
    const s = stage(name);
    let report;
    try {
      report = verifySubtitles({
        videoPath: s.videoPath,
        assPath: s.assPath,
        timingData: s.timingData,
        sceneDurations: s.sceneDurations,
        outputDir: s.work,
        audioPaths: s.audioPaths,
      });
    } catch (e) {
      console.log(`  ⚠️  ${name}: verify crashed — ${e.message}`);
      rmSync(s.work, { recursive: true, force: true });
      continue;
    }
    const category = report.summary.passed ? "—" : classifyFailure(report);
    rows.push({
      name,
      passed: report.summary.passed,
      errors: report.summary.errors,
      category,
      wordSeq: report.wordSequence?.matches === false,
      mismatch: report.wordSequence?.firstMismatch,
    });
    console.log(
      `  ${report.summary.passed ? "PASS" : "FAIL"} ${name.padEnd(34)} errors=${report.summary.errors} ` +
        `warnings=${report.summary.warnings} category=${category}` +
        (report.wordSequence?.matches === false
          ? ` wordSeq firstMismatch=${JSON.stringify(report.wordSequence.firstMismatch)}`
          : ""),
    );
    rmSync(s.work, { recursive: true, force: true });
  }
  const failing = rows.filter((r) => !r.passed);
  const wordSeqFails = rows.filter((r) => r.wordSeq);
  console.log(
    `\nsweep: ${rows.length} package(s) verified, ${failing.length} failing, ` +
      `${wordSeqFails.length} with a word-sequence mismatch`,
  );
  for (const r of wordSeqFails) {
    console.log(`  ${r.name}: ${JSON.stringify(r.mismatch)}`);
  }
}

// ── default: one package, three arms ──
else {
  const s = stage(pack);
  console.log(`pack=${pack}`);
  console.log(`video=${s.video}`);
  console.log(`scenes=${s.sceneDurations.length}`);

  const verifyWith =
    (timing) =>
    ({ videoPath, assPath } = {}) =>
      verifySubtitles({
        videoPath: videoPath ?? s.videoPath,
        assPath: assPath ?? s.assPath,
        timingData: timing,
        sceneDurations: s.sceneDurations,
        outputDir: s.work,
        audioPaths: s.audioPaths,
      });

  const runLoop = async (verifyFn, repairFn) => {
    const dispatched = [];
    let verifies = 0;
    const counting = (paths) => {
      verifies++;
      return verifyFn(paths);
    };
    const wrapped = (cat, report, state) => {
      dispatched.push(cat);
      return repairFn(cat, report, state);
    };
    const t0 = Date.now();
    const out = await verifyWithRetry({
      verifyFn: counting,
      repairFn: wrapped,
      maxRetries: 2,
      videoPath: s.videoPath,
      assPath: s.assPath,
    });
    return {
      ...out,
      dispatched,
      verifies,
      secs: ((Date.now() - t0) / 1000).toFixed(1),
    };
  };

  const fmt = (r) =>
    `verifies=${r.verifies} repairs=${r.dispatched.length} [${r.dispatched.join(",")}] (${r.secs}s)`;

  // ── A. healthy path on the real artifacts ──
  const reportA = verifyWith(s.timingData)();
  const loopA = await runLoop(verifyWith(s.timingData), () => ({ success: true }));
  console.log(
    `\nA real triple: passed=${reportA.summary.passed} errors=${reportA.summary.errors} warnings=${reportA.summary.warnings}`,
  );
  console.log(`A loop: ${fmt(loopA)}`);

  // ── B. a word-sequence mismatch through the real loop ──
  const scenes = s.timingData.scenes ?? s.timingData;
  let renames = 0;
  const mismatched = {
    ...s.timingData,
    scenes: scenes.map((sc) => ({
      ...sc,
      segments: (sc.segments ?? []).map((seg) => ({
        ...seg,
        words: (seg.words ?? []).map((w) => {
          if (/^DeepSeek$/i.test(w.text)) {
            renames++;
            return { ...w, text: "DeepSeq" };
          }
          return w;
        }),
      })),
    })),
  };

  const verifyMismatch = verifyWith(mismatched);
  const reportB = verifyMismatch();
  const categoryB = classifyFailure(reportB);
  const loopB = await runLoop(verifyMismatch, () => ({ success: true }));
  console.log(
    `\nB mismatch (injected: ${renames} real "DeepSeek" -> "DeepSeq" in the timing): passed=${reportB.summary.passed} errors=${reportB.summary.errors}`,
  );
  console.log(`B wordSequence: ${JSON.stringify(reportB.wordSequence)}`);
  console.log(`B classify="${categoryB}" retryable=${isRetryable(categoryB)} ${fmt(loopB)}`);

  // ── C. the crash path on real data ──
  const loopC = await runLoop(verifyWith(mismatched), () => {
    throw new ReferenceError("generateSubtitles is not defined");
  });
  console.log(
    `\nC repair throws (as the real one did): ${fmt(loopC)} passed=${loopC.report.summary.passed}`,
  );

  const wasted = loopB.verifies + loopC.verifies - 2;
  console.log(
    `\nverdict: B + C spent ${wasted} extra verify pass${wasted === 1 ? "" : "es"} beyond the first on a verdict that could not change` +
      ` (pre-#818 code re-verified after every failed repair, and each real retry re-ran forced alignment first — see --determinism)`,
  );
  rmSync(s.work, { recursive: true, force: true });
}
