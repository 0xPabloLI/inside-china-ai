/**
 * Product-view gate (#810).
 *
 * `implementation-workflow.md` §9 step 8 has asked for the three sentences since
 * 2026-10-13, and §12 records that deliveries kept skipping it anyway — the
 * conclusion there is that wording was never the problem. So the gate is
 * mechanical, and these tests are what keep it mechanical: every way of
 * satisfying it without writing anything is a case below.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  countSentences,
  countUnits,
  evaluateCommentProductView,
  evaluateProductView,
  extractSection,
  substantiveLines,
} from "../check-product-view.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const CI = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
const TEMPLATE = readFileSync(join(ROOT, ".github", "pull_request_template.md"), "utf8");
const SIGNALS = readFileSync(
  join(ROOT, ".github", "workflows", "issue-tracker-signals.yml"),
  "utf8",
);

/**
 * One job's slice of the workflow, so a wiring assertion names the job that has
 * to carry it instead of passing on a match somewhere else in the file.
 * @param {string} name
 * @returns {string}
 */
function jobSlice(name) {
  const start = SIGNALS.indexOf(`  ${name}:`);
  expect(start, `job ${name} is missing from the workflow`).toBeGreaterThan(-1);
  const rest = SIGNALS.slice(start + 1);
  const next = rest.search(/^ {2}[a-z-]+:$/m);
  return next === -1 ? rest : rest.slice(0, next);
}

const THREE_BULLETS = `## 产品视角

- 原本要解决什么用户可见问题：跑完一整轮 GPU 合成后拿不到音频，整轮白烧
- 用户现在看到什么变化：探测有界，失败会打印原因，超预算后直接给手动取件命令
- 哪些行为或边界没有变：正常路径的分类与两套预算逐项未动，由既有测试钉住
`;

describe("evaluateProductView — the shape it accepts", () => {
  it("accepts three substantive bullets", () => {
    const result = evaluateProductView({ body: `## Summary\n\nx\n\n${THREE_BULLETS}` });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.units).toBe(3);
  });

  it("accepts a three-sentence paragraph, not just a list", () => {
    const body = `## 产品视角

原本跑完一轮 GPU 合成后拿不到音频，整轮白烧。现在探测有界，超预算就给出取件命令。正常路径的分类与两套预算逐项未动。
`;
    // Fragments shorter than the unit floor do not count as sentences, so the
    // fixture uses real-length ones ("a。b。c。" measures 0 on purpose).
    expect(
      countSentences(
        "原本跑完一轮 GPU 合成后拿不到音频。现在探测有界并给出取件命令。正常路径的分类逐项未动。",
      ),
    ).toBe(3);
    expect(countSentences("a。b。c。")).toBe(0);
    expect(countUnits(extractSection(body))).toBeGreaterThanOrEqual(3);
    expect(evaluateProductView({ body }).ok).toBe(true);
  });

  it("accepts the English heading too (PRs are written in either language)", () => {
    const body = THREE_BULLETS.replace("## 产品视角", "## Product view");
    expect(evaluateProductView({ body }).ok).toBe(true);
  });
});

describe("evaluateProductView — the ways it refuses", () => {
  it("fails when the template is submitted verbatim: placeholders are not content", () => {
    // The whole point of the placeholder rule. Without it this gate would pass
    // on an untouched template and gate nothing at all.
    const result = evaluateProductView({ body: TEMPLATE });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/substantive unit/);
    expect(result.units).toBe(0);
  });

  it("fails on a section that is only HTML comments", () => {
    const body = `## 产品视角\n\n<!-- 三句，各一行 -->\n<!-- 无用户可见变化时第三句写明原因 -->\n`;
    expect(evaluateProductView({ body }).ok).toBe(false);
  });

  it("fails on two units and names the count", () => {
    const body = `## 产品视角

- 原本要解决什么用户可见问题：跑完一轮 GPU 合成后拿不到音频，整轮白烧
- 用户现在看到什么变化：探测有界，失败会打印原因并给出取件命令
`;
    const result = evaluateProductView({ body });
    expect(result.ok).toBe(false);
    expect(result.units).toBe(2);
    expect(result.reason).toContain("2");
  });

  it("fails when the section is missing and names the heading", () => {
    const result = evaluateProductView({
      body: "## Summary\n\nOnly a summary here, nothing else.\n",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("产品视角");
  });

  it("fails on an empty body", () => {
    expect(evaluateProductView({ body: "   \n" }).ok).toBe(false);
  });

  it("does not borrow content from the sections around it", () => {
    // Section extraction has to stop at the next heading, or any PR with three
    // bullets anywhere below would satisfy the gate.
    const body = `## 产品视角

- 原本要解决什么用户可见问题：跑完一轮 GPU 合成后拿不到音频，整轮白烧
- 用户现在看到什么变化：探测有界，失败会打印原因并给出取件命令

## Changes

- 改了状态轮询的超时与相位保持逻辑
- 补了一条接线测试与八条单元测试
- 更新了 runbook 里的环境变量说明
`;
    const result = evaluateProductView({ body });
    expect(result.ok).toBe(false);
    expect(result.units).toBe(2);
  });
});

describe("evaluateProductView — exemptions say why they were exempt", () => {
  it("skips non-pull_request events", () => {
    const result = evaluateProductView({ eventName: "push", body: "" });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("push");
  });

  it("skips bot authors", () => {
    const result = evaluateProductView({ author: "release-please[bot]", body: "" });
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("bot");
  });

  it("refuses to exempt a branch name, because the PR author chooses it", () => {
    // `release-please--bypass` on a fork was a one-word opt-out in the first cut
    // (droid P2). release-please PRs come from a bot account and are covered by
    // the author rule; a branch name is never a trust boundary.
    const result = evaluateProductView({ headRef: "release-please--bypass", body: "" });
    expect(result.skipped).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("skips an explicit skip-product-view label", () => {
    const result = evaluateProductView({ labels: "bug, skip-product-view", body: "" });
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("skip-product-view");
  });

  it("does not skip on an unrelated label that merely contains the word", () => {
    const result = evaluateProductView({ labels: "product-view-discussion", body: "" });
    expect(result.skipped).toBe(false);
    expect(result.ok).toBe(false);
  });
});

describe("section parsing", () => {
  it("keeps a deeper heading inside the section", () => {
    const body = `## 产品视角\n\n### 细节\n\n- 这一行属于产品视角节，长度足够算一个实质单元\n`;
    expect(extractSection(body)).toContain("这一行属于产品视角节");
  });

  it("strips list, quote and checkbox decoration before measuring", () => {
    expect(substantiveLines("> - [x] 这一行去掉装饰后仍然足够长")).toHaveLength(1);
  });

  it("is null when there is no heading at all", () => {
    expect(extractSection("just prose, no headings")).toBeNull();
  });

  it("drops short scraps, which is also what removes the bare placeholder words", () => {
    // No separate placeholder word-list: every such word is shorter than the
    // unit floor, so the length filter already removes it (droid P3 killed the
    // redundant filter). Mixed casing proves the behaviour is casing-blind.
    for (const word of ["tOdO", "todo", "Tbd", "N/A", "n/a", "...", "…"]) {
      expect(substantiveLines(word)).toHaveLength(0);
    }
  });

  it("does not itself register as an unlinked marker with lint:todos", () => {
    // The first CI run of this gate failed on its own source: a placeholder list
    // spelled the marker word in caps, and the repo's marker gate matches that
    // case-sensitively. The list is gone (the length floor covers it), so this
    // assertion is now cheap insurance against reintroducing the caps form. The
    // character class keeps this very line from tripping the same gate.
    const source = readFileSync(join(ROOT, "scripts", "check-product-view.mjs"), "utf8");
    expect(source).not.toMatch(/\b[T]ODO\b/);
  });
});

describe("wiring — the gate is real only if it runs", () => {
  it("CI invokes the script", () => {
    expect(CI).toContain("node scripts/check-product-view.mjs");
  });

  it("CI passes the three values the script reads", () => {
    for (const key of ["PR_BODY", "PR_AUTHOR", "PR_LABELS"]) {
      expect(CI).toContain(key);
    }
  });

  it("CI never feeds the gate an author-controlled branch name", () => {
    expect(CI).not.toContain("PR_HEAD_REF");
  });

  it("CI runs it on pull_request only (a push to main has no body)", () => {
    const step = CI.split("node scripts/check-product-view.mjs")[0].split("- name:").pop() ?? "";
    expect(step).toContain("github.event_name == 'pull_request'");
  });

  it("the template ships the section the gate looks for", () => {
    // Template and gate must move together; renaming one alone goes red here.
    expect(TEMPLATE).toMatch(/^## 产品视角\s*$/m);
  });

  it("the template's placeholder bullets are the shape the gate rejects", () => {
    const section = extractSection(TEMPLATE);
    expect(section).not.toBeNull();
    expect(countUnits(section)).toBe(0);
    expect(substantiveLines(section).length).toBe(0);
  });
});

describe("documents the gate protects still exist", () => {
  it("§9 step 8 is where the three sentences are required", () => {
    const doc = readFileSync(join(ROOT, "docs", "agents", "implementation-workflow.md"), "utf8");
    expect(doc).toContain("产品视角三句");
    expect(existsSync(join(ROOT, "scripts", "check-product-view.mjs"))).toBe(true);
  });
});

/**
 * #353 delivery record: the closing comment cleared `delivery-record-missing`
 * with a commit sha, a change list and test evidence, and not one sentence about
 * users. The marker was the only part the machine read, so the ledger said done.
 * These cases pin the second surface: the record comment itself must carry the
 * same three sentences the PR body carries.
 */
describe("evaluateCommentProductView — the closing comment carries the three sentences", () => {
  it("accepts a record whose product-view section holds three bullets", () => {
    const result = evaluateCommentProductView(`## 交付记录\n\n${THREE_BULLETS}`);
    expect(result.ok).toBe(true);
    expect(result.units).toBe(3);
  });

  it("accepts a three-sentence paragraph inside the section", () => {
    const result = evaluateCommentProductView(
      [
        "## 交付记录",
        "",
        "## 产品视角",
        "",
        "原本要解决什么用户可见问题：巡检结论只活在终端里，不读那次就没有记录。用户现在看到什么变化：每次运行都落盘一份可 diff 的 JSON，真失败会自动开票。哪些行为或边界没有变：探哪些源、判定规则与回退链全部未动。",
      ].join("\n"),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects the shape that motivated the gate: commits + evidence, no product view", () => {
    const result = evaluateCommentProductView(
      [
        "## 交付记录",
        "",
        "- **已合并 PR**：PR #962（squash commit 8dd9e6b6）",
        "- **核心改动**：新增 --alert 运行时告警同步与 output/selector-health.json",
        "- **验收证据**：242 tests passed，CI 全绿",
      ].join("\n"),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("产品视角");
  });

  it("rejects the template's empty bullets, so pasting the labels is not a pass", () => {
    const result = evaluateCommentProductView(
      [
        "## 交付记录",
        "",
        "## 产品视角",
        "",
        "- 原本要解决什么用户可见问题：",
        "- 用户现在看到什么变化：",
        "- 没有变的行为或边界：",
      ].join("\n"),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects two units and names the count", () => {
    const result = evaluateCommentProductView(
      [
        "## 交付记录",
        "",
        "## 产品视角",
        "",
        "- 原本要解决什么用户可见问题：巡检只看终端",
        "- 用户现在看到什么变化：每次都落盘 JSON",
      ].join("\n"),
    );
    expect(result.ok).toBe(false);
    expect(result.units).toBe(2);
    expect(result.reason).toContain("2");
  });

  it("accepts the English heading like the PR gate does", () => {
    const result = evaluateCommentProductView(
      [
        "## Delivery record",
        "",
        "## Product view",
        "",
        "- Problem: health checks only printed to a terminal",
        "- Now: every run writes a JSON report",
        "- Unchanged: probing, verdicts and fallback chains",
      ].join("\n"),
    );
    expect(result.ok).toBe(true);
  });

  it("has no author or label exemption: a comment is judged on its content alone", () => {
    // The PR gate exempts bots and `skip-product-view`. If the comment gate
    // forwarded those inputs, a bot-authored record would pass with nothing in it.
    const result = evaluateCommentProductView("## 交付记录\n\n- 已合并 PR #1\n- 242 tests passed");
    expect(result.ok).toBe(false);
    expect(result.skipped).toBeUndefined();
  });
});

describe("wiring — the closing-comment gate is real only if it runs", () => {
  it("the close job runs the same evaluator on the record comment", () => {
    const job = jobSlice("check-delivery-record");
    expect(job).toContain("check-product-view.mjs");
    expect(job).toContain("--comment");
    expect(job).toContain("COMMENT_BODY");
  });

  it("the close job judges the record before it sets any ledger label", () => {
    const job = jobSlice("check-delivery-record");
    const gate = job.indexOf("--comment");
    const ledger = job.indexOf("product-view-missing");
    expect(gate).toBeGreaterThan(-1);
    expect(ledger).toBeGreaterThan(gate);
  });

  it("a record without the three sentences lands in a queryable ledger", () => {
    const job = jobSlice("check-delivery-record");
    expect(job).toContain("product-view-missing");
    expect(job).toMatch(/addLabels/);
  });

  it("the event-driven clear knows the label", () => {
    expect(jobSlice("clear-delivery-record")).toContain("product-view-missing");
  });

  it("the daily recheck knows the label", () => {
    const job = jobSlice("delivery-record-recheck");
    expect(job).toContain("product-view-missing");
    expect(job).toContain("check-product-view.mjs");
  });

  it("the reminder names the three roles, so the fix is unambiguous", () => {
    const job = jobSlice("check-delivery-record");
    expect(job).toContain("原本要解决什么用户可见问题");
    expect(job).toContain("用户现在看到什么变化");
    expect(job).toContain("没有变");
  });
});
