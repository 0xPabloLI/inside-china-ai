/**
 * #430 — the missing "no reusable widget" branch.
 *
 * The pipeline says a section with structured data must carry at least one
 * widget, and the checklist downgrades zero widgets to a warning (W6). Neither
 * says what to do when no registered widget fits: the de facto answer was
 * "ship it and move on", which is why 8 of 15 articles carry zero widgets and
 * six of those eight contain tables.
 *
 * The ruling (2026-11-04, ticket comment): zero widgets is allowed only with a
 * written decision record covering one of six outcomes. This suite pins the
 * decision, not the widget count: the gate is the record.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import {
  PLAN_STATUSES,
  collectRegistryIds,
  evaluateWidgetPlan,
  findTables,
  findWidgetMarkers,
} from "../lib/widget-plan.mjs";

const CLI = join(import.meta.dirname, "..", "check-widget-plan.mjs");

const table = `Intro paragraph.

| Model | Price | Context |
| --- | ---: | --- |
| A | $1 | 128k |
| B | $2 | 64k |

Outro.`;

const registry = `const BREAKOUT_WIDGETS = new Set<string>([
  "breakout-only",
]);

export const WIDGETS: Record<string, LazyWidget> = {
  "deepseek-funding": lazy(() =>
    import("./deepseek/funding-view").then((m) => ({ default: m.FundingView })),
  ),
  "kimi-identity-bleed": lazy(() =>
    import("./distillation/identity-bleed-view").then((m) => ({
      default: m.IdentityBleedView,
    })),
  ),
};`;

const ids = ["deepseek-funding", "kimi-identity-bleed"];

describe("findWidgetMarkers", () => {
  it("extracts the ID from the inline marker form", () => {
    expect(findWidgetMarkers("text\n<!-- widget:deepseek-funding -->\nmore")).toEqual([
      "deepseek-funding",
    ]);
    expect(findWidgetMarkers("<!-- widget: deepseek-funding -->")).toEqual(["deepseek-funding"]);
  });

  it("keeps document order and duplicates", () => {
    const body = "<!-- widget:b -->\n<!-- widget:a -->\n<!-- widget:b -->";
    expect(findWidgetMarkers(body)).toEqual(["b", "a", "b"]);
  });

  it("ignores malformed and unrelated comments", () => {
    const body = "<!-- widget: -->\n<!-- widget -->\n<!-- other:x -->\n<!-- widget:a b -->";
    expect(findWidgetMarkers(body)).toEqual([]);
  });

  it("ignores a marker that only appears inside a fenced code block", () => {
    const body = "```html\n<!-- widget:ghost-widget -->\n```\n\nNo widget here.";
    expect(findWidgetMarkers(body)).toEqual([]);
  });
});

describe("findTables", () => {
  it("counts data rows, not header or separator", () => {
    const tables = findTables(table);
    expect(tables).toHaveLength(1);
    expect(tables[0].dataRows).toBe(2);
  });

  it("accepts alignment separators and tables without outer pipes", () => {
    const body = "Name | Score\n:--- | ---:\nAda | 9\nGrace | 8";
    const tables = findTables(body);
    expect(tables).toHaveLength(1);
    expect(tables[0].dataRows).toBe(2);
  });

  it("does not count a table inside a fenced code block", () => {
    const body = "```\n| a | b |\n| --- | --- |\n| 1 | 2 |\n```\n\nNo tables here.";
    expect(findTables(body)).toEqual([]);
  });

  it("requires a separator row and at least one data row", () => {
    expect(findTables("| a | b |\n| 1 | 2 |")).toEqual([]);
    expect(findTables("| a | b |\n| --- | --- |")).toEqual([]);
  });

  it("accepts a GFM separator with single dashes", () => {
    expect(findTables("| a | b |\n| - | - |\n| 1 | 2 |")).toHaveLength(1);
  });

  it("requires header and separator to have the same width", () => {
    expect(findTables("| a | b |\n| --- |\n| 1 | 2 |")).toEqual([]);
  });

  it("does not count a four-space indented table (renders as code)", () => {
    expect(findTables("    | a | b |\n    | --- | --- |\n    | 1 | 2 |")).toEqual([]);
  });
});

describe("collectRegistryIds", () => {
  it("reads WIDGETS keys only, not the breakout set", () => {
    expect(collectRegistryIds(registry)).toEqual(ids);
  });
});

describe("evaluateWidgetPlan — the six ruled outcomes", () => {
  const run = (frontmatter, body = table, registryIds = ids) =>
    evaluateWidgetPlan({ frontmatter, body, registryIds });

  it("rejects structured data with zero widgets and no record", () => {
    const result = run({});
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("widgetPlan");
  });

  it("accepts no-visual-value with a note", () => {
    const result = run({
      widgetPlan: { status: "no-visual-value", note: "Two numbers, no shape." },
    });
    expect(result.ok).toBe(true);
  });

  it("accepts unverifiable with a note", () => {
    const result = run({ widgetPlan: { status: "unverifiable", note: "Anonymous source only." } });
    expect(result.ok).toBe(true);
  });

  it("accepts stale with a note", () => {
    const result = run({ widgetPlan: { status: "stale", note: "Predates the new pricing tier." } });
    expect(result.ok).toBe(true);
  });

  it("accepts new-dev with a backlog reference", () => {
    const result = run({
      widgetPlan: { status: "new-dev", backlog: "#1234", note: "No comparable widget." },
    });
    expect(result.ok).toBe(true);
  });

  it("accepts reuse when the declared widgets match the markers", () => {
    const result = run(
      { widgetPlan: { status: "reused", widgets: ["deepseek-funding"] } },
      "<!-- widget:deepseek-funding -->",
    );
    expect(result.ok).toBe(true);
  });

  it("accepts history-only when a historical snapshot is embedded", () => {
    const result = run(
      {
        widgetPlan: {
          status: "history-only",
          widgets: ["deepseek-funding"],
          note: "July snapshot, used as history.",
        },
      },
      "<!-- widget:deepseek-funding -->",
    );
    expect(result.ok).toBe(true);
  });
});

describe("evaluateWidgetPlan — rejections that keep the record honest", () => {
  const run = (frontmatter, body = table, registryIds = ids) =>
    evaluateWidgetPlan({ frontmatter, body, registryIds });

  it("rejects an unknown status", () => {
    const result = run({ widgetPlan: { status: "skip", note: "nope" } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(PLAN_STATUSES.join(", "));
  });

  it("rejects a missing note on a non-reuse outcome", () => {
    const result = run({ widgetPlan: { status: "no-visual-value" } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("note");
  });

  it("rejects new-dev without a backlog reference", () => {
    const result = run({ widgetPlan: { status: "new-dev", note: "Needs a new view." } });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("backlog");
  });

  it("rejects an outcome that claims no widget while the article embeds one", () => {
    const result = run(
      { widgetPlan: { status: "stale", note: "Old data." } },
      "<!-- widget:deepseek-funding -->",
    );
    expect(result.ok).toBe(false);
  });

  it("rejects reuse that declares nothing", () => {
    const result = run(
      { widgetPlan: { status: "reused", widgets: [] } },
      "<!-- widget:deepseek-funding -->",
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a declared widget the article never embeds", () => {
    const result = run(
      { widgetPlan: { status: "reused", widgets: ["deepseek-funding"] } },
      "<!-- widget:kimi-identity-bleed -->",
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an unregistered widget ID even with a valid record", () => {
    const result = run(
      { widgetPlan: { status: "reused", widgets: ["ghost-widget"] } },
      "<!-- widget:ghost-widget -->",
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("ghost-widget");
  });

  it("rejects an unregistered marker when no record exists (B3 hole)", () => {
    const result = run({}, "<!-- widget:ghost-widget -->");
    expect(result.ok).toBe(false);
  });

  it("rejects a widgetPlan that is not a mapping", () => {
    const result = run({ widgetPlan: "reused" });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("mapping");
  });

  it("treats a code-fenced marker as no widget at all", () => {
    const fenced = "```html\n<!-- widget:deepseek-funding -->\n```\n\n" + table;
    const missingRecord = run({}, fenced);
    expect(missingRecord.ok).toBe(false);
    expect(missingRecord.widgets).toEqual([]);

    const claimed = run(
      { widgetPlan: { status: "reused", widgets: ["deepseek-funding"] } },
      fenced,
    );
    expect(claimed.ok).toBe(false);
    expect(claimed.errors.join("\n")).toContain("does not match");
  });
});

describe("evaluateWidgetPlan — cases that need no record", () => {
  const run = (frontmatter, body = table, registryIds = ids) =>
    evaluateWidgetPlan({ frontmatter, body, registryIds });

  it("passes prose-only articles with zero widgets", () => {
    expect(run({}, "Just prose, no tables.").ok).toBe(true);
  });

  it("passes an article with a registered widget", () => {
    expect(run({}, "<!-- widget:deepseek-funding -->").ok).toBe(true);
  });

  it("does not treat a fenced table as structured data", () => {
    expect(run({}, "```\n| a | b |\n| --- | --- |\n| 1 | 2 |\n```").ok).toBe(true);
  });
});

describe("check-widget-plan CLI", () => {
  const dir = mkdtempSync(join(tmpdir(), "widget-plan-"));
  const registryPath = join(dir, "registry.ts");
  writeFileSync(registryPath, registry);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const write = (name, frontmatter, body) => {
    const path = join(dir, name);
    writeFileSync(
      path,
      `---\ntitle: "T"\nslug: "${name.replace(".md", "")}"\npublished: false\n${frontmatter}---\n\n${body}\n`,
    );
    return path;
  };

  const cli = (args) => spawnSync("node", [CLI, ...args], { encoding: "utf8" });
  const check = (args) => cli(["--registry", registryPath, ...args]);

  it("exits 1 and names the missing record", () => {
    const file = write("gap.md", "", table);
    const result = check(["--file", file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("widgetPlan");
  });

  it("exits 0 when the record is present", () => {
    const file = write(
      "ok.md",
      "widgetPlan:\n  status: no-visual-value\n  note: Two numbers.\n",
      table,
    );
    const result = check(["--file", file]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ok");
  });

  it("exits 2 without --file", () => {
    const result = cli([]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage:");
  });

  it("exits 2 when the registry yields no widget IDs", () => {
    const emptyRegistry = join(dir, "empty-registry.ts");
    writeFileSync(emptyRegistry, "export const NOT_WIDGETS = {};\n");
    const file = write("emptyreg.md", "", table);
    const result = cli(["--registry", emptyRegistry, "--file", file]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("no WIDGETS");
  });

  it("exits 2 when the registry cannot be read", () => {
    const file = write("noreg.md", "", table);
    const result = cli(["--registry", join(dir, "missing-registry.ts"), "--file", file]);
    expect(result.status).toBe(2);
  });

  it("exits 1 when the article cannot be read", () => {
    const result = check(["--file", join(dir, "missing-article.md")]);
    expect(result.status).toBe(1);
  });

  it("answers --help without touching the filesystem", () => {
    const result = cli(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("check-widget-plan");
  });
});
