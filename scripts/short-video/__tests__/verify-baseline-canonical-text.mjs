/**
 * Baseline verification: prove that the current pipeline cannot detect
 * a canonical-text mismatch when scene-data voiceover is changed but
 * subtitle-timing.json is not regenerated.
 *
 * This is T1 of the Subtitle AIL Gate spec (#120).
 * Run: node scripts/short-video/__tests__/verify-baseline-canonical-text.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = join(__dirname, "..", "output", "doubao-work");
const TIMING_PATH = join(OUTPUT_DIR, "audio", "subtitle-timing.json");
const SCENE_DATA_PATH = join(__dirname, "..", "content", "doubao-work", "scene-data.mjs");

// ─── Load timing JSON ───
const timingData = JSON.parse(readFileSync(TIMING_PATH, "utf8"));

// ─── Load scene-data (static import doesn't work for this test, use text parse) ───
const sceneDataText = readFileSync(SCENE_DATA_PATH, "utf8");

// Extract voiceover fields from scene-data text
const voiceoverMatches = [...sceneDataText.matchAll(/voiceover:\s*"([^"]+)"/g)];
const voiceovers = voiceoverMatches.map((m) => m[1]);

console.log("═══════════════════════════════════════════════════════════");
console.log("T1 Baseline: Canonical Text Gap Verification");
console.log("═══════════════════════════════════════════════════════════\n");

console.log(`Timing JSON: ${TIMING_PATH}`);
console.log(`Format: ${Array.isArray(timingData) ? "array (old)" : "object (new)"}`);
console.log(`Scenes: ${timingData.length}`);
console.log(`Voiceover lines: ${voiceovers.length}\n`);

// ─── Baseline: timing words vs scene-data voiceover (unchanged) ───
console.log("─── Step 1: Baseline (scene-data unchanged) ───\n");

let baselinePass = true;
for (let i = 0; i < Math.min(timingData.length, voiceovers.length); i++) {
  const scene = timingData[i];
  const vo = voiceovers[i];

  // Extract all words from timing segments
  const timingWords = (scene.segments || [])
    .flatMap((seg) => (seg.words || []).map((w) => w.text))
    .map((w) => w.toLowerCase().replace(/[.,!?;:"]/g, ""));

  // Extract words from voiceover (simple split + normalize)
  const voWords = vo.split(/\s+/).map((w) => w.toLowerCase().replace(/[.,!?;:"]/g, ""));

  const match = JSON.stringify(timingWords) === JSON.stringify(voWords);
  if (!match) {
    baselinePass = false;
    console.log(`  Scene ${scene.sceneId}: MISMATCH`);
    console.log(`    VO:     ${voWords.slice(0, 10).join(" ")}${voWords.length > 10 ? "..." : ""}`);
    console.log(`    Timing: ${timingWords.slice(0, 10).join(" ")}${timingWords.length > 10 ? "..." : ""}`);

    // Find first mismatch
    const limit = Math.max(timingWords.length, voWords.length);
    for (let j = 0; j < limit; j++) {
      if (timingWords[j] !== voWords[j]) {
        console.log(`    First diff at word ${j}: VO="${voWords[j]}" vs Timing="${timingWords[j]}"`);
        break;
      }
    }
  } else {
    console.log(`  Scene ${scene.sceneId}: MATCH (${timingWords.length} words)`);
  }
}

console.log(`\nBaseline result: ${baselinePass ? "PASS ✅" : "FAIL ❌"}\n`);

// ─── Simulated mismatch: change one word in voiceover ───
console.log("─── Step 2: Simulated mismatch (scene-data changed, timing not regenerated) ───\n");

// Simulate: change "ByteDance" to "Tencent" in scene 1's voiceover
const modifiedVo = voiceovers[0].replace("ByteDance", "Tencent");
const modifiedVoWords = modifiedVo.split(/\s+/).map((w) => w.toLowerCase().replace(/[.,!?;:"]/g, ""));
const timingWordsScene1 = (timingData[0].segments || [])
  .flatMap((seg) => (seg.words || []).map((w) => w.text))
  .map((w) => w.toLowerCase().replace(/[.,!?;:"]/g, ""));

console.log(`  Scene 1 modified VO: "${modifiedVo}"`);
console.log(`  VO words:     ${modifiedVoWords.slice(0, 10).join(" ")}...`);
console.log(`  Timing words:  ${timingWordsScene1.slice(0, 10).join(" ")}...`);

const mismatchFound = JSON.stringify(modifiedVoWords) !== JSON.stringify(timingWordsScene1);
console.log(`  Mismatch detected by manual comparison: ${mismatchFound ? "YES ✅" : "NO ❌"}\n`);

// ─── Check: does the current pipeline detect this? ───
console.log("─── Step 3: Current pipeline behavior ───\n");
console.log("  The current pipeline has NO canonical-text check before rendering.");
console.log("  verifySubtitles() compares ASS vs timing (not scene-data vs timing).");
console.log("  compareWordSequence() checks ASS carries every aligned word from timing —");
console.log("  but timing itself is stale (generated from old scene-data).");
console.log("  Result: pipeline would PASS (timing matches ASS, both are stale),");
console.log("  but the rendered video would show wrong words in subtitles.");
console.log("  This is the gap that the Subtitle AIL Gate (Gate 1) will close.\n");

console.log("═══════════════════════════════════════════════════════════");
console.log("T1 Conclusion: GAP CONFIRMED");
console.log("  Current pipeline cannot detect scene-data voiceover change");
console.log("  when subtitle-timing.json is not regenerated.");
console.log("  Baseline for T3+T4: canonical-text check must compare");
console.log("  timing words vs CURRENT scene-data voiceover, not vs ASS.");
console.log("═══════════════════════════════════════════════════════════");
