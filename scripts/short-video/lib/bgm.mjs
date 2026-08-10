/**
 * BGM selection module — picks a royalty-free background music file.
 *
 * BGM files live in assets/bgm/.  The default track is cinematic-news-yt.mp3
 * (royalty-free, 74s, "breaking news" vibe).  Use --bgm-file <path> to override.
 *
 * BGM is mixed at 12% volume, starts immediately (0.1s fade-in, not 2s) so the
 * Hook scene has BGM impact from frame 1, and auto-loops to cover any video
 * length (handled by assemble.mjs via -stream_loop -1).
 */

import { existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BGM_DIR = join(__dirname, "..", "assets", "bgm");

// Default BGM: cinematic news theme (royalty-free, YouTube, 74s)
const DEFAULT_BGM = "cinematic-news-yt.mp3";

/**
 * Select a BGM file path.
 *
 * @param {string|null} override - explicit file path from --bgm-file flag
 * @returns {string|null} absolute path to BGM file, or null if not found
 */
export function selectBGM(override = null) {
  if (override) {
    // Try as absolute path first, then relative to project root
    const abs = resolve(override);
    if (existsSync(abs)) return abs;

    // Try relative to BGM dir (e.g. --bgm-file news-theme-yt.mp3)
    const rel = join(BGM_DIR, override);
    if (existsSync(rel)) return rel;

    console.warn(`  ⚠️  BGM file not found: ${override}`);
    return null;
  }

  // Default BGM
  const defaultPath = join(BGM_DIR, DEFAULT_BGM);
  if (existsSync(defaultPath)) return defaultPath;

  console.warn(`  ⚠️  Default BGM not found: ${defaultPath}`);
  return null;
}
