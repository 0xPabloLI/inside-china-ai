/**
 * Background music generator for short videos.
 * Creates a dark, atmospheric cyber-ambient track using FFmpeg audio synthesis.
 *
 * Output: scripts/short-video/output/audio/bgm.wav
 * Volume: mixed at ~12% in assembly (barely audible, adds atmosphere)
 */

import { execFileSync } from "child_process";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function generateBGM(duration = 180) {
  const audioDir = join(__dirname, "output", "audio");
  mkdirSync(audioDir, { recursive: true });
  const bgmPath = join(audioDir, "bgm.wav");

  // Build filter_complex as a single string
  const filterComplex = [
    "[0]volume=0.12,tremolo=f=0.3:d=0.5[drone]",
    "[1]volume=0.06[bass]",
    "[2]volume=0.04[mid1]",
    "[3]volume=0.03[mid2]",
    "[4]volume=0.035[mid3]",
    "[5]volume=0.008[shimmer]",
    "[6]volume=0.5,lowpass=f=400[noise]",
    "[drone][bass][mid1][mid2][mid3][shimmer][noise]amix=inputs=7:duration=longest:normalize=0[mixed]",
    "[mixed]volume=0.6,highpass=f=30,lowpass=f=5000[out]",
  ].join(";");

  // Use execFileSync with args array to bypass shell quoting issues
  const args = [
    "-y",
    "-f", "lavfi", "-i", `sine=frequency=55:duration=${duration}`,
    "-f", "lavfi", "-i", `sine=frequency=110:duration=${duration}`,
    "-f", "lavfi", "-i", `sine=frequency=220:duration=${duration}`,
    "-f", "lavfi", "-i", `sine=frequency=277:duration=${duration}`,
    "-f", "lavfi", "-i", `sine=frequency=330:duration=${duration}`,
    "-f", "lavfi", "-i", `sine=frequency=880:duration=${duration}`,
    "-f", "lavfi", "-i", `anoisesrc=color=pink:duration=${duration}:amplitude=0.02`,
    "-filter_complex", filterComplex,
    "-map", "[out]",
    "-ac", "2",
    "-ar", "44100",
    bgmPath,
  ];

  console.log("  Generating background music...");
  execFileSync("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });

  console.log("  Background music generated");
  return { bgmPath, transitionPath: null };
}
