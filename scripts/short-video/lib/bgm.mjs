/**
 * BGM dynamic selection — scans assets/bgm/, filters by instant-start +
 * news-themed, picks one deterministically per pipeline ID.
 *
 * "Instant start" = BGM has audible sound in the first 0.5s (mean > -35dB).
 * A BGM with a slow intro (e.g. cinematic-news-yt at -91dB) is useless for
 * TikTok — the Hook (first 3s) would have no BGM impact even with our 0.1s
 * mix fade-in, because the source file itself is silent.
 *
 * Selection is deterministic: hash(pipelineId) % pool.length ensures the same
 * content always gets the same BGM (reproducible re-renders), while different
 * content gets variety.
 *
 * Override with --bgm-file <path> to force a specific track.
 */

import { existsSync, readdirSync } from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BGM_DIR = join(__dirname, "..", "assets", "bgm");

// ─── Thresholds ───
const INSTANT_START_THRESHOLD_DB = -35; // mean volume in first 0.5s must exceed this
const ANALYSIS_WINDOW_SEC = 0.5; // check first 0.5s for instant start
const NEWS_KEYWORDS = ["news", "breaking", "urgent"]; // filename must contain one of these

/**
 * Analyze a BGM file: duration + first-0.5s mean volume.
 * @param {string} filePath - absolute path to .mp3
 * @returns {{ path: string, filename: string, duration: number, meanVolumeDb: number, instantStart: boolean, isNews: boolean }|null}
 */
function analyzeBGM(filePath) {
  const filename = basename(filePath);

  // Duration
  let duration = 0;
  try {
    const out = execSync(
      `ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`,
    ).toString();
    duration = parseFloat(out.trim());
  } catch {
    return null;
  }

  // First-0.5s mean volume (ffmpeg volumedetect filter)
  let meanVolumeDb = -Infinity;
  try {
    const out = execSync(
      `ffmpeg -i "${filePath}" -t ${ANALYSIS_WINDOW_SEC} -af volumedetect -f null /dev/null 2>&1`,
    ).toString();
    const m = out.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
    if (m) meanVolumeDb = parseFloat(m[1]);
  } catch {
    // ffmpeg failed — treat as not instant-start
  }

  const instantStart = meanVolumeDb > INSTANT_START_THRESHOLD_DB;
  const lowerName = filename.toLowerCase();
  const isNews = NEWS_KEYWORDS.some((kw) => lowerName.includes(kw));

  return { path: filePath, filename, duration, meanVolumeDb, instantStart, isNews };
}

/**
 * FNV-1a hash → unsigned 32-bit. Better distribution than djb2 for short strings.
 * Same input always produces same output → deterministic BGM per pipeline.
 */
function hashStr(s) {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  return h >>> 0;
}

/**
 * Scan the BGM directory and return metadata for all .mp3 files.
 * @returns {Array<{ path: string, filename: string, duration: number, meanVolumeDb: number, instantStart: boolean, isNews: boolean }>}
 */
export function scanBGMPool() {
  if (!existsSync(BGM_DIR)) return [];

  const files = readdirSync(BGM_DIR).filter((f) => f.endsWith(".mp3"));
  const pool = [];

  for (const f of files) {
    const meta = analyzeBGM(join(BGM_DIR, f));
    if (meta) pool.push(meta);
  }

  return pool;
}

/**
 * Select a BGM file by filtering the pool and picking deterministically.
 *
 * Filter chain:
 *   1. instantStart = true (audible in first 0.5s)
 *   2. isNews = true (filename contains news/breaking/urgent)
 *   Fallback: if no news-themed instant-start BGM, use all instant-start BGMs.
 *
 * Selection: hash(pipelineId) % pool.length → same content always gets same BGM.
 *
 * @param {string} pipelineId - for deterministic selection
 * @param {string|null} override - explicit file path from --bgm-file flag
 * @returns {string|null} absolute path to BGM file, or null if not found
 */
export function selectBGM(pipelineId, override = null) {
  // ── Manual override ──
  if (override) {
    const abs = resolve(override);
    if (existsSync(abs)) return abs;
    const rel = join(BGM_DIR, override);
    if (existsSync(rel)) return rel;
    console.warn(`  ⚠️  BGM file not found: ${override}`);
    return null;
  }

  // ── Scan & filter ──
  const all = scanBGMPool();
  if (all.length === 0) {
    console.warn("  ⚠️  No BGM files found in assets/bgm/");
    return null;
  }

  // Log pool for transparency
  console.log("  BGM pool (all):");
  for (const b of all) {
    const tag = b.instantStart ? "✅ instant" : "❌ slow-start";
    const news = b.isNews ? "+news" : "";
    console.log(
      `    ${b.filename} | ${b.duration.toFixed(1)}s | ${b.meanVolumeDb.toFixed(1)}dB | ${tag} ${news}`,
    );
  }

  // Filter: instant-start + news-themed
  let candidates = all.filter((b) => b.instantStart && b.isNews);

  // Fallback: instant-start only (if no news-themed ones pass)
  if (candidates.length === 0) {
    console.warn("  ⚠️  No instant-start + news BGM found — falling back to instant-start only");
    candidates = all.filter((b) => b.instantStart);
  }

  // Last resort: any file
  if (candidates.length === 0) {
    console.warn("  ⚠️  No instant-start BGM found — using all files");
    candidates = all;
  }

  // ── Deterministic pick ──
  const idx = hashStr(pipelineId) % candidates.length;
  const chosen = candidates[idx];
  console.log(`  → Selected: ${chosen.filename} (idx ${idx}/${candidates.length})`);

  return chosen.path;
}
