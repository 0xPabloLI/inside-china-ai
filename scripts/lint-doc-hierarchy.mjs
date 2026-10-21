/**
 * Documentation Hierarchy Lint
 *
 * Checks six rules:
 * 1. DOCS-INDEX consistency — every added or renamed doc under docs/ is listed in
 *    the section that owns its directory; docs root and docs/research/ are also
 *    scanned in full so their existing inventory stays closed
 * 1b. Placement — every tracked markdown file under docs/ lives in a declared directory
 * 2. L1 Design Decisions — L1 docs with L2 references must have ## Design Decisions heading
 * 3. L2 command-line heuristic — L2 docs with ≥5 command-line patterns get WARN
 * 4. Structural pointer or normative rule changes remind the author to load writing-for-agents
 * 5. Reference resolution — repo paths named by live docs and code must be tracked by git
 *    (evidence-tier residue is baselined in scripts/doc-ref-baseline.txt; only growth is printed)
 *
 * Exit codes: 0 = PASS/WARN, 1 = FAIL
 */

import { readdirSync, readFileSync, existsSync, readlinkSync, writeFileSync } from "node:fs";
import { dirname, join, basename, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(__dirname);
const DOCS_DIR = join(PROJECT_ROOT, "docs");
const RESEARCH_DIR = join(DOCS_DIR, "research");
const INDEX_PATH = join(DOCS_DIR, "DOCS-INDEX.md");

// --- Constants ---

const CMD_LINE_PATTERNS = [/npm run\s/, /node scripts\//, /git\s+\w/];

const CMD_LINE_THRESHOLD = 5;
const AGENT_DOC_POINTER_CHAIN = "AGENTS.md → Workflow Router → Agent documents";
const LOCAL_MARKDOWN_LINK_PATTERN = /\]\((?!https?:\/\/|mailto:|#)[^)]+\)/i;
const BACKTICKED_LOCAL_PATH_PATTERN =
  /`(?:AGENTS\.md|CONTEXT\.md|DESIGN\.md|README\.md|package\.json|(?:\.{1,2}\/)?(?:\.agents|\.claude|docs|skills|scripts|src|supabase)\/[^`\s]+)`/;
const NORMATIVE_QUALIFIER_PATTERN =
  /\b(?:must|shall|required|mandatory|never|always|only|cannot|can't|may not|should|should not|do not|don't)\b|(?:必须|强制|不得|禁止|只能|仅当|需要|无需|不可|不允许|应当|应该)/i;

// Check 4 gate classifiers (module scope: pure, shared by classifyGateChange)
const GATE_HEADING_PATTERN = /^#{1,4}\s/;
const GATE_POINTER_PATTERNS = [/→/, LOCAL_MARKDOWN_LINK_PATTERN, BACKTICKED_LOCAL_PATH_PATTERN];

// The tracker rotation commit mechanically replaces the "Last inventory:"
// line — del of the old line + add of the new one in the same diff. That
// replacement is re-inventory, not an authoring decision (issue #178).
// Net deletion — an inventory line removed with no replacement — is
// still an authoring decision and still warns.
//
// Match the line as it is actually written: `> **Last inventory**: …`. The
// first version of this pattern only accepted a bare `Last inventory:` at the
// start of the line, so every rotation warned (issue #178's exemption was dead
// code on this repo's own format). Optional blockquote marker and optional
// emphasis are part of the shape, not decoration.
const TRACKER_PATH = "docs/issue-roadmap.md";
const LAST_INVENTORY_LINE_PATTERN = /^\s*>?\s*\*{0,2}Last inventory\*{0,2}:?/i;

// Files excluded from checks (index itself, ephemeral specs)
const EXCLUDED_FILES = new Set([
  "DOCS-INDEX.md", // index file itself — not listed in itself
]);

// Files matching these patterns are ephemeral (specs, tickets) and excluded
const EXCLUDED_PATTERNS = [/^spec-/, /^tickets-/];

// Directories whose subtrees are historical or external material, registered in
// DOCS-INDEX as a whole. Nested paths below these are allowed; every other
// directory must be declared at its exact path.
const TREE_DOC_DIRS = new Set(["archive", "refs"]);

// Agent-reached documents: the hook reminder and the staged-diff gate must
// classify paths identically, so both call isAgentDoc().
const AGENT_DOC_BASENAMES = new Set(["AGENTS.md", "CLAUDE.md", "SKILL.md"]);

// ADRs register by number (`| 0001 | …`) in the index table, not by filename.
const ADR_FILE_PATTERN = /^(\d{4})-/;

function isExcluded(filename) {
  if (EXCLUDED_FILES.has(basename(filename))) return true;
  // Ephemeral specs and tickets are a docs-root convention; files inside
  // docs/specs/ are registered and must stay checked.
  const dir = posix.dirname(filename);
  if (dir !== "." && dir !== "docs") return false;
  return EXCLUDED_PATTERNS.some((p) => p.test(basename(filename)));
}

export function isAgentDoc(path) {
  return (
    AGENT_DOC_BASENAMES.has(basename(path)) ||
    path.startsWith("docs/") ||
    path.startsWith("skills/") ||
    path.startsWith(".agents/skills/")
  );
}

// --- Pure check functions (exported for testing) ---

/**
 * Split DOCS-INDEX into the sections that own docs directories.
 *
 * `### \`<dir>/\`` owns that directory. `### Root — …` and `### Root-level …`
 * headings share the "root" scope. Any other heading closes the current scope,
 * so a basename match cannot leak in from an unrelated section.
 */
export function parseIndexSections(indexContent) {
  const sections = new Map();
  let current = null;
  for (const line of indexContent.split("\n")) {
    const dirHeading = /^###\s+`([a-z0-9-]+)\/`/.exec(line);
    if (dirHeading) {
      current = dirHeading[1];
      sections.set(current, "");
      continue;
    }
    if (/^#{2,3}\s+Root(?:[-\s]|$)/.test(line)) {
      current = "root";
      if (!sections.has(current)) sections.set(current, "");
      continue;
    }
    if (/^#{1,6}\s/.test(line)) current = null;
    if (current) sections.set(current, `${sections.get(current)}${line}\n`);
  }
  return sections;
}

function scopeFor(filename) {
  const relative = filename.startsWith("docs/") ? filename.slice("docs/".length) : filename;
  const dir = posix.dirname(relative);
  if (dir === ".") return { key: "root", root: true };
  return { key: dir.split("/")[0], root: false };
}

/**
 * Check 1: DOCS-INDEX consistency.
 *
 * Each file must be named in the section that owns its directory, not just
 * anywhere in the index — otherwise a file passes on another directory's row
 * that happens to share its basename. Root files fall back to the
 * whole index only when no root section exists (unit-test fixtures).
 */
export function checkDocsIndexConsistency(docs, indexContent) {
  const sections = parseIndexSections(indexContent);
  const findings = [];
  for (const { filename } of docs) {
    if (isExcluded(filename)) continue;
    const name = basename(filename);
    const { key, root } = scopeFor(filename);
    const hasSection = sections.has(key);
    const scope = hasSection ? sections.get(key) : root ? indexContent : "";
    const adrNumber = key === "adr" ? ADR_FILE_PATTERN.exec(name)?.[1] : null;
    const listed = adrNumber
      ? new RegExp(`\\|\\s*${adrNumber}\\s*\\|`).test(scope)
      : scope.includes(name);
    if (!listed) {
      findings.push({
        level: "FAIL",
        ruleId: "docs-index-missing",
        file: filename,
        message: adrNumber
          ? `${filename} (ADR-${adrNumber}) not listed in the DOCS-INDEX.md adr/ table`
          : `${filename} not listed in its DOCS-INDEX.md section`,
      });
    }
  }
  return { findings };
}

/**
 * Registration gate for changed docs. Only added and renamed paths are checked:
 * legacy drift elsewhere in the tree is not this gate's debt, but a new
 * directory entry must arrive registered.
 */
export function checkChangedDocRegistration(changedPaths, indexContent) {
  const docs = changedPaths
    .filter((path) => path.startsWith("docs/") && path.endsWith(".md"))
    .filter((path) => {
      const dir = posix.dirname(path.slice("docs/".length));
      const [top] = dir.split("/");
      // Root and research/ are scanned in full by check 1, so reporting them
      // here would duplicate the same finding. Tree dirs are registered whole.
      return dir !== "." && dir !== "research" && !TREE_DOC_DIRS.has(top);
    });
  return checkDocsIndexConsistency(
    docs.map((filename) => ({ filename })),
    indexContent,
  );
}

/**
 * Directories DOCS-INDEX declares for docs/ subdirectories.
 *
 * The index is the placement source of truth, so the allowlist is read from its
 * `### \`<dir>/\` — …` sections rather than duplicated here: creating a new docs
 * directory means registering it in the index, not editing this linter.
 */
export function parseAllowedDocDirs(indexContent) {
  return new Set([...indexContent.matchAll(/^###\s+`([a-z0-9-]+)\/`/gm)].map((m) => m[1]));
}

/**
 * Check 1b: placement.
 * Every tracked markdown file under docs/ must live at the docs root or in a
 * directory DOCS-INDEX declares. Nested directories count too, so a new
 * `docs/agents/nested/` cannot ride in on an existing section. TREE_DOC_DIRS
 * (`archive/`, `refs/`) are the exceptions: they are historical or external
 * trees declared as a whole. This is the machine-checkable half of the placement
 * rule: a stray file or a new undeclared directory fails, naming the file and
 * the missing section.
 */
export function checkAllowedPlacement(paths, indexContent) {
  const allowed = parseAllowedDocDirs(indexContent);
  const findings = [];
  for (const filename of paths) {
    if (!filename.startsWith("docs/") || !filename.endsWith(".md")) continue;
    const dir = posix.dirname(filename);
    if (dir === "docs") continue; // docs/*.md root
    const relative = dir.slice("docs/".length);
    const [tree] = relative.split("/");
    if (allowed.has(relative) || (allowed.has(tree) && TREE_DOC_DIRS.has(tree))) continue;
    findings.push({
      level: "FAIL",
      ruleId: "docs-placement-unauthorized-dir",
      file: filename,
      message: `${filename} is under docs/${relative}/, which DOCS-INDEX.md does not declare; place it in a declared docs directory and register it there`,
    });
  }
  return { findings };
}

/**
 * Check 2: L1 Design Decisions.
 * L1 docs (docs/*.md) that reference docs/research/ or docs/tiktok/ must have ## Design Decisions heading.
 */
export function checkL1DesignDecisions(files) {
  const findings = [];
  for (const { filename, content } of files) {
    if (isExcluded(filename)) continue;
    const hasL2Ref = content.includes("docs/research/") || content.includes("docs/tiktok/");
    const hasDesignDecisions = /^##\s+Design Decisions/m.test(content);
    if (hasL2Ref && !hasDesignDecisions) {
      findings.push({
        level: "FAIL",
        ruleId: "l1-missing-design-decisions",
        file: filename,
        message: `${filename} references L2 but has no Design Decisions section`,
      });
    }
  }
  return { findings };
}

/**
 * Check 3: L2 command-line heuristic.
 * L2 docs (docs/research/*.md) with ≥5 command-line patterns get WARN.
 */
export function checkL2CommandLines(files) {
  const findings = [];
  for (const { filename, content } of files) {
    const lines = content.split("\n");
    let cmdCount = 0;
    for (const line of lines) {
      if (CMD_LINE_PATTERNS.some((p) => p.test(line))) {
        cmdCount++;
      }
    }
    if (cmdCount >= CMD_LINE_THRESHOLD) {
      findings.push({
        level: "WARN",
        ruleId: "l2-execution-instructions",
        file: filename,
        message: `${filename} has ${cmdCount} command-line references (≥${CMD_LINE_THRESHOLD} threshold)`,
      });
    }
  }
  return { findings };
}

/**
 * Check 5: reference resolution.
 *
 * A pointer to a file that does not exist is a dead end for whichever agent
 * follows it, and relocating a doc silently strands every doc and code comment
 * naming its old path. Only prose is read — markdown bodies and code comment
 * lines. The truth set is `git ls-files`, never the local
 * filesystem: a gitignored or machine-only path must not read as PASS here and
 * FAIL in CI.
 *
 * Four exemptions, each a property of the text rather than of one machine:
 * - historical referrers (archive, applied migrations) record the path as of
 *   writing, so rewriting them falsifies the record;
 * - `remotion/…` is this repo's shorthand for the Remotion subproject;
 * - a `skills/<name>/` whose name is not vendored here names a skill installed
 *   in the agent's own directory, which no repo checkout can contain;
 * - generated artifacts (run output, per-content research dirs) exist only
 *   after a run, so tracking can never hold them.
 *
 * Bare paths naming another project's files stay in scope: an agent cannot tell
 * them from a repo path, so such a citation has to carry its URL.
 */
const REF_ROOTS = "(?:docs|scripts|src|skills|supabase|agent|remotion|\\.github)";
const REF_EXT = "(?:md|mjs|cjs|ts|tsx|json|py|sh|yml|yaml|sql|css|html)";
// The leading boundary rejects word characters, `/` and `.` so a `sub-skills/…`
// or `.cursor/skills/…` tail, an `…/remotion/…` tail inside a longer path, and a
// `site.com/docs/…` fragment inside a URL never read as repo pointers.
const PATH_REF_RE = new RegExp(
  `(?<![\\w./-])${REF_ROOTS}/[A-Za-z0-9._/-]+\\.${REF_EXT}(?![\\w-])`,
  "g",
);
// Vendored third-party skill docs under `agent/` are deliberately out of scope:
// their internal examples are not this repo's pointer graph.
const REF_SCAN_TARGETS = [
  "docs",
  "scripts",
  "src",
  "skills",
  "supabase",
  ".github",
  "AGENTS.md",
  "CONTEXT.md",
  "DESIGN.md",
  "README.md",
];
const REF_SCAN_EXT = /\.(?:md|mjs|cjs|ts|tsx|json|py|sh|yml|yaml|sql|css|html)$/;
// Comment-line shapes: `//`, `/*`, ` * ` (block continuation), `#`, `--`.
// Trailing end-of-line comments after code are out of scope in this version —
// they are rare in prose-citation positions and detecting them reliably needs
// a parser, not a pattern.
const CODE_PROSE_LINE = /^\s*(?:\/\/|\*|\/\*|#|--)/;
// The linter's own fixtures name paths that deliberately do not exist.
const REF_SCAN_SELF = "scripts/__tests__/lint-doc-hierarchy.test.mjs";
const REF_ALIASES = [{ from: "remotion/", to: "scripts/short-video/remotion/" }];
const SKILL_NAMESPACE = "skills/";
// Run output, per-content research dirs, and build artifacts exist only after a
// run, so the tracked set can never hold them.
const GENERATED_ARTIFACT_PREFIXES = [
  "scripts/short-video/output/",
  "scripts/short-video/content/",
  "scripts/cloud-gpu/output/",
];
// Historical referrers record the path as of writing — an archive ticket and an
// applied migration are both immutable records, so repointing them would
// falsify what they witnessed rather than fix a pointer.
const HISTORICAL_REFERRER_PREFIXES = ["docs/archive/", "supabase/migrations/"];
// A script's own default output, written beside it and never committed.
const GENERATED_ARTIFACT_FILES = new Set([
  "src/routeTree.gen.ts",
  "src/routeTree.gen.tsx",
  "scripts/short-video/scene-data-compilation.mjs",
]);
// Two tiers by who consumes the referrer: an agent that follows a pointer in
// AGENTS.md, a runbook, a skill or code expects the target to exist, so those
// fail the build. Evidence layers (research, reviews, proposals, handoffs,
// vendored refs) quote paths as findings or intentions — including other
// projects' files — so they warn without blocking.
const EVIDENCE_REFERRER_PREFIXES = [
  "docs/research/",
  "docs/reviews/",
  "docs/proposals/",
  "docs/handoffs/",
  "docs/refs/",
];
// The evidence tier is permanently non-empty by design (a research doc that cites
// another project's file is *correct*, not stale), so an uncounted "WARN (39)"
// would train everyone to skim it. `scripts/doc-ref-baseline.txt` freezes the
// accepted set: known pairs print quietly, anything new prints with a NEW marker
// so growth is the signal. Refresh deliberately with `--bless` after reviewing.
const REF_BASELINE_PATH = join(PROJECT_ROOT, "scripts", "doc-ref-baseline.txt");

/** `referrer|target`, one per line; `#` introduces a comment. Absent = nothing known. */
export function parseRefBaseline(text) {
  return new Set(
    text
      .split("\n")
      .map((l) => l.split("#")[0].trim())
      .filter((l) => l.includes("|")),
  );
}

export function loadRefBaseline(path = REF_BASELINE_PATH) {
  try {
    return parseRefBaseline(readFileSync(path, "utf8"));
  } catch {
    return new Set();
  }
}

export function refKey(filename, ref) {
  return `${filename}|${ref}`;
}

export function checkReferenceResolution(
  files,
  trackedFiles,
  symlinks = [],
  baseline = new Set(),
  unmaterialized = [],
) {
  const tracked = new Set(trackedFiles);
  // A committed symlink exists in every fresh clone, so a path written through
  // it is a real pointer even though git lists only the link's own target.
  const links = symlinks.filter((l) => l && l.from && l.to);
  // Paths that land inside a declared-but-uninitialized submodule cannot be
  // judged either way: calling them unresolved would report the repo as broken
  // when only this checkout is incomplete.
  const landsInMissing = (ref) => {
    const readings = [ref];
    for (const l of links) {
      const prefix = `${l.from}/`;
      if (ref.startsWith(prefix)) readings.push(l.to + "/" + ref.slice(prefix.length));
    }
    return readings
      .map((c) => unmaterialized.find((d) => c === d || c.startsWith(`${d}/`)))
      .find(Boolean);
  };
  const unjudged = new Map();
  const vendoredSkills = new Set(
    [...tracked]
      .filter((p) => p.startsWith(SKILL_NAMESPACE) && p.includes("/"))
      .map((p) => p.split("/")[1])
      .filter(Boolean),
  );

  const resolves = (ref, referrer) => {
    if (tracked.has(ref)) return true;
    // Paths inside a subproject are commonly written relative to that package
    // (a `src/…` entry in a subproject's own manifest), so the referrer's own
    // directory is a second legitimate reading.
    const rel = posix.normalize(posix.join(posix.dirname(referrer), ref));
    if (rel !== ref && tracked.has(rel)) return true;
    const alias = REF_ALIASES.find((a) => ref.startsWith(a.from));
    if (alias && tracked.has(alias.to + ref.slice(alias.from.length))) return true;
    return links.some((l) => {
      const prefix = `${l.from}/`;
      return ref.startsWith(prefix) && tracked.has(l.to + "/" + ref.slice(prefix.length));
    });
  };

  const findings = [];
  for (const { filename, content } of files) {
    if (HISTORICAL_REFERRER_PREFIXES.some((p) => filename.startsWith(p))) continue;

    // Markdown is prose throughout; in code, only comment lines are prose. A
    // path inside a string literal is a program input with its own working
    // directory (a Remotion entry point, a CLI argument), and rewriting one as
    // a "broken pointer" breaks the pipeline rather than the doc.
    const proseOnly = !filename.endsWith(".md");
    const firstLine = new Map();
    const lines = content.split("\n");
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      // A fenced command example holds invocation syntax, not pointers — the
      // same reasoning that keeps string literals out of scope.
      if (/^\s*(?:```|~~~)/.test(lines[i])) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      if (proseOnly && !CODE_PROSE_LINE.test(lines[i])) continue;
      for (const ref of lines[i].match(PATH_REF_RE) || []) {
        if (firstLine.has(ref)) continue;
        firstLine.set(ref, i + 1);
      }
    }

    for (const [ref, line] of firstLine) {
      if (resolves(ref, filename)) continue;
      if (ref.startsWith(SKILL_NAMESPACE) && !vendoredSkills.has(ref.split("/")[1])) continue;
      if (GENERATED_ARTIFACT_FILES.has(ref)) continue;
      if (GENERATED_ARTIFACT_PREFIXES.some((p) => ref.startsWith(p))) continue;
      const missingDir = landsInMissing(ref);
      if (missingDir) {
        unjudged.set(missingDir, (unjudged.get(missingDir) || 0) + 1);
        continue;
      }
      const level = EVIDENCE_REFERRER_PREFIXES.some((p) => filename.startsWith(p))
        ? "WARN"
        : "FAIL";
      const key = refKey(filename, ref);
      findings.push({
        level,
        ruleId: "doc-ref-unresolved",
        file: filename,
        key,
        known: baseline.has(key),
        message: `${filename}:${line} — unresolved reference \`${ref}\` (not tracked by git; repoint it if it moved, cite the full URL if it belongs to another project)`,
      });
    }
  }
  for (const [dir, count] of unjudged) {
    findings.push({
      level: "WARN",
      ruleId: "doc-ref-unjudged",
      file: dir,
      message: `${count} 条指向 \`${dir}/\` 的引用无法判定——该 submodule 在本 checkout 未初始化（\`git submodule update --init ${dir}\`）。既不算通过也不算失败。`,
    });
  }
  return { findings };
}

function gateFinding(filename, message) {
  return {
    level: "WARN",
    ruleId: "writing-for-agents-gate",
    file: filename,
    message,
  };
}

function changeVerb(line) {
  return line.type === "add" ? "added" : "deleted";
}

/**
 * Classify one changed line. `isL2` marks an evidence doc (docs/research/**):
 * a heading there is prose structure, not an authoring decision the skill could
 * change, so it is not a trigger — pointer and normative changes still are.
 */
function classifyGateChange(content, isL2 = false) {
  const isHeading = GATE_HEADING_PATTERN.test(content);
  if (isHeading && !isL2) return "heading";
  if (GATE_POINTER_PATTERNS.some((p) => p.test(content))) return "pointer line";
  if (NORMATIVE_QUALIFIER_PATTERN.test(content)) return "normative rule line";
  return null;
}

/**
 * Check 4: writing-for-agents gate.
 * Detects structural changes in staged docs/ files and AGENTS.md.
 * Returns WARN for: new/deleted headings, local pointer changes, normative qualifier changes,
 * and all AGENTS.md modifications.
 *
 * @param {Array<{filename: string, diffLines: DiffLine[]}>} stagedDiffs
 * @returns {{findings: Array<{level: string, ruleId: string, file: string, message: string}>}}
 */
export function checkWritingForAgentsGate(stagedDiffs) {
  const agentsMd = "AGENTS.md";
  const hits = [];

  for (const { filename, diffLines } of stagedDiffs) {
    // Archived docs are moved verbatim (rename/archive), so their headings and
    // pointer lines show up as additions without any authoring decision —
    // relocation, not new agent-doc structure (issue #129 false positive).
    if (filename.startsWith("docs/archive/")) continue;
    const isDocs = filename.startsWith("docs/");
    const isAgentsMd = filename === agentsMd;
    if (!isDocs && !isAgentsMd) continue;

    const changes = diffLines.filter(
      (l) => (l.type === "add" || l.type === "del") && l.content.trim().length > 0,
    );

    if (changes.length === 0) continue;

    const isLastInventoryRotation =
      filename === TRACKER_PATH &&
      changes.some((l) => l.type === "del" && LAST_INVENTORY_LINE_PATTERN.test(l.content)) &&
      changes.some((l) => l.type === "add" && LAST_INVENTORY_LINE_PATTERN.test(l.content));

    if (isAgentsMd) {
      hits.push({ filename, kind: "AGENTS.md modified", sample: null });
      continue;
    }

    const isL2 = filename.startsWith("docs/research/");

    for (const line of changes) {
      if (isLastInventoryRotation && LAST_INVENTORY_LINE_PATTERN.test(line.content)) continue;
      const kind = classifyGateChange(line.content, isL2);
      if (!kind) continue;
      hits.push({ filename, kind: `${kind} ${changeVerb(line)}`, sample: line.content.trim() });
      break;
    }
  }

  if (hits.length === 0) return { findings: [] };

  // One finding per commit, not per file: this prompt re-injects the pointer
  // chain at the moment of the edit, and per-file copies only inflate the WARN
  // count that carries the signal worth reading (doc-ref-unresolved growth).
  const listing = hits
    .map((h) =>
      h.sample ? `${h.filename}（${h.kind}: "${h.sample}"）` : `${h.filename}（${h.kind}）`,
    )
    .join("、");

  return {
    findings: [
      gateFinding(
        hits[0].filename,
        `本批 ${hits.length} 处 agent 文档结构变更 — ${listing} — confirm: did you load writing-for-agents skill? (${AGENT_DOC_POINTER_CHAIN})`,
      ),
    ],
  };
}

// --- File system helpers ---

function readMdFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((filename) => ({
      filename,
      content: readFileSync(join(dir, filename), "utf-8"),
    }));
}

/**
 * Gather reference-scan inputs from git: the tracked set is the existence
 * truth, and the scoped listing is what gets scanned. Submodule contents are
 * listed explicitly — the parent repo records `skills/shared` as a gitlink, so
 * a plain `git ls-files` hides files AGENTS.md legitimately points at.
 * @returns {{files: Array<{filename: string, content: string}>, tracked: string[]}}
 */
function collectReferenceScan() {
  const git = (args) => {
    try {
      return execSync(`git ls-files -z ${args}`, {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      })
        .split("\0")
        .filter(Boolean);
    } catch {
      return [];
    }
  };

  const tracked = git("--recurse-submodules");
  const scoped = git(`--recurse-submodules ${REF_SCAN_TARGETS.map((t) => `"${t}"`).join(" ")}`);

  // Mode 120000 = committed symlink. Resolve it the way a checkout would, so a
  // path written through the link is judged on the target it really reaches.
  const symlinks = [];
  for (const entry of git(
    `-s --recurse-submodules ${REF_SCAN_TARGETS.map((t) => `"${t}"`).join(" ")}`,
  )) {
    const [meta, path] = entry.split("\t");
    if (!path || !meta.startsWith("120000 ")) continue;
    let target;
    try {
      target = readlinkSync(path);
    } catch {
      continue;
    }
    if (!target) continue;
    const to = target.startsWith("/")
      ? target.slice(1)
      : posix.normalize(join(dirname(path), target));
    symlinks.push({ from: path, to });
  }

  const files = [];
  for (const filename of scoped) {
    if (filename === REF_SCAN_SELF) continue;
    if (!REF_SCAN_EXT.test(filename)) continue;
    let content;
    try {
      content = readFileSync(filename, "utf8");
    } catch {
      continue;
    }
    if (content.length > 600000) continue;
    files.push({ filename, content });
  }
  // A declared submodule contributes no tracked paths until it is checked out,
  // so `--recurse-submodules` alone cannot tell "the file is gone" from "this
  // clone was never completed".
  const unmaterialized = readSubmodulePaths().filter(
    (p) => !tracked.some((t) => t.startsWith(`${p}/`)),
  );
  return { files, tracked, symlinks, unmaterialized };
}

function readSubmodulePaths() {
  try {
    const text = readFileSync(join(PROJECT_ROOT, ".gitmodules"), "utf8");
    return [...text.matchAll(/^\s*path\s*=\s*(\S+)\s*$/gm)].map((m) => m[1]);
  } catch {
    return [];
  }
}

// --- Git diff helpers ---

/**
 * One parsed content line of a unified diff.
 * @typedef {Object} DiffLine
 * @property {'add'|'del'|'ctx'} type — line kind (added/deleted/context).
 * @property {string} content — line text without the diff prefix character.
 */

/**
 * Parse unified diff output into structured diff lines.
 * Only parses content lines (starting with +, -, or space), skips headers.
 *
 * @param {string} diffOutput
 * @returns {DiffLine[]}
 */
export function parseDiffLines(diffOutput) {
  const lines = diffOutput.split("\n");
  const result = [];
  for (const line of lines) {
    if (
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("@@") ||
      line.startsWith("\\ No newline")
    )
      continue;
    if (line.startsWith("+")) {
      result.push({ type: "add", content: line.slice(1) });
    } else if (line.startsWith("-")) {
      result.push({ type: "del", content: line.slice(1) });
    } else if (line.startsWith(" ")) {
      result.push({ type: "ctx", content: line.slice(1) });
    }
  }
  return result;
}

function getStagedFileNames(diffFilter = "ACMR") {
  try {
    return execSync(`git diff --cached --name-only --diff-filter=${diffFilter}`, {
      encoding: "utf-8",
      cwd: PROJECT_ROOT,
    })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Staged Agent-reached documents. The pre-commit reminder reads this, so the
 * shell hook and the lint gate share one definition of "Agent doc staged".
 */
export function listStagedAgentDocs() {
  return getStagedFileNames().filter(isAgentDoc);
}

/**
 * Added and renamed docs for the registration gate. Locally that is the staged
 * set; in CI, DOCS_BASE / DOCS_PUSH_BEFORE selects the base commit and the
 * whole commit range is diffed. A failed diff returns an error rather than an
 * empty list, because a gate that scans nothing must not look green.
 */
export function getChangedDocs() {
  const paths = new Set(getStagedFileNames("AR"));
  const base = process.env.DOCS_BASE || process.env.DOCS_PUSH_BEFORE;
  if (base && !/^0+$/.test(base)) {
    try {
      const range = execSync(`git diff --name-only --diff-filter=AR "${base}" HEAD`, {
        encoding: "utf-8",
        cwd: PROJECT_ROOT,
      });
      for (const path of range.trim().split("\n").filter(Boolean)) paths.add(path);
    } catch {
      return { paths: [...paths], error: base };
    }
  }
  return { paths: [...paths], error: null };
}

/**
 * Get staged diffs for Agent-reached documents.
 * Returns array of { filename, diffLines }.
 */
export function getStagedDiffs() {
  return listStagedAgentDocs().map((file) => {
    const diff = execSync(`git diff --cached -- "${file}"`, {
      encoding: "utf-8",
      cwd: PROJECT_ROOT,
    });
    const diffLines = parseDiffLines(diff);
    return { filename: file, diffLines };
  });
}

// --- Main ---

export function main() {
  if (process.argv.includes("--list-staged-agent-docs")) {
    for (const path of listStagedAgentDocs()) process.stdout.write(`${path}\n`);
    process.exit(0);
  }

  const baseline = loadRefBaseline();
  const indexContent = existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, "utf-8") : "";

  // Gather L1 files (docs/*.md root only) and L2 files (docs/research/*.md).
  // Other directories are covered by the changed-doc registration gate; their
  // legacy inventory is not scanned in full.
  const l1Files = readMdFiles(DOCS_DIR);
  const l2Files = readMdFiles(RESEARCH_DIR);
  const activeFiles = [
    ...l1Files,
    ...l2Files.map((file) => ({ ...file, filename: `research/${file.filename}` })),
  ];

  // Run all checks
  const refScan = collectReferenceScan();
  const changed = getChangedDocs();
  const indexFindings = checkDocsIndexConsistency(activeFiles, indexContent).findings;
  const changedFindings = changed.error
    ? [
        {
          level: "FAIL",
          ruleId: "docs-base-diff-failed",
          file: "docs/",
          message: `cannot diff added/renamed docs against ${changed.error}; the registration gate would scan nothing`,
        },
      ]
    : checkChangedDocRegistration(changed.paths, indexContent).findings;
  const placementFindings = checkAllowedPlacement(refScan.tracked, indexContent).findings;
  const l1Findings = checkL1DesignDecisions(l1Files).findings;
  const l2Findings = checkL2CommandLines(l2Files).findings;
  const gateFindings = checkWritingForAgentsGate(getStagedDiffs()).findings;
  const refFindings = checkReferenceResolution(
    refScan.files,
    refScan.tracked,
    refScan.symlinks,
    baseline,
    refScan.unmaterialized,
  ).findings;

  if (process.argv.includes("--bless")) {
    // Only the evidence tier may be blessed — a FAIL is a pointer an agent will
    // actually follow, and baselining one would silence the gate where it matters.
    const keys = refFindings
      .filter((f) => f.level === "WARN")
      .map((f) => f.key)
      .sort();
    const header =
      "# 证据层「引用了 git 未跟踪路径」的已知清单（lint-doc-hierarchy 规则 5）。\n" +
      "# 一行一条 `引用方|被引方`；# 之后为注释。这些不是待修项，而是复核后接受的事实：\n" +
      "# 研究/评审/提案文档常引用别的项目的文件，或被删掉的实验脚本 —— 改它们会伪造记录。\n" +
      "# 门禁只关心清单会不会变长：新增条目在输出里标 NEW，并附处置动作。\n" +
      "#   node scripts/lint-doc-hierarchy.mjs --bless\n" +
      "# 复指好一条就删掉它的行（重生会把已修好的条目一起清掉，属期望行为）；\n" +
      "# 但重生前 `git diff` 一眼，确认没顺手删掉别人正留着的那条。\n";
    writeFileSync(REF_BASELINE_PATH, header + keys.join("\n") + "\n", "utf8");
    process.stderr.write(
      `[doc-hierarchy] baseline written: ${keys.length} 条 → ${basename(REF_BASELINE_PATH)}\n`,
    );
    process.exit(0);
  }

  const allFindings = [
    ...indexFindings,
    ...changedFindings,
    ...placementFindings,
    ...l1Findings,
    ...l2Findings,
    ...gateFindings,
    ...refFindings,
  ];

  // Print findings
  const knownRef = refFindings.filter((f) => f.level === "WARN" && f.known).length;
  for (const f of allFindings) {
    const level = f.level === "FAIL" ? "FAIL" : "WARN";
    // Known evidence-tier residue is folded into the summary count; anything new
    // gets a line and a NEW marker, because "the set grew" is the only thing a
    // reader needs to see.
    if (f.ruleId === "doc-ref-unresolved" && f.known) continue;
    const marker = f.ruleId === "doc-ref-unresolved" && f.level === "WARN" ? "NEW " : "";
    process.stderr.write(`${level} ${marker}${f.ruleId}: ${f.message}\n`);
  }

  // Summary
  const fails = allFindings.filter((f) => f.level === "FAIL");
  const warns = allFindings.filter((f) => f.level === "WARN");
  const newRefs = warns.filter((f) => f.ruleId === "doc-ref-unresolved" && !f.known).length;

  if (allFindings.length === 0) {
    process.stderr.write("[doc-hierarchy] PASS\n");
  } else if (fails.length > 0) {
    process.stderr.write(`[doc-hierarchy] FAIL (${fails.length})`);
    if (warns.length > 0) process.stderr.write(` + WARN (${warns.length})`);
    process.stderr.write("\n");
  } else {
    process.stderr.write(`[doc-hierarchy] WARN (${warns.length})\n`);
  }
  if (knownRef + newRefs > 0) {
    process.stderr.write(
      `[doc-hierarchy] 引用解析：基线已知 ${knownRef} 条（证据层常态，未逐条打印）· 新增 ${newRefs} 条\n`,
    );
    if (newRefs > 0) {
      // The bar's own output is where the recovery action belongs — an agent
      // hitting it has the gate loaded, not necessarily the doc.
      process.stderr.write(
        "[doc-hierarchy] 逐条判定：真断链就复指；确属他项目的文件或已删实验脚本，复核后 `node scripts/lint-doc-hierarchy.mjs --bless`（先 `git diff` 这次重生没抹掉别人删的行）。\n",
      );
    }
  }

  // Exit code: 1 if any FAIL, 0 otherwise
  process.exit(fails.length > 0 ? 1 : 0);
}

// Run if called directly (not imported)
if (process.argv[1] && process.argv[1].endsWith("lint-doc-hierarchy.mjs")) {
  main();
}
