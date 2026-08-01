/**
 * Test FFmpeg silenceremove filter on existing TTS audio.
 * Compresses silence gaps >0.3s down to 0.15s to eliminate "stuttering".
 */
import { execSync } from "child_process";
import { mkdirSync } from "fs";

const outDir = "scripts/short-video/output/tts-test";
mkdirSync(outDir, { recursive: true });

// Test on scene 4 (has 4 gaps, 26% silence)
const input = "scripts/short-video/output/audio/scene-4.mp3";
const output = `${outDir}/scene-4-denoised.mp3`;

// silenceremove: detect silence below -35dB, if longer than 0.3s, remove everything except 0.15s
const filter = "silenceremove=window=0:detection=peak:threshold=-35dB:stop_periods=-1:stop_duration=0.3:stop_silence=0.15";

execSync(`ffmpeg -y -i "${input}" -af "${filter}" "${output}" 2>&1`);

// Compare durations
const origDur = execSync(`ffprobe -i "${input}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim();
const newDur = execSync(`ffprobe -i "${output}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim();

console.log(`Original: ${origDur}s`);
console.log(`Processed: ${newDur}s`);
console.log(`Saved: ${(parseFloat(origDur) - parseFloat(newDur)).toFixed(2)}s`);

// Check remaining silence gaps
const silenceCheck = execSync(
  `ffmpeg -i "${output}" -af silencedetect=noise=-35dB:d=0.2 -f null - 2>&1`,
).toString();
const gaps = silenceCheck.match(/silence_duration: ([\d.]+)/g);
console.log(`\nRemaining silence gaps: ${gaps ? gaps.length : 0}`);
if (gaps) gaps.forEach((g) => console.log(`  ${g}`));

console.log(`\nOutput: ${output}`);
