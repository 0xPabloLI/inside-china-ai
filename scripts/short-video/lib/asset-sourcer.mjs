/**
 * Asset Sourcer — Automated media asset search & download.
 *
 * Standalone tool: node scripts/short-video/lib/asset-sourcer.mjs --content <slug>
 *
 * Searches multiple sources (API + CDP + yt-dlp) for images/videos matching
 * scene-data keywords, scores candidates, downloads top matches, and outputs
 * a JSON report with recommended scene assignments.
 *
 * T05: Pre-download filter gate (threshold 20) skips obviously bad candidates
 *     before downloading. Lower than post-download threshold (30) because
 *     pre-download metadata is sparser.
 *
 * T06: Cascade order fix — pre-filter (free) runs before detectFocus (~0.5s)
 *     in analyzeAssets(), so OpenCV doesn't waste time on assets that will be
 *     skipped anyway.
 *
 * Does NOT auto-modify scene-data — the user reviews the report and manually
 * fills the `media` field in scenes.mjs.
 *
 * @module asset-sourcer
 */

import { existsSync, writeFileSync, mkdirSync, statSync, readFileSync } from "fs";
import { join, dirname, basename, extname, relative, isAbsolute } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { execSync } from "child_process";
import { ALL_SOURCES, SOURCE_ATTRIBUTIONS } from "./source-registry.mjs";
import {
  getCachedSearchResults,
  getOrSearchResults,
  loadSearchResultsCache,
  saveSearchResultsCache,
} from "./search-results-cache.mjs";
import {
  shouldTriggerTier3,
  searchBraveImages,
  searchSearXngImages,
  BraveQuotaTracker,
} from "./progressive-search.mjs";
import { downloadCandidate } from "./download-candidate.mjs";

// Re-export SOURCE_ATTRIBUTIONS from source-registry (single source of truth)
export { SOURCE_ATTRIBUTIONS };

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
const NO_MEDIA_TYPES = new Set(["cta", "data", "stat-reveal"]);

/** Minimum score for hook scene auto-assignment (spec D1). */
const HOOK_MIN_SCORE = 60;

/** Hook scenes require fit="cover" (contain leaves letterbox, weakens impact). */
const HOOK_REQUIRED_FIT = "cover";

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
 * Compute the technical (non-AI) score for a candidate.
 *
 * Components:
 *   title match (0-28) + duration fitness (0-18) + size fitness (0-14) + resolution (0-10)
 *   = technical 0-70
 *
 * @param {Object} candidate - { title, type, duration?, fileSize?, resolution? }
 * @param {string} keyword - Search keyword
 * @returns {{technicalScore: number, titleScore: number, durationScore: number, sizeScore: number, resolutionScore: number}}
 */
function computeTechnicalScore(candidate, keyword) {
  let titleScore = 0;
  let durationScore = 0;
  let sizeScore = 0;
  let resolutionScore = 0;

  // Title match (0-28) with boundary matching (Issue #44 P2)
  const title = (candidate.title || "").toLowerCase();
  const kw = keyword.toLowerCase();
  if (hasBoundaryMatch(title, kw)) {
    titleScore = 28; // exact keyword in title (boundary-matched)
  } else if (kw.length > 3 && hasBoundaryMatch(title, kw.substring(0, Math.min(kw.length, 5)))) {
    titleScore = 14; // partial match
  }

  // Duration fitness (0-18)
  if (candidate.type === "image") {
    durationScore = 14; // images get fixed 14
  } else if (typeof candidate.duration === "number") {
    if (candidate.duration >= 3 && candidate.duration <= 8) {
      durationScore = 18;
    } else if (candidate.duration > 8 && candidate.duration <= 15) {
      durationScore = 10;
    } else if (candidate.duration > 60) {
      durationScore = 3;
    } else {
      durationScore = 3; // <3s
    }
  } else {
    durationScore = 3; // unknown duration
  }

  // File size fitness (0-14)
  const size = candidate.fileSize;
  if (typeof size === "number") {
    if (candidate.type === "image") {
      if (size < 5_000_000) sizeScore = 14;
      else if (size < 10_000_000) sizeScore = 7;
    } else {
      if (size < 20_000_000) sizeScore = 14;
      else if (size < 50_000_000) sizeScore = 7;
    }
  }

  // Resolution bonus (0-10) — case-insensitive (Issue #44 P3 fix)
  const res = candidate.resolution;
  if (res) {
    const resLower = String(res).toLowerCase();
    if (resLower.includes("1080") || resLower.includes("4k") || resLower.includes("2160")) {
      resolutionScore = 10;
    } else if (resLower.includes("720")) {
      resolutionScore = 7;
    } else {
      resolutionScore = 3;
    }
  }

  const technicalScore = titleScore + durationScore + sizeScore + resolutionScore;
  return { technicalScore, titleScore, durationScore, sizeScore, resolutionScore };
}

/**
 * Score a candidate asset (0-100).
 *
 * Score = title match (0-28) + duration fitness (0-18) + size fitness (0-14)
 *         + resolution bonus (0-10) + AI relevance (0-30)
 *         = technical (0-70) + relevance (0-30) = 0-100
 *
 * Issue #44 fixes:
 * - P1: Rebalanced so non-AI = 70, AI relevance = 30 (real influence, not capped)
 * - P1: searchKeyword provenance preserved by caller
 * - P2: Boundary matching (punctuation normalization, token/phrase boundaries)
 * - P3: 4K case-insensitive (String(res).toLowerCase())
 * - P1-1: Accepts { description, subjects } object for semantic scoring
 *
 * @param {Object} candidate - { title, type, duration?, fileSize?, resolution? }
 * @param {string} keyword - Search keyword (should be candidate.searchKeyword)
 * @param {string|{description?: string, subjects?: string[]}} [semantics] - VLM semantics
 * @returns {number} Score 0-100
 */
export function scoreCandidate(candidate, keyword, semantics) {
  // ── Technical score (0-70) ──
  const { technicalScore } = computeTechnicalScore(candidate, keyword);

  // ── Normalize semantics: accept string (backward compat) or object ──
  let description = "";
  let subjects = [];
  if (typeof semantics === "string") {
    description = semantics;
  } else if (semantics && typeof semantics === "object") {
    description = semantics.description || "";
    subjects = Array.isArray(semantics.subjects) ? semantics.subjects : [];
  }

  // ── AI relevance score (0-30) ──
  let relevanceScore = 0;
  const kwLower = keyword.toLowerCase();
  const subjectsLower = subjects.map((s) => s.toLowerCase());

  // Subjects match (0-20): case-insensitive exact match against subjects array
  if (subjectsLower.length > 0) {
    if (subjectsLower.includes(kwLower)) {
      // Full keyword exact match
      relevanceScore += 20;
    } else {
      // Per-token match for multi-word keywords
      const kwTokens = normalizeTokens(kwLower);
      if (kwTokens.length > 1) {
        let matchCount = 0;
        for (const token of kwTokens) {
          if (subjectsLower.includes(token)) {
            matchCount++;
          }
        }
        // Proportional score: (matched tokens / total tokens) * 20
        relevanceScore += Math.round((matchCount / kwTokens.length) * 20);
      }
    }
  }

  // Description match (0-10): keyword boundary match in description string
  if (description && typeof description === "string" && description.trim()) {
    const descLower = description.toLowerCase();

    // Full-phrase bonus only on boundary match (Issue #44 P2)
    if (hasBoundaryMatch(descLower, kwLower)) {
      relevanceScore += 10;
    }
  }

  // Backward compat: if semantics is a string (old behavior), also compute subjects-from-description
  // This preserves old test expectations where string was treated as description-only
  // with subjects scoring from boundary matching
  if (typeof semantics === "string" && semantics.trim()) {
    const descLower = semantics.toLowerCase();
    // Old behavior: boundary match in description gave 20 pts for "subjects"
    if (hasBoundaryMatch(descLower, kwLower)) {
      relevanceScore += 20;
    } else {
      // Per-token match against description
      const kwTokens = normalizeTokens(kwLower);
      let matchCount = 0;
      for (const token of kwTokens) {
        if (hasBoundaryMatch(descLower, token)) {
          matchCount++;
        }
      }
      relevanceScore += matchCount * 10;
    }
  }

  relevanceScore = Math.min(relevanceScore, 30);

  return Math.min(technicalScore + relevanceScore, 100);
}

/**
 * Pre-filter gate: assets with technicalScore < threshold are marked lowConfidence.
 *
 * Only marks lowConfidence when there's enough metadata to make a confident
 * decision. If the asset has no title or keyword, we don't have enough
 * information to judge — let VLM analyze it (hard gate, spec §3).
 *
 * Assets with technicalScore < 30 are hard-skipped from VLM analysis
 * to save inference cost. This may miss assets with poor metadata but
 * visually relevant content; P7 caching layer can add retry logic.
 *
 * @param {Object} candidate - { title, type, duration?, fileSize?, resolution? }
 * @param {string} keyword - Search keyword
 * @returns {{technicalScore: number, lowConfidence: boolean}}
 */
// T05: Pre-download filter threshold — lower than post-download (30) because
// pre-download metadata is sparser (no file size from API, resolution may be missing).
export const PRE_DOWNLOAD_FILTER_THRESHOLD = 20;

export function preFilterCandidate(candidate, keyword) {
  const { technicalScore } = computeTechnicalScore(candidate, keyword);
  const PREFILTER_THRESHOLD = 30;

  // Only apply the gate when we have enough signal to judge:
  // - keyword must be present (otherwise can't score title match)
  // - candidate must have a title (otherwise titleScore=0 is not informative)
  const hasEnoughSignal = !!keyword && !!candidate.title;
  const lowConfidence = hasEnoughSignal && technicalScore < PREFILTER_THRESHOLD;

  return {
    technicalScore,
    lowConfidence,
  };
}

// ─── Boundary matching helpers (Issue #44 P2) ───

/**
 * Normalize punctuation in text for matching.
 * Converts hyphens to spaces, removes possessive apostrophes.
 *
 * @param {string} text
 * @returns {string} Normalized text
 */
function normalizePunctuation(text) {
  return text.replace(/[''\u2019]/g, "").replace(/[-]/g, " ");
}

/**
 * Tokenize text into words (for Latin) or keep as-is (for CJK).
 *
 * @param {string} text - Already-lowercased text
 * @returns {string[]} Token array
 */
function normalizeTokens(text) {
  const normalized = normalizePunctuation(text);
  return normalized.split(/[\s,.!?;:()'"/]+/).filter((t) => t.length > 0);
}

/**
 * Check if keyword appears in text with proper token/phrase boundaries.
 *
 * For Latin text: checks that the match is surrounded by non-alphanumeric chars
 * (or start/end of string). Prevents "AI" matching "train" or "painting".
 *
 * For CJK text: uses includes() directly (no word boundaries in CJK).
 *
 * @param {string} text - The text to search in (already lowercased)
 * @param {string} keyword - The keyword to search for (already lowercased)
 * @returns {boolean}
 */
function hasBoundaryMatch(text, keyword) {
  if (!text || !keyword) return false;

  const normalizedText = normalizePunctuation(text);
  const normalizedKeyword = normalizePunctuation(keyword);

  // Check if keyword contains CJK characters — use includes() for CJK
  if (/[\u4e00-\u9fff\u3040-\u30ff]/.test(keyword)) {
    return normalizedText.includes(normalizedKeyword);
  }

  // Latin text: use word boundary matching
  // Escape regex special chars in the keyword
  const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|[\\s,.!?;:()'"/])${escaped}(?:$|[\\s,.!?;:()'"/])`);
  return regex.test(normalizedText);
}

/**
 * Content kind → preferred scene visualType mapping.
 * Assets with a known contentKind prefer scenes of the matching type.
 * Unknown contentKind values fall through to the current greedy logic.
 */
const CONTENT_KIND_PREFERENCE = {
  product_demo: "narrative",
  talking_head: "quote",
};

/**
 * Recommend a scene for an asset based on visualType and contentKind.
 *
 * If asset.contentKind has a preferred visualType (see CONTENT_KIND_PREFERENCE),
 * scenes of that type are scanned first. If all preferred-type scenes are taken,
 * falls through to the current greedy logic.
 *
 * @param {Object} asset - { type, contentKind? }
 * @param {Array} scenes - Scene data array
 * @returns {{ sceneId: number, animation: string, overlay: number } | null}
 */
export function recommendScene(asset, scenes) {
  // Determine preferred visualType from contentKind (P1-1 fix)
  const preferredVt = asset.contentKind ? CONTENT_KIND_PREFERENCE[asset.contentKind] : undefined;

  // Helper: check if a scene can be recommended
  function tryScene(scene) {
    const vt = scene.visualType;
    if (NO_MEDIA_TYPES.has(vt)) return null;
    if (scene.media) return null;

    if (vt === "hook") {
      return {
        sceneId: scene.id,
        animation: "ken-burns",
        overlay: 0.5,
      };
    }
    if (vt === "narrative") {
      return {
        sceneId: scene.id,
        animation: asset.type === "video" ? "zoom" : "ken-burns",
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
    return null;
  }

  // Pass 1: if there's a preferred visualType, scan for it first
  if (preferredVt) {
    for (const scene of scenes) {
      if (scene.visualType !== preferredVt) continue;
      const rec = tryScene(scene);
      if (rec) return rec;
    }
  }

  // Pass 2: fall through to current greedy logic (all eligible scenes)
  for (const scene of scenes) {
    const rec = tryScene(scene);
    if (rec) return rec;
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
 * Normalize an asset path for the media-patch.json — always returns a relative path.
 *
 * If the path is already relative, it passes through unchanged.
 * If the path is absolute, it is resolved relative to contentDir.
 * If the result escapes contentDir (starts with `..`), an Error is thrown
 * to prevent path traversal.
 *
 * @param {string} assetPath - The asset path (relative or absolute)
 * @param {string} contentDir - The content directory to resolve against
 * @returns {string} Relative path safe for scene-data
 * @throws {Error} If the normalized path escapes contentDir
 */
export function normalizePathForPatch(assetPath, contentDir) {
  if (!assetPath) return assetPath;
  if (!isAbsolute(assetPath)) return assetPath;

  const rel = relative(contentDir, assetPath);

  // Path escape guard — if result starts with `..`, the path is outside contentDir
  if (rel.startsWith("..")) {
    throw new Error(
      `Path escape detected: "${assetPath}" resolves to "${rel}" which is outside contentDir "${contentDir}"`,
    );
  }

  return rel;
}

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

    // Find first available scene — hook scenes get priority (spec D1)
    let assigned = false;
    const isVideo = asset.type === "video";

    // Pass 1: hook scenes (require score>=60 and aiFit="cover")
    for (const scene of scenes) {
      if (assignedSceneIds.has(scene.id)) continue;
      if (scene.visualType !== "hook") continue;
      if (scene.media) continue;

      // Hook gate: score >= 60 AND fit === "cover"
      if ((asset.score || 0) < HOOK_MIN_SCORE) continue;
      if (asset.fit !== HOOK_REQUIRED_FIT) continue;

      const media = {
        type: asset.type,
        path: asset.path,
        source: asset.source || asset.from || undefined,
        animation: "ken-burns",
        overlay: 0.5,
        fit: "cover",
      };
      if (asset.fit && !isVideo) media.fit = asset.fit;
      if (isVideo && VOLUME_RECOMMENDATIONS["narrative"]) {
        media.volume = VOLUME_RECOMMENDATIONS["narrative"].video;
      }

      result.push({
        sceneId: scene.id,
        sceneName: scene.name,
        visualType: "hook",
        media,
        analysis: asset.focusAnalysis ? { focusAnalysis: asset.focusAnalysis } : undefined,
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
    if (assigned) continue;

    // Pass 2: all other eligible scenes (narrative, info-card, quote, etc.)
    for (const scene of scenes) {
      if (assignedSceneIds.has(scene.id)) continue;
      if (NO_MEDIA_TYPES.has(scene.visualType)) continue;
      if (scene.visualType === "hook") continue; // already handled in pass 1
      if (scene.media) continue;

      // Assign this asset to this scene
      const vt = scene.visualType;

      // Determine animation
      let animation;
      if (vt === "narrative") {
        animation = isVideo ? "zoom" : "ken-burns";
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
      // Include VLM-analyzed fit when available (spec §4.8)
      // Video assets skip fit — video fit is a P4+ concern (temporal windows)
      if (asset.fit && asset.type !== "video") {
        media.fit = asset.fit;
      }
      // Include crop focus from crop decision (spec: Crop Decision Contract)
      if (asset.cropFocus) {
        media.cropFocus = asset.cropFocus;
      }
      if (volume !== undefined) {
        media.volume = volume;
      }

      // Build analysis field for human review (spec §4.7)
      const analysis = {};
      if (asset.focusAnalysis) {
        analysis.focusAnalysis = asset.focusAnalysis;
      }

      result.push({
        sceneId: scene.id,
        sceneName: scene.name,
        visualType: vt,
        media,
        analysis: Object.keys(analysis).length > 0 ? analysis : undefined,
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
 * Analyze downloaded assets using the VLM in a single semantic merge call.
 *
 * Pipeline phases (T06 fix: pre-filter before focus detection):
 *   Phase 1: Pre-filter (free) — rebalanced scoreCandidate technical score (0-70)
 *             Assets with technicalScore < 30 → hard gate, skip detectFocus + VLM
 *   Phase 2: Focus detection (OpenCV, ~0.5s/asset) → closeFocusDetector
 *             Only runs on assets that survived pre-filter
 *   Phase 3a: VLM deep analysis — single analyzeAssetSemantics call per asset
 *             Stores: description, subjects, contentKind, fit, criticalEdgeText, reason
 *   Phase 3b: Semantic re-scoring — uses VLM subjects + description for relevance
 *
 * Does NOT call closeVisualAnalyzer() — the caller is responsible for closing
 * the VLM process after all phases are complete.
 *
 * Writes asset-analysis.json artifact to outputDir/{contentSlug}/ (if both provided).
 * If contentSlug is not provided, writes to outputDir/ directly (backward compat).
 *
 * @param {Array} assets - Downloaded assets (each must have path and type)
 * @param {Object} [opts] - Options
 * @param {string} [opts.outputDir] - Base directory to write asset-analysis.json
 * @param {string} [opts.contentSlug] - Content slug for artifact isolation
 * @param {string} [opts.model] - VLM model ID (for artifact metadata)
 * @returns {Promise<Array<{path: string, description: string, success: boolean, analysisTimeMs: number}>>}
 */
export async function analyzeAssets(assets, opts = {}) {
  const { analyzeAssetSemantics, detectFocus, closeFocusDetector } =
    await import("./visual-analyzer.mjs");
  const { probeMedia } = await import("./media-probe.mjs");

  if (!assets || assets.length === 0) return [];

  const outputDir = opts.outputDir || null;
  const modelId = opts.model || "mlx-community/Qwen3-VL-8B-Instruct-8bit";
  const contentDir = opts.contentDir || null;
  const contentSlug = opts.contentSlug || null;

  // ── Phase 1: Pre-filter (free — runs before expensive focus detection) ──
  // T06 fix: move pre-filter before detectFocus so OpenCV doesn't waste 0.5s
  // on assets that will be skipped anyway.
  const analyzableAssets = [];
  for (const asset of assets) {
    if (!asset.path) continue;
    const keyword = asset.searchKeyword || "";
    const { technicalScore, lowConfidence } = preFilterCandidate(asset, keyword);
    asset.technicalScore = technicalScore;
    asset.lowConfidence = lowConfidence;
    if (lowConfidence) {
      console.log(
        `  ⏭️  Skipping low-confidence asset (pre-filter): ${asset.path} (score: ${technicalScore})`,
      );
    } else {
      analyzableAssets.push(asset);
    }
  }

  // Guard: if all assets are lowConfidence, skip focus detection + VLM entirely
  if (analyzableAssets.length === 0) {
    console.log("  ⏭️  All assets failed pre-filter — skipping focus detection + VLM");
  }

  // ── Phase 2: Focus detection (medium cost ~0.5s/asset) — only for survivors ──
  // Resolve relative paths using contentDir when provided (P0-1 fix)
  if (analyzableAssets.length > 0) {
    try {
      for (const asset of analyzableAssets) {
        if (!asset.path) continue;
        const absPath =
          contentDir && !isAbsolute(asset.path) ? join(contentDir, asset.path) : asset.path;
        const focus = await detectFocus(absPath);
        asset.focusAnalysis = focus;
      }
    } finally {
      await closeFocusDetector();
    }
  }

  // ── Phase 2.5: Probe video assets + compute time windows (T6) ──
  // For video assets only: call probeMedia to get duration, then compute
  // a time window for VLM analysis. Images are skipped (no window needed).
  const DEFAULT_WINDOW_END_MS = 8000; // matches MAX_VIDEO_SECONDS in vlm_analyzer.py
  const DEFAULT_SAMPLE_FPS = 1.0;

  for (const asset of analyzableAssets) {
    if (asset.type !== "video") continue;

    const absPath =
      contentDir && !isAbsolute(asset.path) ? join(contentDir, asset.path) : asset.path;

    const probe = probeMedia(absPath);

    if (probe) {
      // Compute window: { 0, min(duration, 8000), 1.0 }
      const endMs = Math.min(probe.durationMs, DEFAULT_WINDOW_END_MS);
      asset.window = { startMs: 0, endMs, sampleFps: DEFAULT_SAMPLE_FPS };
    } else {
      // probeMedia failed — use default window, sourceMode will be "degraded"
      asset.window = { startMs: 0, endMs: DEFAULT_WINDOW_END_MS, sampleFps: DEFAULT_SAMPLE_FPS };
    }
  }

  // ── Phase 3a: VLM semantic analysis (single call per asset) ──
  const report = [];

  for (let i = 0; i < analyzableAssets.length; i++) {
    const asset = analyzableAssets[i];
    // Resolve to absolute path for VLM subprocess, keeping asset.path relative (P0-1 fix)
    const absPath =
      contentDir && !isAbsolute(asset.path) ? join(contentDir, asset.path) : asset.path;

    const startTime = Date.now();
    console.log(`  🔍 Analyzing: ${absPath}... (${i + 1}/${analyzableAssets.length})`);

    let semantics;
    let success = false;

    try {
      // Pass window opts for video assets; omit for images (backward compat)
      semantics = asset.window
        ? await analyzeAssetSemantics(absPath, asset.window)
        : await analyzeAssetSemantics(absPath);
      success = !!(semantics.description && semantics.description.length > 0);
    } catch (err) {
      console.warn(`  ⚠️  Analysis failed for ${absPath}: ${err.message}`);
      semantics = {
        description: "",
        subjects: [],
        contentKind: null,
        fit: null,
        criticalEdgeText: null,
        reason: null,
      };
    }

    // Store VLM fields on asset (replaces old aiDescription/aiFit/aiFitReason)
    asset.description = semantics.description;
    asset.subjects = semantics.subjects;
    asset.contentKind = semantics.contentKind;
    asset.fit = semantics.fit;
    asset.criticalEdgeText = semantics.criticalEdgeText;
    asset.reason = semantics.reason;
    // Store window and sourceMode for video assets (T6)
    if (semantics.window) {
      asset.window = semantics.window;
    }
    if (semantics.sourceMode) {
      asset.sourceMode = semantics.sourceMode;
    }

    const analysisTimeMs = Date.now() - startTime;

    report.push({
      path: absPath,
      description: semantics.description,
      success,
      analysisTimeMs,
    });
  }

  // ── Phase 3b: Crop Decision (deterministic geometry) ──
  // For each landscape image asset, evaluate 9:16 cover crop candidates
  // using focus detection data. Select best safe crop or fall back to contain.
  const { selectBestCrop } = await import("./crop-decision.mjs");

  for (const asset of analyzableAssets) {
    if (asset.type !== "image") continue; // video crop not supported

    // Need focusAnalysis.frame to determine aspect ratio
    const focus = asset.focusAnalysis;
    if (!focus?.frame?.width || !focus?.frame?.height) continue;

    const sourceAspect = focus.frame.width / focus.frame.height;
    const targetAspect = 9 / 16;

    // Only run crop decision for landscape images (source wider than target)
    if (sourceAspect <= targetAspect) continue;

    const decision = selectBestCrop({
      sourceAspect,
      targetAspect,
      protectedRegions: focus.protectedRegions || [],
      saliency: focus.saliency || { available: false, dispersion: 0, centroid: [0.5, 0.5] },
      frame: focus.frame,
    });

    asset.cropDecision = decision;

    if (decision.status === "safe" && decision.cropFocus) {
      asset.cropFocus = decision.cropFocus;
      // Only override fit to "cover" if VLM didn't already say "contain"
      // (VLM's "contain" based on seeing the cropped image takes priority)
      if (!asset.fit || asset.fit !== "contain") {
        asset.fit = "cover";
      }
    } else if (decision.status === "unsafe") {
      asset.fit = "contain";
    }
    // indeterminate → leave cropFocus and fit unset (defaults apply)
  }

  // ── Write asset-analysis.json artifact ──
  // P1-3: isolate by content slug — write to outputDir/{contentSlug}/ when both provided
  if (outputDir) {
    const artifactDir = contentSlug ? join(outputDir, contentSlug) : outputDir;
    const artifact = {
      version: 1,
      analyzedAt: new Date().toISOString(),
      model: modelId,
      assets: assets
        .filter((a) => a.path)
        .map((a) => ({
          path: a.path,
          type: a.type,
          searchKeyword: a.searchKeyword || null,
          technicalScore: a.technicalScore || null,
          lowConfidence: a.lowConfidence || false,
          description: a.description || "",
          subjects: a.subjects || [],
          contentKind: a.contentKind || null,
          fit: a.fit || null,
          criticalEdgeText: a.criticalEdgeText || null,
          reason: a.reason || null,
          focusAnalysis: a.focusAnalysis || null,
          cropDecision: a.cropDecision || null,
          cropFocus: a.cropFocus || null,
          window: a.window || null,
          sourceMode: a.sourceMode || null,
        })),
    };

    const artifactPath = join(artifactDir, "asset-analysis.json");
    const dir = dirname(artifactPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
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
  // T2: Guard against unsupported platforms.
  // Previously, non-bilibili platforms silently fell through to YouTube search,
  // producing videos with wrong source attribution (e.g., YouTube videos labeled as xhs).
  const SUPPORTED_PLATFORMS = new Set(["bilibili", "youtube"]);
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    return [];
  }

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

// ─── Source definitions (imported from source-registry) ───
//
// API_SOURCES, YTDLP_SOURCES, CDP_SOURCES, and SOURCE_ATTRIBUTIONS are now
// derived from source-registry.mjs capabilities. The source-registry is the
// single source of truth; these arrays are backward-compatible adapters that
// flatten capabilities.images / capabilities.videos into the flat shape
// expected by searchApiSource(), searchCdpSource(), and searchYtdlp().

/**
 * Flatten a source's capabilities.images (API method) into the flat shape
 * expected by searchApiSource().
 */
function flattenImageApiSource(source) {
  const cap = source.capabilities.images;
  return {
    name: source.name,
    label: source.label,
    type: "image",
    requiresApiKey: cap.requiresApiKey,
    apiKeyEnv: cap.apiKeyEnv,
    authHeader: cap.authHeader,
    authValue: cap.authValue,
    userAgent: cap.userAgent,
    searchUrl: cap.searchUrl,
    parseResponse: cap.parseResponse,
  };
}

/**
 * Flatten a source's capabilities.videos (API method) into the flat shape
 * expected by searchApiSource().
 */
function flattenVideoApiSource(source) {
  const cap = source.capabilities.videos;
  return {
    name: source.name,
    label: source.label,
    type: "video",
    requiresApiKey: cap.requiresApiKey,
    apiKeyEnv: cap.apiKeyEnv,
    authHeader: cap.authHeader,
    authValue: cap.authValue,
    userAgent: cap.userAgent,
    searchUrl: cap.searchUrl,
    parseResponse: cap.parseResponse,
  };
}

/**
 * Flatten a source's capabilities.images (CDP method) into the flat shape
 * expected by searchCdpSource().
 */
function flattenCdpImageSource(source) {
  const cap = source.capabilities.images;
  return {
    name: source.name,
    label: source.label,
    url: cap.url,
    primaryScript: cap.primaryScript,
    fallbackScript: cap.fallbackScript,
  };
}

/**
 * Flatten a source's capabilities.videos (ytdlp method) into the flat shape
 * expected by searchYtdlp() and downloadYtdlp().
 */
function flattenYtdlpVideoSource(source) {
  const cap = source.capabilities.videos;
  return {
    name: source.name,
    label: source.label,
    platform: cap.platform,
    type: "video",
    cookieRequired: cap.cookieRequired || false,
  };
}

/**
 * API source definitions — derived from source-registry capabilities.
 * Sources with capabilities.images.method === "api" are image API sources.
 * Sources with capabilities.videos.method === "api" are video API sources.
 * Lorem Picsum is excluded (deleted — returns random images).
 */
export const API_SOURCES = ALL_SOURCES.filter(
  (s) =>
    (s.capabilities?.images?.method === "api" || s.capabilities?.videos?.method === "api") &&
    s.name !== "lorem_picsum",
).map((s) => {
  if (s.capabilities.images) return flattenImageApiSource(s);
  return flattenVideoApiSource(s);
});

/**
 * yt-dlp source definitions — derived from source-registry capabilities.
 * Sources with capabilities.videos.method === "ytdlp".
 */
export const YTDLP_SOURCES = ALL_SOURCES.filter(
  (s) => s.capabilities?.videos?.method === "ytdlp",
).map(flattenYtdlpVideoSource);

/**
 * CDP source definitions — derived from source-registry capabilities.
 * Sources with capabilities.images.method === "cdp".
 */
export const CDP_SOURCES = ALL_SOURCES.filter((s) => s.capabilities?.images?.method === "cdp").map(
  flattenCdpImageSource,
);

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

// ─── T04 (#56): Cached-image flow ───

/**
 * Regex to detect logos, avatars, icons, placeholders, and spinners in image URLs.
 * Case-insensitive match on common non-content image patterns.
 */
const LOGO_ICON_REGEX = /logo|avatar|icon|placeholder|spinner|favicon|badge|button|sprite/i;

/**
 * Check if a URL points to a logo, avatar, icon, or other non-content image.
 *
 * @param {string} url - Image URL to check
 * @returns {boolean} true if URL matches logo/icon pattern
 */
export function isLogoOrIcon(url) {
  if (!url || typeof url !== "string") return true;
  return LOGO_ICON_REGEX.test(url);
}

/**
 * Check if a title contains any of the given keywords.
 * Case-insensitive substring match.
 *
 * @param {string} title - Article/source title
 * @param {string[]} keywords - Keywords to match
 * @returns {boolean} true if any keyword appears in title
 */
export function hasKeywordMatch(title, keywords) {
  if (!title || !keywords || keywords.length === 0) return false;
  const lower = title.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Load cached image URLs from trending-topics.json.
 *
 * Reads the trending-topics.json file produced by trend discovery (Stage 1),
 * extracts images from topics whose title matches any of the given keywords.
 * Images are filtered to exclude logos/icons.
 *
 * Scenario #6: File doesn't exist → returns empty array, normal search proceeds.
 *
 * @param {string} filePath - Path to trending-topics.json
 * @param {string[]} keywords - Asset search keywords to match against topic titles
 * @returns {Array<{url: string, sourceArticle: string|null, sourceTitle: string}>}
 */
/**
 * Normalize a Stage 1 cached image for the Stage 4 score, filter, and
 * attribution pipeline. The trend topic title supplies the only reliable
 * relevance metadata for a cached URL, while the article URL remains
 * provenance rather than an asset source identifier.
 */
export function toCachedImageCandidate(candidate) {
  return {
    ...candidate,
    title: candidate?.sourceTitle || candidate?.title || "",
    source: "cached",
    type: "image",
  };
}

export function loadCachedImages(filePath, keywords) {
  if (!filePath || !existsSync(filePath)) return [];
  if (!keywords || keywords.length === 0) return [];

  try {
    const content = readFileSync(filePath, "utf8");
    const data = JSON.parse(content);
    const results = [];

    // Iterate all topic categories
    const categories = data.topics || {};
    for (const category of Object.values(categories)) {
      if (!Array.isArray(category)) continue;
      for (const topic of category) {
        // Check if topic title matches any keyword
        if (!hasKeywordMatch(topic.title, keywords)) continue;

        // Extract images from topic
        const images = topic.images || [];
        for (const img of images) {
          if (!img.url) continue;
          // Filter out logos/icons (scenario #7)
          if (isLogoOrIcon(img.url)) continue;

          results.push({
            url: img.url,
            sourceArticle: img.sourceArticle || null,
            sourceTitle: topic.title,
          });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * SVE (#114): Normalize a cached media candidate from media-cache.json
 * for the score, filter, and download pipeline.
 *
 * The sourceTitle (from metadata.ogTitle or topic title) supplies the
 * relevance metadata, while sourceArticle is provenance.
 */
export function toCachedMediaCandidate(candidate) {
  return {
    ...candidate,
    title: candidate?.sourceTitle || candidate?.title || "",
    source: "cached-media",
    type: candidate?.type || "image",
  };
}

/**
 * SVE (#114): Load cached media from a media-cache.json file.
 *
 * Reads entries from detail-page media extraction (extract-media.mjs),
 * filters by keyword match on metadata.ogTitle or sourceUrl context,
 * and returns a flat array of image + video candidates.
 *
 * File missing → empty array. Malformed → empty array. No keyword
 * match → empty array. All gracefully degrading.
 *
 * @param {string} filePath - Path to media-cache.json
 * @param {string[]} keywords - Keywords to filter entries by
 * @returns {Array<{url, type, sourceArticle, sourceTitle}>}
 */
export function loadCachedMedia(filePath, keywords) {
  if (!filePath || !existsSync(filePath)) return [];
  if (!keywords || keywords.length === 0) return [];

  try {
    const content = readFileSync(filePath, "utf8");
    const data = JSON.parse(content);
    const results = [];

    const entries = Array.isArray(data.entries) ? data.entries : [];
    for (const entry of entries) {
      // Check if entry matches any keyword
      const matchText = [entry?.metadata?.ogTitle || "", entry?.sourceUrl || ""].join(" ");
      if (!hasKeywordMatch(matchText, keywords)) continue;

      // Extract images
      const images = Array.isArray(entry.images) ? entry.images : [];
      for (const img of images) {
        if (!img || !img.url) continue;
        if (isLogoOrIcon(img.url)) continue;
        results.push({
          url: img.url,
          type: "image",
          sourceArticle: entry.sourceUrl || null,
          sourceTitle: entry.metadata?.ogTitle || "",
        });
      }

      // Extract videos
      const videos = Array.isArray(entry.videos) ? entry.videos : [];
      for (const vid of videos) {
        if (!vid || !vid.url) continue;
        results.push({
          url: vid.url,
          type: "video",
          sourceArticle: entry.sourceUrl || null,
          sourceTitle: entry.metadata?.ogTitle || "",
        });
      }

      // Extract og:image as additional image candidate
      if (entry.metadata?.ogImage) {
        if (!isLogoOrIcon(entry.metadata.ogImage)) {
          results.push({
            url: entry.metadata.ogImage,
            type: "image",
            sourceArticle: entry.sourceUrl || null,
            sourceTitle: entry.metadata?.ogTitle || "",
          });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
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

// ─── URL dedup helpers (cross-phase Single Visit Extraction) ───

/**
 * Check if a URL has already been downloaded in this run.
 * Returns true if the URL is in the Set — caller should skip the download.
 *
 * @param {string} url - Candidate image/video URL
 * @param {Set<string>} downloadedUrls - Runtime set of already-downloaded URLs
 * @returns {boolean} true if URL was already downloaded (should skip)
 */
export function shouldSkipUrl(url, downloadedUrls) {
  if (!url || typeof url !== "string") return false;
  return downloadedUrls.has(url);
}

/**
 * Mark a URL as downloaded. Called after a successful download so that
 * subsequent phases don't re-download the same URL.
 *
 * @param {string} url - Successfully downloaded URL
 * @param {Set<string>} downloadedUrls - Runtime set to add to
 * @returns {void}
 */
export function markDownloaded(url, downloadedUrls) {
  if (url && typeof url === "string") {
    downloadedUrls.add(url);
  }
}

// ─── Main orchestrator ───

/**
 * Persist the optional search cache without letting a filesystem failure abort
 * the already completed media collection.
 */
export function persistSearchResultsCache(searchCachePath, searchCache, logger = console) {
  const cacheSave = saveSearchResultsCache(searchCachePath, searchCache);
  if (cacheSave.success) {
    logger.log(`\n💾 Search cache updated: ${searchCachePath}`);
  } else {
    logger.warn(`\n⚠️  Search cache was not saved: ${cacheSave.error}`);
  }
  return cacheSave;
}

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
  const sceneDataPath = join(contentDir, "scene-data.mjs");
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

  const searchCachePath = join(contentDir, "search-cache.json");
  const searchCache = loadSearchResultsCache(searchCachePath);
  let searchCacheDirty = false;
  console.log(`  Search cache: ${searchCache.entries.length} entries loaded`);

  // A working CDP connection is required only when at least one CDP query is
  // not already cached. This lets fully cached runs proceed without Chrome.
  const cdpSearchRequired = CDP_SOURCES.some((source) =>
    keywords.some(
      (keyword) =>
        !getCachedSearchResults(searchCache, {
          source: source.name,
          keyword,
        }),
    ),
  );
  if (cdpSearchRequired) {
    const cdpAvailable = await checkCdpAvailable();
    if (!cdpAvailable) {
      console.error("❌ CDP proxy not available at localhost:3456");
      console.error("   Enable Chrome Remote Debugging + start web-access skill proxy.");
      process.exit(1);
    }
    console.log("  ✅ CDP proxy available");
  } else {
    console.log("  ✅ CDP search results available from cache");
  }

  const allAssets = [];
  const failed = [];
  const skipped = [];

  // URL-level dedup across all phases (Phase 0, API, yt-dlp, CDP, Tier 3).
  // Prevents re-downloading the same image URL when different search
  // phases return overlapping results (Single Visit Extraction principle).
  const downloadedUrls = new Set();

  // ── Phase 0: Cached-image flow (from trend discovery) ──
  // R1: Check trending-topics.json for cached image URLs before making new CDP/API requests.
  // Images are filtered by keyword match + URL pattern (exclude logos/icons), then
  // pre-download filtered (technicalScore >= 20), then downloaded.
  const trendingTopicsPath = join(__dirname, "..", "output", "trending-topics.json");
  const cachedImages = loadCachedImages(trendingTopicsPath, keywords);
  if (cachedImages.length > 0) {
    console.log(`\n🖼️  Cached images (from trend discovery): ${cachedImages.length} found`);
    const scored = cachedImages
      .map((c) => {
        const candidate = toCachedImageCandidate(c);
        return {
          ...candidate,
          score: scoreCandidate(candidate, keywords[0]),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPerSource);

    for (let j = 0; j < scored.length; j++) {
      const candidate = scored[j];
      if (!candidate.url) continue;

      // T05: Pre-download filter
      const { technicalScore: preScore } = preFilterCandidate(candidate, keywords[0]);
      if (preScore < PRE_DOWNLOAD_FILTER_THRESHOLD) {
        skipped.push({
          source: "cached",
          reason: `pre-download filter (score: ${preScore})`,
        });
        continue;
      }

      // Skip if this URL was already downloaded by a prior phase
      if (downloadedUrls.has(candidate.url)) {
        skipped.push({ source: "cached", reason: "URL already downloaded" });
        continue;
      }

      const filename = buildFilename("cached", keywords[0], j + 1, "jpg");
      const destPath = join(assetsDir, filename);
      const dl = await downloadCandidate(candidate, { destPath, contentDir });
      if (dl.success) downloadedUrls.add(candidate.url);
      if (dl.success) {
        allAssets.push({
          ...candidate,
          path: dl.path,
          status: dl.skipped ? "already exists" : "downloaded",
        });
        console.log(`    ✅ cached: ${filename} (score: ${candidate.score})`);
      } else if (dl.skipped) {
        skipped.push({ source: "cached", reason: dl.error });
        console.log(`    ⏭️  cached: ${dl.error}`);
      } else {
        failed.push({ source: "cached", keyword: keywords[0], error: dl.error });
        console.log(`    ❌ cached: ${dl.error}`);
      }
    }
  } else {
    console.log("\n🖼️  No cached images found in trending-topics.json");
  }

  // ── Phase 0b: Cached media from detail pages (SVE #114) ──
  // Reads media-cache.json produced by extract-media.mjs during Stage 0.
  // Contains images + videos extracted from article detail pages that the
  // Agent already opened. Reuses existing score/filter/download pipeline.
  const mediaCachePath = join(contentDir, "research", "media-cache.json");
  const cachedMedia = loadCachedMedia(mediaCachePath, keywords);
  if (cachedMedia.length > 0) {
    console.log(`\n🎬  Cached media (from detail pages): ${cachedMedia.length} found`);
    const scoredMedia = cachedMedia
      .map((c) => {
        const candidate = toCachedMediaCandidate(c);
        return {
          ...candidate,
          score: scoreCandidate(candidate, keywords[0]),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPerSource);

    for (let j = 0; j < scoredMedia.length; j++) {
      const candidate = scoredMedia[j];
      if (!candidate.url) continue;

      // Skip if this URL was already downloaded by Phase 0 or prior
      if (downloadedUrls.has(candidate.url)) {
        skipped.push({ source: "cached-media", reason: "URL already downloaded" });
        continue;
      }

      const ext = candidate.type === "video" ? "mp4" : "jpg";
      const filename = buildFilename("cached-media", keywords[0], j + 1, ext);
      const destPath = join(assetsDir, filename);
      const dl = await downloadCandidate(candidate, { destPath, contentDir });
      if (dl.success) downloadedUrls.add(candidate.url);
      if (dl.success) {
        allAssets.push({
          ...candidate,
          path: dl.path,
          status: dl.skipped ? "already exists" : "downloaded",
        });
        console.log(`    ✅ cached-media: ${filename} (score: ${candidate.score})`);
      } else if (dl.skipped) {
        skipped.push({ source: "cached-media", reason: dl.error });
        console.log(`    ⏭️  cached-media: ${dl.error}`);
      } else {
        failed.push({ source: "cached-media", keyword: keywords[0], error: dl.error });
        console.log(`    ❌ cached-media: ${dl.error}`);
      }
    }
  } else {
    console.log("\n🎬  No cached media found in media-cache.json");
  }

  // ── API sources (parallel) ──
  console.log("\n📡 API sources:");
  const apiResults = await Promise.allSettled(
    API_SOURCES.map(async (source) => {
      const apiKey = source.apiKeyEnv ? getApiKey(env, source.apiKeyEnv) : null;
      const missingApiKey = source.requiresApiKey && !apiKey;
      let skippedForMissingApiKey = false;

      const candidates = await Promise.all(
        keywords.map(async (keyword) => {
          const result = await getOrSearchResults(searchCache, {
            source: source.name,
            keyword,
            search: () => searchApiSource(source, keyword, apiKey),
          });
          if (result.cacheHit) {
            console.log(`  ♻️  ${source.label} cache hit: "${keyword}"`);
          } else if (missingApiKey) {
            skippedForMissingApiKey = true;
          } else if (result.results.length > 0) {
            searchCacheDirty = true;
            console.log(`  💾 ${source.label} search cached: "${keyword}"`);
          }
          return result.results;
        }),
      );
      if (skippedForMissingApiKey) {
        skipped.push({ source: source.name, reason: "no API key" });
      }
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

      // Download — T05: pre-download filter gate (threshold 20)
      for (let j = 0; j < scored.length; j++) {
        const candidate = scored[j];

        // T05: Skip candidates with technicalScore < 20 before downloading
        const { technicalScore: preScore } = preFilterCandidate(candidate, keywords[0]);
        if (preScore < PRE_DOWNLOAD_FILTER_THRESHOLD) {
          skipped.push({
            source: candidate.source,
            reason: `pre-download filter (score: ${preScore})`,
          });
          continue;
        }

        const ext = candidate.type === "video" ? "mp4" : "jpg";
        const filename = buildFilename(candidate.source, keywords[0], j + 1, ext);
        const destPath = join(assetsDir, filename);

        if (candidate.url) {
          // Skip if this URL was already downloaded by a prior phase
          if (downloadedUrls.has(candidate.url)) {
            skipped.push({ source: candidate.source, reason: "URL already downloaded" });
            continue;
          }
          const headers = {};
          if (candidate.source === "wikimedia") {
            headers["User-Agent"] = "ChinaAINews/1.0 (contact@china-ai.news)";
          }
          const dl = await downloadCandidate(candidate, { destPath, contentDir, headers });
          if (dl.success) downloadedUrls.add(candidate.url);
          if (dl.success) {
            const assetEntry = {
              ...candidate,
              path: dl.path,
              status: dl.skipped ? "already exists" : "downloaded",
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
          } else if (dl.skipped) {
            skipped.push({ source: candidate.source, reason: dl.error });
            console.log(`    ⏭️  ${candidate.source}: ${dl.error}`);
          } else {
            failed.push({ source: candidate.source, keyword: keywords[0], error: dl.error });
            console.log(`    ❌ ${candidate.source}: ${dl.error}`);
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
      const result = await getOrSearchResults(searchCache, {
        source: source.name,
        keyword,
        search: () => searchYtdlp(keyword, source.platform),
      });
      const candidates = result.results;
      if (!result.cacheHit && candidates.length > 0) {
        searchCacheDirty = true;
        console.log("     Live search result queued for cache");
      } else if (result.cacheHit) {
        console.log("     Reused cached search result");
      }
      console.log(`     Found ${candidates.length} candidates`);

      const scored = candidates
        .map((c) => ({ ...c, score: scoreCandidate(c, keyword), source: source.name }))
        .sort((a, b) => b.score - a.score)
        .slice(0, maxPerSource);

      for (let j = 0; j < scored.length; j++) {
        const candidate = scored[j];

        // T05: Skip candidates with technicalScore < 20 before downloading
        const { technicalScore: preScore } = preFilterCandidate(candidate, keyword);
        if (preScore < PRE_DOWNLOAD_FILTER_THRESHOLD) {
          skipped.push({ source: source.name, reason: `pre-download filter (score: ${preScore})` });
          continue;
        }

        // Skip if this URL was already downloaded by a prior phase
        if (downloadedUrls.has(candidate.url)) {
          skipped.push({ source: source.name, reason: "URL already downloaded" });
          continue;
        }

        const filename = buildFilename(source.name, keyword, j + 1, "mp4");
        const destPath = join(assetsDir, filename);

        const dl = await downloadCandidate(candidate, { destPath, contentDir });
        if (dl.success) downloadedUrls.add(candidate.url);
        if (dl.success) {
          allAssets.push({
            ...candidate,
            path: dl.path,
            status: dl.skipped ? "already exists" : "downloaded",
          });
          console.log(`    ✅ ${source.name}: ${filename} (score: ${candidate.score})`);
        } else if (dl.skipped) {
          skipped.push({ source: source.name, reason: dl.error });
          console.log(`    ⏭️  ${source.name}: ${dl.error}`);
        } else {
          failed.push({ source: source.name, keyword, error: dl.error });
          console.log(`    ❌ ${source.name}: ${dl.error}`);
        }
      }
    }
  }

  // ── CDP sources (serial) ──
  console.log("\n📰 CDP sources (Chinese news sites):");
  for (const source of CDP_SOURCES) {
    for (const keyword of keywords) {
      console.log(`  🔍 ${source.label} search: "${keyword}"...`);
      const result = await getOrSearchResults(searchCache, {
        source: source.name,
        keyword,
        search: () => searchCdpSource(source, keyword),
      });
      const candidates = result.results;
      if (!result.cacheHit && candidates.length > 0) {
        searchCacheDirty = true;
        console.log("     Live search result queued for cache");
      } else if (result.cacheHit) {
        console.log("     Reused cached search result");
      }
      console.log(`     Found ${candidates.length} candidates`);

      const scored = candidates
        .map((c) => ({ ...c, score: scoreCandidate(c, keyword), source: source.name }))
        .sort((a, b) => b.score - a.score)
        .slice(0, maxPerSource);

      for (let j = 0; j < scored.length; j++) {
        const candidate = scored[j];
        if (!candidate.url) continue;

        // T3 updated: text candidates are article references, not downloadable images.
        // Add them directly as article sources (no file download needed).
        if (candidate.type === "text") {
          allAssets.push({
            ...candidate,
            path: null,
            status: "text-only",
          });
          console.log(
            `    📄 ${source.name}: text article "${candidate.title}" (score: ${candidate.score})`,
          );
          continue;
        }

        // T05: Skip candidates with technicalScore < 20 before downloading
        const { technicalScore: preScore } = preFilterCandidate(candidate, keyword);
        if (preScore < PRE_DOWNLOAD_FILTER_THRESHOLD) {
          skipped.push({ source: source.name, reason: `pre-download filter (score: ${preScore})` });
          continue;
        }

        // Skip if this URL was already downloaded by a prior phase
        if (downloadedUrls.has(candidate.url)) {
          skipped.push({ source: source.name, reason: "URL already downloaded" });
          continue;
        }

        const filename = buildFilename(source.name, keyword, j + 1, "jpg");
        const destPath = join(assetsDir, filename);

        const dl = await downloadCandidate(candidate, { destPath, contentDir });
        if (dl.success) downloadedUrls.add(candidate.url);
        if (dl.success) {
          allAssets.push({
            ...candidate,
            path: dl.path,
            status: dl.skipped ? "already exists" : "downloaded",
          });
          console.log(`    ✅ ${source.name}: ${filename} (score: ${candidate.score})`);
        } else if (dl.skipped) {
          skipped.push({ source: source.name, reason: dl.error });
          console.log(`    ⏭️  ${source.name}: ${dl.error}`);
        } else {
          failed.push({ source: source.name, keyword, error: dl.error });
          console.log(`    ❌ ${source.name}: ${dl.error}`);
        }
      }
    }
  }

  if (searchCacheDirty) {
    persistSearchResultsCache(searchCachePath, searchCache);
  }

  // ── Tier 3: Progressive (Open Search Engine) Image Search ──
  // Issue #110: Only triggers when Tier 1 (stock API) + Tier 2 (CDP news)
  // yield insufficient results. Searches Brave Image API + SearXNG image
  // search in parallel. Results are copyright-unverified — attribution
  // marks them for manual review.
  const scenesNeedingMedia = scenes.filter(
    (s) => !NO_MEDIA_TYPES.has(s.visualType) && !s.media,
  ).length;
  if (shouldTriggerTier3(allAssets.length, scenesNeedingMedia)) {
    console.log("\n🔍 Tier 3: Progressive Search (open search engine images):");
    console.log(
      `   ${allAssets.length} assets found in Tier 1+2, ${scenesNeedingMedia} scenes need media`,
    );

    const tier3QuotaTracker = new BraveQuotaTracker();
    const tier3Sources = API_SOURCES.filter(
      (s) => s.name === "brave_image" || s.name === "searxng_image",
    );

    // Engines in parallel (Promise.allSettled), each engine internally serial on keywords
    // to avoid anti-bot rate limiting from the same engine.
    const tier3Results = await Promise.allSettled(
      tier3Sources.map(async (source) => {
        const apiKey = source.apiKeyEnv ? getApiKey(env, source.apiKeyEnv) : null;
        const missingApiKey = source.requiresApiKey && !apiKey;
        if (missingApiKey) {
          return { skipped: { source: source.name, reason: "no API key" }, assets: [], failed: [] };
        }

        const engineAssets = [];
        const engineFailed = [];

        for (const keyword of keywords) {
          console.log(`  🔍 ${source.label} search: "${keyword}"...`);
          const result = await getOrSearchResults(searchCache, {
            source: source.name,
            keyword,
            search: () => {
              if (source.name === "brave_image") {
                return searchBraveImages(keyword, apiKey, {
                  count: 20,
                  quotaTracker: tier3QuotaTracker,
                });
              } else {
                return searchSearXngImages(keyword, { count: 20 });
              }
            },
          });
          const candidates = result.results;
          if (!result.cacheHit && candidates.length > 0) {
            console.log(`     Found ${candidates.length} candidates`);
          } else if (result.cacheHit) {
            console.log(`     ♻️  Cache hit: ${candidates.length} candidates`);
          } else {
            console.log(`     Found ${candidates.length} candidates`);
          }

          const scored = candidates
            .map((c) => ({ ...c, score: scoreCandidate(c, keyword), source: source.name }))
            .sort((a, b) => b.score - a.score)
            .slice(0, maxPerSource);

          for (let j = 0; j < scored.length; j++) {
            const candidate = scored[j];
            if (!candidate.url) continue;

            const { technicalScore: preScore } = preFilterCandidate(candidate, keyword);
            if (preScore < PRE_DOWNLOAD_FILTER_THRESHOLD) {
              engineFailed.push({
                source: source.name,
                reason: `pre-download filter (score: ${preScore})`,
              });
              continue;
            }

            // Skip if this URL was already downloaded by a prior phase
            if (downloadedUrls.has(candidate.url)) {
              engineFailed.push({ source: source.name, reason: "URL already downloaded" });
              continue;
            }

            const filename = buildFilename(source.name, keyword, j + 1, "jpg");
            const destPath = join(assetsDir, filename);
            const dl = await downloadCandidate(candidate, { destPath, contentDir });
            if (dl.success) downloadedUrls.add(candidate.url);
            if (dl.success) {
              engineAssets.push({
                ...candidate,
                path: dl.path,
                status: dl.skipped ? "already exists" : "downloaded",
              });
              console.log(`    ✅ ${source.name}: ${filename} (score: ${candidate.score})`);
            } else if (dl.skipped) {
              engineFailed.push({ source: source.name, reason: dl.error });
              console.log(`    ⏭️  ${source.name}: ${dl.error}`);
            } else {
              engineFailed.push({ source: source.name, keyword, error: dl.error });
              console.log(`    ❌ ${source.name}: ${dl.error}`);
            }
          }
        }

        return { assets: engineAssets, failed: engineFailed, cacheDirty: true };
      }),
    );

    // Merge parallel results back into allAssets, failed, skipped
    for (const result of tier3Results) {
      if (result.status === "fulfilled") {
        const { skipped: skippedEntry, assets, failed: failedEntries } = result.value;
        if (skippedEntry) {
          skipped.push(skippedEntry);
          console.log(`  ⏭️  ${skippedEntry.source}: skipped (no API key)`);
        }
        allAssets.push(...assets);
        failed.push(...failedEntries);
        if (result.value.cacheDirty) searchCacheDirty = true;
      } else {
        console.log(`  ❌ Engine failed: ${result.reason?.message || "unknown error"}`);
      }
    }

    if (searchCacheDirty) {
      persistSearchResultsCache(searchCachePath, searchCache);
    }
    console.log(`   Tier 3 complete: ${allAssets.length} total assets now`);
  } else {
    console.log(
      `\n✅ Tier 3 skipped: ${allAssets.length} assets >= ${scenesNeedingMedia} scenes needing media`,
    );
  }

  // ── AI Analysis (after download, before assignment) ──
  let aiAnalysis = [];
  if (allAssets.length > 0) {
    console.log("\n🤖 AI Analysis:");
    // P0-1 fix: pass contentDir to analyzeAssets instead of mutating asset.path
    // asset.path stays relative; analyzeAssets resolves to absolute internally
    try {
      aiAnalysis = await analyzeAssets(allAssets, {
        outputDir: join(__dirname, "..", "output"),
        contentDir,
        contentSlug,
      });
      // Re-score assets with VLM description (Phase 2c: semantic scoring)
      for (const asset of allAssets) {
        if (asset.description) {
          const kw = asset.searchKeyword || keywords[0];
          asset.score = scoreCandidate(asset, kw, {
            description: asset.description,
            subjects: asset.subjects || [],
          });
        }
      }
    } catch (err) {
      console.warn(`⚠️  AI analysis layer not available: ${err.message}`);
    } finally {
      // Close VLM process — analyzeAssets no longer closes it itself,
      // so we must close it here to release the ~2GB 2B-4bit model.
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
  // P0-1 fix: normalize any absolute paths back to relative before writing patch
  for (const asset of allAssets) {
    if (asset.path) {
      asset.path = normalizePathForPatch(asset.path, contentDir);
    }
  }
  const patches = assignAssetsToScenes(allAssets, scenes);
  // Defensive: also normalize media.path in patches
  for (const patch of patches) {
    if (patch.media?.path) {
      patch.media.path = normalizePathForPatch(patch.media.path, contentDir);
    }
  }
  // P1-3: isolate media-patch.json by content slug
  const patchDir = contentSlug
    ? join(__dirname, "..", "output", contentSlug)
    : join(__dirname, "..", "output");
  const patchPath = join(patchDir, "media-patch.json");
  // Ensure the directory exists
  if (contentSlug) {
    mkdirSync(patchDir, { recursive: true });
  }
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
