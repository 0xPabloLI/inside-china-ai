// Video-fit is an inventory score, not an editorial promise. A topic only
// earns a high score when the content package can actually show motion: the
// number of usable motion clips and their total seconds are measured from
// `content/<slug>/assets/`, then the declared `meta.videoFit` is checked against
// that measurement. This closes the 2026-11-20 failure where two published
// videos declared "video fit" but shipped 2-3 stills and zero motion.
// From score 3 up, the scenes must also bind image/video media to at least
// 60% of non-CTA scenes; score 4+ additionally checks hook evidence and motion
// clips actually used in scenes.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mediaRoleOf } from "./media-role.mjs";

const VIDEO_FIT_POLICY_DATE = "2026-11-20";
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const MIN_VIDEO_WIDTH = 640;
const MIN_VIDEO_HEIGHT = 360;
const MIN_IMAGE_WIDTH = 640;
const MIN_IMAGE_HEIGHT = 360;
const MOTION_SECONDS_CAP_PER_CLIP = 10;

function round1(value) {
  return Math.round(value * 10) / 10;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      // Working copies live under underscore folders; the inventory should
      // describe the curated package, not duplicates made while building it.
      if (entry.name.startsWith("_")) continue;
      files.push(...walkFiles(absolute));
    } else if (entry.isFile()) {
      // Render-time upscales live beside the source and are not new assets.
      if (/-resampled\.|-upscaled\./i.test(entry.name)) continue;
      files.push(absolute);
    }
  }
  return files;
}

function resolveFfprobe() {
  const candidates = [
    process.env.FFPROBE_PATH,
    "/opt/homebrew/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    "/usr/bin/ffprobe",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? "ffprobe";
}

const FFPROBE = resolveFfprobe();

function probeMedia(file) {
  try {
    const json = execFileSync(
      FFPROBE,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height:format=duration",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const parsed = JSON.parse(json);
    const stream = parsed.streams?.[0] ?? {};
    const width = finite(stream.width);
    const height = finite(stream.height);
    const duration = finite(parsed.format?.duration);
    return { ok: width > 0 && height > 0, width, height, duration };
  } catch {
    return { ok: false, width: 0, height: 0, duration: 0 };
  }
}

/**
 * Read the curated asset package. Only files that clear the minimum frame size
 * count; a 165×144 logo is not a visual, and a 120-second demo is capped at
 * 10 counted seconds per clip so one long screen recording cannot buy a 5.
 */
function scanAssetInventory(assetsDir, { probe = probeMedia } = {}) {
  const inventory = { videos: [], images: [], skipped: [] };
  for (const file of walkFiles(assetsDir)) {
    const extension = extname(file).toLowerCase();
    const kind = VIDEO_EXTENSIONS.has(extension)
      ? "video"
      : IMAGE_EXTENSIONS.has(extension)
        ? "image"
        : null;
    if (!kind) continue;
    const media = probe(file);
    const minWidth = kind === "video" ? MIN_VIDEO_WIDTH : MIN_IMAGE_WIDTH;
    const minHeight = kind === "video" ? MIN_VIDEO_HEIGHT : MIN_IMAGE_HEIGHT;
    if (!media.ok || media.width < minWidth || media.height < minHeight) {
      inventory.skipped.push({
        path: file,
        kind,
        reason: media.ok ? `small frame ${media.width}×${media.height}` : "unreadable",
      });
      continue;
    }
    if (kind === "video") {
      if (media.duration < 1) {
        inventory.skipped.push({ path: file, kind, reason: "shorter than 1s" });
        continue;
      }
      inventory.videos.push({
        path: file,
        width: media.width,
        height: media.height,
        duration: round1(media.duration),
      });
    } else {
      inventory.images.push({ path: file, width: media.width, height: media.height });
    }
  }
  return inventory;
}

/**
 * 5: two motion clips, ≥15 counted seconds, ≥4 stills.
 * 4: one motion clip, ≥8 counted seconds, ≥3 stills.
 * 3: one short motion clip and ≥2 stills, or ≥6 stills.
 * 2: ≥3 stills, no motion. 1: 1-2 stills. 0: nothing usable.
 */
export function scoreVideoFit(inventory = {}) {
  const videos = inventory.videos ?? [];
  const images = inventory.images ?? [];
  const motionClipCount = videos.length;
  const motionSeconds = round1(
    videos.reduce(
      (sum, video) => sum + Math.min(finite(video.duration), MOTION_SECONDS_CAP_PER_CLIP),
      0,
    ),
  );
  const stillCount = images.length;

  let score = 0;
  if (motionClipCount >= 2 && motionSeconds >= 15 && stillCount >= 4) score = 5;
  else if (motionClipCount >= 1 && motionSeconds >= 8 && stillCount >= 3) score = 4;
  else if ((motionClipCount >= 1 && motionSeconds >= 3 && stillCount >= 2) || stillCount >= 6)
    score = 3;
  else if (stillCount >= 3) score = 2;
  else if (stillCount >= 1) score = 1;

  return { score, motionClipCount, motionSeconds, stillCount };
}

function sceneHasMedia(scene) {
  return Boolean(scene?.media?.path && scene?.media?.type);
}

function isHook(scene, index) {
  return scene?.visualType === "hook" || index === 0;
}

function isCta(scene) {
  return scene?.visualType === "cta" || scene?.sceneType === "cta";
}

/**
 * Production readiness bit. A package can start rendering once the curated
 * assets clear the minimum density floor (score 2: 3 stills, or a short motion
 * clip plus 2 stills). The topic-stage `videoFit` is a potential score and
 * lives in `lib/topic-video-fit.mjs`; do not conflate the two.
 */
export function assetReadyFromInventory(inventory = {}) {
  return scoreVideoFit(inventory).score >= 2 ? 1 : 0;
}

/**
 * Pure decision layer: takes a scanned inventory plus authored scenes/meta and
 * returns gate rows. Keeping it pure lets tests encode the two published
 * failures without decoding real videos.
 */
export function evaluateVideoFit({ inventory = {}, meta = {}, scenes = [] } = {}) {
  const measured = scoreVideoFit(inventory);
  const actual = measured.score;
  const assetReady = assetReadyFromInventory(inventory);
  const claimed = Number.isInteger(meta.videoFit) ? meta.videoFit : null;
  const policyDate = String(meta.createdAt ?? "");
  const requiresDeclaration = policyDate >= VIDEO_FIT_POLICY_DATE;
  const rows = [];

  if (claimed === null) {
    rows.push({
      level: requiresDeclaration ? "fail" : "pass",
      check: "videoFit declared",
      detail: requiresDeclaration
        ? `meta.videoFit missing for a package created on/after ${VIDEO_FIT_POLICY_DATE}`
        : "legacy package — no declaration required",
      fix: requiresDeclaration
        ? "Add meta.videoFit from the measured asset score; a 4+ claim also needs motion used in scenes."
        : "",
    });
  } else {
    rows.push({
      level: "pass",
      check: "videoFit declared",
      detail: `claimed ${claimed}`,
    });
  }

  const densityBlocked = actual < 2 && (requiresDeclaration || claimed !== null);
  rows.push({
    level: densityBlocked ? "fail" : "pass",
    check: "asset inventory",
    detail:
      `${measured.motionClipCount} motion clips / ${measured.motionSeconds}s counted; ` +
      `${measured.stillCount} stills → score ${actual}` +
      (densityBlocked ? "" : " (legacy package — not gated)"),
    fix: densityBlocked
      ? "Download at least 3 usable stills, or a motion clip of 3s+ plus 2 stills, into content/<slug>/assets/."
      : "",
  });

  if (claimed !== null && claimed > actual) {
    rows.push({
      level: "fail",
      check: "videoFit claim ≤ measured inventory",
      detail: `declared ${claimed}, but the assets only support ${actual}`,
      fix: "Declare the measured score, or acquire the missing motion/stills before claiming a higher fit.",
    });
  }

  if (actual >= 3) {
    const renderable = scenes.filter((scene) => !isCta(scene));
    const withMedia = renderable.filter(sceneHasMedia);
    const coverage = renderable.length ? withMedia.length / renderable.length : 0;
    rows.push({
      level: coverage >= 0.6 ? "pass" : "fail",
      check: "videoFit media coverage ≥60%",
      detail: `${withMedia.length}/${renderable.length} non-CTA scenes have media`,
      fix: "Bind image or video media to at least 60% of the non-CTA scenes.",
    });
  }

  if (actual >= 4) {
    const hookIndex = scenes.findIndex((scene, index) => isHook(scene, index));
    const hook = hookIndex >= 0 ? scenes[hookIndex] : null;
    const hookHasMedia = sceneHasMedia(hook);
    // A hook only renders evidence media: `renderableMedia` returns null for
    // background/card roles, so a bound clip with the default role is a
    // text-only first frame in the delivered video. Inventory alone must not
    // earn the point (2026-11-20 WorkBuddy: clip declared, hook rendered black).
    const hookIsRenderable = hookHasMedia && mediaRoleOf(hook) === "evidence";
    const hookHasMotion = hookIsRenderable && hook?.media?.type === "video";
    const usedVideoPaths = new Set(
      scenes.filter((scene) => scene?.media?.type === "video").map((scene) => scene.media.path),
    );
    const requiredVideos = actual >= 5 ? 2 : 1;

    rows.push({
      level: hookIsRenderable ? "pass" : "fail",
      check: "videoFit hook has renderable evidence media",
      detail: hookIsRenderable
        ? `scene ${hook?.id ?? hookIndex + 1}: ${hook.media.type} ${hook.media.path}`
        : hookHasMedia
          ? `hook media is ${mediaRoleOf(hook)}; the hook renderer drops it`
          : "hook is CSS-only",
      fix: "Bind evidence media to the hook (mediaRole: evidence); videoFit 4+ cannot start on a text frame.",
    });

    if (actual >= 5) {
      rows.push({
        level: hookHasMotion ? "pass" : "fail",
        check: "videoFit 5 hook is motion",
        detail: hookHasMotion ? `${hook.media.path}` : "hook media is not a video clip",
        fix: "Use one of the motion clips as the hook background.",
      });
    }

    rows.push({
      level: usedVideoPaths.size >= requiredVideos ? "pass" : "fail",
      check: `videoFit uses ≥${requiredVideos} motion clip(s) in scenes`,
      detail: `${usedVideoPaths.size} distinct video path(s) used`,
      fix: "Bind the downloaded clips into actual scenes; clips sitting unused in assets do not count as delivered motion.",
    });
  }

  return { actual, assetReady, claimed, measured, rows };
}

export function checkVideoFit({ scenes, meta, contentDirAbs }) {
  const inventory = scanAssetInventory(join(contentDirAbs, "assets"));
  return evaluateVideoFit({ inventory, meta, scenes });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const contentIndex = process.argv.indexOf("--content");
  const content = contentIndex >= 0 ? process.argv[contentIndex + 1] : null;
  if (!content) {
    console.error("Usage: node scripts/short-video/lib/video-fit.mjs --content <slug>");
    process.exit(2);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const assetsDir = join(here, "..", "content", content, "assets");
  const inventory = scanAssetInventory(assetsDir);
  const measured = scoreVideoFit(inventory);
  console.log(
    JSON.stringify(
      {
        content,
        assetsDir,
        ...measured,
        assetFit: measured.score,
        assetReady: assetReadyFromInventory(inventory),
      },
      null,
      2,
    ),
  );
  if (inventory.skipped.length > 0) {
    console.log("Skipped:");
    for (const item of inventory.skipped) console.log(`- ${item.path}: ${item.reason}`);
  }
}
