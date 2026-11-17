/**
 * Chart claim agreement audit (#1398).
 *
 * A native chart can be numerically correct and still disagree with the
 * narration: the voiceover says "35 to 50" while the chart plots 3.5 and 5.0,
 * or the chart claims a June window the script never mentions. This audit
 * looks for one shared anchor, not for semantic equivalence. It is advisory
 * first: a false positive should cost a writer one sentence, never a render.
 *
 * Two chart paths are covered:
 *
 * 1. Native `scene.info` charts: at least one data label or value must appear
 *    in the voiceover or the scene's text; when `info.time` is present, the
 *    voiceover must name one of its year/month tokens.
 * 2. Chart-image pins (`scene.chart`, K-line): `texts.subtext` or
 *    `texts.source` must name a price unit or the claim window. The pin's
 *    pixels are not readable by this layer, so the text has to carry it.
 */
import { normalizeInfoSpec } from "./info-grammar.mjs";

const CHECK = "Chart claim agreement (data labels, time window, pin window)";
const CATEGORY = "Data";

const MONTH_ABBR = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const MONTH_FULL = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

function row(level, detail, fix) {
  return { level, category: CATEGORY, check: CHECK, detail, ...(fix ? { fix } : {}) };
}

function text(value) {
  return typeof value === "string" && value.trim() !== "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sceneText(scene) {
  const parts = [];
  if (text(scene?.voiceover)) parts.push(scene.voiceover);
  const texts = scene?.texts;
  if (texts && typeof texts === "object") {
    for (const value of Object.values(texts)) {
      if (text(value)) parts.push(value);
    }
  }
  return parts.join(" ");
}

function containsNumber(haystack, value, decimals) {
  if (!Number.isFinite(value)) return false;
  const forms = new Set();
  const abs = Math.abs(value);
  forms.add(String(value));
  forms.add(String(abs));
  if (Number.isInteger(decimals)) {
    forms.add(value.toFixed(decimals));
    forms.add(abs.toFixed(decimals));
  }
  // A whole number also appears in a decimal claim ("120" in "120 million").
  if (!Number.isInteger(abs)) {
    forms.add(abs.toFixed(1));
    forms.add(abs.toFixed(2));
  }
  for (const form of forms) {
    const pattern = new RegExp(`(?<![\\d.])${escapeRegExp(form)}(?![\\d.])`, "i");
    if (pattern.test(haystack)) return true;
  }
  return false;
}

function containsLabel(haystack, label) {
  if (!text(label) || label.trim().length < 2) return false;
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(label.trim())}([^\\p{L}\\p{N}]|$)`,
    "iu",
  );
  return pattern.test(haystack);
}

function timeTokens(iso) {
  if (!text(iso)) return [];
  const match = /^(\d{4})-(\d{1,2})/.exec(iso.trim());
  if (!match) return [iso.trim().toLowerCase()];
  const year = match[1];
  const month = Number(match[2]);
  if (month < 1 || month > 12) return [year];
  return [year, String(month).padStart(2, "0"), MONTH_ABBR[month - 1], MONTH_FULL[month - 1]];
}

function voiceoverNames(tokens, voiceover) {
  if (!text(voiceover) || tokens.length === 0) return false;
  const lower = voiceover.toLowerCase();
  return tokens.some((token) => {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegExp(token.toLowerCase())}([^\\p{L}\\p{N}]|$)`,
      "iu",
    );
    return pattern.test(lower);
  });
}

function auditNative(scene, index) {
  const info = normalizeInfoSpec(scene.info);
  const data = Array.isArray(info.data) ? info.data.filter(Boolean) : [];
  if (data.length === 0) {
    return [
      row(
        "warn",
        `Scene ${scene.id ?? index + 1} has a native chart but no readable data points.`,
        "Add at least one `{ label, value }` datum so the claim can be checked.",
      ),
    ];
  }

  const findings = [];
  const haystack = sceneText(scene);
  const anchor = data.some(
    (datum) => containsLabel(haystack, datum.label) || containsNumber(haystack, datum.value, info.decimals),
  );

  if (!anchor) {
    const labels = data.map((datum) => datum.label).filter(text);
    findings.push(
      row(
        "warn",
        `Scene ${scene.id ?? index + 1} plots ${labels.join(", ")} but neither a label nor a value appears in the voiceover or scene text.`,
        "Name one chart value in the voiceover (e.g. \"from 35 to 50\") or repeat the reading in `texts.subtext`; the viewer should not have to infer which number the shot is about.",
      ),
    );
  }

  if (info.time && text(info.time.from) && text(info.time.to)) {
    const tokens = [...timeTokens(info.time.from), ...timeTokens(info.time.to)];
    if (!voiceoverNames(tokens, scene.voiceover)) {
      findings.push(
        row(
          "warn",
          `Scene ${scene.id ?? index + 1} declares a ${info.time.from} to ${info.time.to} window, but the voiceover never names its year or month.`,
          "Say the window in the voiceover (e.g. \"between January and July\") or remove `info.time` if the chart is not making a time claim.",
        ),
      );
    }
  }

  return findings;
}

function hasUnitOrWindow(value, chart) {
  if (!text(value)) return false;
  if (/(?:HK\$|US\$|\$|%|HKD|USD|CNY|RMB|yuan|points?)/i.test(value)) return true;
  if (/\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i.test(value)) return true;
  if (/\b20\d{2}\b/.test(value)) return true;
  if (typeof chart?.range === "string" && value.toLowerCase().includes(chart.range.toLowerCase())) {
    return true;
  }
  return false;
}

function auditPin(scene, index) {
  const label = typeof scene?.texts?.subtext === "string" ? scene.texts.subtext : "";
  const source = typeof scene?.texts?.source === "string" ? scene.texts.source : "";
  if (hasUnitOrWindow(label, scene.chart) || hasUnitOrWindow(source, scene.chart)) return [];
  return [
    row(
      "warn",
      `Scene ${scene.id ?? index + 1} pins a chart image but neither \`texts.subtext\` nor \`texts.source\` names its unit or claim window.`,
      "Add the unit and window (e.g. \"HK$ 2,980 → 454, JUN–NOV\") to `texts.subtext` or `texts.source`; a K-line without a readable window cannot be checked against the script.",
    ),
  ];
}

/**
 * Audit chart scenes against their narration and on-screen text.
 *
 * @param {Array<{id?: number, voiceover?: string, texts?: object, info?: object, chart?: object}>} scenes
 * @returns {Array<{level: string, category: string, check: string, detail?: string, fix?: string}>}
 */
export function auditChartClaimAgreement(scenes) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return [row("pass", "No scenes to audit")];
  }

  const chartScenes = scenes.filter((scene) => scene?.info || scene?.chart);
  if (chartScenes.length === 0) {
    return [row("pass", "No chart scenes to audit")];
  }

  const findings = [];
  for (const [index, scene] of scenes.entries()) {
    if (scene?.info) findings.push(...auditNative(scene, index));
    else if (scene?.chart) findings.push(...auditPin(scene, index));
  }

  if (findings.length === 0) {
    return [
      row(
        "pass",
        `${chartScenes.length} chart scene(s) name a data anchor and, where claimed, a time window.`,
      ),
    ];
  }
  return findings;
}
