import { describe, it, expect } from "vitest";
import {
  checkDocsIndexConsistency,
  checkL1DesignDecisions,
  checkL2CommandLines,
  checkWritingForAgentsGate,
  parseDiffLines,
} from "../lint-doc-hierarchy.mjs";

const warnsOf = (findings) => findings.filter((f) => f.level === "WARN");
const failsOf = (findings) => findings.filter((f) => f.level === "FAIL");

describe("checkDocsIndexConsistency", () => {
  it("PASS: L1 doc listed in DOCS-INDEX", () => {
    const docs = [{ filename: "video-workflow.md", content: "# Video Workflow" }];
    const indexContent = "| `video-workflow.md` | Video production | AGENTS.md |";
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

  it("PASS: handoffs/ files not checked", () => {
    const docs = [{ filename: "video-layout-standard.md", content: "# Layout" }];
    const indexContent = "| `video-layout-standard.md` | Layout |";
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

describe("checkL1DesignDecisions", () => {
  it("PASS: L1 doc with L2 ref + has Design Decisions", () => {
    const files = [
      {
        filename: "video-workflow.md",
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
    expect(warns[0].message).toContain("AGENTS.md → Workflow Router → Agent documents");
    expect(warns[0].message).not.toContain("Coding Conventions");
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
        filename: "docs/video-workflow.md",
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
        filename: "docs/video-workflow.md",
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

  it("PASS: empty staged diffs", () => {
    const { findings } = checkWritingForAgentsGate([]);
    expect(findings).toHaveLength(0);
  });
});
