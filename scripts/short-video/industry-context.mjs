#!/usr/bin/env node
/**
 * Industry context CLI (#253 S2).
 *
 *   node scripts/short-video/industry-context.mjs --content <dir> [--today YYYY-MM-DD]
 *                                                 [--print-only] [--json]
 *
 * Reads the pack's meta.mjs + scene-data.mjs, derives the ledger entities the
 * pack talks about, and writes `content/<dir>/industry-context.json` — the
 * Stage 3 writer's injection block. Only `current` facts enter it; stale facts
 * are flagged with their age so the writer can qualify them as "as of <month>".
 *
 * Exit codes: 0 rendered (even when no entity matched), 1 bad arguments or
 * unreadable pack.
 */

import { existsSync, realpathSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { buildIndustryContext, formatIndustryContext } from "./lib/industry-context.mjs";
import { listContentDirs, resolveContentDir } from "./lib/cli-content.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };
  const printOnly = args.includes("--print-only");
  const asJson = args.includes("--json");
  const today = getArg("today") ?? new Date().toISOString().slice(0, 10);

  const resolved = resolveContentDir({ argv: args, baseDir: __dirname, defaultContent: null });
  if (!resolved.ok || !resolved.contentDir) {
    const message = resolved.ok ? "--content is required" : resolved.message;
    console.error(`❌ ${message}`);
    for (const dir of listContentDirs(__dirname)) console.error(`   - ${dir}`);
    process.exit(1);
  }

  const packDir = resolve(__dirname, "content", resolved.contentDir);
  for (const file of ["meta.mjs", "scene-data.mjs"]) {
    if (!existsSync(join(packDir, file))) {
      console.error(`❌ ${file} not found in ${packDir}`);
      process.exit(1);
    }
  }

  const metaModule = await import(pathToFileURL(join(packDir, "meta.mjs")).href);
  const sceneModule = await import(pathToFileURL(join(packDir, "scene-data.mjs")).href);
  const meta = metaModule.meta ?? {};
  const scenes = sceneModule.scenes ?? [];
  if (!Array.isArray(scenes) || scenes.length === 0) {
    console.error(`❌ scene-data.mjs in ${resolved.contentDir} exports no scenes`);
    process.exit(1);
  }

  const context = buildIndustryContext({
    packId: resolved.contentDir,
    meta,
    scenes,
    today,
  });

  const outPath = join(packDir, "industry-context.json");
  if (!printOnly) {
    writeFileSync(outPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  }

  console.log(formatIndustryContext(context));
  if (!printOnly) console.log(`\n📄 wrote ${outPath}`);
  if (asJson) console.log(JSON.stringify(context, null, 2));
  if (context.entities.length === 0) {
    console.log("⚠️  no industry-knowledge entity matched this pack — nothing injected");
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
