import { readFileSync } from "fs";
import { verifyCanonicalText } from "../lib/verify-canonical-text.mjs";

const timing = JSON.parse(
  readFileSync("scripts/short-video/output/doubao-work/audio/subtitle-timing.json", "utf8"),
);

// Load real scene-data voiceovers (text parse — can't import .mjs without build step)
const sceneText = readFileSync("scripts/short-video/content/doubao-work/scene-data.mjs", "utf8");
const voiceovers = [...sceneText.matchAll(/voiceover:\s*"([^"]+)"/g)].map((m) => m[1]);
const scenes = voiceovers.map((vo, i) => ({ id: i + 1, voiceover: vo }));

const keyEntities = {
  companies: ["bytedance", "doubao", "feishu"],
  people: ["zhao-qi"],
  models: ["doubao-work"],
};

console.log("══════════════════════════════════════════");
console.log("Real data E2E test: doubao-work");
console.log("══════════════════════════════════════════");
console.log("Timing format:", Array.isArray(timing) ? "array (old)" : "object (new)");
console.log("Timing scenes:", timing.length);
console.log("Scene-data voiceovers:", scenes.length);
console.log("Key entities:", JSON.stringify(keyEntities));
console.log();

// Test 1: Baseline — timing should match scene-data
console.log("─── Test 1: Baseline (unchanged scene-data) ───");
const result1 = verifyCanonicalText(timing, scenes, keyEntities);
console.log("Result:", result1.passed ? "PASS ✅" : "FAIL ❌");
if (!result1.passed) {
  for (const m of result1.mismatches) {
    console.log("  Scene", m.sceneId, ":", m.reason);
    console.log("    Timing words:", m.timing.slice(0, 8).join(" ") + "...");
    console.log("    VO words:", m.voiceover.slice(0, 8).join(" ") + "...");
  }
}
console.log();

// Test 2: Modify scene-data — change 'ByteDance' to 'Tencent' in scene 1
console.log("─── Test 2: Modified scene-data (ByteDance->Tencent in scene 1) ───");
const modifiedScenes = JSON.parse(JSON.stringify(scenes));
modifiedScenes[0].voiceover = modifiedScenes[0].voiceover.replace("ByteDance", "Tencent");
const result2 = verifyCanonicalText(timing, modifiedScenes, keyEntities);
console.log("Result:", result2.passed ? "PASS ✅" : "FAIL ❌");
if (!result2.passed) {
  for (const m of result2.mismatches) {
    console.log("  Scene", m.sceneId, ":", m.reason);
  }
}
console.log();

// Test 3: render-only.mjs scenario
console.log("─── Test 3: render-only.mjs scenario ───");
console.log(
  "If render-only.mjs were called with modified scene-data,",
);
console.log(
  "Gate 1 would",
  result2.passed ? "PASS (bad!)" : "FAIL and hard-exit (correct)",
);
console.log();

console.log("══════════════════════════════════════════");
console.log("E2E verification complete.");
console.log("══════════════════════════════════════════");
