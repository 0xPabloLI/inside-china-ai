/**
 * #827 Real Data Smoke — reproducible evidence for the delivery record.
 *
 * The claim this script exists to check: the alignment-guards trim read-back
 * (#232 verified-cut) now receives `keyEntities`, so a declared lowercase brand
 * that whisper.cpp spells as a near-miss is judged recognition variance instead
 * of truncation — and nothing else changes.
 *
 * Two measurements, both on the REAL corpus (real scene data, real audio, real
 * whisper.cpp, real subtitle-timing.json), not fixtures:
 *
 *   A. Does the real ASR near-miss a declared brand on real audio at all?
 *      Runs the REAL gate (`evaluateSceneTts`) over every scene whose script
 *      says a declared entity, A/B with and without the dictionary.
 *      → answers "is this bug reachable on today's content?"
 *
 *   B. No-regression on every scene the guards would actually cut.
 *      Runs the REAL guard path (`runAlignmentGuards`, real whisper.cpp
 *      read-back) A/B and compares the verdicts byte for byte.
 *      → the dictionary must be inert wherever the tail word is not a declared
 *        name; any A/B difference here would be a behaviour change.
 *
 * Usage:
 *   node scripts/short-video/.scratch-827-real-smoke.mjs [codeRoot] [contentRoot] [reportPath]
 *
 *   codeRoot     the checkout whose lib/tts/* is UNDER TEST (default: the
 *                scripts/short-video directory this script lives in)
 *   contentRoot  the checkout holding real content + output (default:
 *                codeRoot). For a session worktree, point this at the MAIN
 *                checkout — output/ is gitignored, so a fresh worktree has no
 *                audio to measure.
 *   reportPath   defaults to /tmp/827-real-smoke.json
 *
 * Measured 2026-10-22 (codeRoot = the #827 worktree, contentRoot = main
 * checkout): A = 29 real near-miss events across 12 TRACKED packs (e.g.
 * deepseek-embodied-ai scene 4, where the real transcript reads "DeepSeq" for
 * the declared `deepseek`); B = 19 real cuttable scenes, 19/19 byte-identical
 * A/B, 0 cuts committed and 1 refusal in both arms. The main checkout also
 * carries untracked in-progress packs; with their audio present A rises to 38
 * events across 14 packs — the same code, a bigger corpus, so A's count moves
 * with the content list while B (the no-regression half) does not.
 * Honest gap: no scene today combines a declared lowercase brand in the tail
 * window with an excess tail >= 0.5s, so the end-to-end flip is not observable
 * on this corpus — A and B together bound the change instead (reachable, and
 * inert elsewhere).
 */
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CODE_ROOT = resolve(process.argv[2] ?? HERE);
const CONTENT_ROOT = resolve(process.argv[3] ?? CODE_ROOT);
const REPORT_PATH = resolve(process.argv[4] ?? "/tmp/827-real-smoke.json");

const { runAlignmentGuards } = await import(join(CODE_ROOT, "lib/tts/alignment-guards.mjs"));
const { evaluateSceneTts, tokenize } = await import(join(CODE_ROOT, "lib/tts/quality-gate.mjs"));

const norm = (v) =>
  String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

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

const packs = readdirSync(join(CONTENT_ROOT, "content")).filter((d) =>
  existsSync(join(CONTENT_ROOT, "content", d, "meta.mjs")),
);
const work = mkdtempSync(join(tmpdir(), "827-smoke-"));
const audioOf = (pack, id) => join(CONTENT_ROOT, "output", pack, "audio", `scene-${id}.wav`);

// ── A. does the real ASR near-miss a declared brand on real audio? ──
const declaredProbe = [];
for (const pack of packs) {
  const { meta } = await import(join(CONTENT_ROOT, "content", pack, "meta.mjs"));
  const { scenes } = await import(join(CONTENT_ROOT, "content", pack, "scene-data.mjs"));
  const declared = new Set();
  for (const arr of Object.values(meta?.keyEntities ?? {})) {
    if (!Array.isArray(arr)) continue;
    for (const e of arr) if (typeof e === "string") declared.add(norm(e));
  }
  if (declared.size === 0) continue;
  for (const scene of scenes) {
    const audio = audioOf(pack, scene.id);
    if (!existsSync(audio)) continue;
    const text = scene.ttsText || scene.voiceoverTts || scene.voiceover || "";
    if (![...declared].some((d) => tokenize(text).some((w) => norm(w) === d))) continue;
    const d = duration(audio);
    const withDict = await evaluateSceneTts(scene, audio, d, { keyEntities: meta.keyEntities });
    const without = await evaluateSceneTts(scene, audio, d, {});
    const variance = (withDict.warnings ?? []).filter((w) => /near-miss|split|merged/.test(w));
    if (variance.length === 0) continue;
    declaredProbe.push({
      pack,
      scene: scene.id,
      declaredNamesInScript: [...declared].filter((x) => tokenize(text).some((w) => norm(w) === x)),
      realTranscript: withDict.asrText,
      varianceWarnings: variance,
      similarityWithDict: Number((withDict.similarity ?? 0).toFixed(4)),
      similarityWithoutDict: Number((without.similarity ?? 0).toFixed(4)),
      issuesWithDict: withDict.issues,
      issuesWithoutDict: without.issues,
    });
  }
}

// ── B. real no-regression on every real cuttable scene ──
const noRegression = [];
for (const pack of packs) {
  const timingPath = join(CONTENT_ROOT, "output", pack, "audio", "subtitle-timing.json");
  if (!existsSync(timingPath)) continue;
  const { meta } = await import(join(CONTENT_ROOT, "content", pack, "meta.mjs"));
  const { scenes } = await import(join(CONTENT_ROOT, "content", pack, "scene-data.mjs"));
  const timing = JSON.parse(readFileSync(timingPath, "utf8"));
  for (const scene of scenes) {
    const audio = audioOf(pack, scene.id);
    if (!existsSync(audio)) continue;
    const sceneTiming = (timing.scenes ?? timing).find((s) => s.sceneId === scene.id);
    if (!sceneTiming) continue;
    const words = (sceneTiming.segments ?? []).flatMap((seg) => seg.words ?? []);
    if (words.length === 0) continue;
    const lastWordEnd = Math.max(...words.map((w) => w.end ?? 0));
    const d = duration(audio);
    // Same threshold the guards use before they consider a cut at all.
    if (d - (lastWordEnd + 0.15) < 0.5) continue;

    const ab = {};
    for (const withDict of [true, false]) {
      const audioPath = join(work, `${pack}-s${scene.id}-${withDict ? "w" : "wo"}.wav`);
      copyFileSync(audio, audioPath);
      const ttsResults = [{ sceneId: scene.id, audioPath, duration: d }];
      const out = await runAlignmentGuards(
        ttsResults,
        [{ sceneId: scene.id, segments: sceneTiming.segments }],
        [scene],
        withDict ? { keyEntities: meta.keyEntities ?? null } : {},
      );
      ab[withDict ? "with" : "without"] = {
        cuts: out.cuts,
        refused: out.refusedCuts,
        finalDuration: Number(ttsResults[0].duration.toFixed(3)),
      };
    }
    noRegression.push({
      pack,
      scene: scene.id,
      realDuration: Number(d.toFixed(3)),
      lastWordEnd: Number(lastWordEnd.toFixed(3)),
      excessTailSec: Number((d - (lastWordEnd + 0.15)).toFixed(3)),
      ab,
      identical: JSON.stringify(ab.with) === JSON.stringify(ab.without),
    });
  }
}

const report = { contentRoot: CONTENT_ROOT, declaredProbe, noRegression };
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(
  `\nA: real near-miss events on real audio = ${declaredProbe.length}` +
    `\nB: real cuttable scenes = ${noRegression.length},` +
    ` identical A/B = ${noRegression.filter((r) => r.identical).length}` +
    `\nreport: ${REPORT_PATH}`,
);
