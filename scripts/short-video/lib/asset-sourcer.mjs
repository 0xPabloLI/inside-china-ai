/**
 * Asset Sourcer — Automated media asset search & download.
 *
 * Standalone tool: node scripts/short-video/lib/asset-sourcer.mjs --content <slug>
 *
 * Searches multiple sources (API + CDP + yt-dlp) for images/videos matching
 * scene-data keywords, scores candidates, downloads top matches, and outputs
 * a JSON report with recommended scene assignments.
 *
 * Does NOT auto-modify scene-data — the user reviews the report and manually
 * fills the `media` field in scenes.mjs.
 *
 * @module asset-sourcer
 */

import { existsSync, writeFileSync, mkdirSync, statSync, readFileSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { execSync } from "child_process";

// ─── Constants ───

/** Known AI company names for voiceover keyword extraction. */
const KNOWN_COMPANIES = [
  "DeepSeek",
  "Unitree",
  "Alibaba",
  "Baidu",
  "Tencent",
  "ByteDance",
  "Huawei",
  "Xiaomi",
  "Qwen",
  "Doubao",
  "Kimi",
  "Moonshot",
  "Zhipu",
  "MiniMax",
  "SenseTime",
  "iFlytek",
  "Cambricon",
  "Horizon Robotics",
  "UBTECH",
  "Agibot",
  "Xiaomi",
  "Nio",
  "Li Auto",
  "XPeng",
  "Bilibili",
  "Douyin",
  "WeChat",
  "DingTalk",
  "Feishu",
];

/** Scene types that should NOT have media assigned. */
const NO_MEDIA_TYPES = new Set(["hook", "cta", "data", "stat-reveal"]);

// ─── Pure functions ───

/**
 * Extract keywords from scene-data, CLI args, or voiceover text.
 * 3-tier fallback: meta.keyEntities → CLI keywords → voiceover extraction.
 *
 * @param {Array} scenes - Scene data array
 * @param {Object|null} meta - Metadata object with keyEntities
 * @param {string[]|null} cliKeywords - CLI-provided keywords
 * @returns {string[]} Deduplicated keyword array
 */
export function extractKeywords(scenes, meta, cliKeywords) {
  const keywords = [];

  // Tier 1: meta.keyEntities.companies
  if (meta?.keyEntities?.companies && Array.isArray(meta.keyEntities.companies)) {
    keywords.push(...meta.keyEntities.companies);
  }

  // Tier 2: CLI keywords
  if (cliKeywords && Array.isArray(cliKeywords)) {
    keywords.push(...cliKeywords);
  }

  // Tier 3: Extract known company names from voiceover text
  if (keywords.length === 0 && scenes && Array.isArray(scenes)) {
    for (const scene of scenes) {
      const vo = scene?.voiceover || "";
      for (const company of KNOWN_COMPANIES) {
        if (vo.toLowerCase().includes(company.toLowerCase()) && !keywords.includes(company)) {
          keywords.push(company);
        }
      }
    }
  }

  // Deduplicate (case-insensitive, keep first occurrence's casing)
  const seen = new Set();
  const deduped = [];
  for (const kw of keywords) {
    const lower = kw.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      deduped.push(kw);
    }
  }

  return deduped;
}

/**
 * Score a candidate asset (0-100).
 *
 * Score = keyword match (0-40) + duration fitness (0-25) + size fitness (0-20)
 *         + resolution bonus (0-15) + content match (0-30, from aiDescription)
 *
 * When aiDescription is absent or empty, behaves identically to the original
 * implementation (backward compatible).
 *
 * @param {Object} candidate - { title, type, duration?, fileSize?, resolution? }
 * @param {string} keyword - Search keyword
 * @param {string} [aiDescription] - Optional VLM-generated content description
 * @returns {number} Score 0-100
 */
export function scoreCandidate(candidate, keyword, aiDescription) {
  let score = 0;

  // Keyword match in title (0-40)
  const title = (candidate.title || "").toLowerCase();
  const kw = keyword.toLowerCase();
  if (title.includes(kw)) {
    score += 40; // exact keyword in title
  } else if (kw.length > 3 && title.includes(kw.substring(0, Math.min(kw.length, 5)))) {
    score += 20; // partial match
  }

  // Duration fitness (0-25)
  if (candidate.type === "image") {
    score += 20; // images get fixed 20
  } else if (typeof candidate.duration === "number") {
    if (candidate.duration >= 3 && candidate.duration <= 8) {
      score += 25;
    } else if (candidate.duration > 8 && candidate.duration <= 15) {
      score += 15;
    } else if (candidate.duration > 60) {
      score += 5;
    } else {
      score += 5; // <3s
    }
  } else {
    score += 5; // unknown duration
  }

  // File size fitness (0-20)
  const size = candidate.fileSize;
  if (typeof size === "number") {
    if (candidate.type === "image") {
      if (size < 5_000_000) score += 20;
      else if (size < 10_000_000) score += 10;
    } else {
      if (size < 20_000_000) score += 20;
      else if (size < 50_000_000) score += 10;
    }
  }

  // Resolution bonus (0-15)
  const res = candidate.resolution;
  if (res) {
    if (res.includes("1080") || res.includes("4k") || res.includes("2160")) {
      score += 15;
    } else if (res.includes("720")) {
      score += 10;
    } else {
      score += 5;
    }
  }

  // Content match from AI description (0-30)
  // When aiDescription is present, compute token overlap with keyword.
  // Simple token overlap: lowercase both, split into words, count matches.
  if (aiDescription && typeof aiDescription === "string" && aiDescription.trim()) {
    const descTokens = new Set(
      aiDescription
        .toLowerCase()
        .split(/[\s,.!?;:()'"/]+/)
        .filter((t) => t.length > 2),
    );
    // Also tokenize the keyword (may be multi-word like "Unitree H1")
    const kwTokens = keyword
      .toLowerCase()
      .split(/[\s]+/)
      .filter((t) => t.length > 2);

    // Count how many keyword tokens appear in the description
    let matchCount = 0;
    for (const kwt of kwTokens) {
      if (descTokens.has(kwt)) matchCount++;
    }

    // Also check if the full keyword string appears in the description
    const descLower = aiDescription.toLowerCase();
    const kwLower = keyword.toLowerCase();
    const fullMatch = descLower.includes(kwLower);

    // Score: full keyword match → 20, per-token match → 10 each, capped at 30
    let contentScore = 0;
    if (fullMatch) contentScore += 20;
    contentScore += matchCount * 10;
    contentScore = Math.min(contentScore, 30);
    score += contentScore;
  }

  return Math.min(score, 100);
}

/**
 * Recommend a scene for an asset based on visualType.
 *
 * @param {Object} asset - { type }
 * @param {Array} scenes - Scene data array
 * @returns {{ sceneId: number, animation: string, overlay: number } | null}
 */
export function recommendScene(asset, scenes) {
  // Find the first scene that can use media
  for (const scene of scenes) {
    const vt = scene.visualType;
    if (NO_MEDIA_TYPES.has(vt)) continue;
    // Skip scenes that already have media assigned
    if (scene.media) continue;

    if (vt === "narrative") {
      return {
        sceneId: scene.id,
        animation: asset.type === "video" ? "zoom" : "fade",
        overlay: 0.7,
      };
    }
    if (vt === "info-card") {
      return {
        sceneId: scene.id,
        animation: asset.type === "image" ? "ken-burns" : "fade",
        overlay: 0.75,
      };
    }
    if (vt === "quote") {
      return {
        sceneId: scene.id,
        animation: "fade",
        overlay: 0.8,
      };
    }
  }
  return null;
}

/**
 * Volume recommendation per visualType + media type.
 * Based on §4.6 research: product demos louder, narrated clips quieter.
 */
const VOLUME_RECOMMENDATIONS = {
  narrative: { video: 0.1 }, // product demo — motor sounds add realism
  quote: { video: 0.04 }, // text focus — minimize competing audio
  "info-card": { video: 0.08 }, // default level
  // image: no volume (images have no audio)
};

/**
 * Batch-assign downloaded assets to scenes using greedy matching.
 *
 * Assets are sorted by score descending. Each asset is assigned to the
 * first available scene (no existing media, visualType not in NO_MEDIA_TYPES).
 * Deduplicates by asset path — same file won't be assigned twice.
 *
 * Assets that can't be assigned (no available scene, no path, duplicate path)
 * are included in the result with status: "unassigned".
 *
 * @param {Array} assets - Downloaded assets (each must have score, type, path)
 * @param {Array} scenes - Scene data array
 * @returns {Array<{ sceneId?: number, sceneName?: string, visualType?: string,
 *   media?: Object, assetScore: number, source: string, attribution?: Object,
 *   status: "assigned" | "unassigned" }>}
 */
export function assignAssetsToScenes(assets, scenes) {
  if (!assets || assets.length === 0) return [];

  // Sort assets by score descending (greedy: highest score gets first pick)
  const sorted = [...assets].sort((a, b) => (b.score || 0) - (a.score || 0));

  // Track assigned scene IDs and asset paths
  const assignedSceneIds = new Set();
  const assignedPaths = new Set();
  const result = [];

  for (const asset of sorted) {
    // Skip assets without a path (can't assign without knowing file location)
    if (!asset.path) {
      result.push({
        assetScore: asset.score || 0,
        source: asset.source || asset.from || "unknown",
        attribution: asset.attribution || null,
        status: "unassigned",
      });
      continue;
    }

    // Skip duplicate paths (first occurrence already assigned)
    if (assignedPaths.has(asset.path)) {
      result.push({
        assetScore: asset.score || 0,
        source: asset.source || asset.from || "unknown",
        attribution: asset.attribution || null,
        status: "unassigned",
      });
      continue;
    }

    // Find first available scene
    let assigned = false;
    for (const scene of scenes) {
      if (assignedSceneIds.has(scene.id)) continue;
      if (NO_MEDIA_TYPES.has(scene.visualType)) continue;
      if (scene.media) continue;

      // Assign this asset to this scene
      const vt = scene.visualType;
      const isVideo = asset.type === "video";

      // Determine animation
      let animation;
      if (vt === "narrative") {
        animation = isVideo ? "zoom" : "fade";
      } else if (vt === "info-card") {
        animation = asset.type === "image" ? "ken-burns" : "fade";
      } else if (vt === "quote") {
        animation = "fade";
      } else {
        animation = "fade";
      }

      // Determine overlay
      let overlay;
      if (vt === "quote") {
        overlay = 0.8;
      } else if (vt === "info-card") {
        overlay = 0.75;
      } else {
        overlay = 0.7;
      }

      // Determine volume (only for video)
      const volRec = VOLUME_RECOMMENDATIONS[vt];
      const volume = isVideo && volRec ? volRec.video : undefined;

// Build media object
const media = {
type: asset.type,
path: asset.path,
source: asset.source || asset.from || undefined,
animation,
overlay,
};
// Include VLM-analyzed fit/focus when available
if (asset.aiFit) {
media.fit = asset.aiFit;
}
if (asset.aiFocus) {
media.focus = asset.aiFocus;
}
if (volume !== undefined) {
media.volume = volume;
}

      result.push({
        sceneId: scene.id,
        sceneName: scene.name,
        visualType: vt,
        media,
        assetScore: asset.score || 0,
        source: asset.source || asset.from || "unknown",
        attribution: asset.attribution || null,
        status: "assigned",
      });

      assignedSceneIds.add(scene.id);
      assignedPaths.add(asset.path);
      assigned = true;
      break;
    }

    if (!assigned) {
      result.push({
        assetScore: asset.score || 0,
        source: asset.source || asset.from || "unknown",
        attribution: asset.attribution || null,
        status: "unassigned",
      });
    }
  }

  return result;
}

/**
 * Convert a keyword to a filename-safe slug.
 *
 * @param {string} keyword
 * @returns {string} Slugified keyword
 */
export function slugifyKeyword(keyword) {
  if (!keyword) return "";
  // Remove possessive apostrophes, then remove non-alphanumeric/CJK chars
  return keyword
    .replace(/['']/g, "")
    .replace(/[^\w\u4e00-\u9fff\u3040-\u30ff]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/**
 * Build a filename from source, keyword, index, and extension.
 *
 * @param {string} source - Source name (e.g., "ithome")
 * @param {string} keyword - Search keyword
 * @param {number} index - Asset index (1-based)
 * @param {string} ext - File extension without dot (e.g., "jpg")
 * @returns {string} Filename like "ithome-unitree-01.jpg"
 */
export function buildFilename(source, keyword, index, ext) {
  const slug = slugifyKeyword(keyword);
  const paddedIndex = String(index).padStart(2, "0");
  return `${source}-${slug}-${paddedIndex}.${ext}`;
}

/**
 * Build the JSON report structure.
 *
 * @param {string} content - Content slug
 * @param {string[]} keywords - Searched keywords
 * @param {Array} assets - Downloaded assets
 * @param {Array} failed - Failed sources
 * @param {Array} skipped - Skipped sources
 * @param {Object} [extra] - Optional extra fields (e.g., { aiAnalysis })
 * @returns {Object} Report object
 */
export function buildReport(content, keywords, assets, failed, skipped, extra = {}) {
  const report = {
    searchedAt: new Date().toISOString(),
    content,
    keywords,
    totalAssets: assets.length,
    assets,
    failed,
    skipped,
  };
  if (extra.aiAnalysis) {
    report.aiAnalysis = extra.aiAnalysis;
  }
  return report;
}

// ─── AI Analysis integration ───

/**
 * Analyze downloaded assets using the VLM AI analyzer.
 *
 * For each asset with a path, calls describeImage or describeVideo based
 * on asset type. Stores the result in asset.aiDescription. Returns a
 * report array with per-asset analysis data.
 *
 * When VLM is unavailable, logs warning and returns empty descriptions.
 * Does NOT call closeVisualAnalyzer() — the caller is responsible for closing
 * the VLM process after all analysis phases (including assignAssetsToScenes)
 * are complete. This keeps the 11GB model resident across phases.
 *
 * For landscape assets (aspect > 1.2), also calls analyzeFit() to determine
 * how to place the asset in a 9:16 vertical canvas.
 *
 * @param {Array} assets - Downloaded assets (each must have path and type)
 * @returns {Promise<Array<{path: string, description: string, success: boolean, analysisTimeMs: number}>>}
 */
export async function analyzeAssets(assets) {
  const { describeImage, describeVideo, analyzeFit } = await import("./visual-analyzer.mjs");
  const { checkResolution } = await import("./upscale.mjs");

  const report = [];

  try {
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const absPath = asset.path || "";

      if (!absPath) {
        report.push({
          path: "",
          description: "",
          success: false,
          analysisTimeMs: 0,
        });
        continue;
      }

      const startTime = Date.now();
      console.log(`  🔍 Analyzing: ${absPath}... (${i + 1}/${assets.length})`);

      let description = "";
      let success = false;

      try {
        if (asset.type === "video") {
          description = await describeVideo(absPath);
        } else {
          description = await describeImage(absPath);
        }
        success = description.length > 0;
      } catch (err) {
        console.warn(`  ⚠️  Analysis failed for ${absPath}: ${err.message}`);
        description = "";
        success = false;
      }

      // For landscape assets, also analyze fit/focus
      try {
        const res = checkResolution(absPath);
        const aspect = res.height > 0 ? res.width / res.height : 0;
        if (aspect > 1.2) {
          console.log(`  📐 Landscape asset (aspect ${aspect.toFixed(2)}), analyzing fit...`);
          const fitResult = await analyzeFit(absPath);
          if (fitResult.fit) {
            asset.aiFit = fitResult.fit;
            asset.aiFocus = fitResult.focus;
            asset.aiFitReason = fitResult.reason || "";
            console.log(`     → fit: ${fitResult.fit}, focus: ${fitResult.focus}`);
          }
        }
      } catch (fitErr) {
        // Fit analysis is optional — don't fail the whole asset
        console.warn(`  ⚠️  Fit analysis skipped for ${absPath}: ${fitErr.message}`);
      }

      const analysisTimeMs = Date.now() - startTime;
      asset.aiDescription = description;

      report.push({
        path: absPath,
        description,
        success,
        analysisTimeMs,
      });
    }
  } catch (err) {
    // Re-throw so caller knows analysis failed
    throw err;
  }

  return report;
}

// ─── API Source search & download ───

/**
 * Search an API source for candidates.
 *
 * @param {Object} source - Source definition { name, searchUrl, authHeader, parseResponse }
 * @param {string} keyword - Search keyword
 * @param {string|null} apiKey - API key (null = skip)
 * @returns {Promise<Array>} Candidates array
 */
export async function searchApiSource(source, keyword, apiKey) {
  if (source.requiresApiKey && !apiKey) {
    return [];
  }

  const headers = {};
  if (source.authHeader && apiKey) {
    headers[source.authHeader] = source.authValue ? source.authValue(apiKey) : apiKey;
  }
  if (source.userAgent) {
    headers["User-Agent"] = source.userAgent;
  }

  const url = source.searchUrl(keyword, apiKey);
  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) return [];
    const data = await resp.json();
    return source.parseResponse(data, keyword);
  } catch {
    return [];
  }
}

/**
 * Download an asset from a URL.
 *
 * @param {string} url - Direct download URL
 * @param {string} destPath - Destination file path
 * @param {Object} [headers] - Optional request headers
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export async function downloadAsset(url, destPath, headers = {}) {
  try {
    // Check if file already exists
    if (existsSync(destPath)) {
      return { success: true, path: destPath, skipped: true };
    }

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      return { success: false, error: `HTTP ${resp.status}` };
    }

    const buffer = Buffer.from(await resp.arrayBuffer());

    // Check file size — reject if <1KB (likely corrupt)
    if (buffer.length < 1024) {
      return { success: false, error: "File too small (<1KB), likely corrupt" };
    }

    // Ensure directory exists
    const dir = dirname(destPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(destPath, buffer);
    return { success: true, path: destPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── yt-dlp search & download ───

/**
 * Search for videos using yt-dlp.
 *
 * @param {string} keyword - Search keyword
 * @param {string} platform - "youtube" or "bilibili"
 * @returns {Array} Candidates array
 */
export function searchYtdlp(keyword, platform) {
  const searchUrl = platform === "bilibili" ? `bilisearch:${keyword}` : `ytsearch10:${keyword}`;

  try {
    const output = execSync(
      `yt-dlp --cookies-from-browser firefox --flat-playlist --print "%(id)s\\t%(title)s\\t%(duration)s" "${searchUrl}" 2>/dev/null`,
      { encoding: "utf8", timeout: 60000 },
    );

    const lines = output.trim().split("\n").filter(Boolean);
    return lines.map((line) => {
      const [id, ...rest] = line.split("\t");
      const title = rest.length > 1 ? rest.slice(0, -1).join("\t") : rest[0] || "";
      const duration = rest.length > 1 ? parseFloat(rest[rest.length - 1]) : undefined;
      const url =
        platform === "bilibili"
          ? `https://www.bilibili.com/video/${id}`
          : `https://www.youtube.com/watch?v=${id}`;
      return { title, url, duration, type: "video", id };
    });
  } catch {
    return [];
  }
}

/**
 * Download a video clip using yt-dlp.
 *
 * @param {string} url - Video URL
 * @param {string} destPath - Destination file path
 * @returns {{ success: boolean, path?: string, error?: string }}
 */
export function downloadYtdlp(url, destPath) {
  // Check if file already exists
  if (existsSync(destPath)) {
    return { success: true, path: destPath, skipped: true };
  }

  // Ensure directory exists
  const dir = dirname(destPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const cmd = [
    "yt-dlp",
    "--cookies-from-browser firefox",
    '-f "best[height<=720][ext=mp4]/best[height<=720]/bestvideo[height<=720]+bestaudio/best"',
    "--max-filesize 20M",
    '--download-sections "*0:00-0:08"',
    `-o "${destPath}"`,
    `"${url}"`,
  ].join(" ");

  try {
    execSync(cmd, { encoding: "utf8", timeout: 120000, stdio: ["pipe", "pipe", "pipe"] });

    if (!existsSync(destPath)) {
      return { success: false, error: "yt-dlp completed but file not found" };
    }

    const stat = statSync(destPath);
    if (stat.size < 1024) {
      return { success: false, error: "Downloaded file too small (<1KB)" };
    }

    return { success: true, path: destPath };
  } catch (e) {
    const stderr = e.stderr?.toString()?.substring(0, 200) ?? "";
    // Detect login requirement
    if (stderr.toLowerCase().includes("login")) {
      return { success: false, error: "needs auth" };
    }
    return { success: false, error: e.message?.substring(0, 200) || "yt-dlp failed" };
  }
}

// ─── Source definitions ───

/**
 * API source definitions.
 * Each source has: name, requiresApiKey, searchUrl, authHeader, parseResponse, downloadUrl.
 */
export const API_SOURCES = [
  {
    name: "pexels",
    label: "Pexels",
    type: "image",
    requiresApiKey: true,
    apiKeyEnv: "PEXELS_API_KEY",
    authHeader: "Authorization",
    authValue: (key) => key,
    searchUrl: (keyword, key) =>
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&orientation=portrait&per_page=10`,
    parseResponse: (data, keyword) => {
      const photos = (data.photos || []).map((p) => ({
        title: p.alt || keyword,
        url: p.src?.original || p.src?.large,
        type: "image",
        resolution: `${p.width}x${p.height}`,
        fileSize: undefined,
        duration: undefined,
      }));
      return photos;
    },
  },
  {
    name: "pexels-video",
    label: "Pexels Videos",
    type: "video",
    requiresApiKey: true,
    apiKeyEnv: "PEXELS_API_KEY",
    authHeader: "Authorization",
    authValue: (key) => key,
    searchUrl: (keyword, key) =>
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&orientation=portrait&per_page=10`,
    parseResponse: (data, keyword) => {
      return (data.videos || []).map((v) => {
        // Pick the best quality file (largest by resolution)
        const files = v.video_files || [];
        const best = files.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
        return {
          title: v.user?.name ? `${v.user.name} video` : keyword,
          url: best?.link || undefined,
          type: "video",
          resolution: best ? `${best.width}x${best.height}` : undefined,
          fileSize: undefined,
          duration: v.duration ? `${v.duration}s` : undefined,
          author: v.user?.name,
        };
      });
    },
  },
  {
    name: "unsplash",
    label: "Unsplash",
    type: "image",
    requiresApiKey: true,
    apiKeyEnv: "UNSPLASH_ACCESS_KEY",
    authHeader: "Authorization",
    authValue: (key) => `Client-ID ${key}`,
    searchUrl: (keyword, key) =>
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&orientation=portrait&per_page=10`,
    parseResponse: (data, keyword) => {
      return (data.results || []).map((p) => ({
        title: p.alt_description || keyword,
        url: p.urls?.full || p.urls?.regular,
        type: "image",
        resolution: `${p.width}x${p.height}`,
        fileSize: undefined,
        duration: undefined,
      }));
    },
  },
  {
    name: "wikimedia",
    label: "Wikimedia Commons",
    type: "image",
    requiresApiKey: false,
    apiKeyEnv: null,
    userAgent: "ChinaAINews/1.0 (contact@china-ai.news)",
    searchUrl: (keyword, key) =>
      `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(keyword)}&srnamespace=6&format=json&srlimit=10`,
    parseResponse: (data, keyword) => {
      // Returns titles like "File:xxx.jpg" — need a second call to get URLs
      // For simplicity, return titles and resolve URLs during download
      return (data.query?.search || []).map((item) => ({
        title: item.title,
        url: null, // Will be resolved in download
        type: "image",
        resolution: undefined,
        fileSize: undefined,
        duration: undefined,
        fileTitle: item.title,
      }));
    },
  },
  {
    name: "coverr",
    label: "Coverr",
    type: "video",
    requiresApiKey: true,
    apiKeyEnv: "COVERR_API_KEY",
    authHeader: "Authorization",
    authValue: (key) => `Bearer ${key}`,
    // Coverr API: GET /videos?query=X with Bearer token. Returns { hits: [...] }
    searchUrl: (keyword, key) =>
      `https://api.coverr.co/videos?query=${encodeURIComponent(keyword)}`,
    parseResponse: (data, keyword) => {
      const hits = data.hits || [];
      return hits.map((v) => ({
        title: v.title || keyword,
        url: `https://cdn.coverr.co/videos/${v.base_filename}/mp4?token=${data.params?.userToken || ""}`,
        type: "video",
        resolution: v.is_vertical ? "vertical" : "horizontal",
        fileSize: undefined,
        duration: undefined,
        baseFilename: v.base_filename,
      }));
    },
  },
  {
    name: "pixabay",
    label: "Pixabay",
    type: "image+video",
    requiresApiKey: true,
    apiKeyEnv: "PIXABAY_API_KEY",
    searchUrl: (keyword, key) =>
      `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(keyword)}&image_type=photo&orientation=vertical&per_page=10`,
    parseResponse: (data, keyword) => {
      return (data.hits || []).map((p) => ({
        title: p.tags || keyword,
        url: p.largeImageURL || p.webformatURL,
        type: "image",
        resolution: `${p.imageWidth}x${p.imageHeight}`,
        fileSize: undefined,
        duration: undefined,
        author: p.user,
      }));
    },
  },
  {
    name: "lorem_picsum",
    label: "Lorem Picsum",
    type: "image",
    requiresApiKey: false,
    apiKeyEnv: null,
    // Lorem Picsum: https://picsum.photos/ — random Unsplash images, no auth
    // Returns a random image redirect. Use /list to get image metadata.
    searchUrl: (keyword) =>
      `https://picsum.photos/v1/list?limit=10`,
    parseResponse: (data, keyword) => {
      return (data || []).map((img) => ({
        title: `Lorem Picsum ${img.id}`,
        url: `https://picsum.photos/id/${img.id}/${img.width || 800}/${img.height || 600}`,
        type: "image",
        resolution: `${img.width || 800}x${img.height || 600}`,
        fileSize: undefined,
        duration: undefined,
        author: img.author || "Lorem Picsum",
      }));
    },
  },
];

/**
 * yt-dlp source definitions.
 */
export const YTDLP_SOURCES = [
  {
    name: "youtube",
    label: "YouTube",
    platform: "youtube",
    type: "video",
  },
  {
    name: "bilibili",
    label: "B站",
    platform: "bilibili",
    type: "video",
  },
  {
    name: "douyin",
    label: "抖音",
    platform: "douyin",
    type: "video",
    // Cookie required: export cookies.txt from Chrome, then use --cookies flag
    cookieRequired: true,
  },
  {
    name: "xiaohongshu",
    label: "小红书",
    platform: "xiaohongshu",
    type: "video",
    cookieRequired: true,
  },
  {
    name: "weibo",
    label: "微博",
    platform: "weibo",
    type: "video",
    cookieRequired: true,
  },
];

/**
 * CDP source definitions — Chinese news sites + search engines.
 * Each has a primary extract script + fallback generic script.
 */
export const CDP_SOURCES = [
  {
    name: "google_news",
    label: "Google News",
    url: (keyword) =>
      `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=nws&tbs=qdr:w`,
    primaryScript: `
      var results = [];
      document.querySelectorAll('div.g, .Gx5Zad, .fP1Qef, div[data-ved]').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h3, .LC20lb');
        var img = el.querySelector('img[src]');
        var snippet = el.querySelector('.VwiC3b, .IsZvec');
        if (link && title) {
          results.push({
            title: title.textContent.trim(),
            url: img ? img.src : link.href,
            type: img ? 'image' : 'text',
            sourceUrl: link.href,
            snippet: snippet ? snippet.textContent.trim().substring(0, 200) : ''
          });
        }
      });
      return results;
    `,
    fallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          if (!img.src.includes('gstatic') && !img.src.includes('google')) {
            results.push({ title: img.alt || '', url: img.src, type: 'image' });
          }
        }
      });
      return results;
    `,
  },
  {
    name: "bing_news",
    label: "Bing News",
    url: (keyword) =>
      `https://www.bing.com/news/search?q=${encodeURIComponent(keyword)}&qft=interval%3d%227%22`,
    primaryScript: `
      var items = document.querySelectorAll('.news-item, .tob-article, .news-card, .b_caption');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        var title = el.querySelector('h3, h2, .title, .b_caption p');
        if (link && title) {
          results.push({
            title: title.textContent.trim(),
            url: img ? img.src : link.href,
            type: img ? 'image' : 'text',
            sourceUrl: link.href
          });
        }
      });
      return results;
    `,
    fallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          if (!img.src.includes('bing.com') && !img.src.includes('r.bing')) {
            results.push({ title: img.alt || '', url: img.src, type: 'image' });
          }
        }
      });
      return results;
    `,
  },
  {
    name: "ithome",
    label: "IT之家",
    url: (keyword) => `https://www.ithome.com/search?word=${encodeURIComponent(keyword)}`,
    primaryScript: `
      var items = document.querySelectorAll('.list .item, .news-list .item, article, .search-result .item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        if (link && img) {
          results.push({ title: (el.querySelector('.title, h3, h2')?.textContent || link.textContent || '').trim(), url: img.src, type: 'image' });
        }
      });
      return results;
    `,
    fallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
  {
    name: "jiqizhixin",
    label: "机器之心",
    url: (keyword) => `https://www.jiqizhixin.com/search?keywords=${encodeURIComponent(keyword)}`,
    primaryScript: `
      var items = document.querySelectorAll('.article-list__item, .post-item, article, .list-item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        if (link && img) {
          results.push({ title: (el.querySelector('.article__title, h2, h3, .title')?.textContent || '').trim(), url: img.src, type: 'image' });
        }
      });
      return results;
    `,
    fallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
  {
    name: "xinhua",
    label: "新华网",
    url: (keyword) => `https://www.news.cn/search/news.htm?keyword=${encodeURIComponent(keyword)}`,
    primaryScript: `
      var items = document.querySelectorAll('.search-result .item, .news-list .item, article');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        if (link && img) {
          results.push({ title: (el.querySelector('h3, h2, .title')?.textContent || link.textContent || '').trim(), url: img.src, type: 'image' });
        }
      });
      return results;
    `,
    fallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
  {
    name: "thepaper",
    label: "澎湃新闻",
    url: (keyword) => `https://www.thepaper.cn/searchResult?keyword=${encodeURIComponent(keyword)}`,
    primaryScript: `
      var items = document.querySelectorAll('.search-result .item, .news-list .item, article');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        if (link && img) {
          results.push({ title: (el.querySelector('h3, h2, .title')?.textContent || link.textContent || '').trim(), url: img.src, type: 'image' });
        }
      });
      return results;
    `,
    fallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
  {
    name: "leiphone",
    label: "雷锋网",
    url: (keyword) => `https://www.leiphone.com/search?s=${encodeURIComponent(keyword)}`,
    primaryScript: `
      var items = document.querySelectorAll('.article-list .item, .post-item, article, .search-result .item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        if (link && img) {
          results.push({ title: (el.querySelector('h2, h3, .title')?.textContent || link.textContent || '').trim(), url: img.src, type: 'image' });
        }
      });
      return results;
    `,
    fallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
  {
    name: "xinzhiyuan",
    label: "新智元",
    url: (keyword) => `https://www.xinzhiyuan.com/?s=${encodeURIComponent(keyword)}`,
    primaryScript: `
      var items = document.querySelectorAll('.post-item, article, .list-item, .search-result .item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        if (link && img) {
          results.push({ title: (el.querySelector('h2, h3, .title')?.textContent || link.textContent || '').trim(), url: img.src, type: 'image' });
        }
      });
      return results;
    `,
    fallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
  {
    name: "zhidx",
    label: "智东西",
    url: (keyword) => `https://zhidx.com/?s=${encodeURIComponent(keyword)}`,
    primaryScript: `
      var items = document.querySelectorAll('.post-item, article, .list-item, .search-result .item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        if (link && img) {
          results.push({ title: (el.querySelector('h2, h3, .title')?.textContent || link.textContent || '').trim(), url: img.src, type: 'image' });
        }
      });
      return results;
    `,
    fallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
];

// ─── Attribution definitions ───

/**
 * Attribution data per source. Used to generate credits for TikTok description.
 */
export const SOURCE_ATTRIBUTIONS = {
  pexels: {
    text: (a) => `Photo by ${a.author || "Unknown"} from Pexels`,
    license: "Pexels License",
    logoRequired: false,
  },
  "pexels-video": {
    text: (a) => `Video by ${a.author || "Unknown"} from Pexels`,
    license: "Pexels License",
    logoRequired: false,
  },
  unsplash: {
    text: (a) => `Photo by ${a.author || "Unknown"} on Unsplash`,
    license: "Unsplash License",
    logoRequired: false,
  },
  pixabay: {
    text: () => `Source: Pixabay (https://pixabay.com)`,
    license: "Pixabay Content License",
    logoRequired: true,
  },
  wikimedia: {
    text: (a) => `${a.author || "Unknown"} via Wikimedia Commons (${a.license || "CC-BY-SA 4.0"})`,
    license: "CC-BY-SA 4.0",
    logoRequired: false,
    dynamicAttribution: true,
  },
  coverr: {
    text: () => `Video from Coverr (https://coverr.co)`,
    license: "Coverr License",
    logoRequired: false,
  },
  youtube: {
    text: (a) => `Contains footage from ${a.author || a.title || "Unknown"} (YouTube)`,
    license: "Fair use",
    logoRequired: false,
  },
  bilibili: {
    text: (a) => `Contains footage from ${a.author || "Unknown"} (B站)`,
    license: "Fair use",
    logoRequired: false,
  },
  douyin: {
    text: (a) => `Contains footage from ${a.author || "Unknown"} (抖音)`,
    license: "Fair use",
    logoRequired: false,
  },
  xiaohongshu: {
    text: (a) => `Contains footage from ${a.author || "Unknown"} (小红书)`,
    license: "Fair use",
    logoRequired: false,
  },
  weibo: {
    text: (a) => `Contains footage from ${a.author || "Unknown"} (微博)`,
    license: "Fair use",
    logoRequired: false,
  },
  ithome: {
    text: () => `图片来源: IT之家 (ithome.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  jiqizhixin: {
    text: () => `图片来源: 机器之心 (jiqizhixin.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  xinhua: {
    text: () => `图片来源: 新华网 (news.cn)`,
    license: "News copyright",
    logoRequired: false,
  },
  thepaper: {
    text: () => `图片来源: 澎湃新闻 (thepaper.cn)`,
    license: "News copyright",
    logoRequired: false,
  },
  leiphone: {
    text: () => `图片来源: 雷锋网 (leiphone.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  xinzhiyuan: {
    text: () => `图片来源: 新智元 (xinzhiyuan.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  zhidx: {
    text: () => `图片来源: 智东西 (zhidx.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  google_news: {
    text: (a) => `Image source: ${a.sourceUrl || "Google News"}`,
    license: "Varies",
    logoRequired: false,
  },
  bing_news: {
    text: (a) => `Image source: ${a.sourceUrl || "Bing News"}`,
    license: "Varies",
    logoRequired: false,
  },
};

/**
 * Build attribution object for an asset.
 *
 * For sources with `dynamicAttribution: true` (e.g., Wikimedia), the `attributionRequired`
 * field is determined per-asset based on the file's license. CC-BY and CC-BY-SA require
 * attribution; Public Domain does not. The `licenseInfo` from `fetchWikimediaLicense()`
 * should be passed as `asset.licenseInfo`.
 */
export function buildAttribution(source, asset) {
  const attr = SOURCE_ATTRIBUTIONS[source];
  if (!attr) return null;

  // For dynamic-attribution sources, determine attributionRequired from license info
  let attributionRequired = attr.logoRequired; // Static sources: logoRequired implies attribution
  let license = attr.license;

  if (attr.dynamicAttribution && asset.licenseInfo) {
    // Use per-file license data
    license = asset.licenseInfo.license || license;
    // CC-BY, CC-BY-SA, CC-BY-ND, CC-BY-NC, CC-BY-NC-SA all require attribution
    // Public Domain, CC0 do not
    const licLower = license.toLowerCase();
    attributionRequired =
      asset.licenseInfo.attributionRequired ||
      licLower.includes("cc-by") ||
      licLower.includes("cc by") ||
      licLower.includes("gfdl") ||
      (licLower.includes("cc") && !licLower.includes("cc0") && !licLower.includes("public domain"));
  }

  return {
    text: attr.text({ ...asset, license }),
    source,
    author: asset.author || asset.licenseInfo?.author || undefined,
    license,
    url: asset.sourceUrl || asset.url || undefined,
    logoRequired: attr.logoRequired,
    attributionRequired,
  };
}

/**
 * Generate a credits section for TikTok description.
 *
 * Includes assets where:
 * - `logoRequired=true` (e.g., Pixabay API terms require showing their logo)
 * - OR `attributionRequired=true` (e.g., Wikimedia CC-BY/CC-BY-SA requires attribution)
 *
 * Sources with neither flag (Pexels, Unsplash, Coverr, YouTube, news sites) are
 * tracked internally in `output/asset-report.json` but not surfaced to TikTok.
 */
export function buildCreditsSection(assets) {
  const lines = [];
  const seen = new Set();
  for (const a of assets) {
    if (!a.attribution) continue;
    // Include if logo required OR attribution required (CC-BY etc.)
    if (!a.attribution.logoRequired && !a.attribution.attributionRequired) continue;
    const key = a.attribution.source + (a.attribution.author || "");
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(a.attribution.text);
  }
  if (lines.length === 0) return "";
  return "\n\n--- Credits ---\n" + lines.join("\n") + "\n--- /Credits ---";
}

/**
 * Fetch license metadata for a Wikimedia Commons file.
 * Uses the imageinfo API with iiprop=extmetadata to get license, author, etc.
 *
 * @param {string} fileTitle - File title like "File:Example.jpg"
 * @returns {Promise<{license: string, author: string, attributionRequired: boolean, licenseUrl: string} | null>}
 */
export async function fetchWikimediaLicense(fileTitle) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=extmetadata&format=json`;
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "ChinaAINews/1.0 (contact@china-ai.news)" },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const pages = data.query?.pages || {};
    const firstPage = Object.values(pages)[0];
    const ext = firstPage?.imageinfo?.[0]?.extmetadata;
    if (!ext) return null;
    return {
      license: ext.LicenseShortName?.value || "Unknown",
      author: ext.Artist?.value?.replace(/<[^>]+>/g, "").trim() || undefined,
      attributionRequired: ext.AttributionRequired?.value === "true",
      licenseUrl: ext.LicenseUrl?.value || undefined,
    };
  } catch {
    return null;
  }
}

// ─── CDP search & download ───

/**
 * Check if CDP proxy is available.
 *
 * @returns {Promise<boolean>}
 */
export async function checkCdpAvailable() {
  try {
    const resp = await fetch("http://localhost:3456/targets");
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Search a CDP source for image candidates.
 *
 * Uses existing cdp-client.mjs functions.
 *
 * @param {Object} source - CDP source definition
 * @param {string} keyword - Search keyword
 * @returns {Promise<Array>} Candidates array
 */
export async function searchCdpSource(source, keyword) {
  // Dynamic import to avoid hard dependency when CDP not needed
  const { cdpNewTab, cdpCloseTab, extractFromTab, waitForPageLoad } =
    await import("./cdp-client.mjs");

  const url = source.url(keyword);
  let tabId;
  try {
    tabId = await cdpNewTab(url);
  } catch {
    return [];
  }

  // Wait for page load
  await new Promise((r) => setTimeout(r, 3000));
  await waitForPageLoad(tabId);

  // Primary extraction
  let candidates = await extractFromTab(tabId, source.primaryScript);

  // Retry once if empty
  if (candidates.length === 0) {
    await new Promise((r) => setTimeout(r, 3000));
    candidates = await extractFromTab(tabId, source.primaryScript);
  }

  // Fallback to generic extraction
  if (candidates.length === 0 && source.fallbackScript) {
    candidates = await extractFromTab(tabId, source.fallbackScript);
  }

  // Close tab
  await cdpCloseTab(tabId);

  return candidates;
}

// ─── Env / API key loading ───

/**
 * Load .env.local file and return key-value map.
 * Uses dotenv-style parsing (KEY=VALUE, # comments, quotes).
 *
 * @param {string} envPath - Path to .env.local
 * @returns {Object} Key-value map
 */
export function loadEnvLocal(envPath) {
  const env = {};
  if (!existsSync(envPath)) return env;

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;

    const key = trimmed.substring(0, eqIdx).trim();
    let value = trimmed.substring(eqIdx + 1).trim();
    // Strip quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

/**
 * Get an API key from environment.
 *
 * @param {Object} env - Environment map
 * @param {string} keyName - Env variable name
 * @returns {string|null}
 */
export function getApiKey(env, keyName) {
  return env?.[keyName] || null;
}

// ─── Main orchestrator ───

/**
 * Main entry point.
 *
 * Usage: node asset-sourcer.mjs --content unitree [--keywords "kw1,kw2"] [--max-per-source 3]
 *
 * @param {string[]} args - CLI arguments
 */
export async function main(args = process.argv.slice(2)) {
  // Parse CLI args
  const getArg = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };

  const contentSlug = getArg("content");
  const keywordsArg = getArg("keywords");
  const maxPerSource = parseInt(getArg("max-per-source") || "3", 10);

  if (!contentSlug) {
    console.error(
      "Usage: node asset-sourcer.mjs --content <slug> [--keywords <kw>] [--max-per-source <n>]",
    );
    process.exit(1);
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const contentDir = join(__dirname, "..", "content", contentSlug);
  const assetsDir = join(contentDir, "assets");
  const outputPath = join(__dirname, "..", "output", "asset-report.json");

  console.log("🎬 Asset Sourcer");
  console.log("=".repeat(60));
  console.log(`  Content: ${contentSlug}`);

  // Load scene-data if available
  let scenes = [];
  let meta = null;
  const sceneDataPath = join(contentDir, "scenes.mjs");
  if (existsSync(sceneDataPath)) {
    try {
      const module = await import(pathToFileURL(sceneDataPath).href);
      scenes = module.scenes || [];
      meta = module.meta || null;
      console.log(`  Scene-data: ${scenes.length} scenes loaded`);
    } catch (e) {
      console.warn(`  ⚠️  Failed to load scene-data: ${e.message}`);
    }
  } else {
    console.log("  Scene-data: not found (will use CLI keywords only)");
  }

  // Extract keywords
  const cliKeywords = keywordsArg ? keywordsArg.split(",").map((k) => k.trim()) : null;
  const keywords = extractKeywords(scenes, meta, cliKeywords);
  console.log(`  Keywords: ${keywords.join(", ") || "(none)"}`);

  if (keywords.length === 0) {
    console.error("❌ No keywords found. Provide --keywords or scene-data with keyEntities.");
    process.exit(1);
  }

  // Load environment
  const envPath = join(__dirname, "..", "..", "..", ".env.local");
  const env = loadEnvLocal(envPath);

  // Check CDP proxy
  const cdpAvailable = await checkCdpAvailable();
  if (!cdpAvailable) {
    console.error("❌ CDP proxy not available at localhost:3456");
    console.error("   Enable Chrome Remote Debugging + start web-access skill proxy.");
    process.exit(1);
  }
  console.log("  ✅ CDP proxy available");

  const allAssets = [];
  const failed = [];
  const skipped = [];

  // ── API sources (parallel) ──
  console.log("\n📡 API sources:");
  const apiResults = await Promise.allSettled(
    API_SOURCES.map(async (source) => {
      const apiKey = source.apiKeyEnv ? getApiKey(env, source.apiKeyEnv) : null;
      if (source.requiresApiKey && !apiKey) {
        skipped.push({ source: source.name, reason: "no API key" });
        return [];
      }

      const candidates = await Promise.all(
        keywords.map((kw) => searchApiSource(source, kw, apiKey)),
      );
      const flat = candidates.flat();
      return flat.map((c) => ({ ...c, source: source.name }));
    }),
  );

  for (let i = 0; i < apiResults.length; i++) {
    const result = apiResults[i];
    if (result.status === "fulfilled") {
      const candidates = result.value;
      // Score and sort
      const scored = candidates
        .map((c) => ({ ...c, score: scoreCandidate(c, keywords[0]) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, maxPerSource);

      // Download
      for (let j = 0; j < scored.length; j++) {
        const candidate = scored[j];
        const ext = candidate.type === "video" ? "mp4" : "jpg";
        const filename = buildFilename(candidate.source, keywords[0], j + 1, ext);
        const destPath = join(assetsDir, filename);

        if (candidate.url) {
          const headers = {};
          if (candidate.source === "wikimedia") {
            headers["User-Agent"] = "ChinaAINews/1.0 (contact@china-ai.news)";
          }
          const dlResult = await downloadAsset(candidate.url, destPath, headers);
          if (dlResult.success) {
            const assetEntry = {
              ...candidate,
              path: destPath.replace(contentDir + "/", ""),
              status: dlResult.skipped ? "already exists" : "downloaded",
            };

            // For Wikimedia assets, fetch per-file license metadata
            if (candidate.source === "wikimedia" && candidate.fileTitle) {
              const licenseInfo = await fetchWikimediaLicense(candidate.fileTitle);
              if (licenseInfo) {
                assetEntry.licenseInfo = licenseInfo;
                assetEntry.author = licenseInfo.author || assetEntry.author;
                console.log(
                  `    📄 License: ${licenseInfo.license}, attribution: ${licenseInfo.attributionRequired}`,
                );
              }
            }

            allAssets.push(assetEntry);
            console.log(`    ✅ ${candidate.source}: ${filename} (score: ${candidate.score})`);
          } else {
            failed.push({ source: candidate.source, keyword: keywords[0], error: dlResult.error });
            console.log(`    ❌ ${candidate.source}: ${dlResult.error}`);
          }
        }
      }
    } else {
      failed.push({
        source: API_SOURCES[i].name,
        keyword: keywords[0],
        error: result.reason?.message || "API error",
      });
    }
  }

  // ── yt-dlp sources (serial) ──
  console.log("\n🎬 yt-dlp sources:");
  for (const source of YTDLP_SOURCES) {
    for (const keyword of keywords) {
      console.log(`  🔍 ${source.label} search: "${keyword}"...`);
      const candidates = searchYtdlp(keyword, source.platform);
      console.log(`     Found ${candidates.length} candidates`);

      const scored = candidates
        .map((c) => ({ ...c, score: scoreCandidate(c, keyword), source: source.name }))
        .sort((a, b) => b.score - a.score)
        .slice(0, maxPerSource);

      for (let j = 0; j < scored.length; j++) {
        const candidate = scored[j];
        const filename = buildFilename(source.name, keyword, j + 1, "mp4");
        const destPath = join(assetsDir, filename);

        const dlResult = downloadYtdlp(candidate.url, destPath);
        if (dlResult.success) {
          allAssets.push({
            ...candidate,
            path: destPath.replace(contentDir + "/", ""),
            status: dlResult.skipped ? "already exists" : "downloaded",
          });
          console.log(`    ✅ ${source.name}: ${filename} (score: ${candidate.score})`);
        } else {
          failed.push({ source: source.name, keyword, error: dlResult.error });
          console.log(`    ❌ ${source.name}: ${dlResult.error}`);
        }
      }
    }
  }

  // ── CDP sources (serial) ──
  console.log("\n📰 CDP sources (Chinese news sites):");
  for (const source of CDP_SOURCES) {
    for (const keyword of keywords) {
      console.log(`  🔍 ${source.label} search: "${keyword}"...`);
      const candidates = await searchCdpSource(source, keyword);
      console.log(`     Found ${candidates.length} candidates`);

      const scored = candidates
        .map((c) => ({ ...c, score: scoreCandidate(c, keyword), source: source.name }))
        .sort((a, b) => b.score - a.score)
        .slice(0, maxPerSource);

      for (let j = 0; j < scored.length; j++) {
        const candidate = scored[j];
        if (!candidate.url) continue;
        const filename = buildFilename(source.name, keyword, j + 1, "jpg");
        const destPath = join(assetsDir, filename);

        const dlResult = await downloadAsset(candidate.url, destPath);
        if (dlResult.success) {
          allAssets.push({
            ...candidate,
            path: destPath.replace(contentDir + "/", ""),
            status: dlResult.skipped ? "already exists" : "downloaded",
          });
          console.log(`    ✅ ${source.name}: ${filename} (score: ${candidate.score})`);
        } else {
          failed.push({ source: source.name, keyword, error: dlResult.error });
          console.log(`    ❌ ${source.name}: ${dlResult.error}`);
        }
      }
    }
  }

  // ── AI Analysis (after download, before assignment) ──
  let aiAnalysis = [];
  if (allAssets.length > 0) {
    console.log("\n🤖 AI Analysis:");
    // Convert relative paths to absolute for the Python subprocess
    for (const asset of allAssets) {
      if (asset.path && !asset.path.startsWith("/")) {
        asset.path = join(contentDir, asset.path);
      }
    }
    try {
      aiAnalysis = await analyzeAssets(allAssets);
      // Re-score assets with aiDescription
      for (const asset of allAssets) {
        if (asset.aiDescription) {
          asset.score = scoreCandidate(asset, keywords[0], asset.aiDescription);
        }
      }
    } catch (err) {
      console.warn(`⚠️  AI analysis layer not available: ${err.message}`);
    } finally {
      // Close VLM process — analyzeAssets no longer closes it itself,
      // so we must close it here to release the ~11GB model.
      try {
const { closeVisualAnalyzer } = await import("./visual-analyzer.mjs");
await closeVisualAnalyzer();
      } catch {
        // ignore close errors
      }
    }
  }

  // ── Add scene recommendations + attribution ──
  for (const asset of allAssets) {
    const rec = recommendScene(asset, scenes);
    if (rec) {
      asset.recommendedScene = rec.sceneId;
      asset.recommendedAnimation = rec.animation;
      asset.recommendedOverlay = rec.overlay;
    }
    // Build attribution
    asset.attribution = buildAttribution(asset.source || asset.from, asset);
  }

  // ── Write report ──
  const creditsText = buildCreditsSection(allAssets);
  const report = buildReport(contentSlug, keywords, allAssets, failed, skipped, { aiAnalysis });
  report.credits = creditsText;
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  // ── Generate media-patch.json (auto-fill suggestions) ──
  const patches = assignAssetsToScenes(allAssets, scenes);
  const patchPath = join(__dirname, "..", "output", "media-patch.json");
  writeFileSync(patchPath, JSON.stringify(patches, null, 2) + "\n", "utf8");
  const assignedCount = patches.filter((p) => p.status === "assigned").length;
  const unassignedCount = patches.filter((p) => p.status === "unassigned").length;

  console.log("\n" + "=".repeat(60));
  console.log(`📊 Summary:`);
  console.log(`   Total assets: ${allAssets.length}`);
  console.log(`   Failed: ${failed.length}`);
  console.log(`   Skipped: ${skipped.length}`);
  console.log(`   Report: ${outputPath}`);
  console.log(
    `   Media patch: ${patchPath} (${assignedCount} assigned, ${unassignedCount} unassigned)`,
  );
}

// Auto-run if called directly
const isMainModule = process.argv[1] && process.argv[1].endsWith("asset-sourcer.mjs");
if (isMainModule) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  });
}
