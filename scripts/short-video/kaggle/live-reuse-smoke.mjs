/**
 * #1515 acceptance driver — real Kaggle cold batch + N live retries, no pipeline.
 *
 * Measures the engine wall for the first batch and for retries served by the
 * same warm kernel, and verifies each retry take landed. One cold push can
 * carry scenes from several packs (ids are offset per pack so the kernel's
 * manifest lookup cannot collide), which is how the ticket's "2 packs / 3
 * retries" acceptance is collected without paying two GPU queues.
 *
 *   PACKS=baidu-token-market,deepseek-harness-desktop RETRY_COUNT=3 \
 *     PATH="/opt/homebrew/bin:$PATH" node scripts/short-video/kaggle/live-reuse-smoke.mjs
 *
 * This exercises the exact engine entry point the registry's
 * `tts-engine-retry` span wraps; it deliberately skips the pipeline so the
 * measurement isolates engine wall from gate/align/loudness work.
 */
import { mkdirSync, existsSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { createCosyVoice3KaggleCudaEngine } from "../lib/tts/cosyvoice3-kaggle-cuda.mjs";
import { createRegenStaging, acceptRegenTake } from "../lib/tts/staging.mjs";

const packNames = (process.env.PACKS || process.env.PACK || "baidu-token-market")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
const smokeId = process.env.SMOKE_ID || `1515-live-${packNames.join("-")}`;
const retryCount = Number(process.env.RETRY_COUNT || "1");
const outputBase = join(import.meta.dirname, "..", "output", smokeId);
const firstDir = join(outputBase, packNames[0], "audio");
mkdirSync(firstDir, { recursive: true });

// One kernel per acceptance run; a separate slug per pack would defeat the
// "one warm kernel serves every retry" measurement.
process.env.COSYVOICE3_KAGGLE_SLUG ||= `cosyvoice3-cuda-${smokeId}`;

const allScenes = [];
for (const [packIndex, pack] of packNames.entries()) {
  const { scenes } = await import(`../content/${pack}/scene-data.mjs`);
  const picked = scenes.filter((s) => s.id === 1 || s.id === 2);
  if (picked.length < 2) throw new Error(`pack ${pack} needs scene 1 and 2, got ${picked.length}`);
  for (const s of picked) {
    allScenes.push({
      ...s,
      // Scene ids repeat across packs; offset them so one manifest can carry
      // both packs and the kernel's `_lookup` stays unambiguous.
      id: packIndex * 100 + s.id,
      __pack: pack,
    });
  }
}

const engine = await createCosyVoice3KaggleCudaEngine();
if (!engine) throw new Error("CosyVoice3 Kaggle CUDA engine unavailable");

console.log(
  `\n=== FIRST BATCH (${allScenes.length} scenes from ${packNames.join(" + ")}, live cold) ===`,
);
const t0 = performance.now();
const first = await engine.generate(allScenes, firstDir);
const coldMs = performance.now() - t0;

const retries = [];
for (let i = 0; i < retryCount; i += 1) {
  const target = allScenes[(i + 1) % allScenes.length];
  const retryDir = join(outputBase, target.__pack, "audio");
  mkdirSync(retryDir, { recursive: true });
  const staging = createRegenStaging(retryDir);
  console.log(
    `\n=== RETRY ${i + 1}/${retryCount} (${target.__pack} scene ${target.id}, live reuse) ===`,
  );
  const t1 = performance.now();
  const retry = await engine.generate([target], staging);
  const retryMs = performance.now() - t1;
  for (const r of retry) acceptRegenTake(retryDir, r);
  retries.push({
    pack: target.__pack,
    sceneId: target.id,
    ms: Math.round(retryMs),
    result: retry.map((r) => ({
      sceneId: r.sceneId,
      duration: r.duration,
      path: r.audioPath,
      exists: existsSync(r.audioPath),
      bytes: existsSync(r.audioPath) ? statSync(r.audioPath).size : 0,
    })),
  });
}

await engine.endLiveSession();

const result = {
  packs: packNames,
  smokeId,
  coldMs: Math.round(coldMs),
  retryCount,
  retries,
  first: first.map((r) => ({
    sceneId: r.sceneId,
    duration: r.duration,
    exists: existsSync(r.audioPath),
    bytes: existsSync(r.audioPath) ? statSync(r.audioPath).size : 0,
  })),
  firstPaths: first.map((r) => r.audioPath),
};
writeFileSync(join(outputBase, "result.json"), JSON.stringify(result, null, 2));
console.log("\nRESULT " + JSON.stringify(result));
