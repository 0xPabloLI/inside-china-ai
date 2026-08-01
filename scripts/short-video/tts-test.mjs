/**
 * TTS voice comparison test.
 * Generates the same text with different voices/engines for comparison.
 */
import { exec } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";

const execAsync = promisify(exec);

const testText = "DeepSeek's API is priced to recover hardware costs in ten months. At fourteen cents per million tokens, it's one-twentieth the price of Claude. They could double the price and not lose users. They chose not to.";

const outputDir = "scripts/short-video/output/tts-test";
const { mkdirSync } = await import("fs");
mkdirSync(outputDir, { recursive: true });

const tempFile = join(tmpdir(), "tts-test.txt");
writeFileSync(tempFile, testText);

const tests = [
  // edge-tts voices
  { name: "guy-current", cmd: `python3 -m edge_tts --voice en-US-GuyNeural --rate=+8% --file "${tempFile}" --write-media "${outputDir}/guy-current.mp3"` },
  { name: "christopher", cmd: `python3 -m edge_tts --voice en-US-ChristopherNeural --rate=+8% --file "${tempFile}" --write-media "${outputDir}/christopher.mp3"` },
  { name: "brian", cmd: `python3 -m edge_tts --voice en-US-BrianNeural --rate=+8% --file "${tempFile}" --write-media "${outputDir}/brian.mp3"` },
  { name: "andrew", cmd: `python3 -m edge_tts --voice en-US-AndrewNeural --rate=+8% --file "${tempFile}" --write-media "${outputDir}/andrew.mp3"` },
  { name: "guy-faster", cmd: `python3 -m edge_tts --voice en-US-GuyNeural --rate=+15% --file "${tempFile}" --write-media "${outputDir}/guy-faster.mp3"` },
  // macOS say with Daniel
  { name: "say-daniel", cmd: `say -v Daniel -r 200 -f "${tempFile}" -o "${outputDir}/say-daniel.aiff"` },
];

for (const test of tests) {
  try {
    await execAsync(test.cmd);
    const { stdout } = await execAsync(`ffprobe -i "${outputDir}/${test.name}.mp3" -show_entries format=duration -v quiet -of csv="p=0" 2>/dev/null || ffprobe -i "${outputDir}/${test.name}.aiff" -show_entries format=duration -v quiet -of csv="p=0"`);
    console.log(`${test.name}: ${stdout.trim()}s`);
  } catch (e) {
    console.error(`${test.name}: FAILED - ${e.message}`);
  }
}

console.log("\nFiles saved to:", outputDir);
