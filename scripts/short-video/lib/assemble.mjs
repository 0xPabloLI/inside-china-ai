/**
 * Assembles the final video using FFmpeg.
 * For each scene: combines WebM video + audio → MP4 with fade transitions.
 * Then concatenates all scene MP4s into the final short video.
 */

import { execSync, execFileSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync, renameSync } from "fs";
import { join } from "path";
import { FPS, sceneClipFrames, sceneClipDuration } from "./timeline.mjs";
import { buildVoiceoverTrack, TRACK_SAMPLE_RATE } from "./audio/track.mjs";

function run(cmd) {
  execSync(cmd, { stdio: ["pipe", "pipe", "pipe"] });
}

export function assembleVideo(
  scenes,
  outputDir,
  pipelineId,
  bgmPath = null,
  subtitlesPath = null,
  version = null,
  subject = null,
) {
  // File prefix: {subject}-{pipelineId} if subject exists and differs from pipelineId, else {pipelineId}
  const filePrefix = subject && subject !== pipelineId ? `${subject}-${pipelineId}` : pipelineId;
  // Versioned output: {filePrefix}-v{version}-short.mp4, or {filePrefix}-short.mp4 if no version
  const versionSuffix = version ? `-v${version}` : "";
  const finalPath = join(outputDir, `${filePrefix}${versionSuffix}-short.mp4`);
  const concatFile = join(outputDir, "concat.txt");
  const sceneFiles = [];

  const missingAudio = scenes.find((s) => !s.audioPath);
  if (missingAudio) {
    throw new Error(
      `Scene ${missingAudio.sceneId} has no audioPath — cannot build the voiceover track`,
    );
  }

  for (const [i, scene] of scenes.entries()) {
    const sceneOutput = join(outputDir, `scene-${scene.sceneId}_final.mp4`);
    // Clip length is defined in frames (see lib/timeline.mjs). Requesting a
    // duration in seconds would be rounded up to the next frame by FFmpeg,
    // drifting the subtitle timeline a few ms per scene.
    const clipFrames = sceneClipFrames(scene.duration);
    const clipDuration = sceneClipDuration(scene.duration);
    const fadeOutStart = Math.max(clipDuration - 0.3, 0.1).toFixed(3);

    // First scene starts at full impact — no fade-in — so the opening frame
    // carries the hook content immediately (TikTok's auto-selected cover and
    // any early-frame selection gets real content, not a black frame).
    const fadeIn = i === 0 ? "" : "fade=t=in:st=0:d=0.2,";

    // Video-only clips: the audio lives in exactly one place — the voiceover
    // master track. Carrying a per-scene audio stream here would create a
    // second, container-level copy of the timeline for concat to drift from.
    const parts = [
      "ffmpeg -y",
      `-i "${scene.videoPath}"`,
      `-c:v libx264 -preset fast -crf 23 -r ${FPS}`,
      "-an",
      // Fade out near end (fade-in skipped for first scene)
      `-vf "${fadeIn}fade=t=out:st=${fadeOutStart}:d=0.3"`,
      `-frames:v ${clipFrames}`,
      `"${sceneOutput}"`,
    ];

    run(parts.join(" "));
    sceneFiles.push(sceneOutput);
    console.log(`  Scene ${scene.sceneId}: video rendered (${clipFrames} frames)`);
  }

  // Build the continuous voiceover master track: every scene padded with real
  // silence to its clip length, concatenated sample-exactly. Its length equals
  // the video length, so no downstream decode→re-encode (player, TikTok ingest)
  // can compact anything — subtitles and audio stay on one timeline forever.
  const voiceoverPath = join(outputDir, "voiceover.wav");
  const { samples: trackSamples } = buildVoiceoverTrack({
    sceneAudioPaths: scenes.map((s) => s.audioPath),
    ttsDurations: scenes.map((s) => s.duration),
    outputPath: voiceoverPath,
  });
  console.log(
    `  🎙 voiceover.wav: ${(trackSamples / TRACK_SAMPLE_RATE).toFixed(3)}s — gapless master track`,
  );

  // Create concat list file
  const concatContent = sceneFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n");
  writeFileSync(concatFile, concatContent);

  // Marry the concatenated video (stream-copied) to the gapless master track.
  // Audio is encoded once here; the optional --bgm pass below re-encodes the
  // already-continuous track, which can only add a constant whole-file offset
  // (AAC priming), never per-scene drift.
  run(
    `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -i "${voiceoverPath}" ` +
      `-map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -ar 44100 "${finalPath}"`,
  );

  // Burn in subtitles (ASS) if provided
  if (subtitlesPath && existsSync(subtitlesPath)) {
    const noSubsPath = finalPath.replace(".mp4", "-nosubs.mp4");
    renameSync(finalPath, noSubsPath);
    // Use ffmpeg-full for subtitles filter (has libass support)
    const ffmpegFull = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
    const subFilter = `ass=${subtitlesPath}`;
    execFileSync(
      ffmpegFull,
      ["-y", "-i", noSubsPath, "-vf", subFilter, "-c:a", "copy", finalPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    try {
      unlinkSync(noSubsPath);
    } catch {}
    console.log("  Subtitles burned in (FFmpeg native)");
  }

  // Mix background music if provided
  if (bgmPath) {
    const noBgmPath = finalPath.replace(".mp4", "-nobgm.mp4");
    renameSync(finalPath, noBgmPath);

    // Get video duration
    let videoDuration = 180;
    try {
      const info = execSync(
        `ffprobe -i "${noBgmPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
      ).toString();
      videoDuration = parseFloat(info.trim());
    } catch {}

    // Mix: TTS audio at full volume + BGM at low volume
    // BGM has fade-in (2s) and fade-out (last 3s) for smooth transitions
    // Use execFileSync to bypass shell quoting issues with filter_complex
    const bgmFadeOutStart = Math.max(videoDuration - 3, 1).toFixed(2);
    const filterComplex = `[1:a]afade=t=in:st=0:d=2,afade=t=out:st=${bgmFadeOutStart}:d=3,volume=0.12[bgm];[0:a]volume=1.0[tts];[tts][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        noBgmPath,
        "-i",
        bgmPath,
        "-filter_complex",
        filterComplex,
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "44100",
        finalPath,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    console.log("  Background music mixed in");

    // Clean up temp
    try {
      unlinkSync(noBgmPath);
    } catch {}
  }

  // Clean up temp files
  unlinkSync(concatFile);

  // No symlink — the versioned file is the canonical output.
  // Clean up old versioned files (keep latest 3)
  try {
    const versionedFiles = execSync(
      `ls -1 "${outputDir}" | grep '${filePrefix}-v.*-short.mp4' | sort -r`,
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    if (versionedFiles.length > 3) {
      for (const oldFile of versionedFiles.slice(3)) {
        const oldPath = join(outputDir, oldFile);
        try {
          unlinkSync(oldPath);
          console.log(`  🗑️ Cleaned old version: ${oldFile}`);
        } catch {}
      }
    }
  } catch {}

  // Get final duration
  let finalDuration = "unknown";
  try {
    const info = execSync(
      `ffprobe -i "${finalPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
    ).toString();
    finalDuration = `${parseFloat(info.trim()).toFixed(1)}s`;
  } catch {}

  return { path: finalPath, duration: finalDuration };
}
