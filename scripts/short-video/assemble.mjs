/**
 * Assembles the final video using FFmpeg.
 * For each scene: combines WebM video + audio → MP4 with fade transitions.
 * Then concatenates all scene MP4s into the final short video.
 */

import { execSync, execFileSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync, renameSync } from "fs";
import { join } from "path";

function run(cmd) {
  execSync(cmd, { stdio: ["pipe", "pipe", "pipe"] });
}

export function assembleVideo(scenes, outputDir, bgmPath = null, srtPath = null) {
  const finalPath = join(outputDir, "deepseek-short.mp4");
  const concatFile = join(outputDir, "concat.txt");
  const sceneFiles = [];

  for (const scene of scenes) {
    const sceneOutput = join(outputDir, `scene-${scene.sceneId}_final.mp4`);
    // Video is recorded for duration + 0.5s buffer
    const videoDuration = scene.duration + 0.5;
    const fadeOutStart = Math.max(videoDuration - 0.3, 0.1).toFixed(2);

    // Build FFmpeg command: combine video + audio with fade transitions
    const parts = [
      "ffmpeg -y",
      `-i "${scene.videoPath}"`,
      `-i "${scene.audioPath}"`,
      "-c:v libx264 -preset fast -crf 23 -r 30",
      "-c:a aac -b:a 192k -ar 44100",
      "-map 0:v -map 1:a",
      // Fade in at start, fade out near end
      `-vf "fade=t=in:st=0:d=0.2,fade=t=out:st=${fadeOutStart}:d=0.3"`,
      `-t ${videoDuration.toFixed(2)}`,
      `"${sceneOutput}"`,
    ];

    run(parts.join(" "));
    sceneFiles.push(sceneOutput);
    console.log(`  Scene ${scene.sceneId}: video + audio merged`);
  }

  // Create concat list file
  const concatContent = sceneFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n");
  writeFileSync(concatFile, concatContent);

  // Concatenate all scenes
  run(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${finalPath}"`);

  // Burn in subtitles via SRT if provided
  if (srtPath && existsSync(srtPath)) {
    const noSubsPath = finalPath.replace(".mp4", "-nosubs.mp4");
    renameSync(finalPath, noSubsPath);
    // Use ffmpeg-full for subtitles filter (has libass support)
    const ffmpegFull = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
    const subFilter = `subtitles=${srtPath}:force_style='FontName=Helvetica Neue,FontSize=18,PrimaryColour=&H00F5F5F5,OutlineColour=&H66000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=120'`;
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
