/**
 * VideoFit rescore audit (#1551).
 *
 * The probe finds media; this module decides whether that media may change a
 * score, and writes the audit a reader can check:
 *
 *   original score → new score, evidence delta, and why a topic did NOT rise.
 *
 * Only topics at `videoFit <= 3` that point at an official product page are
 * probed. Topics already at 4–5 are left alone; a full re-score of every
 * topic would be a second guessing pass, which is exactly what #1551 forbids.
 *
 * The score itself stays in `lib/topic-video-fit.mjs`; this module only adds
 * evidence rows and calls the same pure function.
 *
 * @module videofit-rescore
 */

import { probeOfficialPageMedia } from "./official-media-probe.mjs";
import { evaluateTopicVideoFit } from "./topic-video-fit.mjs";

const DEFAULT_MAX_PAGES = 6;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/** Stable asset identity for de-duplication. */
function assetKey(asset) {
  if (!asset || typeof asset !== "object") return "";
  return asset.url || asset.localPath || asset.path || `${asset.type || "?"}:${asset.label || ""}`;
}

function dedupeAssets(assets) {
  const seen = new Set();
  const result = [];
  for (const asset of asArray(assets)) {
    const key = assetKey(asset);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(asset);
  }
  return result;
}

/** Official product pages named directly in the evidence rows. */
function evidenceProductPages(assets) {
  return asArray(assets)
    .filter(
      (asset) =>
        asset &&
        asset.type === "product" &&
        asset.official === true &&
        typeof asset.url === "string" &&
        /^https?:\/\//i.test(asset.url),
    )
    .map((asset) => asset.url);
}

/** Probe pages the editor discovered beyond the current evidence rows. */
function declaredProbePages(topic) {
  return asArray(topic.probePages).filter(
    (url) => typeof url === "string" && /^https?:\/\//i.test(url),
  );
}

function uniquePages(pages, limit) {
  const seen = new Set();
  const result = [];
  for (const page of pages) {
    if (seen.has(page)) continue;
    seen.add(page);
    result.push(page);
    if (result.length >= limit) break;
  }
  return result;
}

function formatEvidenceChange(demoAssets, pagesWithMedia) {
  if (demoAssets.length === 0) return "无新增动态证据";
  const examples = demoAssets.slice(0, 3).map((asset) => asset.url);
  const suffix = demoAssets.length > examples.length ? " …" : "";
  return `+${demoAssets.length} demo (official, dynamic) from ${pagesWithMedia} page(s): ${examples.join("; ")}${suffix}`;
}

/**
 * Rescore one topic. Pure except for the injected fetch seam.
 *
 * @param {object} topic
 * @param {object} [deps]
 * @param {Function} deps.fetchImpl
 * @param {number} deps.maxPagesPerTopic
 * @returns {Promise<object>} audit row
 */
export async function rescoreTopic(topic, deps = {}) {
  const fetchImpl = deps.fetchImpl;
  const maxPages =
    Number.isInteger(deps.maxPagesPerTopic) && deps.maxPagesPerTopic > 0
      ? deps.maxPagesPerTopic
      : DEFAULT_MAX_PAGES;
  const slug = topic?.slug || "(unnamed)";
  const title = topic?.title || slug;
  const assets = dedupeAssets(topic?.assets);
  const original = evaluateTopicVideoFit({
    assets,
    format: topic?.format || "explainer",
    hook: topic?.hook || "",
    slug: topic?.slug || null,
  });
  const recordedFit = Number.isFinite(topic?.videoFit) ? topic.videoFit : original.videoFit;
  const originalFormat = topic?.format || "explainer";

  const base = {
    slug,
    title,
    newsScore: Number.isFinite(topic?.score) ? topic.score : null,
    original: { videoFit: recordedFit, format: originalFormat },
    rescored: { videoFit: recordedFit, format: originalFormat },
    evidenceChange: "无新增动态证据",
    decision: "无需探针：无官方产品页",
    probe: { pages: [], probed: 0, withMedia: 0, errors: [] },
  };

  if (recordedFit > 3) {
    return {
      ...base,
      decision: `无需探针：原分 ${recordedFit} 高于 3，不参与重打`,
    };
  }

  const pages = uniquePages(
    [...evidenceProductPages(assets), ...declaredProbePages(topic)],
    maxPages,
  );
  if (pages.length === 0) {
    return {
      ...base,
      decision: "无需探针：无官方产品页（第三方页面不得按官方动态计分）",
    };
  }

  const demoAssets = [];
  const pagesWithMedia = new Set();
  const errors = [];
  let probed = 0;

  for (const page of pages) {
    const result = await probeOfficialPageMedia({
      pageUrl: page,
      official: true,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
    probed += 1;
    if (!result.ok) {
      errors.push({ page, error: result.error || "unknown probe error" });
      continue;
    }
    if (result.assets.length > 0) {
      pagesWithMedia.add(page);
      demoAssets.push(...result.assets);
    }
  }

  const probe = { pages, probed, withMedia: pagesWithMedia.size, errors };

  if (demoAssets.length === 0) {
    const failure = errors.length === probed && probed > 0;
    return {
      ...base,
      probe,
      decision: failure
        ? `探针失败（${errors.map((entry) => entry.error).join("; ")}），保留原分 ${recordedFit}`
        : `官方产品页未探到可播放动态，保留原分 ${recordedFit}`,
    };
  }

  const uniqueDemoAssets = dedupeAssets(demoAssets);
  const merged = dedupeAssets([...assets, ...uniqueDemoAssets]);
  const afterFormat = topic?.probe?.format || originalFormat;
  const afterHook = topic?.probe?.hook || topic?.hook || "";
  const rescored = evaluateTopicVideoFit({
    assets: merged,
    format: afterFormat,
    hook: afterHook,
    slug: topic?.slug || null,
  });
  const evidenceChange = formatEvidenceChange(uniqueDemoAssets, pagesWithMedia.size);

  let decision;
  if (rescored.videoFit > recordedFit) {
    decision = `升分：${recordedFit} → ${rescored.videoFit}（${rescored.reason}）`;
  } else if (rescored.videoFit === recordedFit) {
    decision = `证据已补但分数未升：${rescored.reason}；检查 hook/format 是否落在动态素材上`;
  } else {
    decision = `重打后低于原分（${recordedFit} → ${rescored.videoFit}），请人工复核`;
  }

  return {
    slug,
    title,
    newsScore: Number.isFinite(topic?.score) ? topic.score : null,
    original: { videoFit: recordedFit, format: originalFormat },
    rescored: { videoFit: rescored.videoFit, format: afterFormat },
    evidenceChange,
    decision,
    probe,
  };
}

/**
 * Rescore the topics that need it. Topics above 3 are not probed at all.
 *
 * @param {object} options
 * @param {Array<object>} options.topics
 * @param {Function} [options.fetchImpl]
 * @param {string} [options.date]
 * @param {number} [options.maxPagesPerTopic]
 * @returns {Promise<{date: string, rows: Array<object>, summary: object}>}
 */
export async function rescoreTopics({
  topics = [],
  fetchImpl,
  date,
  maxPagesPerTopic = DEFAULT_MAX_PAGES,
} = {}) {
  const rows = [];
  for (const topic of asArray(topics)) {
    rows.push(await rescoreTopic(topic, { fetchImpl, maxPagesPerTopic }));
  }

  const raised = rows.filter((row) => row.rescored.videoFit > row.original.videoFit);
  const probeFailed = rows.filter(
    (row) => row.probe.errors.length === row.probe.probed && row.probe.probed > 0,
  );
  const probed = rows.filter((row) => row.probe.probed > 0);
  const kept = rows.filter(
    (row) => row.probe.probed > 0 && row.rescored.videoFit <= row.original.videoFit,
  );
  const untouched = rows.filter((row) => row.probe.probed === 0 && row.original.videoFit > 3);

  return {
    date: date || null,
    rows,
    summary: {
      total: rows.length,
      raised: raised.length,
      kept: kept.length,
      untouched: untouched.length,
      probed: probed.length,
      probeFailed: probeFailed.length,
    },
  };
}

/** Markdown cell escaping: pipes break GitHub tables. */
function cell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

/**
 * Build the audit file the trend report links to.
 *
 * @param {{date?: string, rows: Array<object>, summary: object}} result
 * @param {{date?: string}} [options]
 * @returns {string}
 */
export function buildRescoreMarkdown(result, options = {}) {
  const date = options.date || result.date || "(undated)";
  const rows = asArray(result.rows);
  const summary = result.summary || {};

  const lines = [
    `# VideoFit 重打分审计（${date}）`,
    "",
    "> 规则：只对 `videoFit <= 3` 且证据指向官方产品页的 topic 探一次页内媒体；探到可播放动态才重打分，探不到保留原分。第三方页面的视频不得按官方动态计分。",
    "",
    `共审计 ${summary.total ?? rows.length} 条：升分 ${summary.raised ?? 0}、保持 ${summary.kept ?? 0}（其中探针失败 ${summary.probeFailed ?? 0}）、无需重打 ${summary.untouched ?? 0}（原分 > 3）；实际探针 ${summary.probed ?? 0} 条。`,
    "",
    "| Topic | 0–10 | 原分 / format | 新分 / format | 证据变化 | 判定 |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${cell(row.title)} | ${row.newsScore ?? "—"} | ${row.original.videoFit} / ${cell(row.original.format)} | ${row.rescored.videoFit} / ${cell(row.rescored.format)} | ${cell(row.evidenceChange)} | ${cell(row.decision)} |`,
    );
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}
