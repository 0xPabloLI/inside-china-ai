#!/usr/bin/env node
/**
 * used-topics.mjs — CLI over `lib/used-topics.mjs`.
 *
 * Trend selection must exclude what already exists as a content package.
 *
 * Usage:
 *   node scripts/short-video/used-topics.mjs [--json] [--out <path>]
 *        [--content-dir <dir>] [--published-record <path>]
 *
 * Defaults: `content/` and `output/pending-analysis.json` next to this script.
 * `--json` prints the machine shape to stdout (packages + exclusionSlugs +
 * exclusionTokens); `--out <path>` additionally writes it to disk.
 *
 * Read-only: walks the tree, imports `meta.mjs`, never writes into `content/`.
 *
 * Exit codes: 0 success, 1 unusable input (missing content directory).
 */

import { existsSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUsedTopicsReport, formatUsedLine } from "./lib/used-topics.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const parseArgs = (args) => {
  const value = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 && index + 1 < args.length && !args[index + 1].startsWith("--")
      ? args[index + 1]
      : null;
  };
  return {
    json: args.includes("--json"),
    out: value("out"),
    contentDir: value("content-dir") ?? resolve(SCRIPT_DIR, "content"),
    publishedRecord:
      value("published-record") ?? resolve(SCRIPT_DIR, "output", "pending-analysis.json"),
  };
};

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (!existsSync(options.contentDir)) {
    console.error(`❌ content 目录不存在：${options.contentDir}`);
    return 1;
  }

  const report = await buildUsedTopicsReport({
    contentDir: options.contentDir,
    publishedRecordPath: existsSync(options.publishedRecord) ? options.publishedRecord : null,
  });

  if (options.out) {
    writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  console.log(`已建包 ${report.count} 个（其中 published ${report.publishedCount} 个）`);
  console.log(`目录：${report.contentDir}`);
  if (!existsSync(options.publishedRecord)) {
    console.log("提示：未找到 output/pending-analysis.json，published 标记全部按未发布处理。");
  }
  console.log("");
  for (const pkg of report.packages) {
    console.log(formatUsedLine(pkg));
  }
  console.log("");
  console.log("选题时把以上 slug / 主题当作排除词表；命中即标 used，不进 Video-ready。");
  if (options.out) console.log(`JSON 已写入 ${options.out}`);
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}

export { main };
