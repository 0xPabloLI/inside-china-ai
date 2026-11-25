// Topic-stage videoFit is a *potential* score, not an asset inventory score.
//
// A trend topic can be video-ready before anyone downloads a file: an official
// demo, a founder photo, a product page, a launch event, a benchmark chart, or
// a company logo already in the shared entity library are all visual material.
// The score answers "could an editor assemble a 30-60s vertical video from
// verifiable assets around this story?" It must not pretend the assets are
// already on disk. Production readiness is a separate `assetReady` bit and the
// measured `assetFit` score in `lib/video-fit.mjs`.
//
// This split closes the 2026-11-21 failure where every new topic scored 0
// because the old rubric only counted files under content/<slug>/assets/.

const TOPIC_VIDEO_FIT_POLICY_DATE = "2026-11-21";

const TOPIC_VIDEO_FORMATS = ["demo-led", "chart-led", "data-reveal", "explainer", "text-led"];

const ASSET_RULES = {
  demo: { dynamic: true, entityVisual: true, officialEligible: true },
  event: { dynamic: true, entityVisual: true, officialEligible: true },
  person: { dynamic: false, entityVisual: true, officialEligible: false },
  company: { dynamic: false, entityVisual: true, officialEligible: false },
  product: { dynamic: false, entityVisual: true, officialEligible: false },
  chart: { dynamic: false, entityVisual: true, officialEligible: false },
  logo: { dynamic: false, entityVisual: false, officialEligible: false },
  text: { dynamic: false, entityVisual: false, officialEligible: false },
};

const URL_RE = /^https?:\/\//i;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Normalize one asset evidence row and reject rows without a usable source.
 * A URL or an absolute/local content-library path is required; a bare label
 * ("official demo") is not evidence and must not earn points.
 */
function normalizeAssetEvidence(item = {}) {
  const type = asString(item.type).toLowerCase();
  const rule = ASSET_RULES[type];
  if (!rule) return { ok: false, reason: `unknown asset type: ${item.type ?? "(missing)"}` };

  const url = asString(item.url);
  const localPath = asString(item.localPath ?? item.path);
  if (!url && !localPath) {
    return { ok: false, reason: `${type}: missing url or localPath` };
  }
  if (url && !URL_RE.test(url)) {
    return { ok: false, reason: `${type}: url must start with http(s)://` };
  }
  if (localPath && !localPath.startsWith("/")) {
    return { ok: false, reason: `${type}: localPath must be absolute` };
  }

  return {
    ok: true,
    asset: {
      type,
      label: asString(item.label) || type,
      url: url || null,
      localPath: localPath || null,
      official: item.official === true,
      dynamic: item.dynamic === undefined ? rule.dynamic : item.dynamic === true,
      entityVisual: rule.entityVisual,
      officialEligible: rule.officialEligible,
    },
  };
}

function countAssets(assets) {
  const dynamic = assets.filter((asset) => asset.dynamic).length;
  const entityVisual = assets.filter((asset) => asset.entityVisual).length;
  const officialDynamic = assets.filter(
    (asset) => asset.dynamic && asset.official && asset.officialEligible,
  ).length;
  const logoOnly = assets.length > 0 && assets.every((asset) => asset.type === "logo");
  const textOnly = assets.length > 0 && assets.every((asset) => asset.type === "text");
  return { dynamic, entityVisual, officialDynamic, logoOnly, textOnly };
}

function hasVisualHook(hook, assets) {
  const value = asString(hook);
  if (!value) return false;
  // A pure text-card hook ("TEXT CARD: ...") is explicitly not a visual hook.
  if (/^TEXT\s*CARD\b/i.test(value)) return false;
  // The hook should name at least one evidence type or asset label; vague
  // "show the product" without a sourced asset is not enough at 3+.
  const normalized = value.toLowerCase();
  return assets.some((asset) => {
    const label = asset.label.toLowerCase();
    return (
      normalized.includes(asset.type) ||
      (label && normalized.includes(label)) ||
      (asset.url && normalized.includes(asset.url.toLowerCase()))
    );
  });
}

/**
 * Score 0-5. `assets` is an array of evidence rows:
 *   { type: "demo"|"event"|"person"|"company"|"product"|"chart"|"logo"|"text",
 *     label?: string, url?: string, localPath?: string, official?: boolean,
 *     dynamic?: boolean }
 *
 * 5: official dynamic demo/event + at least 3 entity visuals, with a dynamic
 *    hook (official event recording or demo clip).
 * 4: at least one dynamic asset + 2 entity visuals (3 assets total), hook is
 *    visual but may be a still.
 * 3: 3+ entity visuals, or one dynamic + 2 entity visuals; explainer-ready.
 * 2: 1-2 assets, or only a logo/avatar/generic image.
 * 1: only text / data card without a visual entity.
 * 0: no verifiable asset.
 *
 * Hard caps: fewer than 3 assets cannot exceed 2; a text-card hook caps at 2.
 */
export function scoreTopicVideoFit({ assets = [], format = "explainer", hook = "" } = {}) {
  const normalized = [];
  const rejected = [];
  for (const item of assets) {
    const result = normalizeAssetEvidence(item);
    if (result.ok) normalized.push(result.asset);
    else rejected.push(result.reason);
  }

  if (normalized.length === 0) {
    return {
      score: 0,
      assetCount: 0,
      dynamicCount: 0,
      entityVisualCount: 0,
      officialDynamicCount: 0,
      rejected,
      reason: "no verifiable visual asset",
    };
  }

  const counts = countAssets(normalized);
  const hookIsVisual = hasVisualHook(hook, normalized);
  const formatIsKnown = TOPIC_VIDEO_FORMATS.includes(format);

  let score = 0;
  if (counts.textOnly) score = 1;
  else if (counts.logoOnly) score = 2;
  else if (normalized.length <= 2) score = 2;
  else if (
    counts.officialDynamic >= 1 &&
    counts.entityVisual >= 3 &&
    hookIsVisual &&
    normalized.some((asset) => asset.dynamic && asset.official)
  ) {
    score = 5;
  } else if (counts.dynamic >= 1 && counts.entityVisual >= 2 && hookIsVisual) {
    score = 4;
  } else if (counts.entityVisual >= 3 || (counts.dynamic >= 1 && counts.entityVisual >= 2)) {
    score = 3;
  } else {
    score = 2;
  }

  if (score >= 3 && !hookIsVisual) score = 2;
  if (score >= 3 && normalized.length < 3) score = 2;
  if (score >= 3 && !formatIsKnown) score = 2;

  return {
    score,
    assetCount: normalized.length,
    dynamicCount: counts.dynamic,
    entityVisualCount: counts.entityVisual,
    officialDynamicCount: counts.officialDynamic,
    hookIsVisual,
    format,
    rejected,
    reason:
      score === 5
        ? "official dynamic demo/event + 3 entity visuals + dynamic-compatible hook"
        : score === 4
          ? "dynamic asset + 2 entity visuals + visual hook"
          : score === 3
            ? "3+ entity visuals, explainer-ready"
            : score === 2
              ? "only 1-2 assets, or logo/avatar/generic imagery"
              : score === 1
                ? "text/data card only"
                : "no verifiable visual asset",
  };
}

/**
 * Report-ready evaluation. `assetEvidence` is a human-readable list of the
 * exact URL/path rows that were counted, or "none"; it never invents a source.
 */
export function evaluateTopicVideoFit({
  assets = [],
  format = "explainer",
  hook = "",
  slug = null,
} = {}) {
  const scoring = scoreTopicVideoFit({ assets, format, hook });
  const evidence = assets
    .map((item) => normalizeAssetEvidence(item))
    .filter((item) => item.ok)
    .map((item) => {
      const where = item.asset.url || item.asset.localPath;
      const official = item.asset.official ? "official" : "third-party";
      const dynamic = item.asset.dynamic ? "dynamic" : "still";
      return `${item.asset.type}:${item.asset.label} (${official}, ${dynamic}) ${where}`;
    });

  return {
    slug,
    videoFit: scoring.score,
    assetReady: 0, // topic stage; production recomputes this from downloaded assets
    assetEvidence: evidence.length > 0 ? evidence.join("; ") : "none",
    format,
    hook,
    reason: scoring.reason,
    diagnostics: {
      assetCount: scoring.assetCount,
      dynamicCount: scoring.dynamicCount,
      entityVisualCount: scoring.entityVisualCount,
      officialDynamicCount: scoring.officialDynamicCount,
      hookIsVisual: scoring.hookIsVisual ?? false,
      rejectedEvidence: scoring.rejected,
    },
  };
}
