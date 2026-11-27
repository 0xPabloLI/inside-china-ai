#!/usr/bin/env node
/**
 * videofit-rescore.mjs — CLI for `lib/videofit-rescore.mjs` (#1551).
 *
 * Input JSON: either an array of topic records, or `{ "topics": [...] }`.
 * A topic record is:
 *   {
 *     slug, title?, score?, videoFit, format, hook,
 *     assets: [{ type, label, url?, localPath?, official?, dynamic? }],
 *     probePages?: [official product page URL discovered by the editor],
 *     probe?: { format?, hook? }   // editorial target when dynamic is found
 *   }
 *
 * Usage:
 *   node scripts/short-video/videofit-rescore.mjs --input <topics.json> \
 *     [--out <videofit-rescore-YYYY-MM-DD.md>] [--date YYYY-MM-DD]
 *     [--max-pages <n>] [--json]
 *
 * Default stdout is the markdown audit; `--json` prints the structured rows.
 * Exit codes: 0 completed (probe failures are audit rows), 1 unusable input.
 */

import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRescoreMarkdown, rescoreTopics } from "./lib/videofit-rescore.mjs";

function parseArgs(args) {
  const value = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 && index + 1 < args.length && !args[index + 1].startsWith("--")
      ? args[index + 1]
      : null;
  };
  return {
    input: value("input"),
    out: value("out"),
    date: value("date"),
    maxPages: value("max-pages"),
    json: args.includes("--json"),
  };
}

function todayInShanghai() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function loadTopics(path) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.topics)) return parsed.topics;
  throw new Error("input JSON must be an array of topics or { topics: [...] }");
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.input) {
    console.error(
      "usage: videofit-rescore.mjs --input <topics.json> [--out <audit.md>] [--date YYYY-MM-DD]",
    );
    return 1;
  }
  if (!existsSync(options.input)) {
    console.error(`input not found: ${resolve(options.input)}`);
    return 1;
  }

  let topics;
  try {
    topics = loadTopics(resolve(options.input));
  } catch (error) {
    console.error(`invalid input: ${error.message}`);
    return 1;
  }

  let maxPagesPerTopic;
  if (options.maxPages) {
    maxPagesPerTopic = Number(options.maxPages);
    if (!Number.isInteger(maxPagesPerTopic) || maxPagesPerTopic <= 0) {
      console.error(`invalid --max-pages: ${options.maxPages} (expected a positive integer)`);
      return 1;
    }
  }

  const date = options.date || todayInShanghai();
  const result = await rescoreTopics({
    topics,
    date,
    ...(maxPagesPerTopic ? { maxPagesPerTopic } : {}),
  });
  const markdown = buildRescoreMarkdown(result, { date });

  if (options.out) {
    writeFileSync(resolve(options.out), markdown, "utf8");
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(markdown);
  }

  if (options.out) {
    console.error(`审计已写入 ${resolve(options.out)}`);
  }
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
