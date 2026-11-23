#!/usr/bin/env node
/**
 * #1514: measure `step-1-tts` substeps on a real package WITHOUT running the
 * rest of the pipeline (no media sourcing, no render, no publish).
 *
 * Fidelity: the cache plan, TTS text normalization and the quality gate see
 * exactly what `main.mjs` gives them — same Steps 0.5/0.6, same `keyEntities`,
 * same engine selection. The only thing left out is everything after Step 1.
 * Output lands in an isolated directory, so a measurement run can never touch
 * a package's approved takes or its profile.
 *
 * Usage:
 *   node scripts/short-video/tts-step-profile.mjs --content <slug> --out <dir>
 *     [--content-dir <abs>]  # measure an uncommitted package (e.g. a draft)
 *     [--no-alignment]   # skip text-align + guards (local-tail floor only)
 *     [--no-cache]       # force cold generation even if <dir> has a cache
 *
 * The run prints the reconciliation demanded by the ticket: sum of the
 * non-overlapping substeps vs the outer `step-1-tts` span (≤5% expected; the
 * remainder is glue between substeps, not an untimed stage).
 */
import { mkdirSync } from "fs";
import { join, resolve } from "path";
import { createProfiler } from "./lib/pipeline-profile.mjs";
import { generateTTS } from "./lib/generate-tts.mjs";
import { normalizeSceneDataWithLiveRates } from "./lib/normalize-currency.mjs";
import { normalizeTtsText } from "./lib/normalize-tts-text.mjs";

const SUBSTEPS = [
  "tts-select",
  "tts-plan",
  "tts-engine",
  "tts-engine-retry",
  "tts-loudness",
  "tts-verify",
  "tts-align",
  "tts-write",
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};

const contentDir = value("content");
if (!contentDir) {
  console.error("❌ --content <slug> is required (a directory under content/).");
  process.exit(1);
}
const contentPath = value("content-dir") || `./content/${contentDir}`;
const outDir = resolve(
  value("out") || join(import.meta.dirname, "output", `${contentDir}-tts-profile`),
);
const audioDir = join(outDir, "audio");
mkdirSync(audioDir, { recursive: true });

const { meta } = await import(`${contentPath}/meta.mjs`);
const { scenes } = await import(`${contentPath}/scene-data.mjs`);
if (!Array.isArray(scenes) || scenes.length === 0) {
  console.error(`❌ ${contentPath}/scene-data.mjs has no scenes.`);
  process.exit(1);
}

// Mirror main.mjs Steps 0.5/0.6 so TTS text and cache keys match production.
await normalizeSceneDataWithLiveRates(scenes, meta, {
  ratesFile: join(outDir, "currency-rates.json"),
});
normalizeTtsText(scenes, meta);

const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const prof = createProfiler({
  outputDir: outDir,
  version: `tts-substep-${stamp}`,
});

console.log(`🎙  step-1-tts profile — ${contentDir} (${scenes.length} scene(s)) → ${outDir}\n`);
prof.mark("step-1-tts", { track: "voice" });
let threw = null;
try {
  await generateTTS(scenes, audioDir, {
    prof,
    runAlignment: !flag("no-alignment"),
    ...(flag("no-cache") ? { useCache: false } : {}),
    qualityGateOptions: { keyEntities: meta.keyEntities },
  });
} catch (err) {
  threw = err;
} finally {
  prof.end("step-1-tts");
  prof.write();
  prof.summary();
}

if (threw) {
  console.error(`\n❌ step-1-tts failed: ${threw.message}`);
  process.exit(1);
}

const outer = prof.steps.find((s) => s.name === "step-1-tts")?.durationMs ?? 0;
const timed = prof.steps.filter((s) => SUBSTEPS.includes(s.name));
const sum = timed.reduce((acc, s) => acc + s.durationMs, 0);
const deltaPct = outer > 0 ? ((sum - outer) / outer) * 100 : 0;
console.log("Substep reconciliation (outer vs sum of non-overlapping substeps):");
for (const name of SUBSTEPS) {
  const step = timed.find((s) => s.name === name);
  const seconds = ((step?.durationMs ?? 0) / 1000).toFixed(1);
  const share = outer > 0 ? (((step?.durationMs ?? 0) / outer) * 100).toFixed(0) : "?";
  console.log(`  ${name.padEnd(14)} ${seconds.padStart(8)}s  ${share.padStart(3)}%`);
  if (step?.queueMs != null || step?.kernelMs != null) {
    console.log(
      `    └ queue ${(step.queueMs ?? 0) / 1000}s · kernel ${(step.kernelMs ?? 0) / 1000}s · ` +
        `transfer ${((step.durationMs - (step.queueMs ?? 0) - (step.kernelMs ?? 0)) / 1000).toFixed(1)}s`,
    );
  }
}
console.log(
  `  ${"step-1-tts".padEnd(14)} ${(outer / 1000).toFixed(1).padStart(8)}s  ` +
    `(sum ${(sum / 1000).toFixed(1)}s, delta ${deltaPct.toFixed(1)}%)\n`,
);
