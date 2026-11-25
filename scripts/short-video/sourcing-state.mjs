#!/usr/bin/env node
/**
 * sourcing-state CLI — explain what the #228 sourcing short circuit would do
 * for one pack, without running the pipeline.
 *
 * Usage:
 *   node scripts/short-video/sourcing-state.mjs --content <slug> [--state <file>] [--json]
 *
 * It loads the pack exactly as the pipeline does (scene-data.mjs), builds the
 * search plan digest, compares it with the persisted `output/<slug>/sourcing-state.json`,
 * and checks every assigned media-patch file is still on disk. The verdict is
 * advisory: `would source` / `would skip`. Exit code is 0 for both — this tool
 * reports a decision, it does not gate anything.
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { evaluateSourcingShortCircuit, SOURCING_STATE_FILE } from "./lib/sourcing-run-state.mjs";
import { containedPath } from "./lib/path-safety.mjs";

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
    state: value("state"),
    json: args.includes("--json"),
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.content) {
    console.error("❌ 用法：--content <slug> [--state <file>] [--json]");
    return 1;
  }

  const contentDirAbs = containedPath(SCRIPT_DIR, "content", options.content);
  const sceneFile = containedPath(contentDirAbs, "scene-data.mjs");
  if (!existsSync(sceneFile)) {
    console.error(`❌ 找不到内容包：${sceneFile}`);
    return 1;
  }
  const mod = await import(pathToFileURL(sceneFile).href);
  const scenes = Array.isArray(mod.scenes) ? mod.scenes : [];

  const outputDirAbs = containedPath(SCRIPT_DIR, "output", options.content);
  const stateFile = options.state ?? containedPath(outputDirAbs, SOURCING_STATE_FILE);
  let state = null;
  if (existsSync(stateFile)) {
    try {
      state = JSON.parse(readFileSync(stateFile, "utf8"));
    } catch {
      state = null;
    }
  }

  let patch = null;
  const patchFile = containedPath(outputDirAbs, "media-patch.json");
  if (existsSync(patchFile)) {
    try {
      patch = JSON.parse(readFileSync(patchFile, "utf8"));
    } catch {
      patch = null;
    }
  }

  const decision = evaluateSourcingShortCircuit({ scenes, state, patch, contentDirAbs });

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          content: options.content,
          scenes: scenes.length,
          digest: decision.digest,
          stateDigest: state?.digest ?? null,
          stateCompletedAt: state?.completedAt ?? null,
          patchAssigned: decision.assigned,
          verdict: decision.skip ? "would skip" : "would source",
          reason: decision.reason,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(`\nSourcing short circuit — ${options.content}`);
  console.log(`  scenes: ${scenes.length}`);
  console.log(`  digest: ${decision.digest}  state: ${state?.digest ?? "（无）"}`);
  console.log(`  patch:  ${patch ? `${decision.assigned} assigned asset(s)` : "（无）"}`);
  console.log(`  verdict: ${decision.skip ? "⏭  would skip sourcing" : "🔍 would source"}`);
  console.log(`  reason:  ${decision.reason}\n`);
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}
