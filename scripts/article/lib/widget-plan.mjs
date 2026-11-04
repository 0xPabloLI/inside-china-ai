/**
 * Widget plan — the "no reusable widget" branch that the pipeline never had (#430).
 *
 * Rules this module makes decidable:
 *   - A section with structured data and zero widgets must carry a written
 *     decision record in the article frontmatter (`widgetPlan`).
 *   - The record must name one of six outcomes; five of them need a note, and
 *     "new-dev" additionally needs a backlog reference.
 *   - Every embedded `<!-- widget:ID -->` must be registered (the B3 hole:
 *     a typo used to count as "has a widget").
 *   - A record that claims no widget cannot coexist with embedded markers, and
 *     a reuse record must declare exactly the widgets the article embeds.
 *
 * The machine proxy for "structured data" is a markdown table outside fenced
 * code blocks. That is deliberately narrower than the human rule (financials,
 * comparisons, timelines, specs): the guide still asks for the judgement on
 * prose-only sections, but the gate can only be wrong in the lenient direction.
 *
 * Fenced code and four-space indented code are excluded because neither renders
 * as a table; markers get the same treatment, so a code sample that documents
 * `<!-- widget:x -->` cannot satisfy the "has a widget" side of the gate.
 */

/** How each outcome constrains the record and the article. */
const STATUS_RULES = {
  reused: { widgets: "required", note: false, backlog: false },
  "history-only": { widgets: "required", note: true, backlog: false },
  stale: { widgets: "forbidden", note: true, backlog: false },
  "new-dev": { widgets: "forbidden", note: true, backlog: true },
  "no-visual-value": { widgets: "forbidden", note: true, backlog: false },
  unverifiable: { widgets: "forbidden", note: true, backlog: false },
};

/** The six ruled outcomes (ticket #430, 2026-11-04 ruling). */
export const PLAN_STATUSES = Object.keys(STATUS_RULES);

const FENCE = /^(\s*)(`{3,}|~{3,})/;

/**
 * True for every line that belongs to a fenced code block, including the fence
 * lines themselves. A closing fence must use the same character and be at least
 * as long as the opening one, so a ``` line inside a ```` block stays content.
 */
function fencedFlags(lines) {
  const flags = new Array(lines.length).fill(false);
  let open = null;
  for (let i = 0; i < lines.length; i += 1) {
    const match = FENCE.exec(lines[i]);
    if (open) {
      flags[i] = true;
      if (match && match[2][0] === open.char && match[2].length >= open.length) open = null;
      continue;
    }
    if (match) {
      open = { char: match[2][0], length: match[2].length };
      flags[i] = true;
    }
  }
  return flags;
}

/** IDs of every `<!-- widget:ID -->` marker outside fenced code, in document order. */
export function findWidgetMarkers(body) {
  const lines = body.split("\n");
  const flags = fencedFlags(lines);
  const visible = lines.map((line, i) => (flags[i] ? "" : line)).join("\n");
  const ids = [];
  for (const match of visible.matchAll(/<!--\s*widget:\s*([^\s>]+)\s*-->/g)) {
    ids.push(match[1]);
  }
  return ids;
}

/** Split a pipe-table row on unescaped pipes; null when the line is not a row. */
function splitRow(line) {
  const cells = [];
  let cell = "";
  let sawPipe = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\\" && line[i + 1] === "|") {
      cell += "|";
      i += 1;
      continue;
    }
    if (char === "|") {
      cells.push(cell);
      cell = "";
      sawPipe = true;
      continue;
    }
    cell += char;
  }
  cells.push(cell);
  if (!sawPipe) return null;
  // Drop the empty cells produced by leading/trailing pipes.
  if (cells.length && cells[0].trim() === "") cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.length >= 2 ? cells : null;
}

/** GFM delimiter row: each cell is dashes with optional alignment colons. */
function isSeparatorRow(cells) {
  return cells !== null && cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

/**
 * Markdown tables outside fenced and indented code blocks.
 * @returns {{ startLine: number, dataRows: number }[]} 1-based startLine.
 */
export function findTables(body) {
  const lines = body.split("\n");
  const flags = fencedFlags(lines);
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    if (flags[i] || /^\s{4,}/.test(lines[i])) {
      i += 1;
      continue;
    }

    const header = splitRow(lines[i]);
    const separator = i + 1 < lines.length && !flags[i + 1] ? splitRow(lines[i + 1]) : null;
    if (header !== null && isSeparatorRow(separator) && header.length === separator.length) {
      let dataRows = 0;
      let j = i + 2;
      while (j < lines.length && !flags[j] && !/^\s{4,}/.test(lines[j])) {
        const row = splitRow(lines[j]);
        if (row === null) break;
        dataRows += 1;
        j += 1;
      }
      if (dataRows > 0) {
        tables.push({ startLine: i + 1, dataRows });
        i = j;
        continue;
      }
    }
    i += 1;
  }
  return tables;
}

/** Widget IDs registered in registry.ts (`WIDGETS` record only). */
export function collectRegistryIds(registrySource) {
  const marker = registrySource.indexOf("export const WIDGETS");
  if (marker === -1) return [];
  const body = registrySource.slice(marker);
  const ids = [];
  for (const match of body.matchAll(/"([^"]+)":\s*lazy\(/g)) {
    ids.push(match[1]);
  }
  return ids;
}

function declaredWidgets(plan) {
  if (!Array.isArray(plan.widgets)) return [];
  return plan.widgets.map((id) => String(id).trim()).filter(Boolean);
}

/**
 * Judge one article's widget plan.
 *
 * @param {{ frontmatter: object, body: string, registryIds: string[] }} input
 * @returns {{ ok: boolean, errors: string[], notes: string[], widgets: string[], tables: {startLine:number,dataRows:number}[], plan: object|null }}
 */
export function evaluateWidgetPlan({ frontmatter, body, registryIds = [] }) {
  const errors = [];
  const notes = [];
  const widgets = findWidgetMarkers(body);
  const tables = findTables(body);
  const plan = frontmatter?.widgetPlan ?? null;

  const unregistered = [...new Set(widgets)].filter((id) => !registryIds.includes(id));
  for (const id of unregistered) {
    errors.push(
      `widget "${id}" is not registered in src/components/widgets/registry.ts (B3) — fix the ID or register the component`,
    );
  }

  if (plan === null) {
    if (widgets.length === 0 && tables.length > 0) {
      const rows = tables.reduce((sum, table) => sum + table.dataRows, 0);
      errors.push(
        `structured data found (${tables.length} table${tables.length === 1 ? "" : "s"}, ${rows} data row${rows === 1 ? "" : "s"}) but the article embeds 0 widgets and declares no widgetPlan`,
      );
      errors.push(
        `add a widgetPlan block to the frontmatter with one of: ${PLAN_STATUSES.join(", ")} (docs/article-production-guide.md → Widget 适用性决策)`,
      );
    } else {
      notes.push(
        widgets.length > 0
          ? `${widgets.length} widget marker${widgets.length === 1 ? "" : "s"}, all registered`
          : "no structured data, no widget plan needed",
      );
    }
    return { ok: errors.length === 0, errors, notes, widgets, tables, plan };
  }

  if (typeof plan !== "object" || Array.isArray(plan)) {
    errors.push(
      `widgetPlan must be a mapping with a status field (one of: ${PLAN_STATUSES.join(", ")}), got ${JSON.stringify(plan)}`,
    );
    return { ok: false, errors, notes, widgets, tables, plan: null };
  }

  const status = typeof plan.status === "string" ? plan.status.trim() : "";
  const rules = STATUS_RULES[status];
  if (!rules) {
    errors.push(
      `widgetPlan.status must be one of: ${PLAN_STATUSES.join(", ")} (got: ${JSON.stringify(plan.status ?? null)})`,
    );
  }

  const note = typeof plan.note === "string" ? plan.note.trim() : "";
  if (rules?.note && !note) {
    errors.push(`widgetPlan.status "${status}" requires a widgetPlan.note explaining the decision`);
  }

  if (rules?.widgets === "forbidden" && widgets.length > 0) {
    errors.push(
      `widgetPlan.status "${status}" says no widget fits, but the article embeds ${widgets.length} (${widgets.join(", ")})`,
    );
  }

  if (rules?.widgets === "required") {
    const declared = [...new Set(declaredWidgets(plan))].sort();
    const embedded = [...new Set(widgets)].sort();
    if (declared.length === 0) {
      errors.push(
        `widgetPlan.status "${status}" must list the embedded widget IDs in widgetPlan.widgets`,
      );
    } else if (declared.join("|") !== embedded.join("|")) {
      errors.push(
        `widgetPlan.widgets [${declared.join(", ")}] does not match the embedded markers [${embedded.join(", ")}]`,
      );
    }
  }

  if (rules?.backlog && !/^#\d+$/.test(String(plan.backlog ?? "").trim())) {
    errors.push(
      `widgetPlan.status "new-dev" requires widgetPlan.backlog: "#<issue>" for the rolling widget backlog`,
    );
  }

  if (errors.length === 0) {
    notes.push(
      widgets.length > 0
        ? `${widgets.length} widget marker${widgets.length === 1 ? "" : "s"}, all registered; plan: ${status}`
        : `no widgets; plan: ${status}`,
    );
  }

  return { ok: errors.length === 0, errors, notes, widgets, tables, plan };
}
