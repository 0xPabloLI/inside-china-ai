/**
 * Download Candidate — Unified download helper for asset-sourcer.
 *
 * Wraps VDL `downloadVideo()` with file I/O, path conversion, and
 * DownloadResult status mapping. Called by asset-sourcer.mjs's 5
 * download loops (Phase 0, API, yt-dlp, CDP, Tier 3).
 *
 * Responsibilities:
 *   1. File existence check (existsSync → skip)
 *   2. Call VDL downloadVideo() to get DownloadResult
 *   3. Map DownloadResult status → { success, path?, error?, skipped? }
 *   4. Write buffer to destPath when downloaded
 *   5. Convert destPath to relative path for scene-data
 *
 * Not responsible for:
 *   - URL dedup (caller manages downloadedUrls Set)
 *   - Pre-filter (caller manages preFilterCandidate)
 *   - Push allAssets / failed (caller manages arrays)
 *   - Wikimedia license fetch (caller post-processes)
 *   - Text-only handling (caller pre-filters)
 *
 * @module download-candidate
 */

import { existsSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { downloadVideo } from "./video-downloaders.mjs";

/**
 * Download a candidate asset via VDL and write to disk.
 *
 * @param {Object} candidate - { url, type, source, ... }
 * @param {Object} opts
 * @param {string} opts.destPath - Absolute destination file path
 * @param {string} opts.contentDir - Absolute content directory (for relative path conversion)
 * @param {Object} [opts.headers] - Optional HTTP headers (passed to VDL DirectHttp adapter)
 * @param {typeof fetch} [opts.fetchFn] - Injectable fetch for testing
 * @param {Object} [opts.cobaltAdapter] - Injectable Cobalt adapter for testing
 * @param {Function} [opts.downloadFn] - Injectable download function (overrides VDL, for testing)
 * @returns {Promise<{success: boolean, path?: string, error?: string, skipped?: boolean}>}
 */
export async function downloadCandidate(candidate, opts = {}) {
  const { destPath, contentDir } = opts;

  // Guard: missing required fields
  if (!destPath || !contentDir) {
    return { success: false, error: "missing-destpath-or-contentdir" };
  }

  // 1. File existence check — skip if already downloaded
  if (existsSync(destPath)) {
    return {
      success: true,
      path: destPath.replace(contentDir + "/", ""),
      skipped: true,
    };
  }

  // 2. Call VDL downloadVideo() (or injected downloadFn for testing)
  const vdlOpts = {};
  if (opts.headers) vdlOpts.headers = opts.headers;
  if (opts.fetchFn) vdlOpts.fetchFn = opts.fetchFn;
  if (opts.cobaltAdapter) vdlOpts.cobaltAdapter = opts.cobaltAdapter;
  if (opts.skipCobaltPreflight) vdlOpts.skipCobaltPreflight = true;

  const downloadFn = opts.downloadFn || downloadVideo;
  const result = await downloadFn(candidate.url, vdlOpts);

  // 3. Map DownloadResult status → downloadCandidate return value
  switch (result.status) {
    case "downloaded": {
      // 4. Write buffer to destPath
      if (!result.buffer) {
        return { success: false, error: "no-buffer" };
      }

      try {
        // Ensure parent directory exists
        const dir = dirname(destPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        writeFileSync(destPath, result.buffer);

        // 5. Return relative path
        return {
          success: true,
          path: destPath.replace(contentDir + "/", ""),
          skipped: false,
        };
      } catch (e) {
        return { success: false, error: e.message?.substring(0, 200) || "write-failed" };
      }
    }

    case "skipped":
      return {
        success: false,
        error: result.reason || "skipped",
        skipped: true,
      };

    case "unsupported":
      return {
        success: false,
        error: result.reason || "unsupported",
        skipped: true,
      };

    case "needs-selection":
      return {
        success: false,
        error: "needs-selection",
      };

    case "failed":
      return {
        success: false,
        error: result.reason || "download-failed",
      };

    default:
      return {
        success: false,
        error: `unknown-status:${result.status}`,
      };
  }
}
