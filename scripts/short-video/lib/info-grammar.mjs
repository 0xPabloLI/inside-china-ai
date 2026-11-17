/**
 * Information grammar for native charts (#1398).
 *
 * This is the author-facing contract between a data relationship and a chart
 * shape. It exists so "make it a chart" is not an open choice: a magnitude is
 * a bar, a ranking is a sorted bar, change over time is a line, a part-to-whole
 * is a proportion bar, and a deviation needs a declared baseline. The rules
 * trace to the FT Visual Vocabulary / Datawrapper guidance recorded in
 * `docs/specs/spec-information-layout-v2.md`; they are structural rules, not
 * copied template code.
 *
 * Pure Node: no Remotion, no fs. The renderer consumes `normalizeInfoSpec` and
 * `sortData`; preflight consumes `validateInfoSpec` / `checkInfoSpec`.
 */

export const RELATIONSHIPS = Object.freeze([
  "magnitude",
  "ranking",
  "change-over-time",
  "part-to-whole",
  "deviation",
  "distribution",
  "correlation",
  "flow",
  "spatial",
]);

export const CHART_TYPES = Object.freeze([
  "bar",
  "column",
  "line",
  "slope",
  "proportion-bar",
  "dot-plot",
  "scatter",
  "histogram",
]);

/** Charts this release can draw without a chart-img asset. */
export const NATIVE_CHART_TYPES = Object.freeze([
  "bar",
  "column",
  "line",
  "slope",
  "proportion-bar",
  "dot-plot",
]);

export const RELATIONSHIP_CHARTS = Object.freeze({
  magnitude: ["bar", "column", "dot-plot"],
  ranking: ["bar", "dot-plot", "slope"],
  "change-over-time": ["line", "column", "slope"],
  "part-to-whole": ["proportion-bar"],
  deviation: ["bar", "column"],
  distribution: ["dot-plot", "column"],
  correlation: [],
  flow: [],
  spatial: [],
});

const DEFAULT_CHART = Object.freeze({
  magnitude: "bar",
  ranking: "bar",
  "change-over-time": "line",
  "part-to-whole": "proportion-bar",
  deviation: "bar",
  distribution: "dot-plot",
});

const DATA_LIMITS = Object.freeze({
  bar: { min: 2, max: 8 },
  column: { min: 2, max: 6 },
  line: { min: 2, max: 6 },
  slope: { min: 2, max: 4 },
  "proportion-bar": { min: 2, max: 5 },
  "dot-plot": { min: 2, max: 10 },
});

// Character ceilings are geometry, not style: 40px type at the chart's real
// column/axis spacing. A longer category is a signal to switch to a bar chart,
// never to rotate the label.
const LABEL_LIMIT = Object.freeze({
  bar: 24,
  column: 8,
  line: 8,
  slope: 12,
  "proportion-bar": 18,
  "dot-plot": 16,
});

const SORTS = new Set(["none", "asc", "desc"]);
const PANEL_VARIANTS = new Set(["clean", "terminal"]);

export function allowedChartsFor(relationship) {
  return RELATIONSHIP_CHARTS[relationship] ?? [];
}

export function defaultChartFor(relationship) {
  return DEFAULT_CHART[relationship] ?? null;
}

export function chartDataBounds(relationship, chart) {
  if (relationship === "distribution") return { min: 5, max: 12 };
  return DATA_LIMITS[chart] ?? { min: 2, max: 8 };
}

export function labelLimitFor(chart) {
  return LABEL_LIMIT[chart] ?? 24;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function text(value) {
  return typeof value === "string" && value.trim() !== "";
}

function push(list, code, message, path = "") {
  list.push({ code, message, ...(path ? { path } : {}) });
}

/**
 * Fill the defaults the renderer and gate both read.
 *
 * This does not validate; callers that need a verdict call `validateInfoSpec`.
 * A malformed payload still comes back (with the fields it could read) so the
 * gate can name the exact problem rather than throwing a TypeError.
 */
export function normalizeInfoSpec(info) {
  const source = isPlainObject(info) ? info : {};
  const relationship = text(source.relationship) ? source.relationship : "";
  const chart = text(source.chart) ? source.chart : defaultChartFor(relationship) || "";
  const data = Array.isArray(source.data)
    ? source.data.map((datum) => (isPlainObject(datum) ? { ...datum } : datum))
    : [];
  const needsZero = (chart === "bar" || chart === "column") && relationship !== "deviation";
  return {
    relationship,
    chart,
    data,
    unit: text(source.unit) ? source.unit : "",
    baseline: finite(source.baseline) ? source.baseline : needsZero ? 0 : undefined,
    sort: SORTS.has(source.sort) ? source.sort : relationship === "ranking" ? "desc" : "none",
    highlight: text(source.highlight) ? source.highlight : null,
    time: isPlainObject(source.time) ? { ...source.time } : null,
    decimals: Number.isInteger(source.decimals) ? source.decimals : null,
    prefix: text(source.prefix) ? source.prefix : "",
    suffix: text(source.suffix) ? source.suffix : "",
    axisLabels: Array.isArray(source.axisLabels) ? [...source.axisLabels] : null,
    panelVariant: PANEL_VARIANTS.has(source.panelVariant) ? source.panelVariant : "clean",
  };
}

/**
 * Sort only where order is free. Time series and part-to-whole keep authored
 * order; a ranking sorts by value; an explicit sort overrides magnitude/dot.
 */
export function sortData(info) {
  const normalized = normalizeInfoSpec(info);
  const data = normalized.data.filter(isPlainObject);
  if (normalized.sort === "none" || normalized.chart === "line" || normalized.chart === "slope") {
    return data;
  }
  if (normalized.chart === "proportion-bar") return data;
  return [...data].sort((a, b) =>
    normalized.sort === "asc"
      ? Number(a.value) - Number(b.value)
      : Number(b.value) - Number(a.value),
  );
}

/** Whether this datum is the one highlighted mark. */
export function isHighlighted(info, datum) {
  const normalized = normalizeInfoSpec(info);
  return Boolean(
    datum?.highlight === true || (normalized.highlight && datum?.label === normalized.highlight),
  );
}

function autoDecimals(value) {
  if (!Number.isFinite(value)) return 0;
  if (Number.isInteger(value)) return 0;
  if (Math.abs(value) >= 100) return 0;
  if (Math.abs(value) >= 10) return 1;
  return 1;
}

/** Render a value with its unit, avoiding false precision. */
export function formatChartValue(value, info = {}) {
  const normalized = normalizeInfoSpec(info);
  if (!Number.isFinite(value)) return "—";
  const digits = Number.isInteger(normalized.decimals) ? normalized.decimals : autoDecimals(value);
  const body = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(value));
  const prefix = normalized.prefix || "";
  const suffix = normalized.suffix || "";
  const unit = normalized.unit && normalized.unit !== "count" ? normalized.unit : "";
  return `${value < 0 ? "-" : ""}${prefix}${body}${suffix}${unit}`;
}

/**
 * Validate one scene's `info`. Errors are blocking; warnings are structural
 * advice (missing highlight, too many categories to compare comfortably).
 *
 * @param {object} info
 * @param {{texts?: object, visualType?: string, layout?: string}} [context]
 * @returns {{ok: boolean, errors: Array<object>, warnings: Array<object>, normalized: object}}
 */
export function validateInfoSpec(info, context = {}) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(info)) {
    push(errors, "info.type", "scene.info must be an object");
    return { ok: false, errors, warnings, normalized: normalizeInfoSpec(info) };
  }

  const { texts = {}, visualType, layout } = context;
  if (visualType !== undefined && visualType !== "data") {
    push(
      errors,
      "info.visualType",
      `scene.info is only valid on visualType "data" (got "${visualType}")`,
    );
  }
  if (layout !== undefined && layout !== "chart") {
    push(errors, "info.layout", `scene.info requires layout "chart" (got "${layout}")`);
  }

  const relationship = info.relationship;
  if (!text(relationship) || !RELATIONSHIPS.includes(relationship)) {
    push(errors, "info.relationship", `unknown relationship ${JSON.stringify(relationship)}`);
  }
  const allowed = allowedChartsFor(relationship);
  const chart = text(info.chart) ? info.chart : defaultChartFor(relationship);
  if (!text(chart) || !CHART_TYPES.includes(chart)) {
    push(errors, "info.chart", `unknown chart ${JSON.stringify(info.chart)}`);
  } else if (!NATIVE_CHART_TYPES.includes(chart)) {
    push(
      errors,
      "info.chart.notNative",
      `chart "${chart}" is not native in v2; use a real chart asset with layout "chart-card"`,
    );
  } else if (allowed.length === 0) {
    push(
      errors,
      "info.relationship.noChart",
      `relationship "${relationship}" has no native chart; use an existing topology or a real chart asset`,
    );
  } else if (!allowed.includes(chart)) {
    push(
      errors,
      "info.chart.mismatch",
      `relationship "${relationship}" does not allow chart "${chart}" (allowed: ${allowed.join(", ")})`,
    );
  }

  const data = Array.isArray(info.data) ? info.data : null;
  if (!data) {
    push(errors, "info.data", "info.data must be an array");
  } else {
    const bounds = chartDataBounds(relationship, chart);
    if (data.length < bounds.min || data.length > bounds.max) {
      push(
        errors,
        "info.data.length",
        `info.data has ${data.length} points; ${chart || relationship} needs ${bounds.min}–${bounds.max}`,
        "info.data",
      );
    }
    const labels = new Set();
    data.forEach((datum, index) => {
      const where = `info.data[${index}]`;
      if (!isPlainObject(datum)) {
        push(errors, "info.data.datum", `${where} must be an object`, where);
        return;
      }
      if (!text(datum.label)) {
        push(errors, "info.data.label", `${where}.label must be a non-empty string`, where);
      } else {
        if (datum.label.length > labelLimitFor(chart)) {
          push(
            errors,
            "info.data.labelLength",
            `${where}.label is ${datum.label.length} chars; ${chart} allows ${labelLimitFor(chart)}`,
            where,
          );
        }
        if (labels.has(datum.label)) {
          push(
            errors,
            "info.data.duplicateLabel",
            `${where}.label duplicates ${JSON.stringify(datum.label)}`,
            where,
          );
        }
        labels.add(datum.label);
      }
      if (!finite(datum.value)) {
        push(errors, "info.data.value", `${where}.value must be a finite number`, where);
      }
      if (chart === "slope" && !finite(datum.value2)) {
        push(errors, "info.data.value2", `${where}.value2 is required for a slope chart`, where);
      }
      if (relationship === "part-to-whole" && finite(datum.value) && datum.value <= 0) {
        push(errors, "info.data.positive", `${where}.value must be > 0 for part-to-whole`, where);
      }
      if (datum.value2 !== undefined && !finite(datum.value2)) {
        push(errors, "info.data.value2", `${where}.value2 must be a finite number`, where);
      }
    });

    // 40px type has ~20px average advance. Direct labels must fit the slot the
    // chart actually grants; a longer label is an error, not a rotation.
    if (chart === "column" && data.length > 0) {
      const slot = 700 / data.length;
      for (const datum of data) {
        if (text(datum?.label) && datum.label.length * 20 > slot * 0.9) {
          push(
            errors,
            "info.data.labelOverlap",
            `column label ${JSON.stringify(datum.label)} needs ~${datum.label.length * 20}px but each column has ${slot.toFixed(0)}px; use a bar chart`,
          );
        }
      }
    }
    if (chart === "line" && data.length > 1) {
      const slot = 700 / (data.length - 1);
      for (const datum of data) {
        if (text(datum?.label) && datum.label.length * 20 > slot * 0.9) {
          push(
            errors,
            "info.data.labelOverlap",
            `line x-label ${JSON.stringify(datum.label)} needs ~${datum.label.length * 20}px but points are ${slot.toFixed(0)}px apart`,
          );
        }
      }
    }

    const flagged = data.filter((datum) => datum?.highlight === true).length;
    const named = text(info.highlight) ? 1 : 0;
    if (flagged + named > 1) {
      push(errors, "info.highlight.multiple", "at most one point may be highlighted");
    }
    if (text(info.highlight) && !labels.has(info.highlight)) {
      push(
        errors,
        "info.highlight.unknown",
        `highlight ${JSON.stringify(info.highlight)} is not a data label`,
      );
    }
    if (relationship === "ranking" && flagged + named === 0) {
      push(warnings, "info.highlight.ranking", "a ranking should highlight the point of interest");
    }
    if (data.length > 6 && chart !== "dot-plot") {
      push(warnings, "info.data.density", `${data.length} categories is dense for one 40–70s shot`);
    }
  }

  if (!text(info.unit)) {
    push(errors, "info.unit", "info.unit is required (e.g. %, B, HKD, users)");
  } else if (info.unit.length > 8) {
    push(errors, "info.unit.length", `info.unit is ${info.unit.length} chars; keep it <= 8`);
  }
  if (info.prefix !== undefined && (!text(info.prefix) || info.prefix.length > 3)) {
    push(errors, "info.prefix", "info.prefix must be 1–3 characters");
  }
  if (info.suffix !== undefined && (!text(info.suffix) || info.suffix.length > 3)) {
    push(errors, "info.suffix", "info.suffix must be 1–3 characters");
  }
  if (
    info.decimals !== undefined &&
    (!Number.isInteger(info.decimals) || info.decimals < 0 || info.decimals > 2)
  ) {
    push(errors, "info.decimals", "info.decimals must be 0, 1 or 2");
  }
  if (info.sort !== undefined && !SORTS.has(info.sort)) {
    push(errors, "info.sort", `info.sort must be one of ${[...SORTS].join(", ")}`);
  }
  if (
    (chart === "line" || chart === "slope" || chart === "proportion-bar") &&
    info.sort &&
    info.sort !== "none"
  ) {
    push(errors, "info.sort.fixed", `${chart} keeps authored order; sort must be "none"`);
  }
  if (info.panelVariant !== undefined && !PANEL_VARIANTS.has(info.panelVariant)) {
    push(errors, "info.panelVariant", `info.panelVariant must be "clean" or "terminal"`);
  }
  if (info.axisLabels !== undefined) {
    if (
      !Array.isArray(info.axisLabels) ||
      info.axisLabels.length !== 2 ||
      !info.axisLabels.every((label) => text(label) && label.length <= 12)
    ) {
      push(
        errors,
        "info.axisLabels",
        "info.axisLabels must be two non-empty labels of <= 12 chars",
      );
    }
  }
  if (info.time !== undefined) {
    if (!isPlainObject(info.time) || !text(info.time.from) || !text(info.time.to)) {
      push(errors, "info.time", "info.time must be { from, to } with non-empty strings");
    }
  }

  if (chart === "bar" || chart === "column") {
    if (relationship === "deviation") {
      if (!finite(info.baseline)) {
        push(errors, "info.baseline", "a deviation chart needs an explicit numeric baseline");
      }
    } else if (
      info.baseline !== undefined &&
      (!finite(info.baseline) || Math.abs(info.baseline) > 1e-9)
    ) {
      push(
        errors,
        "info.baseline.zero",
        `${chart} for ${relationship} must start at zero (FT Visual Vocabulary); got baseline ${info.baseline}`,
      );
    }
  } else if (info.baseline !== undefined && !finite(info.baseline)) {
    push(errors, "info.baseline", "info.baseline must be a finite number when present");
  }

  if (relationship === "part-to-whole" && Array.isArray(info.data)) {
    const values = info.data.map((datum) => datum?.value).filter(finite);
    const sum = values.reduce((total, value) => total + value, 0);
    if (values.length > 0 && sum <= 0) {
      push(errors, "info.data.sum", "part-to-whole values must sum to > 0");
    } else if (info.unit === "%" && values.length > 0 && Math.abs(sum - 100) > 0.5) {
      push(
        errors,
        "info.data.percentSum",
        `part-to-whole values with unit "%" must sum to 100 (got ${sum.toFixed(1)})`,
      );
    }
  }

  if (!text(texts?.source)) {
    push(errors, "info.source", "native charts require texts.source (the attribution line)");
  }
  if (!text(texts?.label)) {
    push(warnings, "info.title", "no texts.label — the chart has no claim heading");
  }

  return { ok: errors.length === 0, errors, warnings, normalized: normalizeInfoSpec(info) };
}

/**
 * Preflight gate over every scene. A `chart` layout without `info` is a hard
 * fail; an `info` block on any other layout or visualType is also a hard fail.
 */
export function checkInfoSpec(scenes) {
  const results = [];
  for (const scene of Array.isArray(scenes) ? scenes : []) {
    const layout = scene?.layout ?? null;
    if (!scene?.info) {
      if (layout === "chart") {
        results.push({
          level: "fail",
          category: "Structure",
          check: `Scene ${scene.id} info spec`,
          detail: 'layout "chart" requires scene.info',
          fix: "Add a scene.info block (relationship, chart, data, unit) or remove the chart layout",
        });
      }
      continue;
    }
    const verdict = validateInfoSpec(scene.info, {
      texts: scene.texts,
      visualType: scene.visualType,
      layout,
    });
    for (const error of verdict.errors) {
      results.push({
        level: "fail",
        category: "Structure",
        check: `Scene ${scene.id} info spec`,
        detail: error.message,
        fix: `Fix scene.info ${error.path || error.code} in scene-data (or use a text-side topology)`,
      });
    }
    for (const warning of verdict.warnings) {
      results.push({
        level: "warn",
        category: "Structure",
        check: `Scene ${scene.id} info spec`,
        detail: warning.message,
        fix: "Review the data grammar before rendering",
      });
    }
    if (verdict.ok && verdict.warnings.length === 0) {
      results.push({
        level: "pass",
        category: "Structure",
        check: `Scene ${scene.id} info spec`,
        detail: `${scene.info.relationship} → ${scene.info.chart || defaultChartFor(scene.info.relationship)}; ${scene.info.data?.length ?? 0} points`,
      });
    }
  }
  if (results.length === 0) {
    results.push({
      level: "pass",
      category: "Structure",
      check: "Info spec",
      detail: "no native chart scenes",
    });
  }
  return results;
}
