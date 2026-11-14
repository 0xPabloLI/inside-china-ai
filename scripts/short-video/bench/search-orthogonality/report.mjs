/**
 * Report builder for the orthogonality bench (#457).
 *
 * Input is a `run.json` written by `run-pilot.mjs` — raw per-channel results
 * plus the run metadata. Output is `report.json` plus `summary.md`. Everything
 * here is a pure transformation of the run, so `--replay` recomputes the same
 * numbers without touching the network.
 *
 * Each per-channel row carries `file`, the raw artifact it was computed from,
 * so a reader can go from any number to the exact response that produced it
 * (the `bench/keyframe/` shape: artifacts and scores correspond by filename,
 * never by log order).
 */

import {
  canonicalUrl,
  registrableDomain,
  uniqueCount,
  greedySelection,
  overlapMatrix,
  relevanceCoverage,
  payloadTokens,
  latencyStats,
  mean,
} from "./metrics.mjs";

/** The family table this pilot is testing (`cached-search.mjs` FAMILIES). */
export const CURRENT_FAMILIES = ["pool:serper", "pool:brave", "pool:tavily"];

const byUrl = (article) => canonicalUrl(article?.url);
const byDomain = (article) => registrableDomain(article?.url);

export function rawFileName(queryId, channelId) {
  return `${queryId}__${channelId.replace(":", "-")}.json`;
}

/**
 * Effective result per (query, channel): a retried channel (a later run in the
 * same directory, e.g. after fixing transport) supersedes the earlier one, so
 * reports never count a channel twice.
 */
const indexCache = new WeakMap();

function indexResults(run) {
  if (!indexCache.has(run)) {
    const index = new Map();
    for (const result of run.results) {
      index.set(`${result.queryId}::${result.channel}`, result);
    }
    indexCache.set(run, index);
  }
  return indexCache.get(run);
}

function resultFor(run, queryId, channelId) {
  return indexResults(run).get(`${queryId}::${channelId}`);
}

function channelRow(run, query, channelId) {
  const result = resultFor(run, query.id, channelId);
  const articles = result?.articles ?? [];
  return {
    channel: channelId,
    file: rawFileName(query.id, channelId),
    ok: Boolean(result && !result.error && !result.skipped),
    error: result?.error ?? null,
    skipped: result?.skipped ?? null,
    note: result?.note ?? null,
    ms: result?.ms ?? null,
    articles: articles.length,
    uniqueUrls: uniqueCount(articles, byUrl),
    uniqueDomains: uniqueCount(articles, byDomain),
    relevance: mean(articles.map((article) => relevanceCoverage(query.text, article).coverage)),
    payloadTokens: payloadTokens(articles),
  };
}

function byChannel(run) {
  const map = new Map();
  for (const result of indexResults(run).values()) {
    const list = map.get(result.channel) ?? [];
    list.push(result);
    map.set(result.channel, list);
  }
  return map;
}

function channelStats(run) {
  const grouped = byChannel(run);
  const queryText = new Map(run.queries.map((query) => [query.id, query.text]));
  return run.channels.map((channelId) => {
    const results = grouped.get(channelId) ?? [];
    const articles = results.flatMap((result) => result.articles ?? []);
    const latency = latencyStats(results.map((result) => result.ms));
    return {
      channel: channelId,
      runs: results.length,
      okRuns: results.filter((result) => !result.error && !result.skipped).length,
      articles: articles.length,
      uniqueDomains: uniqueCount(articles, byDomain),
      relevance: mean(
        results.flatMap((result) =>
          (result.articles ?? []).map(
            (article) => relevanceCoverage(queryText.get(result.queryId) ?? "", article).coverage,
          ),
        ),
      ),
      payloadTokens: payloadTokens(articles),
      p50: latency.p50,
      p95: latency.p95,
      errors: results
        .filter((result) => result.error)
        .map((result) => `${result.queryId}: ${result.error}`),
    };
  });
}

function greedyForQuery(run, query, keyOf) {
  const groups = run.channels.map((channelId) => {
    const result = resultFor(run, query.id, channelId);
    return {
      id: channelId,
      articles: result?.articles ?? [],
      cost: run.channelMeta?.[channelId]?.allowanceShare ?? 0,
      latencyP95: result?.ms ?? null,
    };
  });
  return greedySelection(groups, { keyOf }).order;
}

/** Unique keys each non-family channel adds on top of the current trio. */
function marginalGivenFamilies(run, query) {
  const familyArticles = CURRENT_FAMILIES.flatMap(
    (channelId) => resultFor(run, query.id, channelId)?.articles ?? [],
  );
  const familyDomains = new Set(familyArticles.map(byDomain).filter(Boolean));
  const familyUrls = new Set(familyArticles.map(byUrl).filter(Boolean));
  const rows = [];
  for (const channelId of run.channels) {
    if (CURRENT_FAMILIES.includes(channelId)) continue;
    const articles = resultFor(run, query.id, channelId)?.articles ?? [];
    rows.push({
      channel: channelId,
      domains: uniqueCount(articles, byDomain, familyDomains),
      urls: uniqueCount(articles, byUrl, familyUrls),
    });
  }
  return rows;
}

function tallyGreedy(perQuery, key) {
  const tally = new Map();
  for (const entry of perQuery) {
    const order = entry[key];
    order.forEach((step, index) => {
      const row = tally.get(step.id) ?? {
        channel: step.id,
        firstPlace: 0,
        top3: 0,
        selected: 0,
        totalUnique: 0,
      };
      if (index === 0) row.firstPlace++;
      if (index < 3) row.top3++;
      row.selected++;
      row.totalUnique += step.uniqueAdded;
      tally.set(step.id, row);
    });
  }
  return [...tally.values()].sort(
    (a, b) => b.top3 - a.top3 || b.firstPlace - a.firstPlace || a.channel.localeCompare(b.channel),
  );
}

function median(values) {
  const xs = (values ?? []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * Cross-query stability of pairwise overlap: the ticket's 73/33/54% figure is
 * the swing across queries, so the report has to show the range, not a mean.
 */
function overlapStability(run, keyOf) {
  const pairs = new Map();
  for (const query of run.queries) {
    const groups = run.channels.map((channelId) => ({
      id: channelId,
      articles: resultFor(run, query.id, channelId)?.articles ?? [],
    }));
    for (const pair of overlapMatrix(groups, { keyOf })) {
      const key = `${pair.a} × ${pair.b}`;
      const list = pairs.get(key) ?? [];
      list.push(pair.containment);
      pairs.set(key, list);
    }
  }
  return [...pairs.entries()]
    .map(([pair, values]) => ({
      pair,
      n: values.length,
      min: Math.min(...values),
      median: median(values),
      max: Math.max(...values),
    }))
    .filter((row) => row.n >= 2)
    .sort((a, b) => b.median - a.median);
}

/**
 * Per-intent-band summary (#1276): the ticket's deliverable is a per-intent
 * recommended channel set, so each band gets its own pooled greedy order and
 * its own marginal-gain-over-families row — band-level numbers, not
 * cross-band means (the pilot showed per-query swing swamps means).
 */
function intentBandSummary(run, intent) {
  const queries = run.queries.filter((query) => query.intent === intent);
  const pooled = (channelId) => ({
    id: channelId,
    articles: queries.flatMap((q) => resultFor(run, q.id, channelId)?.articles ?? []),
    cost: run.channelMeta?.[channelId]?.allowanceShare ?? 0,
  });
  const groups = run.channels.map(pooled);
  const greedyDomain = greedySelection(groups, { keyOf: byDomain }).order;
  const familyArticles = CURRENT_FAMILIES.flatMap((id) => pooled(id).articles);
  const familyDomains = new Set(familyArticles.map(byDomain).filter(Boolean));
  const familyUrls = new Set(familyArticles.map(byUrl).filter(Boolean));
  const marginal = run.channels
    .filter((id) => !CURRENT_FAMILIES.includes(id))
    .map((id) => {
      const articles = pooled(id).articles;
      return {
        channel: id,
        domains: uniqueCount(articles, byDomain, familyDomains),
        urls: uniqueCount(articles, byUrl, familyUrls),
      };
    });
  return { intent, queries: queries.length, greedyDomain, marginal };
}

function perIntentSummary(run) {
  return [...new Set(run.queries.map((query) => query.intent))].map((intent) =>
    intentBandSummary(run, intent),
  );
}

export function buildReport(run) {
  const perQuery = run.queries.map((query) => ({
    queryId: query.id,
    intent: query.intent,
    text: query.text,
    channels: run.channels.map((channelId) => channelRow(run, query, channelId)),
    greedyDomain: greedyForQuery(run, query, byDomain),
    greedyUrl: greedyForQuery(run, query, byUrl),
    marginalGivenFamilies: marginalGivenFamilies(run, query),
  }));

  const cost = {
    totalCalls: indexResults(run).size,
    meteredCalls: [...indexResults(run).values()].filter(
      (result) => run.channelMeta?.[result.channel]?.metered,
    ).length,
    skippedForBudget: [...indexResults(run).values()].filter(
      (result) => result.skipped === "budget",
    ).length,
    byChannel: Object.fromEntries(
      run.channels.map((channelId) => {
        const meta = run.channelMeta?.[channelId] ?? {};
        const calls = [...indexResults(run).values()].filter(
          (result) => result.channel === channelId && !result.error && !result.skipped,
        ).length;
        return [
          channelId,
          {
            calls,
            allowanceSharePerCall: meta.allowanceShare ?? 0,
            monthlyShareConsumed: Number(((meta.allowanceShare ?? 0) * calls).toFixed(6)),
          },
        ];
      }),
    ),
    note: run.costNote ?? null,
  };

  return {
    runId: run.runId,
    startedAt: run.startedAt,
    baseline: run.baseline,
    versions: run.versions ?? {},
    maxResults: run.meta?.maxResults ?? null,
    queries: run.queries,
    channels: run.channels,
    perQuery,
    summary: {
      channelStats: channelStats(run),
      greedyDomainTally: tallyGreedy(perQuery, "greedyDomain"),
      greedyUrlTally: tallyGreedy(perQuery, "greedyUrl"),
      overlapDomainStability: overlapStability(run, byDomain),
      overlapUrlStability: overlapStability(run, byUrl),
      perIntent: perIntentSummary(run),
      familiesCheck: {
        current: CURRENT_FAMILIES,
        perQuery: perQuery.map((query) => ({
          queryId: query.queryId,
          marginalGivenFamilies: query.marginalGivenFamilies,
        })),
      },
      cost,
    },
  };
}

function table(headers, rows) {
  const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const row of rows) lines.push(`| ${row.join(" | ")} |`);
  return lines.join("\n");
}

const pct = (value) => (Number.isFinite(value) ? `${(value * 100).toFixed(0)}%` : "—");
const num = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : "—");

export function renderMarkdown(report) {
  const lines = [];
  lines.push(`# Search orthogonality pilot — ${report.runId}`, "");
  lines.push(`- baseline: \`${report.baseline}\``);
  lines.push(
    `- queries: ${report.queries.length} (${report.queries.map((q) => q.intent).join(" / ")})`,
  );
  lines.push(`- channels: ${report.channels.length}`);
  lines.push(`- max results per channel: ${report.maxResults}`);
  lines.push(`- metered calls: ${report.summary.cost.meteredCalls}`);
  lines.push("");

  lines.push("## Per-query channel yield", "");
  for (const query of report.perQuery) {
    lines.push(`### ${query.queryId} · ${query.intent} — "${query.text}"`, "");
    lines.push(
      table(
        ["channel", "arts", "URLs", "domains", "rel", "payload tok", "ms", "error"],
        query.channels.map((row) => [
          row.channel,
          String(row.articles),
          String(row.uniqueUrls),
          String(row.uniqueDomains),
          pct(row.relevance),
          String(row.payloadTokens),
          row.ms === null ? "—" : String(row.ms),
          row.error ? row.error.slice(0, 60) : row.skipped ? `skipped: ${row.skipped}` : "",
        ]),
      ),
      "",
    );
  }

  lines.push("## Greedy order", "");
  lines.push(
    "Domain level = independence (Phase-4 unit). URL level = breadth. " +
      "Free channels first (infinite marginal return), then paid by " +
      "`new domains / share of monthly allowance`.",
    "",
  );
  lines.push(
    table(
      ["query", "domain-level order", "url-level order"],
      report.perQuery.map((query) => [
        query.queryId,
        query.greedyDomain.map((step) => `${step.id} (+${step.uniqueAdded})`).join(" → "),
        query.greedyUrl.map((step) => `${step.id} (+${step.uniqueAdded})`).join(" → "),
      ]),
    ),
    "",
  );

  lines.push("## Marginal gain over the current FAMILIES trio", "");
  lines.push(`trio: ${report.summary.familiesCheck.current.join(", ")}`, "");
  lines.push(
    table(
      ["query", ...report.channels.filter((id) => !CURRENT_FAMILIES.includes(id))],
      report.summary.familiesCheck.perQuery.map((entry) => [
        entry.queryId,
        ...report.channels
          .filter((id) => !CURRENT_FAMILIES.includes(id))
          .map((id) => {
            const row = entry.marginalGivenFamilies.find((candidate) => candidate.channel === id);
            return row ? `${row.domains}d / ${row.urls}u` : "—";
          }),
      ]),
    ),
    "",
  );

  lines.push("## Per-intent band summary (#1276)", "");
  lines.push(
    "Pooled per band: unique domains across all of the band's queries " +
      "(top-10 per channel per query). Greedy = free channels first, then " +
      "paid by `new domains / share of monthly allowance`.",
    "",
  );
  for (const band of report.summary.perIntent) {
    lines.push(`### ${band.intent} (${band.queries} queries)`, "");
    lines.push(
      table(
        ["channel", "pooled unique domains", "marginal vs trio (d/u)"],
        report.channels.map((id) => {
          const greedyRow = band.greedyDomain.find((step) => step.id === id);
          const marginalRow = band.marginal.find((row) => row.channel === id);
          return [
            id,
            greedyRow ? String(greedyRow.totalUnique) : "—",
            marginalRow ? `${marginalRow.domains}d / ${marginalRow.urls}u` : "in trio",
          ];
        }),
      ),
    );
    lines.push(
      "",
      `greedy order: ${band.greedyDomain
        .map((step) => `${step.id} (+${step.uniqueAdded})`)
        .join(" → ")}`,
      "",
    );
  }

  lines.push("## Pairwise containment stability (domain level)", "");
  lines.push(
    table(
      ["pair", "n", "min", "median", "max"],
      report.summary.overlapDomainStability
        .slice(0, 15)
        .map((row) => [row.pair, String(row.n), pct(row.min), pct(row.median), pct(row.max)]),
    ),
    "",
  );

  lines.push("## Pairwise containment stability (URL level)", "");
  lines.push(
    table(
      ["pair", "n", "min", "median", "max"],
      report.summary.overlapUrlStability
        .slice(0, 15)
        .map((row) => [row.pair, String(row.n), pct(row.min), pct(row.median), pct(row.max)]),
    ),
    "",
  );

  lines.push("## Channel totals", "");
  lines.push(
    table(
      [
        "channel",
        "ok/run",
        "arts",
        "domains",
        "rel",
        "payload tok",
        "p50 ms",
        "p95 ms",
        "monthly share",
      ],
      report.summary.channelStats.map((row) => [
        row.channel,
        `${row.okRuns}/${row.runs}`,
        String(row.articles),
        String(row.uniqueDomains),
        pct(row.relevance),
        String(row.payloadTokens),
        row.p50 === null ? "—" : String(row.p50),
        row.p95 === null ? "—" : String(row.p95),
        num(report.summary.cost.byChannel?.[row.channel]?.monthlyShareConsumed, 4),
      ]),
    ),
    "",
  );

  lines.push("## Cost", "");
  lines.push(`- total calls: ${report.summary.cost.totalCalls}`);
  lines.push(`- metered calls: ${report.summary.cost.meteredCalls}`);
  lines.push(`- skipped for budget: ${report.summary.cost.skippedForBudget}`);
  if (report.summary.cost.note) lines.push(`- ${report.summary.cost.note}`);
  lines.push("");

  return lines.join("\n");
}
