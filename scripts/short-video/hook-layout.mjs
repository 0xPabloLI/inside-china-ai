#!/usr/bin/env node
/**
 * hook-layout CLI — the Stage 3 selection gate for hook layouts (#1480).
 *
 * Usage:
 *   node scripts/short-video/hook-layout.mjs --content <slug|dir>
 *        [--root <short-video dir>] [--repeat-reason "<why this must repeat>"]
 *        [--sequence] [--json]
 *
 * What it judges, in the order the writer needs it:
 * 1. Which layout the pack will actually render (number-led / claim-led /
 *    media-led), including the silent media-led → hero-center downgrade.
 * 2. That layout's hard prerequisites from research §6 — a number-led hook
 *    needs a real cross-tier magnitude with a traceable fact, a claim-led hook
 *    needs its claim paid off inside 30 seconds, a media-led hook needs an
 *    evidence-role picture with provenance.
 * 3. Cross-pack anti-repetition: the same layout in the last N packs either
 *    switches or carries a one-line reason (--repeat-reason). History is read
 *    from the publish records (`pending-analysis.json`, the analytics
 *    reminder's own ledger) and the layout is derived from each pack's
 *    scene-data — the decision is never copied into a second file.
 *
 * `--sequence` swaps the history source to the pack sequence (meta.createdAt),
 * labelled as such in the output: it answers "what would this pack repeat?"
 * before publish records exist. Published history stays the default because a
 * pack that never shipped cannot fatigue an audience.
 *
 * Exit codes: 0 pass (or insufficient history), 1 a criterion failed or a
 * repeat needs its reason. Stage 3 is an editorial gate, not CI: nothing here
 * is wired into the render or the preflight.
 */

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listPendingAnalysis } from "./lib/pending-analysis.mjs";
import {
  HOOK_LAYOUTS,
  classifyHookLayout,
  evaluateHookLayout,
  evaluateHookLayoutRotation,
} from "./lib/hook-layout.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SHORT_VIDEO_ROOT = SCRIPT_DIR;

function parseArgs(args) {
  const value = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 && index + 1 < args.length && !args[index + 1].startsWith("--")
      ? args[index + 1]
      : null;
  };
  return {
    content: value("content"),
    root: value("root") ?? SHORT_VIDEO_ROOT,
    repeatReason: value("repeat-reason"),
    sequence: args.includes("--sequence"),
    json: args.includes("--json"),
  };
}

function packDirFor(content, root) {
  if (!content) throw new Error("--content is required (a slug or a pack directory)");
  const maybeDir = resolve(content);
  if (existsSync(join(maybeDir, "scene-data.mjs"))) return maybeDir;
  const underRoot = resolve(root, "content", content);
  if (existsSync(join(underRoot, "scene-data.mjs"))) return underRoot;
  throw new Error(`no scene-data.mjs for "${content}" (tried ${maybeDir} and ${underRoot})`);
}

async function loadPack(packDir) {
  const mod = await import(pathToFileURL(join(packDir, "scene-data.mjs")).href);
  if (!Array.isArray(mod.scenes) || mod.scenes.length === 0) {
    throw new Error(`${packDir}/scene-data.mjs exports no scenes`);
  }
  // The pack's fact ledger lives in meta.mjs (scene-data.mjs exports scenes
  // only); number-led traceability reads its dataPoints.
  let meta = mod.meta ?? null;
  const metaPath = join(packDir, "meta.mjs");
  if (existsSync(metaPath)) {
    try {
      const metaMod = await import(pathToFileURL(metaPath).href);
      meta = metaMod.meta ?? meta;
    } catch {
      // A broken meta.mjs is not this gate's business; the pack preflight owns it.
    }
  }
  const contextPath = join(packDir, "industry-context.json");
  const industryContext = existsSync(contextPath)
    ? JSON.parse(readFileSync(contextPath, "utf8"))
    : null;
  return { scenes: mod.scenes, meta, industryContext };
}

/** Layout of a pack, cached: the scene-data is the single source of the layout. */
const layoutCache = new Map();
async function layoutOf(root, slug) {
  if (layoutCache.has(slug)) return layoutCache.get(slug);
  const file = join(root, "content", slug, "scene-data.mjs");
  let layout = null;
  if (existsSync(file)) {
    try {
      const mod = await import(pathToFileURL(file).href);
      layout = classifyHookLayout(mod.scenes?.[0]).effective;
    } catch {
      layout = null;
    }
  }
  layoutCache.set(slug, layout);
  return layout;
}

/** Published history: publish records ordered newest first. */
async function publishedHistory(root, targetSlug) {
  const entries = listPendingAnalysis(root);
  const history = [];
  for (const entry of entries) {
    let slug = entry.slug;
    if (!slug && typeof entry.record?.videoPath === "string") {
      const match = entry.record.videoPath.match(/output\/([^/]+)\//);
      slug = match ? match[1] : null;
    }
    if (!slug || slug === targetSlug) continue;
    history.push({
      slug,
      layout: await layoutOf(root, slug),
      publishedAt: entry.record?.publishedAt ?? null,
      source: "published",
    });
  }
  return history;
}

/** Pack sequence fallback: every pack ordered by meta.createdAt, newest first. */
async function sequenceHistory(root, targetSlug) {
  const contentRoot = join(root, "content");
  const packs = [];
  for (const dirent of readdirSync(contentRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name.startsWith("_") || dirent.name === targetSlug)
      continue;
    const metaPath = join(contentRoot, dirent.name, "meta.mjs");
    if (!existsSync(metaPath) || !existsSync(join(contentRoot, dirent.name, "scene-data.mjs")))
      continue;
    let createdAt = "";
    try {
      const mod = await import(pathToFileURL(metaPath).href);
      createdAt = String(mod.meta?.createdAt ?? "");
    } catch {
      createdAt = "";
    }
    packs.push({
      slug: dirent.name,
      createdAt,
      layout: await layoutOf(root, dirent.name),
      source: "sequence",
    });
  }
  return packs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function printReport({ slug, layout, declared, findings, rotation, historySource, historyCount }) {
  console.log(`\nHook layout — ${slug}`);
  const rule = layout ? HOOK_LAYOUTS[layout] : null;
  console.log(
    `版式：${layout ?? "（无可判版式）"}${declared && declared !== layout ? `（声明 ${declared}）` : ""}`,
  );
  if (rule) {
    console.log(`  何时用：${rule.when}`);
    console.log(`  硬前提：${rule.prerequisite}`);
    console.log(`  禁用：${rule.disallowed}`);
  }
  console.log("\n判据：");
  const fails = findings.filter((finding) => finding.level === "fail");
  if (fails.length === 0) console.log("  ✅ pass");
  for (const finding of findings) {
    const icon = finding.level === "fail" ? "❌" : "⚠️";
    console.log(`  ${icon} ${finding.detail}`);
    if (finding.fix) console.log(`     FIX: ${finding.fix}`);
  }
  console.log("\n跨期反重复：");
  console.log(`  历史来源：${historySource}（${historyCount} 条）`);
  const icon =
    rotation.status === "pass" ||
    rotation.status === "pass-with-reason" ||
    rotation.status === "insufficient-history"
      ? "✅"
      : rotation.status === "needs-reason"
        ? "❌"
        : "ℹ️";
  console.log(`  ${icon} ${rotation.detail}`);
  if (rotation.fix) console.log(`     FIX: ${rotation.fix}`);
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.content) {
    console.error("❌ --content <slug|dir> is required");
    return 1;
  }

  const packDir = packDirFor(options.content, options.root);
  const slug = packDir.split(/[\\/]/).filter(Boolean).pop();
  const { scenes, meta, industryContext } = await loadPack(packDir);
  const hook = scenes[0];

  const evaluated = evaluateHookLayout(hook, { scenes, meta, industryContext });
  const history = options.sequence
    ? await sequenceHistory(options.root, slug)
    : await publishedHistory(options.root, slug);
  const rotation = evaluateHookLayoutRotation({
    history,
    candidate: evaluated.layout,
    repeatReason: options.repeatReason,
  });

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          slug,
          layout: evaluated.layout,
          declared: evaluated.declared,
          findings: evaluated.findings,
          rotation,
          historySource: options.sequence ? "sequence" : "published",
          historyCount: history.length,
        },
        null,
        2,
      ),
    );
  } else {
    printReport({
      slug,
      layout: evaluated.layout,
      declared: evaluated.declared,
      findings: evaluated.findings,
      rotation,
      historySource: options.sequence ? "pack sequence (meta.createdAt)" : "publish records",
      historyCount: history.length,
    });
  }

  const failed = evaluated.findings.some((finding) => finding.level === "fail");
  if (failed) {
    console.error("\n❌ Stage 3 版式判据未通过");
    return 1;
  }
  if (rotation.status === "needs-reason") {
    console.error("\n❌ 连用同一版式需要一句理由（--repeat-reason）或换版式");
    return 1;
  }
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}

export { main };
