#!/usr/bin/env node
/**
 * #1030 — Real-data smoke: replay the allocator's animation / source-tier
 * decisions over the `asset-analysis.json` files of REAL content packs and
 * report what changes versus the pre-#1030 rules.
 *
 * Read-only: does not re-render, re-download or mutate any content pack.
 *
 * Usage:
 *   node scripts/short-video/replay-animation-decisions.mjs \
 *     --packs /path/to/scripts/short-video/output
 *
 * `--packs` defaults to <repo>/scripts/short-video/output. Content packs are
 * gitignored and machine-bound, so a fresh worktree legitimately has none:
 * this script FAILS LOUDLY (exit 2) on an empty scan — or a scan with zero
 * media assets — instead of printing a green-looking zero report. CI asserts
 * the same behaviour against committed fixtures under __tests__/fixtures/.
 */
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  selectAnimationForAsset,
  sourceTierRank,
  assignAssetsToScenes,
} from "./lib/asset-sourcer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKS_ROOT = resolve(__dirname, "output");

/** Pre-#1030 producer: video → fade, image → ken-burns, nothing else considered. */
export const oldAnimation = (asset) => (asset.type === "video" ? "fade" : "ken-burns");

/** Real packs often omit `source`; fall back to the stock-library slug in the path. */
export function inferSource(asset) {
  if (asset.source) return asset.source;
  const path = String(asset.path || "").toLowerCase();
  for (const name of ["pexels-video", "pexels", "pixabay", "unsplash", "coverr", "wikimedia"]) {
    if (path.includes(name)) return name;
  }
  return "unknown";
}

/**
 * @param {string} outputRoot directory whose immediate subdirs are content packs
 * @returns {Object} before/after statistics
 * @throws {Error} when no pack carries an asset-analysis.json (fail loud)
 */
export function replayPacks(outputRoot = DEFAULT_PACKS_ROOT) {
  const packs = existsSync(outputRoot)
    ? readdirSync(outputRoot, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() && existsSync(join(outputRoot, entry.name, "asset-analysis.json")),
        )
        .map((entry) => entry.name)
        .sort()
    : [];

  if (packs.length === 0) {
    throw new Error(
      `No real content packs found under ${outputRoot}. ` +
        "Pass --packs <dir> pointing at a checkout that has scripts/short-video/output/<pack>/asset-analysis.json — " +
        "an empty replay is not evidence.",
    );
  }

  const stats = {
    outputRoot,
    packCount: packs.length,
    packs,
    assets: 0,
    animationChanged: 0,
    reasons: { talking_head_video: 0, static_image: 0, contain_image: 0 },
    tierChanges: 0,
    sample: [],
  };

  for (const pack of packs) {
    const doc = JSON.parse(readFileSync(join(outputRoot, pack, "asset-analysis.json"), "utf-8"));
    const assets = (doc.assets || []).filter(
      (asset) => asset && (asset.type === "video" || asset.type === "image"),
    );
    stats.assets += assets.length;

    for (const asset of assets) {
      const before = oldAnimation(asset);
      const after = selectAnimationForAsset(asset, asset.fit);
      if (before === after) continue;
      stats.animationChanged++;
      if (asset.type === "video" && asset.contentKind === "talking_head") {
        stats.reasons.talking_head_video++;
      } else if (["chart", "text_screenshot"].includes(asset.contentKind)) {
        stats.reasons.static_image++;
      } else if (asset.fit === "contain") {
        stats.reasons.contain_image++;
      }
      if (stats.sample.length < 6) {
        stats.sample.push({
          pack,
          path: asset.path,
          type: asset.type,
          contentKind: asset.contentKind ?? null,
          fit: asset.fit ?? null,
          before,
          after,
        });
      }
    }

    // Same-type ordering only: source tier ahead of technical score.
    const decorated = assets.map((asset) => ({
      ...asset,
      source: inferSource(asset),
      score: asset.technicalScore ?? 0,
    }));
    for (const type of ["video", "image"]) {
      const group = decorated.filter((asset) => asset.type === type);
      if (group.length < 2) continue;
      const oldFirst = [...group].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      const newFirst = [...group].sort(
        (a, b) => sourceTierRank(b) - sourceTierRank(a) || (b.score || 0) - (a.score || 0),
      )[0];
      if (oldFirst.path !== newFirst.path) stats.tierChanges++;
    }
  }

  // A pack directory with an empty `assets` array is just as vacuous as no
  // pack at all: it would print an all-zero "before/after" report and exit 0.
  if (stats.assets === 0) {
    throw new Error(
      `Found ${packs.length} content pack(s) under ${outputRoot} but zero media assets. ` +
        "An all-zero replay is not evidence — point --packs at a real output/ tree.",
    );
  }

  return stats;
}

/**
 * Synthetic control — NOT real data. Runs the full allocator so the replay
 * checks the written `media` field, not only the two pure functions.
 */
export function allocatorControl() {
  const scenes = [{ id: 2, visualType: "narrative", media: undefined }];
  const pair = [
    {
      path: "assets/pexels-generic-01.jpg",
      type: "image",
      score: 95,
      source: "pexels",
      claimSceneId: 2,
      relevanceScore: 90,
      fit: "cover",
    },
    {
      path: "assets/qbitai-first-party-01.jpg",
      type: "image",
      score: 70,
      source: "qbitai",
      claimSceneId: 2,
      relevanceScore: 90,
      fit: "cover",
      contentKind: "chart",
    },
  ];
  const assigned = assignAssetsToScenes(pair, scenes).find((r) => r.status === "assigned");
  return {
    chosenPath: assigned.media.path,
    chosenSource: assigned.media.source,
    animation: assigned.media.animation,
    volume: assigned.media.volume ?? null,
  };
}

const isCli =
  Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const flag = process.argv.indexOf("--packs");
  const root = flag > -1 ? resolve(process.argv[flag + 1]) : DEFAULT_PACKS_ROOT;
  try {
    const report = { ...replayPacks(root), control: allocatorControl() };
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`[replay-animation-decisions] ${error.message}`);
    process.exitCode = 2;
  }
}
