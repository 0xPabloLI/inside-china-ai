/**
 * TTS voiceover generation.
 *
 * Engine priority:
 *   1. XTTS v2 (voice cloning, most natural) — requires Python 3.11 venv at ~/.xtts-env
 *   2. Kokoro (neural TTS, natural) — requires Python venv at ~/.tts-env
 *   3. edge-tts (Microsoft neural TTS) — falls back if above unavailable
 *   4. macOS `say` — last resort
 *
 * All engines are post-processed with FFmpeg silenceremove to compress
 * sentence-boundary pauses (>0.25s → 0.08s retained).
 *
 * Returns audio file paths and exact durations (durations drive video timing).
 */

import { execSync, exec } from "child_process";
import { writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── F5-TTS-MLX config (default engine, best quality on Apple Silicon) ──
const F5_MLX_BATCH_SCRIPT = join(__dirname, "f5_mlx_batch_tts.py");
const F5_MLX_VENV = join(process.env.HOME || "", ".f5-tts-env");
const F5_MLX_SPEED = parseFloat(process.env.F5_SPEED) || 1.0;
const F5_REF_AUDIO = join(__dirname, "assets", "voice-sample-24k.wav");
const F5_REF_TEXT_FILE = join(__dirname, "assets", "voice-sample-ref-text.txt");

async function isF5MLXAvailable() {
  if (!existsSync(F5_MLX_BATCH_SCRIPT)) return false;
  if (!existsSync(F5_MLX_VENV)) return false;
  if (!existsSync(F5_REF_AUDIO)) return false;
  try {
    await execAsync(
      `source ${F5_MLX_VENV}/bin/activate && python3 -c "import f5_tts_mlx" 2>/dev/null`,
    );
    return true;
  } catch {
    return false;
  }
}

// ── XTTS v2 config ──
// Uses batch script to load model ONCE for all scenes (avoids 60+ min reload penalty)
const XTTS_BATCH_SCRIPT = join(__dirname, "xtts_batch_tts.py");
const XTTS_VENV = join(process.env.HOME || "", ".xtts-env");
const XTTS_LANGUAGE = "en";
const XTTS_SPEED = parseFloat(process.env.XTTS_SPEED) || 1.15;
const XTTS_SPEAKER = process.env.XTTS_SPEAKER || "Craig Gutsy"; // Configurable via env var
// Voice cloning: uses multi-WAV conditioning by default (3 clips from different positions).
// Multi-WAV averaging produces more stable speaker embeddings than single clip.
// Override: TTS_SPEAKER_WAV=none → built-in speaker; TTS_SPEAKER_WAV=/path → single file; TTS_SPEAKER_WAV="a.wav,b.wav" → custom multi
const VOICE_SAMPLES_DIR = join(__dirname, "assets", "voice-samples");
const multiClips = existsSync(VOICE_SAMPLES_DIR)
  ? ["multi_clip1.wav", "multi_clip2.wav", "multi_clip3.wav"]
      .map((f) => join(VOICE_SAMPLES_DIR, f))
      .filter((f) => existsSync(f))
  : [];
const DEFAULT_SPEAKER_WAV = join(__dirname, "assets", "voice-sample.wav");
const XTTS_SPEAKER_WAV =
  process.env.TTS_SPEAKER_WAV === "none"
    ? null
    : process.env.TTS_SPEAKER_WAV
      ? process.env.TTS_SPEAKER_WAV
      : multiClips.length >= 2
        ? multiClips.join(",")
        : existsSync(DEFAULT_SPEAKER_WAV)
          ? DEFAULT_SPEAKER_WAV
          : null;

// Path to Kokoro Python TTS script and venv
// Checks persistent location (~/.tts-env) first, then temp (/tmp/tts-env)
const KOKORO_SCRIPT = join(__dirname, "kokoro_tts.py");
const KOKORO_VENV_CANDIDATES = [join(process.env.HOME || "", ".tts-env"), "/tmp/tts-env"];
const KOKORO_VOICE = "am_michael"; // Clear, authoritative male
const KOKORO_SPEED = 1.1; // ~10% faster than normal

async function isCommandAvailable(cmd) {
  try {
    await execAsync(`which ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

// Path to XTTS v2 model directory (checks if model is downloaded, not just package installed)
const XTTS_MODEL_DIR = join(
  process.env.HOME || "",
  "Library",
  "Application Support",
  "tts",
  "tts_models--multilingual--multi-dataset--xtts_v2",
);

async function isXTTSAvailable() {
  if (!existsSync(XTTS_BATCH_SCRIPT)) return false;
  if (!existsSync(XTTS_VENV)) return false;
  // Check if model is actually downloaded (not just Python package installed)
  if (!existsSync(XTTS_MODEL_DIR)) return false;
  try {
    await execAsync(`source ${XTTS_VENV}/bin/activate && python3 -c "import TTS" 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

async function isKokoroAvailable() {
  if (!existsSync(KOKORO_SCRIPT)) return null;
  for (const venvPath of KOKORO_VENV_CANDIDATES) {
    if (!existsSync(venvPath)) continue;
    try {
      await execAsync(`source ${venvPath}/bin/activate && python3 -c "import kokoro" 2>/dev/null`);
      return venvPath;
    } catch {
      continue;
    }
  }
  return null;
}

async function isEdgeTTSAvailable() {
  if (await isCommandAvailable("edge-tts")) return "edge-tts";
  try {
    await execAsync("python3 -m edge_tts --version");
    return "python3 -m edge_tts";
  } catch {
    return null;
  }
}

async function getDurationWithFfprobe(audioPath) {
  const { stdout } = await execAsync(
    `ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
  );
  return parseFloat(stdout.trim());
}

// FFmpeg silenceremove filter to compress sentence-boundary pauses.
// threshold 0.018 ≈ -35dB amplitude. Compress gaps >0.25s, keep 0.08s.
// Optional atempo for clone voice speed-up (TTS_ATEMPO env var, e.g. TTS_ATEMPO=1.3)
const TTS_ATEMPO = parseFloat(process.env.TTS_ATEMPO) || null;
const SILENCE_FILTER =
  "silenceremove=stop_periods=-1:stop_duration=0.25:stop_silence=0.08:stop_threshold=0.018" +
  (TTS_ATEMPO ? `,atempo=${TTS_ATEMPO}` : "");

// ── F5-TTS-MLX batch mode: load model once, process all scenes ──
async function generateBatchWithF5MLX(scenes, outputDir) {
  const { writeFileSync: writeSync, readFileSync: readSync } = await import("fs");
  const manifestPath = join(outputDir, "f5-manifest.json");
  const manifest = scenes.map((s) => ({
    sceneId: s.id,
    text: s.voiceover,
    output: `scene-${s.id}.mp3`,
  }));
  writeSync(manifestPath, JSON.stringify(manifest));

  // Read ref-text from file
  const refText = readSync(F5_REF_TEXT_FILE, "utf-8").trim();

  console.log("  Loading F5-TTS-MLX model (once for all scenes)...");
  const { stdout } = await execAsync(
    `source ${F5_MLX_VENV}/bin/activate && HF_HUB_DISABLE_XET=1 PYTHONUNBUFFERED=1 F5_REF_AUDIO="${F5_REF_AUDIO}" F5_REF_TEXT="${refText.replace(/"/g, '\\"')}" python3 "${F5_MLX_BATCH_SCRIPT}" ` +
      `--manifest "${manifestPath}" --output-dir "${outputDir}" --speed ${F5_MLX_SPEED} 2>&1`,
  );

  // Parse results from stdout
  const lines = stdout.trim().split("\n");
  const jsonLine = lines.find((l) => l.trim().startsWith("[{"));
  let batchResults = [];
  if (jsonLine) {
    try {
      batchResults = JSON.parse(jsonLine.trim());
    } catch (e) {
      console.error("  Failed to parse F5-MLX JSON output:", e.message);
    }
  }
  if (batchResults.length === 0) {
    throw new Error("No F5-MLX results parsed from batch output");
  }

  // Post-process each: F5 generates clean audio, no silenceremove needed.
  // Only apply atempo if TTS_ATEMPO is set (for speed-up).
  const f5Filter = TTS_ATEMPO ? `-af atempo=${TTS_ATEMPO}` : "";
  const finalResults = [];
  for (const r of batchResults) {
    const audioPath = r.audioPath;
    const processedPath = audioPath.replace(".mp3", "-processed.mp3");
    await execAsync(
      `ffmpeg -y -i "${audioPath}" ${f5Filter} -ar 44100 -b:a 192k "${processedPath}" 2>/dev/null`,
    );
    await execAsync(`mv "${processedPath}" "${audioPath}"`);

    const duration = await getDurationWithFfprobe(audioPath);
    finalResults.push({ sceneId: r.sceneId, audioPath, duration });
    console.log(`  Scene ${r.sceneId}: ${duration.toFixed(2)}s`);
  }

  return finalResults;
}

// ── XTTS batch mode: load model once, process all scenes ──
async function generateBatchWithXTTS(scenes, outputDir) {
  const { writeFileSync: writeSync } = await import("fs");
  const manifestPath = join(outputDir, "xtts-manifest.json");
  const manifest = scenes.map((s) => ({
    sceneId: s.id,
    text: s.voiceover,
    output: `scene-${s.id}.mp3`,
  }));
  writeSync(manifestPath, JSON.stringify(manifest));

  const speakerArg = XTTS_SPEAKER_WAV ? `--speaker "${XTTS_SPEAKER_WAV}"` : "";
  console.log("  Loading XTTS v2 model (once for all scenes)...");
  const { stdout } = await execAsync(
    `source ${XTTS_VENV}/bin/activate && COQUI_TOS_AGREED=1 XTTS_SPEAKER="${XTTS_SPEAKER}" python3 "${XTTS_BATCH_SCRIPT}" ` +
      `--manifest "${manifestPath}" --output-dir "${outputDir}" ` +
      `--language ${XTTS_LANGUAGE} --speed ${XTTS_SPEED} ${speakerArg} 2>&1`,
  );

  // Parse results from stdout — look for JSON array of objects (not the TTS sentence-split output)
  const lines = stdout.trim().split("\n");
  // The real results array starts with [{"sceneId" — not ["sentence"]
  const jsonLine = lines.find((l) => l.trim().startsWith('[{"'));
  let batchResults = [];
  if (jsonLine) {
    try {
      batchResults = JSON.parse(jsonLine.trim());
    } catch (e) {
      console.error("  Failed to parse XTTS JSON output:", e.message);
      console.error("  JSON line:", jsonLine.substring(0, 200));
    }
  } else {
    // Fallback: try each line that looks like JSON array
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("[") && trimmed.includes("sceneId") && trimmed.includes("audioPath")) {
        try {
          batchResults = JSON.parse(trimmed);
          break;
        } catch (e) {
          continue;
        }
      }
    }
  }
  if (batchResults.length === 0) {
    throw new Error("No XTTS results parsed from batch output");
  }

  // Post-process each with silenceremove
  const finalResults = [];
  for (const r of batchResults) {
    const audioPath = r.audioPath;
    const processedPath = audioPath.replace(".mp3", "-processed.mp3");
    await execAsync(
      `ffmpeg -y -i "${audioPath}" -af "${SILENCE_FILTER}" -ar 44100 -b:a 192k "${processedPath}" 2>/dev/null`,
    );
    await execAsync(`mv "${processedPath}" "${audioPath}"`);

    // Get exact duration
    const duration = await getDurationWithFfprobe(audioPath);
    finalResults.push({ sceneId: r.sceneId, audioPath, duration });
    console.log(`  Scene ${r.sceneId}: ${duration.toFixed(2)}s`);
  }

  return finalResults;
}

async function generateWithKokoro(scene, tempFile, outputDir, venvPath) {
  const wavPath = join(outputDir, `scene-${scene.id}-kokoro.wav`);
  const audioPath = join(outputDir, `scene-${scene.id}.mp3`);

  // Generate WAV with Kokoro
  await execAsync(
    `source ${venvPath}/bin/activate && python3 "${KOKORO_SCRIPT}" ` +
      `--file "${tempFile}" --output "${wavPath}" ` +
      `--voice ${KOKORO_VOICE} --speed ${KOKORO_SPEED} 2>&1`,
  );

  // Convert WAV → MP3 with silenceremove + resample
  await execAsync(
    `ffmpeg -y -i "${wavPath}" -af "${SILENCE_FILTER}" -ar 44100 -b:a 192k "${audioPath}" 2>/dev/null`,
  );

  return audioPath;
}

async function generateWithEdgeTTS(scene, tempFile, outputDir, edgeTTSCommand) {
  const voice = "en-US-BrianNeural";
  const rate = "+8%";
  const rawPath = join(outputDir, `scene-${scene.id}-raw.mp3`);
  const audioPath = join(outputDir, `scene-${scene.id}.mp3`);

  // Generate raw TTS audio (with retry for network instability)
  let ttsSuccess = false;
  for (let attempt = 1; attempt <= 3 && !ttsSuccess; attempt++) {
    try {
      await execAsync(
        `${edgeTTSCommand} --voice ${voice} --rate=${rate} --file "${tempFile}" --write-media "${rawPath}"`,
      );
      ttsSuccess = true;
    } catch (e) {
      if (attempt < 3) {
        console.log(`    [retry ${attempt}/3] Scene ${scene.id} TTS failed, retrying...`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      } else {
        throw e;
      }
    }
  }

  // Post-process to compress silence gaps
  await execAsync(`ffmpeg -y -i "${rawPath}" -af "${SILENCE_FILTER}" "${audioPath}" 2>/dev/null`);

  return audioPath;
}

async function generateWithSay(scene, tempFile, outputDir) {
  const voice = "Daniel";
  const rate = "190";
  const rawPath = join(outputDir, `scene-${scene.id}-raw.aiff`);
  const audioPath = join(outputDir, `scene-${scene.id}.mp3`);

  execSync(`say -v ${voice} -r ${rate} -f "${tempFile}" -o "${rawPath}"`);
  await execAsync(
    `ffmpeg -y -i "${rawPath}" -af "${SILENCE_FILTER}" -ar 44100 -b:a 192k "${audioPath}" 2>/dev/null`,
  );

  return audioPath;
}

export async function generateTTS(scenes, outputDir) {
  const f5mlxAvailable = await isF5MLXAvailable();
  const xttsAvailable = !f5mlxAvailable ? await isXTTSAvailable() : false;
  const kokoroVenv = !f5mlxAvailable && !xttsAvailable ? await isKokoroAvailable() : null;
  const kokoroAvailable = kokoroVenv !== null;
  const edgeTTSCommand =
    !f5mlxAvailable && !xttsAvailable && !kokoroAvailable ? await isEdgeTTSAvailable() : null;
  const hasFfprobe = await isCommandAvailable("ffprobe");
  const hasSay = process.platform === "darwin";

  if (!f5mlxAvailable && !xttsAvailable && !kokoroAvailable && !edgeTTSCommand && !hasSay) {
    throw new Error(
      "No TTS engine available. Install F5-TTS-MLX (pip install f5-tts-mlx), XTTS (pip install TTS), Kokoro (pip install kokoro), or edge-tts, or run on macOS.",
    );
  }

  // Select engine (TTS_ENGINE env var can force kokoro or xtts)
  let engine, engineInfo;
  const forceEngine = process.env.TTS_ENGINE || null;
  if (forceEngine === "f5" || (!forceEngine && f5mlxAvailable)) {
    engine = "f5-mlx";
    engineInfo = `F5-TTS-MLX (cloned from ${F5_REF_AUDIO}, speed=${F5_MLX_SPEED})`;
  } else if (forceEngine === "kokoro" && kokoroAvailable) {
    engine = "kokoro";
    engineInfo = `Kokoro neural TTS (${KOKORO_VOICE}, speed=${KOKORO_SPEED})`;
  } else if (forceEngine === "xtts" || (!forceEngine && xttsAvailable)) {
    engine = "xtts";
    const speakerInfo = XTTS_SPEAKER_WAV ? `cloned from ${XTTS_SPEAKER_WAV}` : XTTS_SPEAKER;
    engineInfo = `XTTS v2 (${speakerInfo}, speed=${XTTS_SPEED})`;
  } else if (kokoroAvailable) {
    engine = "kokoro";
    engineInfo = `Kokoro neural TTS (${KOKORO_VOICE}, speed=${KOKORO_SPEED})`;
  } else if (edgeTTSCommand) {
    engine = "edge-tts";
    engineInfo = `edge-tts (en-US-BrianNeural, rate=+8%)`;
  } else {
    engine = "say";
    engineInfo = `macOS say (Daniel, rate=190)`;
  }

  console.log(`  TTS engine: ${engineInfo}`);
  console.log(
    `  Post-process: FFmpeg silenceremove (compress pauses >0.25s → 0.08s)${TTS_ATEMPO ? ` + atempo ${TTS_ATEMPO}x` : ""}`,
  );

  const results = [];

  if (engine === "f5-mlx") {
    // F5-TTS-MLX uses batch mode — load model once, process all scenes
    const f5Results = await generateBatchWithF5MLX(scenes, outputDir);
    await runWhisperAlignment(scenes, f5Results, outputDir);
    return f5Results;
  }

  if (engine === "xtts") {
    // XTTS uses batch mode — load model once, process all scenes
    const xttsResults = await generateBatchWithXTTS(scenes, outputDir);
    // Run whisper alignment for accurate subtitle timing
    await runWhisperAlignment(scenes, xttsResults, outputDir);
    return xttsResults;
  }

  for (const scene of scenes) {
    const tempFile = join(tmpdir(), `tts-scene-${scene.id}.txt`);
    writeFileSync(tempFile, scene.voiceover);

    let audioPath;

    if (engine === "kokoro") {
      audioPath = await generateWithKokoro(scene, tempFile, outputDir, kokoroVenv);
    } else if (engine === "edge-tts") {
      audioPath = await generateWithEdgeTTS(scene, tempFile, outputDir, edgeTTSCommand);
    } else {
      audioPath = await generateWithSay(scene, tempFile, outputDir);
    }

    // Get exact duration of the processed audio
    let duration;
    if (hasFfprobe) {
      duration = await getDurationWithFfprobe(audioPath);
    } else {
      const wordCount = scene.voiceover.split(" ").length;
      duration = wordCount / 2.5;
    }

    results.push({
      sceneId: scene.id,
      audioPath,
      duration,
    });

    console.log(`  Scene ${scene.id}: ${duration.toFixed(2)}s`);
  }

  // Run whisper alignment for accurate subtitle timing
  await runWhisperAlignment(scenes, results, outputDir);

  return results;
}

// ── Force-align subtitle timing ──
// Uses ffmpeg silencedetect to align KNOWN text to KNOWN audio.
// Output: output/audio/subtitle-timing.json — used by generate-scenes.mjs
async function runWhisperAlignment(scenes, ttsResults, outputDir) {
  const { existsSync } = await import("fs");
  const alignScript = join(__dirname, "text-align.py");
  if (!existsSync(alignScript)) {
    console.log("  ⚠️ Force-align script not found, skipping");
    return;
  }

  console.log("  🎯 Running force-align subtitle timing...");

  const manifest = ttsResults.map((r) => ({
    sceneId: r.sceneId,
    text: scenes.find((s) => s.id === r.sceneId)?.voiceover || "",
    audioPath: r.audioPath,
  }));
  const manifestPath = join(outputDir, "whisper-manifest.json");
  const timingPath = join(outputDir, "subtitle-timing.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));

  try {
    await execAsync(
      `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 ~/.f5-tts-env/bin/python3 "${alignScript}" ` +
        `--manifest "${manifestPath}" --output "${timingPath}" 2>&1`,
    );
    console.log("  ✅ Subtitle timing saved (WhisperX wav2vec2 aligned)");
  } catch (e) {
    console.log(`  ⚠️ Force-align failed: ${e.message.substring(0, 100)}`);
  }
}
