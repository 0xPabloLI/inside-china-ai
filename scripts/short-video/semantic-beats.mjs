#!/usr/bin/env node
/**
 * semantic-beats CLI — validate the News SHOTBOOK beats in Scene Data (#733 S2).
 *
 * Usage:
 *   node scripts/short-video/semantic-beats.mjs --content <slug> [--json]
 *   node scripts/short-video/semantic-beats.mjs --check [--root <short-video dir>] [--json]
 *   node scripts/short-video/semantic-beats.mjs --roles
 *
 * `--content` validates one pack and prints its beats; `--check` walks every
 * shipped pack (packs without beats are skipped, not failed); `--roles` prints
 * the closed 26-role vocabulary.
 *
 * Exit codes: 0 valid; 1 a pack violates the contract or cannot be imported.
 * This is an authoring gate — it is not wired into render or preflight yet.
 */

import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BEAT_SCHEMA_VERSION,
  NEWS_BEAT_ROLES,
  NEWS_BEAT_ROLE_IDS,
  validatePackBeats,
} from "./lib/semantic-beats.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function parseArgs(args) {
  const value = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 && index + 1 < args.length && !args[index + 1].startsWith("--")
      ? args[index + 1]
      : null;
  };
  return {
    content: value("content"),
    check: args.includes("--check"),
    roles: args.includes("--roles"),
    root: value("root") ?? SCRIPT_DIR,
    json: args.includes("--json"),
  };
}

async function loadScenes(root, slug) {
  const sceneFile = join(root, "content", slug, "scene-data.mjs");
  if (!existsSync(sceneFile)) throw new Error(`no scene-data.mjs for content "${slug}"`);
  const mod = await import(pathToFileURL(sceneFile).href);
  if (!Array.isArray(mod.scenes)) throw new Error(`content "${slug}" exports no scenes array`);
  return mod.scenes;
}

function shippedSlugs(root) {
  const contentRoot = join(root, "content");
  if (!existsSync(contentRoot)) throw new Error(`no content directory at ${contentRoot}`);
  return readdirSync(contentRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .filter((slug) => existsSync(join(contentRoot, slug, "scene-data.mjs")));
}

function formatErrors(slug, result) {
  return result.errors.map(
    (error) =>
      `${slug}${error.sceneId === null ? "" : ` scene ${error.sceneId}`}: ${error.code} — ${error.message}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.roles) {
    if (args.json) {
      console.log(
        JSON.stringify({ schemaVersion: BEAT_SCHEMA_VERSION, roles: NEWS_BEAT_ROLES }, null, 2),
      );
    } else {
      console.log(
        `News SHOTBOOK roles (${NEWS_BEAT_ROLE_IDS.length}, schema v${BEAT_SCHEMA_VERSION}):`,
      );
      for (const id of NEWS_BEAT_ROLE_IDS) {
        console.log(
          `  ${id.padEnd(12)} ${NEWS_BEAT_ROLES[id].label.padEnd(12)} ${NEWS_BEAT_ROLES[id].use}`,
        );
      }
    }
    return;
  }
  if (!args.content && !args.check) {
    console.error("usage: semantic-beats --content <slug> | --check | --roles [--json]");
    process.exitCode = 1;
    return;
  }

  const targets = args.content ? [args.content] : shippedSlugs(args.root);
  const reports = [];
  for (const slug of targets) {
    let scenes;
    try {
      scenes = await loadScenes(args.root, slug);
    } catch (error) {
      reports.push({ slug, ok: false, error: error.message });
      continue;
    }
    const result = validatePackBeats(scenes);
    reports.push({ slug, ...result });
  }

  const failed = reports.filter((report) => !report.ok);
  if (args.json) {
    console.log(JSON.stringify({ schemaVersion: BEAT_SCHEMA_VERSION, reports }, null, 2));
  } else {
    for (const report of reports) {
      if (report.error) {
        console.log(`✗ ${report.slug}: ${report.error}`);
        continue;
      }
      const status = report.ok ? "✓" : "✗";
      const scope =
        report.beatCount === 0
          ? "no beats (opt-in, skipped)"
          : `${report.beatCount} beats across ${report.scenesWithBeats} scenes`;
      console.log(`${status} ${report.slug}: ${scope}`);
      if (!report.ok) {
        for (const line of formatErrors(report.slug, report)) console.log(`    ${line}`);
      }
    }
    if (failed.length > 0) console.log(`\n${failed.length}/${reports.length} pack(s) invalid`);
  }
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`semantic-beats failed: ${error.message}`);
  process.exitCode = 1;
});
