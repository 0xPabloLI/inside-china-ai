/**
 * Analyze TTS silence gaps vs text punctuation to find root cause.
 */
import { execSync } from "child_process";

const scenes = [
  {
    id: 2,
    text: "In May, DeepSeek founder Liang Wenfeng held a closed-door meeting with investors. No press, no recording. Two months later, the full transcript leaked online, then disappeared within hours.",
    silences: [
      { start: 4.04, end: 4.95, dur: 0.91 },
      { start: 6.41, end: 7.3, dur: 0.89 },
      { start: 9.71, end: 9.93, dur: 0.23 },
      { start: 11.22, end: 12.05, dur: 0.83 },
    ],
    totalDur: 12.05,
  },
  {
    id: 4,
    text: "DeepSeek's API is priced to recover hardware costs in ten months. At fourteen cents per million tokens, it's one-twentieth the price of Claude. They could double the price and not lose users. They chose not to.",
    silences: [
      { start: 3.49, end: 4.41, dur: 0.92 },
      { start: 8.05, end: 8.95, dur: 0.9 },
      { start: 11.02, end: 11.94, dur: 0.92 },
      { start: 12.86, end: 13.63, dur: 0.77 },
    ],
    totalDur: 13.63,
  },
  {
    id: 5,
    text: "DeepSeek open-sources its strongest models with production weights. No inferior version. The safety isn't generosity. It's a cost advantage. Competitors would pay several times more to deploy the same model.",
    silences: [
      { start: 3.29, end: 4.21, dur: 0.92 },
      { start: 5.44, end: 6.34, dur: 0.9 },
      { start: 8.02, end: 8.95, dur: 0.93 },
      { start: 10.11, end: 11.01, dur: 0.9 },
      { start: 13.96, end: 14.81, dur: 0.85 },
    ],
    totalDur: 14.81,
  },
];

console.log("=== TTS Silence Gap Analysis ===\n");

for (const scene of scenes) {
  const sentences = scene.text.split(/(?<=[.,])\s+/);
  console.log(`Scene ${scene.id} (${scene.totalDur}s total)`);
  console.log(`  Text segments: ${sentences.length}`);
  console.log(`  Silence gaps: ${scene.silences.length}`);
  console.log(
    `  Avg silence: ${(scene.silences.reduce((s, g) => s + g.dur, 0) / scene.silences.length).toFixed(2)}s`,
  );
  console.log(
    `  Total silence: ${scene.silences.reduce((s, g) => s + g.dur, 0).toFixed(2)}s (${((scene.silences.reduce((s, g) => s + g.dur, 0) / scene.totalDur) * 100).toFixed(0)}% of scene)`,
  );
  console.log(`  Silence pattern: every ~0.9s at punctuation boundaries`);
  console.log();
}

console.log("=== Root Cause ===");
console.log("edge-tts inserts ~0.9s silence at EVERY sentence boundary (period).");
console.log("With 4-5 sentences per scene, that's 4-5 gaps of ~0.9s = 3.6-4.5s of dead air.");
console.log("This is ~30% of each scene's duration spent in silence.");
console.log("The 'stuttering' is these long pauses between sentences.");
console.log();
console.log("=== Solution ===");
console.log("Option A: Post-process with FFmpeg to compress silences >0.3s to 0.15s");
console.log("Option B: Rewrite text to use fewer sentence breaks (semicolons, em-dashes)");
console.log("Option C: Both A + B");
