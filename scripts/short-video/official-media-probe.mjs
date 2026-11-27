#!/usr/bin/env node
/**
 * official-media-probe.mjs — CLI for `lib/official-media-probe.mjs` (#1551).
 *
 * Answers: does this declared official product/newsroom/launch page ship
 * playable media that the topic evidence is missing?
 *
 * Usage:
 *   node scripts/short-video/official-media-probe.mjs \
 *     --url <page-url> (--official | --third-party) [--json] [--out <path>]
 *
 * `--official` / `--third-party` is required on purpose: the probe cannot
 * know page provenance from HTML, and a third-party repost must never be
 * written as `official`. The flag is the editor's provenance verdict.
 *
 * Exit codes: 0 probe completed (including "no media"), 1 usage/input error,
 * 2 the page could not be fetched.
 */

import { realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { probeOfficialPageMedia } from "./lib/official-media-probe.mjs";

function parseArgs(args) {
  const value = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 && index + 1 < args.length && !args[index + 1].startsWith("--")
      ? args[index + 1]
      : null;
  };
  const official = args.includes("--official");
  const thirdParty = args.includes("--third-party");
  return {
    url: value("url"),
    official,
    thirdParty,
    json: args.includes("--json"),
    out: value("out"),
  };
}

function printHuman(result) {
  console.log(`Probe: ${result.pageUrl} (${result.official ? "official" : "third-party"})`);
  console.log(`Method: ${result.method}`);
  console.log(`Candidates: ${result.candidates.length}`);
  for (const asset of result.assets) {
    console.log(
      `- demo:${asset.label} (${asset.official ? "official" : "third-party"}, dynamic) ${asset.url}`,
    );
  }
  if (result.candidates.length === 0) {
    console.log("No playable media found. Keep the page as a still evidence row.");
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.url) {
    console.error(
      "usage: official-media-probe.mjs --url <page-url> (--official|--third-party) [--json] [--out <path>]",
    );
    return 1;
  }
  if (options.official && options.thirdParty) {
    console.error("choose exactly one provenance flag: --official or --third-party");
    return 1;
  }
  if (!options.official && !options.thirdParty) {
    console.error(
      "provenance flag required: pass --official for a first-party page or --third-party for a repost",
    );
    return 1;
  }

  const result = await probeOfficialPageMedia({
    pageUrl: options.url,
    official: options.official,
  });

  if (options.out) {
    const outPath = resolve(options.out);
    writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
    if (options.out) console.log(`JSON 已写入 ${resolve(options.out)}`);
  }

  return result.ok ? 0 : 2;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
