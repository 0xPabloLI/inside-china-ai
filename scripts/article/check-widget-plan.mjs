#!/usr/bin/env node
/**
 * check-widget-plan.mjs — MRL-1 gate for the "no reusable widget" branch (#430).
 *
 * The pipeline promises a widget for every structured-data section, but widget
 * work is application code (component + registry + build + deploy + a11y), so
 * the honest unit of enforcement is the *decision*, not the widget count.
 * This gate makes that decision decidable: an article with tables and zero
 * widgets must carry a `widgetPlan` record in its frontmatter, and every
 * embedded `<!-- widget:ID -->` must resolve in registry.ts.
 *
 * Usage:
 *   node scripts/article/check-widget-plan.mjs --file articles/<slug>.md
 *   node scripts/article/check-widget-plan.mjs --file <path> --registry <registry.ts>
 *
 * Exit: 0 = pass, 1 = finding, 2 = usage error.
 */
import { readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { collectRegistryIds, evaluateWidgetPlan } from "./lib/widget-plan.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..", "..");
const DEFAULT_REGISTRY = join(PROJECT_ROOT, "src", "components", "widgets", "registry.ts");

const USAGE = `check-widget-plan — judge one article's widget plan (#430)

usage:
  node scripts/article/check-widget-plan.mjs --file <article.md> [--registry <registry.ts>]

Rules:
  - structured data (a markdown table) + 0 widgets requires a widgetPlan block
  - widgetPlan.status: reused | history-only | stale | new-dev | no-visual-value | unverifiable
  - every <!-- widget:ID --> must be registered in registry.ts

Exit: 0 = pass, 1 = finding, 2 = usage error.
See docs/article-production-guide.md → Widget 适用性决策.`;

function parseArgs(argv) {
  const args = { file: null, registry: DEFAULT_REGISTRY, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--file" || arg === "--registry") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        return { error: `${arg} requires a value` };
      }
      args[arg.slice(2)] = value;
      i += 1;
      continue;
    }
    return { error: `unknown argument: ${arg}` };
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.error) {
    process.stderr.write(`✗ ${args.error}\n\n${USAGE}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (!args.file) {
    process.stderr.write(`✗ --file is required\n\n${USAGE}\n`);
    return 2;
  }

  const filePath = isAbsolute(args.file) ? args.file : resolve(process.cwd(), args.file);
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    process.stderr.write(`✗ cannot read ${filePath}: ${error.message}\n`);
    return 1;
  }

  let registryIds;
  try {
    registryIds = collectRegistryIds(readFileSync(args.registry, "utf8"));
  } catch (error) {
    process.stderr.write(`✗ cannot read registry ${args.registry}: ${error.message}\n`);
    return 2;
  }
  if (registryIds.length === 0) {
    // A registry that parses to nothing would make every marker look
    // unregistered — fail loudly instead of reporting findings for all of them.
    process.stderr.write(`✗ no WIDGETS entries parsed from ${args.registry}\n`);
    return 2;
  }

  let parsed;
  try {
    parsed = matter(raw);
  } catch (error) {
    process.stderr.write(`✗ cannot parse frontmatter in ${filePath}: ${error.message}\n`);
    return 1;
  }

  const result = evaluateWidgetPlan({
    frontmatter: parsed.data ?? {},
    body: parsed.content ?? "",
    registryIds,
  });

  const label = `${filePath}${parsed.data?.slug ? ` (${parsed.data.slug})` : ""}`;
  if (result.ok) {
    for (const note of result.notes) process.stdout.write(`✓ ${label}: ${note}\n`);
    return 0;
  }

  process.stderr.write(`✗ ${label}\n`);
  for (const note of result.notes) process.stderr.write(`  · ${note}\n`);
  for (const error of result.errors) process.stderr.write(`  ✗ ${error}\n`);
  const dataRows = result.tables.reduce((sum, table) => sum + table.dataRows, 0);
  process.stderr.write(
    `  found: ${result.tables.length} table(s) / ${dataRows} data row(s), ${result.widgets.length} widget marker(s)\n`,
  );
  return 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

export { main, parseArgs };
