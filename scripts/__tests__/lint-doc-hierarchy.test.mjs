import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkDocsIndexConsistency,
  checkL1DesignDecisions,
  checkL2CommandLines,
  checkReferenceResolution,
  checkWritingForAgentsGate,
  parseDiffLines,
  parseRefBaseline,
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
