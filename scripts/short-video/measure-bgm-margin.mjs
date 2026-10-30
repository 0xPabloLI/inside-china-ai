#!/usr/bin/env node
/**
 * Music-below-narration measurement for any finished artifact (#950).
 *
 * Works on the local render AND on a post downloaded from the platform: the
 * windows come from our own alignment timing, which stays valid because the
 * platform re-encodes the same take on the same timeline (measured lag 0).
 *
 * Usage:
 *   node measure-bgm-margin.mjs --video <path> --content <dir> [--expect-bgm|--no-bgm]
 *   node measure-bgm-margin.mjs --video <path> --timing <json> --durations <json>
 *
 * Without --expect-bgm/--no-bgm the expectation comes from the audio/bgm-mix.json
 * marker next to the artifact (unknown when there is none).
 *
 * Exit code: 0 pass | warn | unknown, 1 fail.
 */

import { existsSync, readFileSync, realpathSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import {
  buildWindowsFromTiming,
  evaluateBgmMargin,
  expectedBedFor,
  measureBgmMargin,
} from "./lib/audio/bgm-margin.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  function getArg(name) {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  }

  const videoPath = getArg("video");
  if (!videoPath || !existsSync(videoPath)) {
    console.error("❌ --video <path> is required and must exist");
    console.error(
      "   Example: node measure-bgm-margin.mjs --video /tmp/post-audio.mp4 --content deepseek-v41-flash-1017",
    );
    process.exit(1);
  }

  let timingPath = getArg("timing");
  let durationsPath = getArg("durations");
  const contentDir = getArg("content");
  if (!timingPath || !durationsPath) {
    if (!contentDir) {
      console.error("❌ pass --content <dir> (or both --timing and --durations)");
      process.exit(1);
    }
    let pipelineId = contentDir;
    try {
      const metaMod = await import(`file://${join(__dirname, "content", contentDir, "meta.mjs")}`);
      pipelineId = metaMod.meta?.pipelineId || contentDir;
    } catch {}
    const audioDir = join(__dirname, "output", pipelineId, "audio");
    timingPath = timingPath || join(audioDir, "subtitle-timing.json");
    durationsPath = durationsPath || join(audioDir, "scene-durations.json");
  }
  for (const [flag, path] of [
    ["--timing", timingPath],
    ["--durations", durationsPath],
  ]) {
    if (!existsSync(path)) {
      console.error(`❌ ${flag} not found: ${path}`);
      process.exit(1);
    }
  }

  const explicit = args.includes("--expect-bgm") ? true : args.includes("--no-bgm") ? false : null;
  const expectBed = explicit ?? expectedBedFor(videoPath);

  const windows = buildWindowsFromTiming(
    JSON.parse(readFileSync(timingPath, "utf8")),
    JSON.parse(readFileSync(durationsPath, "utf8")),
  );
  const measurement = measureBgmMargin({ videoPath, windows });
  const verdict = evaluateBgmMargin(measurement, { expectBed });

  console.log(`\n🎚️  BGM under voice — ${basename(videoPath)}`);
  console.log("─".repeat(60));
  const expectLabel =
    expectBed === true
      ? "bed expected (local mix)"
      : expectBed === false
        ? "no local bed (platform-attach)"
        : "expectation unknown (no marker for this file)";
  console.log(`  expectation: ${expectLabel}`);
  if (measurement.ok) {
    const seconds = (n) => n.toFixed(1);
    console.log(
      `  speech:      ${measurement.speechRmsDb.toFixed(1)} dBFS  ` +
        `(${seconds(measurement.speechSeconds)}s over ${measurement.speechWindows} windows)`,
    );
    console.log(
      `  bed only:    ${measurement.bgmOnlyRmsDb.toFixed(1)} dBFS  ` +
        `(${seconds(measurement.pauseSeconds)}s over ${measurement.pauseWindows} windows)`,
    );
    console.log(`  music below narration: ${measurement.marginDb.toFixed(1)} dB`);
  } else {
    console.log(`  not measured: ${measurement.error}`);
  }
  for (const reason of verdict.reasons) console.log(`  → ${reason}`);
  console.log(`\n${verdict.status.toUpperCase()}`);
  console.log("─".repeat(60));

  process.exit(verdict.status === "fail" ? 1 : 0);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
