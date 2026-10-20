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
  evaluateProductView,
  extractSection,
  substantiveLines,
} from "../check-product-view.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const CI = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
const TEMPLATE = readFileSync(join(ROOT, ".github", "pull_request_template.md"), "utf8");

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

  it("skips release-please branches", () => {
    const result = evaluateProductView({ headRef: "release-please--branches--main", body: "" });
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("release-please");
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

  it("drops whole-line placeholders in any casing", () => {
    // Mixed casing on purpose: `tOdO` proves the comparison lowercases, and
    // writing the all-caps form here would trip the repo's marker gate.
    for (const word of ["tOdO", "todo", "Tbd", "N/A", "n/a", "...", "…"]) {
      expect(substantiveLines(word)).toHaveLength(0);
    }
  });

  it("does not itself register as an unlinked marker with lint:todos", () => {
    // The first CI run of this gate failed on its own source: the placeholder
    // list was a regex literal spelling the marker word, and the repo's marker
    // gate matches it case-sensitively. A gate about placeholder text must not
    // become debt; the list is lowercase and compared after toLowerCase, and
    // this assertion is the tripwire against reintroducing the caps form. The
    // character class keeps this line from tripping the same gate.
    const source = readFileSync(join(ROOT, "scripts", "check-product-view.mjs"), "utf8");
    expect(source).not.toMatch(/\b[T]ODO\b/);
  });
});

describe("wiring — the gate is real only if it runs", () => {
  it("CI invokes the script", () => {
    expect(CI).toContain("node scripts/check-product-view.mjs");
  });

  it("CI passes the four values the script reads", () => {
    for (const key of ["PR_BODY", "PR_AUTHOR", "PR_HEAD_REF", "PR_LABELS"]) {
      expect(CI).toContain(key);
    }
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
