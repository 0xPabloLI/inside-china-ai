import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkAllowedPlacement,
  checkChangedDocRegistration,
  checkDocsIndexConsistency,
  checkL1DesignDecisions,
  checkL2CommandLines,
  checkReferenceResolution,
  checkResearchDownstream,
  checkReviewReportShape,
  checkWritingForAgentsGate,
  isAgentDoc,
  loadDownstreamBaseline,
  parseAllowedDocDirs,
  parseDiffLines,
  parseDownstreamBaseline,
  parseIndexSections,
  parseRefBaseline,
  parseResearchDownstream,
  parseReviewHeader,
  parseReviewReportName,
  parseRulingStatus,
  loadRefBaseline,
} from "../lint-doc-hierarchy.mjs";

const warnsOf = (findings) => findings.filter((f) => f.level === "WARN");
const failsOf = (findings) => findings.filter((f) => f.level === "FAIL");
const messageOf = (findings, level = "WARN") =>
  findings.find((f) => f.level === level)?.message ?? "";

describe("checkDocsIndexConsistency", () => {
  it("PASS: L1 doc listed in DOCS-INDEX", () => {
    const docs = [{ filename: "video-production-runbook.md", content: "# Video Workflow" }];
    const indexContent = "| `video-production-runbook.md` | Video production | AGENTS.md |";
    const { findings } = checkDocsIndexConsistency(docs, indexContent);
    expect(failsOf(findings)).toHaveLength(0);
  });

  it("FAIL: L1 doc NOT in DOCS-INDEX", () => {
    const docs = [{ filename: "missing-doc.md", content: "# Missing" }];
    const indexContent = "| `other-doc.md` | Other | AGENTS.md |";
    const { findings } = checkDocsIndexConsistency(docs, indexContent);
    const fails = failsOf(findings);
    expect(fails).toHaveLength(1);
    expect(fails[0].ruleId).toBe("docs-index-missing");
    expect(fails[0].file).toBe("missing-doc.md");
  });

  it("PASS: L2 doc listed in DOCS-INDEX", () => {
    const docs = [{ filename: "audio-drift-fix.md", content: "# Audio Drift" }];
    const indexContent = "| `audio-drift-fix.md` | Audio drift fix |";
    const { findings } = checkDocsIndexConsistency(docs, indexContent);
    expect(failsOf(findings)).toHaveLength(0);
  });

  it("PASS: empty docs directory", () => {
    const { findings } = checkDocsIndexConsistency([], "");
    expect(findings).toHaveLength(0);
  });

  it("PASS: a handoff under handoffs/ is matched in its own section", () => {
    const docs = [{ filename: "handoffs/video-layout-standard.md", content: "# Layout" }];
    const indexContent = "### `handoffs/` — Handoffs\n| `video-layout-standard.md` | Layout |";
    const { findings } = checkDocsIndexConsistency(docs, indexContent);
    expect(failsOf(findings)).toHaveLength(0);
  });

  it("FAIL: a cross-directory basename in another section does not count", () => {
    const docs = [{ filename: "conventions/git-workflow.md", content: "# Conventions" }];
    const indexContent =
      "### `agents/` — Agent docs\n| `git-workflow.md` | Git |\n### `conventions/` — Conventions\n";
    const { findings } = checkDocsIndexConsistency(docs, indexContent);
    expect(failsOf(findings)).toHaveLength(1);
    expect(failsOf(findings)[0].message).toContain("its DOCS-INDEX.md section");
  });

  it("FAIL: an added file under an unlisted directory has no section to match", () => {
    const docs = [{ filename: "tiktok/new-research.md", content: "# New" }];
    const indexContent = "### `agents/` — Agent docs\n| `new-research.md` | Wrong section |";
    const { findings } = checkDocsIndexConsistency(docs, indexContent);
    expect(failsOf(findings)).toHaveLength(1);
  });

  it("PASS: an ADR registers by number, not filename", () => {
    const docs = [{ filename: "adr/0016-signal-density-rule-2.md", content: "# ADR" }];
    const indexContent = "### `adr/` — ADRs\n| 0016 | Signal density | Accepted |";
    const { findings } = checkDocsIndexConsistency(docs, indexContent);
    expect(failsOf(findings)).toHaveLength(0);
  });

  it("FAIL: an ADR whose number is absent from the adr/ table", () => {
    const docs = [{ filename: "adr/0099-new-rule.md", content: "# ADR" }];
    const indexContent = "### `adr/` — ADRs\n| 0016 | Signal density | Accepted |";
    const { findings } = checkDocsIndexConsistency(docs, indexContent);
    expect(failsOf(findings)).toHaveLength(1);
    expect(failsOf(findings)[0].message).toContain("ADR-0099");
  });

  it("PASS: docs/specs files register; only docs-root spec-* stays ephemeral", () => {
    const docs = [
      { filename: "specs/spec-digital-human-pipeline.md", content: "# Spec" },
      { filename: "spec-local-scratch.md", content: "# Scratch" },
    ];
    const indexContent = "### `specs/` — Specs\n| `spec-digital-human-pipeline.md` | Spec |";
    const { findings } = checkDocsIndexConsistency(docs, indexContent);
    expect(failsOf(findings)).toHaveLength(0);
  });

  it("PASS: multiple L1 docs all listed", () => {
    const docs = [
      { filename: "a.md", content: "# A" },
      { filename: "b.md", content: "# B" },
    ];
    const indexContent = "| `a.md` | A |\n| `b.md` | B |";
    const { findings } = checkDocsIndexConsistency(docs, indexContent);
    expect(failsOf(findings)).toHaveLength(0);
  });

  it("FAIL: multiple missing docs all reported", () => {
    const docs = [
      { filename: "missing1.md", content: "# Missing 1" },
      { filename: "missing2.md", content: "# Missing 2" },
    ];
    const indexContent = "| `other.md` | Other |";
    const { findings } = checkDocsIndexConsistency(docs, indexContent);
    expect(failsOf(findings)).toHaveLength(2);
  });
});

describe("parseAllowedDocDirs", () => {
  it("reads only ### <dir>/ section headings", () => {
    const indexContent = [
      "## Canonical Structure",
      "### Layer Definitions",
      "### `agents/` — Agent execution references",
      "### `archive/` — Completed work",
      "### Root — Active reference",
    ].join("\n");
    expect([...parseAllowedDocDirs(indexContent)]).toEqual(["agents", "archive"]);
  });
});

describe("parseIndexSections", () => {
  const indexContent = [
    "# Index",
    "## Root-level Active Reference",
    "| `content-pipeline.md` | Pipeline |",
    "### `agents/` — Agent docs",
    "| `git-workflow.md` | Git |",
    "### Layer Definitions",
    "### `archive/` — Completed work",
    "| `old.md` | Old |",
  ].join("\n");

  it("keeps root rows out of a following ### Layer Definitions section", () => {
    const sections = parseIndexSections(indexContent);
    expect(sections.get("root")).toContain("content-pipeline.md");
    expect(sections.get("root")).not.toContain("git-workflow.md");
    expect(sections.get("agents")).toContain("git-workflow.md");
    expect(sections.get("archive")).toContain("old.md");
  });

  it("does not let a heading-less tail leak into the last directory", () => {
    const sections = parseIndexSections(indexContent);
    expect(sections.get("archive")).not.toContain("stray");
  });
});

describe("isAgentDoc", () => {
  it("classifies rule 6 targets and leaves code alone", () => {
    expect(isAgentDoc("AGENTS.md")).toBe(true);
    expect(isAgentDoc("docs/agents/git-workflow.md")).toBe(true);
    expect(isAgentDoc("skills/web-access/SKILL.md")).toBe(true);
    expect(isAgentDoc(".agents/skills/x/SKILL.md")).toBe(true);
    expect(isAgentDoc("remotion/src/Card.tsx")).toBe(false);
    expect(isAgentDoc("scripts/AGENTS.md.bak")).toBe(false);
  });
});

describe("checkChangedDocRegistration", () => {
  const indexContent =
    "### `agents/` — Agent docs\n| `git-workflow.md` | Git |\n### `proposals/` — Proposals\n| `p.md` | P |";

  it("checks only added/renamed docs and skips archive trees", () => {
    const { findings } = checkChangedDocRegistration(
      [
        "docs/agents/git-workflow.md",
        "docs/proposals/p.md",
        "docs/archive/specs/old.md",
        "scripts/lint-doc-hierarchy.mjs",
      ],
      indexContent,
    );
    expect(failsOf(findings)).toHaveLength(0);
  });

  it("FAIL: a new doc in a listed directory still needs its own row", () => {
    const { findings } = checkChangedDocRegistration(["docs/proposals/unlisted.md"], indexContent);
    expect(failsOf(findings)).toHaveLength(1);
    expect(failsOf(findings)[0].file).toBe("docs/proposals/unlisted.md");
  });
});

describe("checkAllowedPlacement", () => {
  const indexContent =
    "### `agents/` — Agent execution references\n" +
    "### `archive/` — Completed work\n" +
    "### `proposals/` — Proposals\n" +
    "### `refs/` — Reference materials";

  it("PASS: docs root and declared directories", () => {
    const { findings } = checkAllowedPlacement(
      [
        "docs/content-pipeline.md",
        "docs/agents/git-workflow.md",
        "docs/archive/specs/old.md",
        "docs/proposals/p.md",
      ],
      indexContent,
    );
    expect(failsOf(findings)).toHaveLength(0);
  });

  it("FAIL: an undeclared docs subdirectory names the file and the directory", () => {
    const { findings } = checkAllowedPlacement(["docs/notes/scratch.md"], indexContent);
    const fails = failsOf(findings);
    expect(fails).toHaveLength(1);
    expect(fails[0].ruleId).toBe("docs-placement-unauthorized-dir");
    expect(fails[0].file).toBe("docs/notes/scratch.md");
    expect(fails[0].message).toContain("docs/notes/");
  });

  it("FAIL: a nested directory under a declared one is still unauthorized", () => {
    const { findings } = checkAllowedPlacement(["docs/agents/nested/x.md"], indexContent);
    expect(failsOf(findings)).toHaveLength(1);
  });

  it("PASS: archive and refs keep their historical/external nested trees", () => {
    const { findings } = checkAllowedPlacement(
      ["docs/archive/specs/deep/old.md", "docs/refs/source-materials/INDEX.md"],
      indexContent,
    );
    expect(failsOf(findings)).toHaveLength(0);
  });

  it("ignores paths outside docs/ and non-markdown files", () => {
    const { findings } = checkAllowedPlacement(
      ["scripts/readme.md", "docs/notes/scratch.txt"],
      indexContent,
    );
    expect(findings).toHaveLength(0);
  });
});

describe("checkL1DesignDecisions", () => {
  it("PASS: L1 doc with L2 ref + has Design Decisions", () => {
    const files = [
      {
        filename: "video-production-runbook.md",
        content:
          "# Video Workflow\n\nSee docs/research/audio-drift-fix.md\n\n## Design Decisions & References\n\n| Topic | Reference |",
      },
    ];
    const { findings } = checkL1DesignDecisions(files);
    expect(failsOf(findings)).toHaveLength(0);
  });

  it("FAIL: L1 doc with docs/research/ ref but no Design Decisions", () => {
    const files = [
      {
        filename: "bad-doc.md",
        content: "# Bad Doc\n\nSee docs/research/something.md for details.",
      },
    ];
    const { findings } = checkL1DesignDecisions(files);
    const fails = failsOf(findings);
    expect(fails).toHaveLength(1);
    expect(fails[0].ruleId).toBe("l1-missing-design-decisions");
    expect(fails[0].file).toBe("bad-doc.md");
  });

  it("FAIL: L1 doc with docs/tiktok/ ref but no Design Decisions", () => {
    const files = [
      {
        filename: "tiktok-doc.md",
        content: "# TikTok Doc\n\nSee docs/tiktok/best-practices.md",
      },
    ];
    const { findings } = checkL1DesignDecisions(files);
    const fails = failsOf(findings);
    expect(fails).toHaveLength(1);
    expect(fails[0].ruleId).toBe("l1-missing-design-decisions");
  });

  it("PASS: L1 doc without L2 ref + no Design Decisions needed", () => {
    const files = [
      {
        filename: "simple.md",
        content: "# Simple Doc\n\nNo research references here.",
      },
    ];
    const { findings } = checkL1DesignDecisions(files);
    expect(failsOf(findings)).toHaveLength(0);
  });
});

describe("checkL2CommandLines", () => {
  it("PASS: L2 doc with 0 command lines", () => {
    const files = [{ filename: "clean.md", content: "# Research\n\nNo commands here." }];
    const { findings } = checkL2CommandLines(files);
    expect(warnsOf(findings)).toHaveLength(0);
  });

  it("PASS: L2 doc with 3 command lines (below threshold)", () => {
    const content = "# Research\n\nnpm run test\nnode scripts/foo.mjs\ngit status\n";
    const files = [{ filename: "low-cmds.md", content }];
    const { findings } = checkL2CommandLines(files);
    expect(warnsOf(findings)).toHaveLength(0);
  });

  it("WARN: L2 doc with 5 command lines (at threshold)", () => {
    const content = `# Research
npm run build
node scripts/a.mjs
node scripts/b.mjs
git commit -m "x"
git push
`;
    const files = [{ filename: "high-cmds.md", content }];
    const { findings } = checkL2CommandLines(files);
    const warns = warnsOf(findings);
    expect(warns).toHaveLength(1);
    expect(warns[0].ruleId).toBe("l2-execution-instructions");
    expect(warns[0].file).toBe("high-cmds.md");
  });

  it("WARN: L2 doc with 10 command lines", () => {
    const lines = Array(10).fill("npm run something").join("\n");
    const files = [{ filename: "many-cmds.md", content: `# Research\n${lines}` }];
    const { findings } = checkL2CommandLines(files);
    expect(warnsOf(findings)).toHaveLength(1);
  });

  it("git commands count toward the command-line threshold", () => {
    // Pins the `git\s+\w` pattern explicitly: research docs full of git
    // sequences are execution instructions just like npm/node lines.
    const content = [
      "# Research",
      "git add file.txt",
      "git stash list",
      "git rebase main",
      "git merge main",
      "git cherry-pick abc123",
      "",
    ].join("\n");
    const files = [{ filename: "git-heavy.md", content }];
    const { findings } = checkL2CommandLines(files);
    const warns = warnsOf(findings);
    expect(warns).toHaveLength(1);
    expect(messageOf(findings)).toContain("git-heavy.md has 5 command-line references");
  });
});

describe("parseDiffLines", () => {
  it("parses add/del/ctx content lines", () => {
    const lines = parseDiffLines(" context\n+added\n-removed");
    expect(lines).toEqual([
      { type: "ctx", content: "context" },
      { type: "add", content: "added" },
      { type: "del", content: "removed" },
    ]);
  });

  it("skips diff headers, index lines, and hunk markers", () => {
    const diff = [
      "diff --git a/docs/a.md b/docs/a.md",
      "index 1234567..89abcde 100644",
      "--- a/docs/a.md",
      "+++ b/docs/a.md",
      "@@ -1,2 +1,2 @@",
      "+new line",
    ].join("\n");
    expect(parseDiffLines(diff)).toEqual([{ type: "add", content: "new line" }]);
  });

  it("skips '\\ No newline at end of file' markers", () => {
    const lines = parseDiffLines("+last line\n\\ No newline at end of file");
    expect(lines).toEqual([{ type: "add", content: "last line" }]);
  });

  it("returns empty for empty diff", () => {
    expect(parseDiffLines("")).toEqual([]);
  });
});

describe("integration: combined checks", () => {
  it("reports both FAIL and WARN in one run", () => {
    const l1Files = [
      {
        filename: "missing-index.md",
        content: "# Missing\n\nSee docs/research/foo.md",
      },
    ];
    const l2Files = [
      {
        filename: "cmd-heavy.md",
        content: Array(6).fill("npm run x").join("\n"),
      },
    ];
    const indexContent = "| `other.md` | Other |";

    const indexFindings = checkDocsIndexConsistency(
      [...l1Files, ...l2Files],
      indexContent,
    ).findings;
    const l1Findings = checkL1DesignDecisions(l1Files).findings;
    const l2Findings = checkL2CommandLines(l2Files).findings;

    const all = [...indexFindings, ...l1Findings, ...l2Findings];
    expect(failsOf(all).length).toBeGreaterThanOrEqual(2); // missing from index + missing design decisions
    expect(warnsOf(all)).toHaveLength(1);
  });

  it("exit code 0 when only WARNs (no FAILs)", () => {
    const l2Files = [
      {
        filename: "cmd-heavy.md",
        content: Array(5).fill("npm run x").join("\n"),
      },
    ];
    const indexContent = "| `cmd-heavy.md` | Research |";
    const indexFindings = checkDocsIndexConsistency(l2Files, indexContent).findings;
    const l2Findings = checkL2CommandLines(l2Files).findings;
    const all = [...indexFindings, ...l2Findings];
    expect(failsOf(all)).toHaveLength(0);
    expect(warnsOf(all)).toHaveLength(1);
  });
});

describe("checkWritingForAgentsGate", () => {
  it("WARN: new section heading added", () => {
    const stagedDiffs = [
      {
        filename: "docs/content-pipeline.md",
        diffLines: [
          { type: "ctx", content: "some context" },
          { type: "add", content: "## New Section" },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    const warns = warnsOf(findings);
    expect(warns).toHaveLength(1);
    expect(warns[0].ruleId).toBe("writing-for-agents-gate");
  });

  it("PASS: L2 research doc gains a section heading — prose structure, not an authoring decision", () => {
    // A research report is organized by headings by definition; the skill's
    // guidance does not hinge on whether `## 实跑验证` may be added. Firing here
    // was pure WARN inflation that buried the signals worth reading.
    const stagedDiffs = [
      {
        filename: "docs/research/pixelle-video-research-2026-10-01.md",
        diffLines: [
          { type: "add", content: "## 实跑验证（2026-10-02 追加）" },
          { type: "add", content: "### 三个部署坑的记录" },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(0);
  });

  it("WARN: L2 research doc with a heading plus a local pointer still fires, on the pointer", () => {
    const stagedDiffs = [
      {
        filename: "docs/research/some-doc.md",
        diffLines: [
          { type: "add", content: "## New Section" },
          { type: "add", content: "依据见 `docs/content-pipeline.md`。" },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("pointer line");
    expect(findings[0].message).not.toContain("heading added");
  });

  it("WARN: structural changes across several docs collapse into one finding", () => {
    const stagedDiffs = [
      {
        filename: "docs/content-pipeline.md",
        diffLines: [{ type: "add", content: "## New Stage" }],
      },
      {
        filename: "docs/agents/issue-tracker.md",
        diffLines: [{ type: "add", content: "- New rule → docs/agents/x.md" }],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(warnsOf(findings)).toHaveLength(1);
    expect(findings[0].message).toContain("docs/content-pipeline.md");
    expect(findings[0].message).toContain("docs/agents/issue-tracker.md");
  });

  it("PASS: only typo fix (no structural patterns)", () => {
    const stagedDiffs = [
      {
        filename: "docs/research/some-doc.md",
        diffLines: [
          { type: "ctx", content: "## Existing Section" },
          { type: "del", content: "Thsi is a typo" },
          { type: "add", content: "This is a typo" },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(0);
  });

  it("WARN: AGENTS.md modified (any non-whitespace change)", () => {
    const stagedDiffs = [
      {
        filename: "AGENTS.md",
        diffLines: [
          { type: "ctx", content: "some context" },
          { type: "add", content: "- New rule: something" },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    const warns = warnsOf(findings);
    expect(warns).toHaveLength(1);
    expect(warns[0].file).toBe("AGENTS.md");
    expect(messageOf(findings)).toContain("AGENTS.md → Workflow Router → Agent documents");
    expect(messageOf(findings)).not.toContain("Coding Conventions");
  });

  it("WARN: pointer line changed (contains arrow)", () => {
    const stagedDiffs = [
      {
        filename: "docs/DOCS-INDEX.md",
        diffLines: [
          { type: "del", content: "old → docs/research/old.md" },
          { type: "add", content: "new → docs/research/new.md" },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    const warns = warnsOf(findings);
    expect(warns).toHaveLength(1);
    expect(warns[0].ruleId).toBe("writing-for-agents-gate");
  });

  it("WARN: local Markdown link changed", () => {
    const stagedDiffs = [
      {
        filename: "docs/DOCS-INDEX.md",
        diffLines: [
          {
            type: "add",
            content: "See [workflow](docs/agents/implementation-workflow.md).",
          },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("writing-for-agents-gate");
  });

  it("WARN: backticked local path changed", () => {
    const stagedDiffs = [
      {
        filename: "docs/tools-catalog.md",
        diffLines: [
          {
            type: "add",
            content: "Read `docs/agents/proposal-review.md` first.",
          },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("writing-for-agents-gate");
  });

  it("WARN: normative qualifier changed", () => {
    const stagedDiffs = [
      {
        filename: "docs/video-production-runbook.md",
        diffLines: [
          { type: "del", content: "Agent may run preflight." },
          { type: "add", content: "Agent must run preflight." },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("writing-for-agents-gate");
  });

  it("PASS: external Markdown link without a rule change", () => {
    const stagedDiffs = [
      {
        filename: "docs/research/some-doc.md",
        diffLines: [
          {
            type: "add",
            content: "See [source](https://example.com/reference).",
          },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(0);
  });

  it("PASS: non-docs non-AGENTS.md file not checked", () => {
    const stagedDiffs = [
      {
        filename: "src/components/Button.tsx",
        diffLines: [{ type: "add", content: "## New Section" }],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(0);
  });

  it("PASS: docs/archive/ moves are mechanical, not authored structure (#129)", () => {
    // Archiving moves a doc verbatim: the diff shows its headings and pointer
    // lines as additions, but no authoring decision was made. The gate must
    // not fire on relocation (issue #129 false positive).
    const stagedDiffs = [
      {
        filename: "docs/archive/spec-old-thing.md",
        diffLines: [
          { type: "add", content: "# Spec: Old Thing" },
          { type: "add", content: "Details → docs/research/old.md" },
        ],
      },
      {
        filename: "docs/archive/reviews/old-review.md",
        diffLines: [{ type: "add", content: "## Findings" }],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(0);
  });

  it("WARN: section heading deleted", () => {
    const stagedDiffs = [
      {
        filename: "docs/video-production-runbook.md",
        diffLines: [{ type: "del", content: "### Old Subsection" }],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(warnsOf(findings)).toHaveLength(1);
  });

  it("PASS: only context lines (no add/del)", () => {
    const stagedDiffs = [
      {
        filename: "docs/content-pipeline.md",
        diffLines: [
          { type: "ctx", content: "## Section" },
          { type: "ctx", content: "some text" },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(0);
  });

  it("PASS: tracker Last-inventory del+add rotation is exempt (#178)", () => {
    // The rotation commit mechanically replaces the "Last inventory:" line;
    // the del+add pair is re-inventory, not an authoring decision. These lines
    // contain backticked script paths, so without the exemption they would
    // hit the pointer-line pattern and WARN.
    const stagedDiffs = [
      {
        filename: "docs/issue-roadmap.md",
        diffLines: [
          {
            type: "del",
            content:
              "Last inventory: 2026-09-02（第五 session）— 文本溢出 epic 收官批次全量推送（含 `scripts/lint-doc-hierarchy.mjs` 引用等）",
          },
          {
            type: "add",
            content:
              "Last inventory: 2026-09-03（第六 session）— **#178 新建**：docs-lint 豁免轮换行 WARN（改 `scripts/lint-doc-hierarchy.mjs` + 同步用例）",
          },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(0);
  });

  it("PASS: the exemption matches the tracker's REAL line shape `> **Last inventory**: …` (#269)", () => {
    // #178's exemption was dead code on this repo's own format: the roadmap
    // writes the pointer as a bolded blockquote line, which the original
    // pattern (`^\s*Last inventory:?`) never matched — so every rotation
    // warned. Guard the shape we actually write, not the shape we imagined.
    const stagedDiffs = [
      {
        filename: "docs/issue-roadmap.md",
        diffLines: [
          {
            type: "del",
            content:
              "> **Last inventory**: 2026-09-22（**#269 后续 Round B：源健康三轴**）—— 含 `docs/selector-auto-healing.md` 引用",
          },
          {
            type: "add",
            content:
              "> **Last inventory**: 2026-09-23（**#269 后续 Round C：抽取层第三轴**）—— 含 `docs/selector-auto-healing.md` 引用",
          },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(0);
  });

  it("WARN: a non-inventory pointer line in the tracker still warns", () => {
    // The widened pattern must not become a blanket exemption for every
    // blockquoted pointer line in the tracker.
    const stagedDiffs = [
      {
        filename: "docs/issue-roadmap.md",
        diffLines: [
          {
            type: "add",
            content: "> frontier = #333（36kr/guancha 收敛）→ `docs/issue-roadmap.md` 未更新",
          },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(1);
    expect(findings[0].level).toBe("WARN");
  });

  it("WARN: tracker Last-inventory line net-deleted (no replacement) (#178)", () => {
    const stagedDiffs = [
      {
        filename: "docs/issue-roadmap.md",
        diffLines: [
          {
            type: "del",
            content:
              "Last inventory: 2026-09-02（第五 session）— 文本溢出 epic 收官批次全量推送（含 `scripts/lint-doc-hierarchy.mjs` 引用等）",
          },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(1);
    expect(findings[0].level).toBe("WARN");
    expect(findings[0].ruleId).toBe("writing-for-agents-gate");
  });

  it("WARN: inventory exemption is line-scoped, other changes still warn (#178)", () => {
    const stagedDiffs = [
      {
        filename: "docs/issue-roadmap.md",
        diffLines: [
          {
            type: "del",
            content:
              "Last inventory: 2026-09-02（第五 session）— 文本溢出 epic 收官批次全量推送（含 `scripts/lint-doc-hierarchy.mjs` 引用等）",
          },
          {
            type: "add",
            content:
              "Last inventory: 2026-09-03（第六 session）— **#178 新建**：docs-lint 豁免轮换行 WARN（改 `scripts/lint-doc-hierarchy.mjs` + 同步用例）",
          },
          { type: "add", content: "## New Section" },
        ],
      },
    ];
    const { findings } = checkWritingForAgentsGate(stagedDiffs);
    expect(findings).toHaveLength(1);
    expect(findings[0].level).toBe("WARN");
    expect(findings[0].ruleId).toBe("writing-for-agents-gate");
  });

  it("PASS: empty staged diffs", () => {
    const { findings } = checkWritingForAgentsGate([]);
    expect(findings).toHaveLength(0);
  });
});

describe("checkReferenceResolution", () => {
  const TRACKED = [
    "docs/video-production-runbook.md",
    "scripts/short-video/main.mjs",
    "scripts/short-video/remotion/src/scenes/HookScene.tsx",
    "skills/brand-system/SKILL.md",
    "CONTEXT.md",
  ];

  it("PASS: a path relative to its own subproject resolves against the referrer directory", () => {
    const files = [
      {
        filename: "scripts/short-video/remotion/package.json",
        content: '{\n  "source": "src/Root.tsx"\n}',
      },
    ];
    const tracked = [...TRACKED, "scripts/short-video/remotion/src/Root.tsx"];
    expect(checkReferenceResolution(files, tracked).findings).toHaveLength(0);
  });

  it("PASS: a committed symlink resolves paths written through it", () => {
    const files = [
      {
        filename: "AGENTS.md",
        content: "Restart the proxy at `skills/web-access/scripts/cdp-proxy.mjs`.",
      },
    ];
    const tracked = [...TRACKED, "skills/shared/web-access/scripts/cdp-proxy.mjs"];
    const symlinks = [{ from: "skills/web-access", to: "skills/shared/web-access" }];
    expect(checkReferenceResolution(files, tracked, symlinks).findings).toHaveLength(0);
  });

  it("PASS: paths inside a fenced command example are invocation syntax, not pointers", () => {
    const files = [
      {
        filename: "skills/open-code-review/SKILL.md",
        content: "```bash\nocr delegate rule src/foo.ts src/bar.ts\n```\n\nSee `docs/gone.md`.\n",
      },
    ];
    const { findings } = checkReferenceResolution(files, TRACKED);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("docs/gone.md");
  });

  it("PASS: string literals in code are program inputs, not pointers", () => {
    const files = [
      {
        filename: "scripts/short-video/__tests__/avatar-card-render.test.mjs",
        content: ' * comment here\nconst ENTRY = "src/avatar-card-fixture.tsx";\n',
      },
    ];
    expect(checkReferenceResolution(files, TRACKED).findings).toHaveLength(0);
  });

  it("FAIL: a comment inside code is still a pointer an agent follows", () => {
    const files = [
      {
        filename: "scripts/short-video/main.mjs",
        content: ' * Spec: docs/gone-spec.md\nconst entry = "src/real.ts";\n',
      },
    ];
    const { findings } = checkReferenceResolution(files, TRACKED);
    expect(failsOf(findings)).toHaveLength(1);
    expect(findings[0].message).toContain("scripts/short-video/main.mjs:1");
  });

  it("WARN: evidence-layer docs break the same pointer without blocking", () => {
    const files = [
      {
        filename: "docs/research/some-study.md",
        content: "Upstream rubric at `docs/scoring.md`.",
      },
    ];
    const { findings } = checkReferenceResolution(files, TRACKED);
    expect(failsOf(findings)).toHaveLength(0);
    expect(warnsOf(findings)).toHaveLength(1);
    expect(findings[0].ruleId).toBe("doc-ref-unresolved");
  });

  it("PASS: build output is not expected in the tracked set", () => {
    const files = [
      {
        filename: "CONTEXT.md",
        content: "Router types land in `src/routeTree.gen.ts` at build time.",
      },
    ];
    expect(checkReferenceResolution(files, TRACKED).findings).toHaveLength(0);
  });

  it("FAIL: live doc points at an untracked path", () => {
    const files = [
      {
        filename: "CONTEXT.md",
        content: "See `docs/spec-vertical-cropping.md` for the policy.",
      },
    ];
    const { findings } = checkReferenceResolution(files, TRACKED);
    const fails = failsOf(findings);
    expect(fails).toHaveLength(1);
    expect(fails[0].ruleId).toBe("doc-ref-unresolved");
    expect(fails[0].message).toContain("docs/spec-vertical-cropping.md");
    expect(fails[0].file).toBe("CONTEXT.md");
  });

  it("PASS: reference resolves to a tracked file", () => {
    const files = [
      {
        filename: "CONTEXT.md",
        content: "See `docs/video-production-runbook.md` for the runbook.",
      },
    ];
    expect(checkReferenceResolution(files, TRACKED).findings).toHaveLength(0);
  });

  it("PASS: remotion/ shorthand resolves through the alias root", () => {
    const files = [
      {
        filename: "CONTEXT.md",
        content: "Hook skeleton lives in `remotion/src/scenes/HookScene.tsx`.",
      },
    ];
    expect(checkReferenceResolution(files, TRACKED).findings).toHaveLength(0);
  });

  it("PASS: mid-word matches are not repo paths", () => {
    const files = [
      {
        filename: "CONTEXT.md",
        content:
          "audit mode see `sub-skills/post-audit.md`; lock in `.cursor/skills/skills-lock.json`; full path `scripts/short-video/remotion/src/scenes/HookScene.tsx` stays one match",
      },
    ];
    expect(checkReferenceResolution(files, TRACKED).findings).toHaveLength(0);
  });

  it("PASS: URL fragments are not treated as local paths", () => {
    const files = [
      {
        filename: "CONTEXT.md",
        content: "Detector list: https://www.scenedetect.com/docs/latest/api/detectors.html",
      },
    ];
    expect(checkReferenceResolution(files, TRACKED).findings).toHaveLength(0);
  });

  it("PASS: archive referrers are exempt — archived text records the path of its day", () => {
    const files = [
      {
        filename: "docs/archive/tickets-old.md",
        content: "Spec at `docs/specs/spec-long-gone.md`.",
      },
    ];
    expect(checkReferenceResolution(files, TRACKED).findings).toHaveLength(0);
  });

  it("PASS: skill names not vendored in this repo are machine-level installs", () => {
    const files = [
      { filename: "CONTEXT.md", content: "Rules come from `skills/ponytail/SKILL.md`." },
    ];
    expect(checkReferenceResolution(files, TRACKED).findings).toHaveLength(0);
  });

  it("FAIL: a known repo skill directory still guards its own file names", () => {
    const files = [{ filename: "CONTEXT.md", content: "See `skills/brand-system/MISSING.md`." }];
    const { findings } = checkReferenceResolution(files, TRACKED);
    expect(failsOf(findings)).toHaveLength(1);
  });

  it("report: one finding per broken ref, carrying the line number", () => {
    const files = [
      {
        filename: "CONTEXT.md",
        content: "line one `docs/gone-a.md`\nline two filler\nline three `docs/gone-b.md`\n",
      },
    ];
    const { findings } = checkReferenceResolution(files, TRACKED);
    expect(failsOf(findings)).toHaveLength(2);
    expect(findings[0].message).toContain(":1");
    expect(findings[1].message).toContain(":3");
  });

  it("基线只折叠证据层，FAIL 永远标不到 known", () => {
    const files = [
      { filename: "docs/research/x.md", content: "见 `docs/gone-a.md`。" },
      { filename: "CONTEXT.md", content: "见 `docs/gone-a.md`。" },
    ];
    const baseline = new Set(["docs/research/x.md|docs/gone-a.md"]);
    const { findings } = checkReferenceResolution(files, TRACKED, [], baseline);
    const evidence = findings.find((f) => f.file === "docs/research/x.md");
    const live = findings.find((f) => f.file === "CONTEXT.md");
    expect(evidence.level).toBe("WARN");
    expect(evidence.known).toBe(true);
    // 同一条 ref 出现在 live 层时不能被证据层的基线一起消音
    expect(live.level).toBe("FAIL");
    expect(live.known).toBe(false);
  });

  it("未初始化的 submodule 里的路径判不了就明说，不谎报成断链", () => {
    const files = [
      { filename: "AGENTS.md", content: "代理在 `skills/web-access/scripts/cdp-proxy.mjs`。" },
      {
        filename: "docs/run.md",
        content: "站点经验见 `skills/web-access/references/site-patterns/tiktok.com.md`。",
      },
    ];
    const symlinks = [{ from: "skills/web-access", to: "skills/shared/web-access" }];
    // symlink 自身也在跟踪集里——CI 里 vendoredSkills 正因如此认得 web-access，
    // 引用才会一路判到 FAIL；少了这行会在命名空间那关被放行，测不到东西
    const tracked = [...TRACKED, "skills/web-access"];
    const { findings } = checkReferenceResolution(files, tracked, symlinks, new Set(), [
      "skills/shared",
    ]);
    expect(failsOf(findings)).toHaveLength(0);
    const unjudged = findings.filter((f) => f.ruleId === "doc-ref-unjudged");
    // 同一个缺失模块只出一条，附上计数与补齐命令
    expect(unjudged).toHaveLength(1);
    expect(unjudged[0].level).toBe("WARN");
    expect(unjudged[0].message).toContain("2 条");
    expect(unjudged[0].message).toContain("git submodule update --init skills/shared");
    // 反面对照：模块已就位时同样的引用必须重新可判（不能再被这条吞掉）
    const initialized = [...tracked, "skills/shared/web-access/scripts/cdp-proxy.mjs"];
    const second = checkReferenceResolution(files, initialized, symlinks, new Set(), []);
    expect(second.findings.filter((f) => f.ruleId === "doc-ref-unjudged")).toHaveLength(0);
    // cdp-proxy.mjs 已解析，tiktok.com.md 仍缺 —— 照旧判死，不留灰色地带
    expect(failsOf(second.findings).map((f) => f.file)).toEqual(["docs/run.md"]);
    expect(second.findings.filter((f) => f.file === "docs/run.md")).toHaveLength(1);
  });
});

describe("研究文档下游票字段", () => {
  const doc = (field) => `# Report\n\n> **关联**：#302\n  ${field}\n\n## 结论\n`;

  it("PASS: 头部声明承接票号", () => {
    expect(parseResearchDownstream(doc("> **下游票**：#1108 / #529")).verdict).toBe("ok");
    // 单位数票号在本仓存在过，不能因为位数少判成没写
    expect(parseResearchDownstream(doc("> **下游票**：#7")).verdict).toBe("ok");
    expect(
      checkResearchDownstream(
        [{ filename: "r.md", content: doc("> **下游票**：#1108") }],
        ["docs/research/r.md"],
      ).findings,
    ).toHaveLength(0);
  });

  it("PASS: 显式无下游 + 原因", () => {
    const content = doc("> **下游票**：无下游：操作手册，供人工查阅，无产线消费方");
    expect(parseResearchDownstream(content).verdict).toBe("waived");
    expect(
      checkResearchDownstream([{ filename: "r.md", content }], ["docs/research/r.md"]).findings,
    ).toHaveLength(0);
  });

  it("FAIL: 缺字段（改动集内）", () => {
    const { findings } = checkResearchDownstream(
      [{ filename: "r.md", content: doc("") }],
      ["docs/research/r.md"],
    );
    expect(failsOf(findings)).toHaveLength(1);
    expect(failsOf(findings)[0].ruleId).toBe("research-downstream-missing");
    expect(messageOf(findings, "FAIL")).toContain("下游票");
  });

  it("FAIL: 写了「无下游」但没给原因", () => {
    const { findings } = checkResearchDownstream(
      [{ filename: "r.md", content: doc("> **下游票**：无下游") }],
      ["docs/research/r.md"],
    );
    expect(failsOf(findings)).toHaveLength(1);
    expect(messageOf(findings, "FAIL")).toContain("没给原因");
  });

  it("FAIL: 既无票号也不是无下游", () => {
    const { findings } = checkResearchDownstream(
      [{ filename: "r.md", content: doc("> **下游票**：待定") }],
      ["docs/research/r.md"],
    );
    expect(failsOf(findings)).toHaveLength(1);
    expect(messageOf(findings, "FAIL")).toContain("#N");
  });

  it("FAIL: 字段写在第 40 行之后不算数——头部是读者先看到的地方", () => {
    const late = `# Report\n${"\n".repeat(45)}> **下游票**：#1108\n`;
    expect(parseResearchDownstream(late).verdict).toBe("missing");
  });

  it("存量豁免：未改动的旧文档不报，改动集内的旧文档照样判死", () => {
    const legacy = [{ filename: "old.md", content: "# Old\n" }];
    const baseline = new Set(["docs/research/old.md"]);
    expect(checkResearchDownstream(legacy, [], baseline).findings).toHaveLength(0);
    const changed = checkResearchDownstream(legacy, ["docs/research/old.md"], baseline);
    expect(failsOf(changed.findings)).toHaveLength(1);
  });

  it("FAIL: 改动集对不上时不静默当无改动——否则被改过的旧文档会继承豁免", () => {
    const legacy = [{ filename: "old.md", content: "# Old\n" }];
    const { findings } = checkResearchDownstream(
      legacy,
      [],
      new Set(["docs/research/old.md"]),
      "origin/main",
    );
    expect(failsOf(findings)).toHaveLength(1);
    expect(failsOf(findings)[0].ruleId).toBe("research-downstream-diff-failed");
    expect(messageOf(findings, "FAIL")).toContain("origin/main");
  });

  it("基线解析只认 docs/research/*.md，容忍注释与空行", () => {
    expect([
      ...parseDownstreamBaseline("# c\n\ndocs/research/a.md\n docs/research/b.md \nfoo|bar\n"),
    ]).toEqual(["docs/research/a.md", "docs/research/b.md"]);
  });

  it("仓内基线必须覆盖所有尚未合规的研究文档，且不留失效条目", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const researchDir = join(root, "docs", "research");
    const baseline = loadDownstreamBaseline();
    const files = readdirSync(researchDir)
      .filter((f) => f.endsWith(".md"))
      .map((filename) => ({
        filename,
        content: readFileSync(join(researchDir, filename), "utf8"),
      }));
    // 未进基线的文档必须合规，否则基线之外会静默长出一批漏网文档
    expect(checkResearchDownstream(files, [], baseline).findings).toEqual([]);
    for (const path of baseline) {
      // 归档/改名后基线行必须同步删除，否则豁免看起来仍在保护一份不存在的文档
      expect(() => readFileSync(join(root, path), "utf8")).not.toThrow();
    }
  });
});

describe("证据层引用基线", () => {
  it("解析时取 # 之前的 key，容忍空白与空行", () => {
    expect([...parseRefBaseline("# c\n a|b \n\n  c|d  # 说明\n")].sort()).toEqual(["a|b", "c|d"]);
  });

  it("基线文件不存在 = 什么都不已知，而不是抛错", () => {
    expect(loadRefBaseline("/definitely/not/here.txt").size).toBe(0);
  });

  it("仓内基线每一行都必须属于证据层——bless 掉一条 FAIL 等于把门禁改哑", () => {
    const evidence = [
      "docs/research/",
      "docs/reviews/",
      "docs/proposals/",
      "docs/handoffs/",
      "docs/refs/",
    ];
    const path = join(dirname(fileURLToPath(import.meta.url)), "..", "doc-ref-baseline.txt");
    const keys = [...parseRefBaseline(readFileSync(path, "utf8"))];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => !evidence.some((p) => k.startsWith(p)))).toEqual([]);
  });
});

describe("checkReviewReportShape（扫描报告形态门禁，#1131）", () => {
  const tableReport = [
    "# OCR Scan Report: src/routes",
    "",
    "| 字段 | 值 |",
    "| --- | --- |",
    "| 工具 | open-code-review v1.12.9（qwen3:8b） |",
    "| 范围 | src/routes/ 31 文件 |",
    "| 日期 | 2026-09-19 |",
    "| 裁决状态 | 未裁决 |",
    "",
    "## Findings",
    "",
  ].join("\n");

  const labelledReport = [
    "# Semgrep Scan",
    "",
    "**Tool**: semgrep CE 1.90",
    "**Scope**: src/",
    "**Date**: 2026-11-04",
    "**Ruling**: 部分吸收（3 条待修）",
    "",
  ].join("\n");

  it("PASS: 合规文件名 + 四字段头（表格形态）", () => {
    const findings = checkReviewReportShape(
      [{ filename: "ocr-routes-scan-2026-09-19.md", content: tableReport }],
      ["docs/reviews/ocr-routes-scan-2026-09-19.md"],
    ).findings;
    expect(findings).toEqual([]);
  });

  it("PASS: 加粗标签与 Tool/Scope/Date/Ruling 英文标签同样算数", () => {
    const findings = checkReviewReportShape(
      [{ filename: "semgrep-src-scan-2026-11-04.md", content: labelledReport }],
      ["docs/reviews/semgrep-src-scan-2026-11-04.md"],
    ).findings;
    expect(findings).toEqual([]);
  });

  it("文件名必须带 kind 段、扫描器名与真实日历日", () => {
    expect(parseReviewReportName("ocr-routes-scan-2026-09-19.md").ok).toBe(true);
    // 描述词落在 kind 与日期之间仍然合法，存量语料不用改名
    expect(parseReviewReportName("ponytail-adoption-review-brief-2026-09-04.md").ok).toBe(true);
    expect(parseReviewReportName("notes.md").ok).toBe(false);
    expect(parseReviewReportName("ocr-routes-scan.md").ok).toBe(false);
    expect(parseReviewReportName("report-2026-11-04.md").ok).toBe(false);
    expect(parseReviewReportName("scan-2026-11-04.md").ok).toBe(false);
    expect(parseReviewReportName("ocr-x-scan-2026-13-45.md").reason).toContain("不是有效日历日");
  });

  it("FAIL: 表头有四行标签但值全空——标签不是字段", () => {
    const blank = ["| 工具 | |", "| 范围 | |", "| 日期 | |", "| 裁决状态 | |", ""].join("\n");
    expect(parseReviewHeader(blank).missing).toHaveLength(4);
  });

  it("英文标签大小写不敏感，但仍须成词", () => {
    expect(parseReviewHeader("**tool**: semgrep\n").missing).not.toContain(
      "工具（哪个扫描器/模型）",
    );
    expect(parseReviewHeader("**ReviewDate**: 2026-11-04\n").missing).toContain(
      "日期（YYYY-MM-DD）",
    );
  });

  it("头部窗口与调研字段同宽（40 行），晚几行的字段仍算数", () => {
    const late = ["# Report", ...Array(25).fill(""), "| 工具 | semgrep |", ""].join("\n");
    expect(parseReviewHeader(late).missing).not.toContain("工具（哪个扫描器/模型）");
    const tooLate = ["# Report", ...Array(45).fill(""), "| 工具 | semgrep |", ""].join("\n");
    expect(parseReviewHeader(tooLate).missing).toContain("工具（哪个扫描器/模型）");
  });

  it("裁决状态按取值判定，不做子串匹配", () => {
    expect(parseRulingStatus("已吸收")).toBe("absorbed");
    expect(parseRulingStatus("已吸收（2026-10-01 归档）")).toBe("absorbed");
    expect(parseRulingStatus("Absorbed")).toBe("absorbed");
    expect(parseRulingStatus("部分吸收")).toBe("partial");
    expect(parseRulingStatus("未裁决（已吸收 0 条）")).toBe("unruled");
    expect(parseRulingStatus("待复核")).toBe("unknown");
  });

  it("同一份报告里出现两个裁决状态时，按已吸收处理（不让旧行掩盖真状态）", () => {
    const mixed = [
      "| 工具 | semgrep |",
      "| 范围 | src/routes |",
      "| 日期 | 2026-11-04 |",
      "| 裁决状态 | 未裁决 |",
      "",
      "## 追加",
      "",
      "| 裁决状态 | 已吸收 |",
      "",
    ].join("\n");
    expect(parseReviewHeader(mixed).status).toBe("已吸收");
  });

  it("FAIL: 头部缺字段时点名缺的是哪几个", () => {
    const legacy = "> 2026-09-19 | ocr scan --path src/routes | 31 files\n";
    const { missing } = parseReviewHeader(legacy);
    expect(missing).toHaveLength(4);
    const findings = checkReviewReportShape(
      [{ filename: "ocr-routes-scan-2026-09-19.md", content: legacy }],
      ["docs/reviews/ocr-routes-scan-2026-09-19.md"],
    ).findings;
    expect(failsOf(findings)).toHaveLength(1);
    expect(findings[0].ruleId).toBe("review-report-header");
    expect(findings[0].message).toContain("工具");
    expect(findings[0].message).toContain("裁决状态");
  });

  it("标签必须带值分隔符——`范围` 只是正文里的词不算字段", () => {
    expect(parseReviewHeader("本次扫描范围覆盖 src/routes。\n").missing).toContain(
      "范围（扫了哪些路径或文件）",
    );
  });

  it("英文标签必须成词——复合词里的 Date 不算日期字段", () => {
    expect(parseReviewHeader("**ReviewDate**: 2026-11-04\n").missing).toContain(
      "日期（YYYY-MM-DD）",
    );
  });

  it("FAIL: 已吸收的报告留在 docs/reviews/；部分吸收仍在场", () => {
    const absorbed = tableReport.replace("| 裁决状态 | 未裁决 |", "| 裁决状态 | 已吸收 |");
    const stays = checkReviewReportShape(
      [{ filename: "ocr-routes-scan-2026-09-19.md", content: absorbed }],
      ["docs/reviews/ocr-routes-scan-2026-09-19.md"],
    ).findings;
    expect(stays.map((f) => f.ruleId)).toEqual(["review-report-unarchived"]);

    const partial = labelledReport; // 部分吸收
    expect(
      checkReviewReportShape(
        [{ filename: "semgrep-src-scan-2026-11-04.md", content: partial }],
        ["docs/reviews/semgrep-src-scan-2026-11-04.md"],
      ).findings,
    ).toEqual([]);
  });

  it("存量不回溯：未改动的旧报告不判", () => {
    const legacy = [{ filename: "ocr-routes-scan-2026-09-19.md", content: "# old\n" }];
    expect(checkReviewReportShape(legacy, []).findings).toEqual([]);
  });

  it("FAIL: 改动集对不上时不静默通过", () => {
    const { findings } = checkReviewReportShape([], [], "origin/main");
    expect(failsOf(findings)).toHaveLength(1);
    expect(findings[0].ruleId).toBe("review-report-diff-failed");
    expect(findings[0].message).toContain("origin/main");
  });

  it("仓内现状：改动集为空时零 findings（规则不退化成全量扫描）", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const dir = join(root, "docs", "reviews");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((filename) => ({ filename, content: readFileSync(join(dir, filename), "utf8") }));
    expect(files.length).toBeGreaterThan(0);
    expect(checkReviewReportShape(files, []).findings).toEqual([]);
  });
});
