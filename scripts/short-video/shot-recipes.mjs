#!/usr/bin/env node
/**
 * shot-recipes CLI — list, show, and check the shot recipe cards (#733 S1).
 *
 * Usage:
 *   node scripts/short-video/shot-recipes.mjs --list
 *   node scripts/short-video/shot-recipes.mjs --card <visualType/layout>
 *   node scripts/short-video/shot-recipes.mjs --check [--root <short-video dir>] [--json]
 *
 * What `--check` verifies beyond the pure catalogue (lib/shot-recipes.mjs):
 * 1. **Demo anchors are real.** A `{pack}` anchor must be a pack whose
 *    scene-data actually renders that combo (layout resolved through
 *    `resolveRenderLayout`, the render-side authority); a `{fixture}` anchor
 *    must be a scenario id present in `remotion/src/scene-gate-fixture.tsx`
 *    (the suite that renders one still per scenario).
 * 2. **Corpus coverage.** Counts, per card, how many scenes in the shipped
 *    packs use it — a card no pack ever used is visible as `unused` rather
 *    than assumed good.
 * 3. **Out-of-contract combos.** Packs written before a template was renamed
 *    carry visualTypes the renderer no longer dispatches (they fail closed at
 *    render). Those are reported as legacy and do not fail the check.
 *
 * Exit codes: 0 all cards valid and every demo anchor resolved; 1 structure
 * broken, an anchor unresolved, or a renderable combo without a card. This is
 * an authoring/index gate — it is not wired into the render or preflight.
 */

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  findRecipe,
  recipeCatalog,
  recipeIdForScene,
  validateRecipeCatalog,
} from "./lib/shot-recipes.mjs";
import { REMOTION_SLOT_MAP } from "./lib/text-slots.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SHORT_VIDEO_ROOT = SCRIPT_DIR;
const FIXTURE_PATH = join(SCRIPT_DIR, "remotion", "src", "scene-gate-fixture.tsx");

function parseArgs(args) {
  const value = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 && index + 1 < args.length && !args[index + 1].startsWith("--")
      ? args[index + 1]
      : null;
  };
  return {
    list: args.includes("--list"),
    check: args.includes("--check"),
    card: value("card"),
    root: value("root") ?? SHORT_VIDEO_ROOT,
    json: args.includes("--json"),
  };
}

/** Load every shipped pack and index which combos it renders. */
export async function loadPackCorpus(root = SHORT_VIDEO_ROOT) {
  const contentRoot = join(root, "content");
  if (!existsSync(contentRoot)) throw new Error(`no content directory at ${contentRoot}`);

  const packs = [];
  const usage = new Map();
  const outOfContract = new Map();

  for (const dirent of readdirSync(contentRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name.startsWith("_")) continue;
    const sceneFile = join(contentRoot, dirent.name, "scene-data.mjs");
    if (!existsSync(sceneFile)) continue;
    let mod;
    try {
      mod = await import(pathToFileURL(sceneFile).href);
    } catch {
      // A pack that does not import is the preflight's business, not this index.
      continue;
    }
    const scenes = Array.isArray(mod.scenes) ? mod.scenes : [];
    packs.push({ slug: dirent.name, scenes });
    for (const scene of scenes) {
      const id = recipeIdForScene(scene);
      if (!id) continue;
      const target = REMOTION_SLOT_MAP?.[scene.visualType]?.[id.split("/")[1]]
        ? usage
        : outOfContract;
      const entry = target.get(id) ?? { count: 0, packs: [] };
      entry.count += 1;
      if (!entry.packs.includes(dirent.name)) entry.packs.push(dirent.name);
      target.set(id, entry);
    }
  }

  return { packs, usage, outOfContract };
}

/**
 * Resolve one card's demo anchor against the corpus and the render fixture.
 * Returns `{ok, detail}` — never throws for a missing anchor.
 */
export function verifyDemoAnchor(recipe, { corpus, fixtureText }) {
  if (recipe.demoGap) return { ok: true, detail: `gap: ${recipe.demoGap}` };
  if (!recipe.demo) return { ok: false, detail: "no demo anchor and no demoGap reason" };

  const kind = Object.keys(recipe.demo)[0];
  const target = recipe.demo[kind];

  if (kind === "pack") {
    const used = corpus.usage.get(recipe.id);
    if (!used || !used.packs.includes(target)) {
      const packExists = corpus.packs.some((pack) => pack.slug === target);
      return {
        ok: false,
        detail: packExists
          ? `pack ${target} exists but never renders ${recipe.id}`
          : `pack ${target} does not exist`,
      };
    }
    return { ok: true, detail: `pack ${target} (${used.count} scene(s) across the corpus)` };
  }

  if (!fixtureText.includes(`"${target}"`)) {
    return { ok: false, detail: `scenario ${target} is not in scene-gate-fixture.tsx` };
  }
  return { ok: true, detail: `fixture ${target}` };
}

function printList(catalog, corpus) {
  console.log(`\nShot recipes — ${catalog.length} cards\n`);
  for (const recipe of catalog) {
    const used = corpus?.usage.get(recipe.id);
    const anchor = recipe.demoGap
      ? `gap`
      : recipe.demo
        ? `${Object.keys(recipe.demo)[0]}:${Object.values(recipe.demo)[0]}`
        : "—";
    console.log(
      `  ${recipe.id.padEnd(28)} ${anchor.padEnd(34)} ${
        used ? `${used.count} scene(s)` : "unused"
      }`,
    );
    console.log(`    ${recipe.when ?? "（缺卡面）"}`);
  }
  console.log("");
}

function printCard(recipe, corpus) {
  console.log(`\n${recipe.id}`);
  console.log(`  何时用：${recipe.when}`);
  console.log(`  硬前提：${recipe.prerequisite}`);
  console.log(`  别用它：${recipe.notFor}`);
  console.log(
    `  版式属性：${recipe.media.textFirst ? "文本优先（媒体只能当暗化背景）" : "可承载画面"}${
      recipe.media.containBand ? " · 有 contain 带" : ""
    }`,
  );
  console.log(
    `  文本槽：必填 ${recipe.slots.rendered.join("/") || "—"}；可选 ${
      recipe.slots.optional.join("/") || "—"
    }；控制 ${recipe.slots.control.join("/") || "—"}`,
  );
  const used = corpus?.usage.get(recipe.id);
  console.log(
    `  样张：${
      recipe.demo
        ? `${Object.keys(recipe.demo)[0]} ${Object.values(recipe.demo)[0]}`
        : `（无）${recipe.demoGap ?? ""}`
    }`,
  );
  console.log(
    `  语料使用：${used ? `${used.count} scene(s)，${used.packs.slice(0, 4).join("/")}` : "unused"}`,
  );
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const catalog = recipeCatalog();

  if (!options.list && !options.check && !options.card) {
    console.error("❌ 用法：--list | --card <visualType/layout> | --check [--root <dir>] [--json]");
    return 1;
  }

  if (options.card) {
    const recipe = findRecipe(options.card, catalog);
    if (!recipe) {
      console.error(`❌ 未知配方卡：${options.card}（用 --list 查看可用的 ${catalog.length} 张）`);
      return 1;
    }
    const corpus = await loadPackCorpus(options.root);
    if (options.json) console.log(JSON.stringify(recipe, null, 2));
    else printCard(recipe, corpus);
    return 0;
  }

  const corpus = await loadPackCorpus(options.root);

  if (options.list) {
    if (options.json) console.log(JSON.stringify(catalog, null, 2));
    else printList(catalog, corpus);
    return 0;
  }

  // --check
  const structural = validateRecipeCatalog(catalog);
  const fixtureText = existsSync(FIXTURE_PATH) ? readFileSync(FIXTURE_PATH, "utf8") : "";
  const anchors = catalog.map((recipe) => ({
    id: recipe.id,
    ...verifyDemoAnchor(recipe, { corpus, fixtureText }),
  }));
  const anchorFailures = anchors.filter((anchor) => !anchor.ok);
  const packAnchors = anchors.filter(
    (anchor) => anchor.ok && anchor.detail.startsWith("pack "),
  ).length;
  const fixtureAnchors = anchors.filter(
    (anchor) => anchor.ok && anchor.detail.startsWith("fixture "),
  ).length;
  const gaps = anchors.filter((anchor) => anchor.detail.startsWith("gap: ")).length;
  const unused = catalog.filter((recipe) => !corpus.usage.has(recipe.id));

  const result = {
    ok: structural.ok && anchorFailures.length === 0,
    cards: catalog.length,
    structural,
    anchors: { pack: packAnchors, fixture: fixtureAnchors, gap: gaps, failures: anchorFailures },
    corpus: {
      packs: corpus.packs.length,
      usedCards: catalog.filter((recipe) => corpus.usage.has(recipe.id)).length,
      unused: unused.map((recipe) => recipe.id),
      outOfContract: [...corpus.outOfContract.entries()].map(([id, entry]) => ({
        id,
        count: entry.count,
        packs: entry.packs,
      })),
    },
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\nShot recipes — ${catalog.length} cards (renderable combos)`);
    if (structural.ok) {
      console.log(`  ✅ 结构：${catalog.length} 张卡面齐全，无重复 id、无缺字段`);
    } else {
      for (const error of structural.errors) console.log(`  ❌ ${error}`);
    }
    console.log(
      `  样张：${packAnchors} 个包 + ${fixtureAnchors} 条渲染基线${
        gaps ? ` + ${gaps} 条登记缺口` : ""
      }`,
    );
    for (const anchor of anchorFailures) console.log(`  ❌ ${anchor.id}: ${anchor.detail}`);
    console.log(
      `  语料：${corpus.packs.length} 个包，${result.corpus.usedCards}/${catalog.length} 张卡被用过${
        unused.length ? `；未用：${unused.map((recipe) => recipe.id).join("、")}` : ""
      }`,
    );
    if (result.corpus.outOfContract.length > 0) {
      const total = result.corpus.outOfContract.reduce((sum, entry) => sum + entry.count, 0);
      console.log(
        `  契约外组合：${result.corpus.outOfContract.length} 种 / ${total} scene(s)（历史包的旧 visualType，渲染时 fail-closed，不计入本目录）`,
      );
    }
    console.log(result.ok ? "\n✅ 配方卡目录自洽" : "\n❌ 配方卡目录有问题");
  }

  return result.ok ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}
