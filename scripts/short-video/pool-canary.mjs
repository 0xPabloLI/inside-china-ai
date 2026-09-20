#!/usr/bin/env node
/**
 * Pool engine canary — #305 C. Mechanizes the drift detection that until now
 * depended on someone noticing a bad run (the #281 class).
 *
 * Scheduled (GitHub Actions, twice weekly Mon/Thu 22:37 UTC), it calls each
 * canary engine ONCE with a must-hit query in news mode and asserts the
 * delivery contract:
 *   - parsed > 0                → catches url/link vocabulary drift (parse-drop)
 *                                 and engine death
 *   - 100% publishedAt coverage → catches date-field vocabulary drift, the
 *     jina `publishedTime` catch of 2026-09-20: articles parse fine but every
 *     publishedAt silently becomes undefined downstream.
 *
 * Engines: the three newsCapable engines only. Jina is excluded on purpose —
 * one call ≈ 59k tokens ≈ 6% of its monthly free quota (#309 probe), so even
 * the twice-weekly cadence would burn ~47% of the monthly tier for a probe.
 * Jina drift is covered by the B zero
 * streak (delivery loss) and the wire fixtures (vocabulary lock).
 *
 * Issue write path (#305 C ruling): with --update-issues (CI only) each failed
 * engine gets exactly one open `[pool-canary] <engine>` issue (bug +
 * needs-triage, deduped by title search; repeat failures append comments) and
 * a recovered engine gets a comment on its still-open issue. Local runs
 * without the flag only report — they never write.
 *
 * Usage: node scripts/short-video/pool-canary.mjs [--query <q>] [--update-issues]
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./lib/load-env.mjs";
import { searchPool, POOL_ENGINES } from "./lib/search-pool.mjs";

const REPO = process.env.POOL_CANARY_REPO || "0xPabloLI/inside-china-ai";
const DEFAULT_QUERY = "DeepSeek"; // must-hit: validated against every engine 2026-09-20

/** Canary roster: newsCapable engines only — see the jina exclusion above. */
export const CANARY_ENGINES = POOL_ENGINES.filter((engine) => engine.newsCapable === true);

/**
 * Pure verdict for one engine run (an attempt object from searchPool plus the
 * delivered articles when ok). Returns the list of findings; empty = pass.
 * @returns {Array<{type: string, detail: string}>}
 */
export function evaluateEngineRun(engine, run) {
  if (!run.ok) {
    const error = run.error ?? "unknown error";
    if (error.startsWith("parse-drop:")) {
      return [{ type: "parse-drop", detail: error }];
    }
    if (error.startsWith("missing ")) {
      return [{ type: "missing-key", detail: error }];
    }
    if (error === "0 results") {
      return [{ type: "no-results", detail: "must-hit query returned nothing" }];
    }
    return [{ type: "unreachable", detail: error }];
  }
  const articles = run.articles ?? [];
  if (articles.length === 0) {
    return [{ type: "no-results", detail: "must-hit query returned nothing" }];
  }
  // The jina-class check (#309 date contract): newsCapable engines must date
  // every entry — coverage below 100% means the date vocabulary drifted.
  const dated = articles.filter((article) => Boolean(article.publishedAt)).length;
  if (dated < articles.length) {
    return [
      {
        type: "date-coverage",
        detail: `${dated}/${articles.length} articles carry publishedAt — date-field vocabulary drift`,
      },
    ];
  }
  return [];
}

/** One probe per engine: single call, news mode, serial (never parallel here). */
async function probeEngines(query) {
  const runs = [];
  for (const engine of CANARY_ENGINES) {
    try {
      const pool = await searchPool(query, { engines: [engine], news: { days: 7 } });
      // The serial chain returns on first success WITHOUT recording an attempt
      // ("attempts records every failure"), so a delivery shows up only as
      // pool.articles — reconstruct the run from it.
      const attempt =
        pool.attempts.find((a) => a.engine === engine.name) ??
        (pool.articles.length > 0
          ? { engine: engine.name, ok: true }
          : { engine: engine.name, ok: false, error: "no attempt recorded" });
      runs.push({ engine, attempt, articles: pool.articles });
    } catch (err) {
      runs.push({
        engine,
        attempt: { engine: engine.name, ok: false, error: err.message },
        articles: [],
      });
    }
  }
  return runs;
}

function issueTitle(engineName, findings) {
  return `[pool-canary] ${engineName}: ${findings.map((f) => f.type).join(",")}`;
}

function issueBody(engineName, findings, query) {
  const lines = findings.map((f) => `- **${f.type}** — ${f.detail}`);
  return [
    `\`[pool-canary]\` failed for **${engineName}** on ${new Date().toISOString().slice(0, 10)} (query: \`${query}\`).`,
    "",
    ...lines,
    "",
    "This ticket is filed by the scheduled canary (workflow `pool-canary.yml`); it dedupes by title, so keep it open until the fixture/adapter fix lands. Fix seam: refresh the wire fixture `__tests__/fixtures/pool-contracts/" +
      engineName +
      ".json` from a real response and repair the matching adapter in `scripts/short-video/lib/search-pool.mjs` (see issue #305).",
  ].join("\n");
}

function gh(args, inputEnv) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    env: { ...process.env, ...inputEnv },
  }).trim();
}

/** Find the open canary issue for one engine, by title substring. */
function findOpenIssue(engineName, token) {
  const out = gh(
    [
      "api",
      "-X",
      "GET",
      "search/issues",
      "-f",
      `q=repo:${REPO} in:title "[pool-canary] ${engineName}" state:open type:issue`,
      "-f",
      "per_page=5",
    ],
    token ? { GH_TOKEN: token } : {},
  );
  const parsed = JSON.parse(out);
  return parsed.items?.[0]?.number ?? null;
}

/**
 * Write path behind --update-issues. Failing engines: comment on the open
 * canary issue or create one (bug + needs-triage). Green engines with a
 * still-open canary issue get a recovery comment (a human closes it).
 */
function updateIssues(results, query, token) {
  for (const result of results) {
    const number = findOpenIssue(result.engine.name, token);
    if (result.findings.length > 0) {
      const body = issueBody(result.engine.name, result.findings, query);
      if (number) {
        gh(
          ["issue", "comment", String(number), "--repo", REPO, "--body", body],
          token ? { GH_TOKEN: token } : {},
        );
        console.log(
          `[pool-canary] commented on existing issue #${number} for ${result.engine.name}`,
        );
      } else {
        const url = gh(
          [
            "issue",
            "create",
            "--repo",
            REPO,
            "--title",
            issueTitle(result.engine.name, result.findings),
            "--body",
            body,
            "--label",
            "bug",
            "--label",
            "needs-triage",
          ],
          token ? { GH_TOKEN: token } : {},
        );
        console.log(`[pool-canary] created issue for ${result.engine.name}: ${url}`);
      }
    } else if (number) {
      gh(
        [
          "issue",
          "comment",
          String(number),
          "--repo",
          REPO,
          "--body",
          `\`[pool-canary]\` recovery: **${result.engine.name}** passed on ${new Date().toISOString().slice(0, 10)} — closing this ticket is safe now.`,
        ],
        token ? { GH_TOKEN: token } : {},
      );
      console.log(`[pool-canary] posted recovery on issue #${number} for ${result.engine.name}`);
    }
  }
}

async function main(argv) {
  loadEnv(); // #287 — the CLI entry owns env loading; the library never self-loads
  const updateIssuesFlag = argv.includes("--update-issues");
  const queryFlag = argv.indexOf("--query");
  const query =
    queryFlag >= 0 ? argv[queryFlag + 1] : process.env.POOL_CANARY_QUERY || DEFAULT_QUERY;

  console.log(
    `[pool-canary] probing ${CANARY_ENGINES.map((e) => e.name).join(", ")} with "${query}" (news, 7d)`,
  );
  const runs = await probeEngines(query);
  const results = runs.map((run) => ({
    engine: run.engine,
    attempt: run.attempt,
    findings: evaluateEngineRun(run.engine, {
      ...run.attempt,
      articles: run.attempt.ok ? run.articles : undefined,
    }),
  }));

  let failed = 0;
  for (const result of results) {
    if (result.findings.length === 0) {
      console.log(`[pool-canary] ${result.engine.name}: OK`);
      continue;
    }
    failed += 1;
    for (const finding of result.findings) {
      console.log(`[pool-canary] ${result.engine.name}: FAIL ${finding.type} — ${finding.detail}`);
    }
  }

  if (updateIssuesFlag) {
    updateIssues(results, query, process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
  } else if (failed > 0) {
    console.log("[pool-canary] findings found; pass --update-issues in CI to file/update tickets");
  }

  return failed > 0 ? 1 : 0;
}

/** ESM direct-execution guard: only run main() when invoked as a script. */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`[pool-canary] error: ${err.message}`);
      process.exit(1);
    },
  );
}
