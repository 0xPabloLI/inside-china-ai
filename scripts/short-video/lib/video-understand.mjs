/**
 * Video Understanding Pipeline — download → transcribe → VLM analyze.
 *
 * Given an arbitrary video URL (TikTok/YouTube/Bilibili), extracts transcript
 * (whisper.cpp ASR) and visual understanding (Qwen3-VL via visual-analyzer.mjs),
 * returning a structured JSON result.
 *
 * API:
 *   detectPlatform(url)         → "tiktok" | "youtube" | "bilibili"
 *   parseVideoMeta(url, plat)   → { platform, videoId, author, title }
 *   parseWhisperOutput(json)    → { segments, fullText }
 *   downloadVideo(url, opts)    → { videoPath, platform, videoId, author }
 *   transcribeVideo(path, opts) → { segments, fullText } | null
 *   understandVideo(url, opts)  → { url, platform, author, title, duration,
 *                                    transcript, visualAnalysis, summary, status }
 *
 * Graceful degradation:
 *   - Download fails → throws (cannot continue)
 *   - whisper-cli unavailable → transcript: null + warning
 *   - VLM unavailable → visualAnalysis: DEGRADED_RESULT (existing behavior)
 *   - Both fail → status: "degraded"
 *
 * @module video-understand
 */

import { exec } from "child_process";
import { existsSync, writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Constants ───

const HOME = process.env.HOME || "/Users/pabloli";
const WHISPER_CLI = "/opt/homebrew/bin/whisper-cli";
const WHISPER_MODEL = join(HOME, ".cache/whisper/ggml-large-v3-turbo.bin");
const FFMPEG_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
const YTDLP = "/opt/homebrew/bin/yt-dlp";
const CDP_BASE = "http://localhost:3456";

// ─── URL Parsing & Platform Detection ───

/**
 * Detect the video platform from a URL.
 *
 * @param {string} url - Video URL
 * @returns {"tiktok" | "youtube" | "bilibili"}
 * @throws {Error} If platform cannot be detected
 */
export function detectPlatform(url) {
  if (!url || typeof url !== "string") {
    throw new Error(`Unsupported platform: ${url}`);
  }

  const lower = url.toLowerCase();

  if (
    lower.includes("tiktok.com") ||
    lower.includes("vt.tiktok.com") ||
    lower.includes("vm.tiktok.com")
  ) {
    return "tiktok";
  }

  if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
    return "youtube";
  }

  if (lower.includes("bilibili.com")) {
    return "bilibili";
  }

  throw new Error(`Unsupported platform: ${url}`);
}

/**
 * Parse video metadata (videoId, author) from a URL.
 *
 * For TikTok short URLs (vt.tiktok.com/xxx), the URL should already be
 * resolved to a full URL via fetch redirect following before calling this.
 *
 * @param {string} url - Full video URL
 * @param {"tiktok" | "youtube" | "bilibili"} platform - Platform from detectPlatform
 * @returns {{platform: string, videoId: string, author: string | null, title: null}}
 */
export function parseVideoMeta(url, platform) {
  const meta = {
    platform,
    videoId: null,
    author: null,
    title: null,
  };

  if (platform === "tiktok") {
    // Match: tiktok.com/@username/video/123456
    const match = url.match(/tiktok\.com\/@([^/]+)\/video\/(\d+)/);
    if (match) {
      meta.author = match[1];
      meta.videoId = match[2];
    }
  } else if (platform === "youtube") {
    // Match: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID
    const watchMatch = url.match(/[?&]v=([^&]+)/);
    const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
    const shortsMatch = url.match(/youtube\.com\/shorts\/([^?&]+)/);

    meta.videoId =
      (watchMatch && watchMatch[1]) ||
      (shortMatch && shortMatch[1]) ||
      (shortsMatch && shortsMatch[1]) ||
      null;
  } else if (platform === "bilibili") {
    // Match: bilibili.com/video/BVxxx
    const match = url.match(/bilibili\.com\/video\/(BV\w+)/);
    if (match) {
      meta.videoId = match[1];
    }
  }

  return meta;
}

/**
 * Resolve a TikTok short URL to a full URL via fetch redirect following.
 *
 * @param {string} shortUrl - e.g. https://vt.tiktok.com/ZSVAVk4n1
 * @returns {Promise<string>} Full URL e.g. https://www.tiktok.com/@user/video/123
 */
async function resolveTikTokShortUrl(shortUrl) {
  const resp = await fetch(shortUrl, { redirect: "follow" });
  return resp.url;
}

// ─── Whisper Output Parsing ───

/**
 * Parse whisper-cli JSON output into a transcript structure.
 *
 * whisper-cli `-oj` produces:
 * { "transcription": [
 *   { "timestamps": {"from":"00:00:00,000","to":"00:00:02,500"},
 *     "offsets": {"from":0,"to":2500},
 *     "text":" Hello world" }
 * ] }
 *
 * @param {string} jsonStr - Raw JSON string from whisper-cli
 * @returns {{segments: Array<{start: number, end: number, text: string}>, fullText: string}}
 */
export function parseWhisperOutput(jsonStr) {
  if (!jsonStr) {
    return { segments: [], fullText: "" };
  }

  try {
    const data = JSON.parse(jsonStr);
    if (!data.transcription || !Array.isArray(data.transcription)) {
      return { segments: [], fullText: "" };
    }

    const segments = data.transcription.map((seg) => ({
      start: seg.offsets?.from ?? 0,
      end: seg.offsets?.to ?? 0,
      text: (seg.text || "").trim(),
    }));

    const fullText = segments
      .map((s) => s.text)
      .filter(Boolean)
      .join(" ");

    return { segments, fullText };
  } catch {
    return { segments: [], fullText: "" };
  }
}

// ─── Video Download ───

/**
 * Download a video from YouTube, Bilibili, or TikTok.
 *
 * YouTube/Bilibili use yt-dlp. TikTok uses CDP `item/detail` API.
 *
 * @param {string} url - Video URL
 * @param {{outputDir?: string}} [options]
 * @returns {Promise<{videoPath: string, platform: string, videoId: string, author: string|null}>}
 * @throws {Error} If download fails or platform is unsupported
 */
export async function downloadVideo(url, options = {}) {
  const outputDir = options.outputDir || "/tmp";
  mkdirSync(outputDir, { recursive: true });

  const platform = detectPlatform(url);

  // Resolve TikTok short URL
  let fullUrl = url;
  if (platform === "tiktok" && url.includes("vt.tiktok.com")) {
    fullUrl = await resolveTikTokShortUrl(url);
  }

  const meta = parseVideoMeta(fullUrl, platform);

  if (platform === "youtube" || platform === "bilibili") {
    const videoPath = join(outputDir, `${platform}-${meta.videoId}.mp4`);
    const cmd = buildYtdlpCommand(fullUrl, videoPath, platform);
    try {
      await execAsync(cmd);
    } catch (err) {
      throw new Error(`Download failed: ${err.message}`);
    }
    return { videoPath, ...meta };
  }

  if (platform === "tiktok") {
    const videoPath = join(outputDir, `tiktok-${meta.videoId}.mp4`);
    await downloadTikTokVideo(fullUrl, meta.videoId, videoPath);
    return { videoPath, ...meta };
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

/**
 * Build yt-dlp command string for YouTube/Bilibili.
 *
 * @param {string} url - Full URL
 * @param {string} output - Output file path
 * @param {string} platform - "youtube" or "bilibili"
 * @returns {string}
 */
function buildYtdlpCommand(url, output, platform) {
  const parts = [`"${YTDLP}"`];

  if (platform === "youtube") {
    parts.push("--cookies-from-browser chrome");
    parts.push("--remote-components ejs:github");
  }

  parts.push("-o", `"${output}"`);
  parts.push(`"${url}"`);

  return parts.join(" ");
}

/**
 * Download a TikTok video via CDP `item/detail` API.
 *
 * Flow:
 * 1. Open TikTok page in browser (CDP new tab)
 * 2. Call `/aweme/v1/web/item/detail/?itemId=ID&aid=1988` via CDP eval
 * 3. Extract `playAddr` from response
 * 4. Download video via base64 chunking
 * 5. Close tab
 *
 * @param {string} fullUrl - Full TikTok URL
 * @param {string} itemId - TikTok video ID
 * @param {string} output - Output file path
 */
async function downloadTikTokVideo(fullUrl, itemId, output) {
  // Dynamic import to avoid hard dependency when CDP not needed
  const { cdpNewTab, cdpEval, cdpCloseTab, waitForPageLoad } = await import("./cdp-client.mjs");

  // Check CDP availability
  try {
    const resp = await fetch(`${CDP_BASE}/targets`);
    if (!resp.ok) throw new Error("CDP proxy not responding");
  } catch {
    throw new Error(
      `CDP proxy not available at ${CDP_BASE}. Start Chrome with --remote-debugging-port and the web-access skill.`,
    );
  }

  let tabId;
  try {
    tabId = await cdpNewTab(fullUrl);
    await new Promise((r) => setTimeout(r, 3000));
    await waitForPageLoad(tabId);

    // Step 1: Call item/detail API to get playAddr
    const detailScript = `
      const resp = await fetch(
        'https://www.tiktok.com/aweme/v1/web/item/detail/?itemId=${itemId}&aid=1988',
        { credentials: 'include' }
      );
      const data = await resp.json();
      const playAddr = data?.itemInfo?.item?.video?.playAddr;
      return playAddr || null;
    `;
    const playAddrResp = await cdpEval(tabId, `(async function(){${detailScript}})()`);
    const playAddr = playAddrResp?.result?.value || playAddrResp?.value || null;

    if (!playAddr) {
      throw new Error("TikTok API returned no playAddr");
    }

    // Step 2: Download video via base64 chunking
    // The video blob (5-10MB) is too large for a single CDP eval response.
    // Strategy: fetch in browser → blob → slice → readAsDataURL → return chunks
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB

    // First, get the total size
    const sizeScript = `
      const blob = await fetch(${JSON.stringify(playAddr)}, { credentials: 'include' }).then(r => r.blob());
      return blob.size;
    `;
    const sizeResp = await cdpEval(tabId, `(async function(){${sizeScript}})()`);
    const totalSize = sizeResp?.result?.value || sizeResp?.value || 0;

    if (totalSize === 0) {
      throw new Error("TikTok video download: blob size is 0");
    }

    // Download in chunks
    const chunks = [];
    let offset = 0;
    let chunkIndex = 0;

    while (offset < totalSize) {
      const end = Math.min(offset + CHUNK_SIZE, totalSize);
      const chunkScript = `
        const blob = await fetch(${JSON.stringify(playAddr)}, { credentials: 'include' }).then(r => r.blob());
        const slice = blob.slice(${offset}, ${end});
        const reader = new FileReader();
        return new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(slice);
        });
      `;
      const chunkResp = await cdpEval(tabId, `(async function(){${chunkScript}})()`);
      const dataUrl = chunkResp?.result?.value || chunkResp?.value || null;

      if (!dataUrl || typeof dataUrl !== "string") {
        throw new Error(`TikTok download: chunk ${chunkIndex} failed`);
      }

      // Strip "data:application/octet-stream;base64," prefix
      const base64 = dataUrl.split(",")[1] || dataUrl;
      chunks.push(Buffer.from(base64, "base64"));
      offset = end;
      chunkIndex++;
    }

    // Write to file
    const fullBuffer = Buffer.concat(chunks);
    writeFileSync(output, fullBuffer);
  } finally {
    if (tabId) {
      await cdpCloseTab(tabId);
    }
  }
}

// ─── Audio Extraction & ASR ───

/**
 * Transcribe a video file using ffmpeg + whisper-cli.
 *
 * @param {string} videoPath - Path to the video file
 * @param {{outputDir?: string}} [options]
 * @returns {Promise<{segments: Array, fullText: string} | null>} Transcript or null on failure
 */
export async function transcribeVideo(videoPath, options = {}) {
  if (!existsSync(videoPath)) {
    console.warn(`  [video-understand] Video file not found: ${videoPath}`);
    return null;
  }

  const outputDir = options.outputDir || dirname(videoPath);
  const audioPath = join(outputDir, "audio.wav");
  const whisperPrefix = join(outputDir, "transcript");

  // Step 1: Extract audio (16kHz mono WAV for whisper.cpp)
  try {
    const ffmpegCmd = `"${FFMPEG_FULL}" -y -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" 2>/dev/null`;
    await execAsync(ffmpegCmd);
  } catch (err) {
    console.warn(`  [video-understand] Audio extraction failed: ${err.message}`);
    return null;
  }

  // Check whisper-cli availability
  if (!existsSync(WHISPER_CLI)) {
    console.warn(`  [video-understand] whisper-cli not found at ${WHISPER_CLI}`);
    return null;
  }

  if (!existsSync(WHISPER_MODEL)) {
    console.warn(`  [video-understand] Whisper model not found at ${WHISPER_MODEL}`);
    return null;
  }

  // Step 2: Run whisper-cli ASR
  try {
    const whisperCmd = `"${WHISPER_CLI}" -m "${WHISPER_MODEL}" -f "${audioPath}" -t 8 -fa -oj -of "${whisperPrefix}"`;
    await execAsync(whisperCmd);
  } catch (err) {
    console.warn(`  [video-understand] ASR failed: ${err.message}`);
    return null;
  }

  // Step 3: Parse whisper JSON output
  const whisperJsonPath = `${whisperPrefix}.json`;
  if (!existsSync(whisperJsonPath)) {
    console.warn(`  [video-understand] Whisper output not found: ${whisperJsonPath}`);
    return null;
  }

  const jsonStr = readFileSync(whisperJsonPath, "utf8");
  return parseWhisperOutput(jsonStr);
}

// ─── Full Pipeline ───

/**
 * Understand a video: download → transcribe → VLM analyze.
 *
 * @param {string} url - Video URL (TikTok/YouTube/Bilibili)
 * @param {{transcript?: boolean, visual?: boolean, outputDir?: string, writeFile?: boolean}} [options]
 * @returns {Promise<{url: string, platform: string, author: string|null, title: null, duration: null, transcript: object|null, visualAnalysis: object|null, summary: null, status: string}>}
 */
export async function understandVideo(url, options = {}) {
  const opts = {
    transcript: options.transcript ?? true,
    visual: options.visual ?? true,
    outputDir: options.outputDir || "/tmp",
    writeFile: options.writeFile ?? true,
  };

  const result = {
    url,
    platform: null,
    author: null,
    title: null,
    duration: null,
    transcript: null,
    visualAnalysis: null,
    summary: null,
    status: "ok",
  };

  // Step 1: Detect platform
  try {
    result.platform = detectPlatform(url);
  } catch (err) {
    result.status = "error";
    result.platform = "unknown";
    return result;
  }

  // Step 2: Download video
  let downloadResult;
  try {
    downloadResult = await downloadVideo(url, { outputDir: opts.outputDir });
  } catch (err) {
    result.status = "error";
    return result;
  }

  result.author = downloadResult.author;
  result.videoId = downloadResult.videoId;

  // Step 3: Transcribe (if requested)
  let videoPath = downloadResult.videoPath;

  if (opts.transcript) {
    try {
      result.transcript = await transcribeVideo(videoPath, {
        outputDir: opts.outputDir,
      });
      if (result.transcript === null) {
        result.status = "degraded";
      }
    } catch (err) {
      result.status = "degraded";
    }
  }

  // Step 4: VLM analysis (if requested)
  if (opts.visual) {
    try {
      const { analyzeAssetSemantics, closeVisualAnalyzer } = await import("./visual-analyzer.mjs");
      result.visualAnalysis = await analyzeAssetSemantics(videoPath);
      await closeVisualAnalyzer();
    } catch (err) {
      result.visualAnalysis = null;
      result.status = result.status === "ok" ? "degraded" : result.status;
    }
  }

  // Step 5: Write output file
  if (opts.writeFile && opts.outputDir) {
    try {
      mkdirSync(opts.outputDir, { recursive: true });
      const outputPath = join(
        opts.outputDir,
        `${result.platform}-${downloadResult.videoId}-understanding.json`,
      );
      writeFileSync(outputPath, JSON.stringify(result, null, 2));
    } catch (err) {
      // File write failure is non-fatal
      console.warn(`  [video-understand] Failed to write output: ${err.message}`);
    }
  }

  return result;
}
