/**
 * Determinism contract for the production render graph (#734 ①).
 *
 * Why a static gate and not just the pixel test: `render-determinism.test.mjs`
 * proves ONE frame of ONE fixture re-renders identically. It cannot see a
 * `Date.now()` that only fires on a branch, and it runs in the slow
 * `pixel-render` job. This file is the invariant itself — every module the
 * composition actually bundles must be free of wall-clock and entropy sources,
 * so a scene cannot drift into frame-to-frame variance between the frames the
 * pixel suite happens to sample.
 *
 * Source of the rule: #302 D segment (`docs/research/repo-survey-tracking.md`)
 * — video-shotcraft forbids `Date.now()` / `Math.random()` and asserts on its
 * seeded `mulberry32` instead. Audited at pickup (2026-11-10): the production
 * graph had zero `Math.random()` and zero `Date.now()` already, so nothing
 * needed injecting; what was missing was anything that keeps it that way.
 *
 * Why the module graph and not a directory scan:
 *   - `remotion/src/*-fixture.tsx` legitimately waits on `Date.now()` deadlines
 *     for image loading. They are test scaffolding, not the composition, and
 *     `Root.tsx` does not import them.
 *   - The composition pulls shared logic from `scripts/short-video/lib/*.mjs`
 *     (`timeline.mjs`, `text-slots.mjs`, `safe-zones.mjs`). A `Math.random()`
 *     there is just as visible to the viewer as one in a scene.
 *
 * Fail-closed on purpose: a relative import that cannot be resolved fails the
 * test instead of being skipped. A scan that silently covers less is the
 * failure mode #1084 spent two days proving: green because absent.
 *
 * What is NOT a violation:
 *   - `useCurrentFrame()` — frame is input, not a clock.
 *   - `new Date("2026-01-01")` — parsing a constant is deterministic; only the
 *     zero-argument constructor reads the clock.
 *   - seeded `random(seed)` from `remotion` — deterministic by construction.
 */
import { describe, it, expect } from "vitest";
import ts from "typescript";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHORT_VIDEO = resolve(HERE, "..");
const REMOTION_SRC = join(SHORT_VIDEO, "remotion", "src");
const ENTRY = join(REMOTION_SRC, "Root.tsx");

const scriptKindFor = (file) =>
  file.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : file.endsWith(".ts")
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;

function parse(file) {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKindFor(file),
  );
}

/** Relative import specifiers, including `export … from` and dynamic import(). */
function relativeImports(sourceFile) {
  const found = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        found.push(node.moduleSpecifier.text);
      }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) found.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found.filter((spec) => spec.startsWith("."));
}

/** Resolve a relative specifier the way the bundler does; null when unresolvable. */
function resolveModule(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mjs`,
    `${base}.js`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  return (
    candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
  );
}

function moduleGraph(entry) {
  const files = new Set();
  const unresolved = [];
  const walk = (file) => {
    if (files.has(file)) return;
    files.add(file);
    for (const spec of relativeImports(parse(file))) {
      const target = resolveModule(file, spec);
      if (!target) {
        unresolved.push(`${relative(SHORT_VIDEO, file)} → ${spec}`);
        continue;
      }
      walk(target);
    }
  };
  walk(entry);
  return { files: [...files].sort(), unresolved };
}

/** Wall-clock and entropy reads, as AST shapes (comments and strings never match). */
function clockAndEntropyReads(sourceFile) {
  const hits = [];
  const lineOf = (node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const isMemberCall = (node) =>
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression);

  const visit = (node) => {
    if (isMemberCall(node)) {
      const object = node.expression.expression.text;
      const method = node.expression.name.text;
      const label =
        object === "Math" && method === "random"
          ? "Math.random()"
          : object === "Date" && method === "now"
            ? "Date.now()"
            : object === "performance" && method === "now"
              ? "performance.now()"
              : object === "crypto" && method === "getRandomValues"
                ? "crypto.getRandomValues()"
                : object === "crypto" && method === "randomUUID"
                  ? "crypto.randomUUID()"
                  : null;
      if (label) hits.push({ line: lineOf(node), label });
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Date" &&
      (node.arguments?.length ?? 0) === 0
    ) {
      hits.push({ line: lineOf(node), label: "new Date()" });
    }
    // `random()` from remotion is only deterministic with a seed; no argument
    // or an explicit null re-rolls every render.
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "random" &&
      (node.arguments.length === 0 ||
        (node.arguments.length === 1 && node.arguments[0].kind === ts.SyntaxKind.NullKeyword))
    ) {
      hits.push({ line: lineOf(node), label: "random() without a seed" });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hits;
}

const graph = moduleGraph(ENTRY);

describe("production render graph is free of clocks and entropy (#734)", () => {
  it("resolves every relative import in the graph", () => {
    // Fail-closed: an unresolvable edge means the scan below covers less than
    // the composition does, and the missing file is exactly where a clock
    // could hide.
    expect(graph.unresolved).toEqual([]);
  });

  it("covers the composition, not an empty set", () => {
    // A gate that scans nothing reports green. Pin the walk to the entry, the
    // dispatcher, every registered scene, and the shared lib modules.
    const rel = graph.files.map((file) => relative(REMOTION_SRC, file));
    expect(graph.files.length).toBeGreaterThan(25);
    expect(rel).toContain("Root.tsx");
    expect(rel).toContain("ShortVideo.tsx");
    for (const scene of readdirSync(join(REMOTION_SRC, "scenes"))) {
      if (!scene.endsWith(".tsx")) continue;
      expect(rel, `scenes/${scene} is not reachable from Root.tsx`).toContain(
        join("scenes", scene),
      );
    }
    const sharedLib = graph.files
      .map((file) => relative(SHORT_VIDEO, file))
      .filter((file) => file.startsWith("lib" + "/"));
    expect(
      sharedLib.length,
      "no scripts/short-video/lib/*.mjs was walked — cross-directory imports broke",
    ).toBeGreaterThan(0);
  });

  it("reads no wall clock or entropy source", () => {
    const violations = graph.files.flatMap((file) =>
      clockAndEntropyReads(parse(file)).map(
        (hit) => `${relative(SHORT_VIDEO, file)}:${hit.line} ${hit.label}`,
      ),
    );
    expect(
      violations,
      "A frame must be a pure function of its props and frame. Use useCurrentFrame() " +
        "for time and a seeded PRNG (mulberry32, seeded from props) for noise — " +
        "Math.random()/Date.now()/performance.now() make re-renders differ.",
    ).toEqual([]);
  });
});
