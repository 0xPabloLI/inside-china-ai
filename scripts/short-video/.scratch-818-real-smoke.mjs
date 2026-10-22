/**
 * #818 Real Data Smoke — Step 6 (Gate 2) on real packages.
 *
 * Runs the REAL verifySubtitles (ffmpeg silencedetect + cross-correlation +
 * word-sequence compare) against REAL shipped videos, their REAL
 * subtitles.ass and the REAL subtitle-timing.json. Everything is copied to a
 * scratch dir first, so packages under scripts/short-video/output/ are never
 * written to.
 *
 *   --sweep        Every real package: the Gate 2 verdict and failure category.
 *                  This is AC1's observation — does any real package today
 *                  carry a word-sequence mismatch, and which word is it?
 *   <pack>         One package, three arms:
 *     A. Healthy path — the real triple's verdict and repairs dispatched.
 *     B. The fix — a word-sequence mismatch: classified `subtitle-alignment`,
 *        loop stops after ONE verify, zero repairs. Pre-#818 code spent both
 *        retries re-verifying and logged "Errors: 1 → 1 (rolled back)".
 *     C. The crash path — a repair that throws, as the real one did (it called
 *        a `generateSubtitles` main.mjs never imported).
 *
 * Usage:
 *   node scripts/short-video/.scratch-818-real-smoke.mjs --sweep [codeRoot]
 *   node scripts/short-video/.scratch-818-real-smoke.mjs [pack] [codeRoot]
 *
 * codeRoot defaults to this script's own tree. Point it at another checkout
 * (e.g. the main one) to A/B the fix against the code before it.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const OUTPUT = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/output";
const sweepMode = process.argv[2] === "--sweep";
const pack = sweepMode ? null : (process.argv[2] ?? "deepseek-v41-flash-1017");
// The script's own tree is the code under test; output/ is read from the main
// checkout so the smoke never depends on which worktree it runs in.
const ROOT = (sweepMode ? process.argv[3] : process.argv[4]) ?? import.meta.dirname;

const retryMod = await import(join(ROOT, "lib/verify-retry.mjs"));
const { verifySubtitles } = await import(join(ROOT, "lib/verify-subtitles.mjs"));
const { verifyWithRetry, classifyFailure } = retryMod;
// Absent before this fix — that absence is the A/B's control arm.
const isRetryable = retryMod.isRetryable ?? (() => "n/a (pre-#818 code)");

console.log(`codeRoot=${ROOT}`);

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
  cpSync(join(src, video), join(work, video));
  cpSync(join(src, "subtitles.ass"), join(work, "subtitles.ass"));
  for (const f of readdirSync(join(src, "audio"))) {
    if (/^(scene-\d+\.wav|scene-durations\.json|subtitle-timing\.json)$/.test(f)) {
      cpSync(join(src, "audio", f), join(work, "audio", f));
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

const packNames = readdirSync(OUTPUT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("."))
  .map((d) => d.name)
  .filter(
    (n) =>
      existsSync(join(OUTPUT, n, "subtitles.ass")) &&
      existsSync(join(OUTPUT, n, "audio/subtitle-timing.json")) &&
      readdirSync(join(OUTPUT, n)).some((f) => f.endsWith("-short.mp4")),
  );

// ── --sweep: Gate 2 across every real package ──
if (sweepMode) {
  console.log(`packages with a .ass + timing + rendered video: ${packNames.length}\n`);
  const rows = [];
  for (const name of packNames) {
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
} else {
  const s = stage(pack);
  console.log(`pack=${pack}`);
  console.log(`video=${s.video}`);
  console.log(`scenes=${s.sceneDurations.length}`);

  const verifyWith = (timing) => () =>
    verifySubtitles({
      videoPath: s.videoPath,
      assPath: s.assPath,
      timingData: timing,
      sceneDurations: s.sceneDurations,
      outputDir: s.work,
      audioPaths: s.audioPaths,
    });

  const runLoop = async (verifyFn, repairFn) => {
    const dispatched = [];
    let verifies = 0;
    const counting = () => {
      verifies++;
      return verifyFn();
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
  // Injecting the mismatch in the timing (rather than editing the .ass) is the
  // shape a real mismatch has: the two sides disagree. See --sweep for whether
  // any real package carries one today.
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
    `\nB mismatch (${renames} real "DeepSeek" -> "DeepSeq" in the timing): passed=${reportB.summary.passed} errors=${reportB.summary.errors}`,
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
      ` (pre-#818 code re-verified after every failed repair, and each real retry re-ran ~20-25s of forced alignment first)`,
  );
  rmSync(s.work, { recursive: true, force: true });
}
