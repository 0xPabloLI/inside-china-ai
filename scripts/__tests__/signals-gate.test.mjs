/**
 * Behavioural gate test for `.github/workflows/issue-tracker-signals.yml`.
 *
 * The sibling `check-product-view.test.mjs` asserts the wiring by string
 * presence, which proves the YAML mentions the gate and nothing more. The two
 * jobs here decide what happens to a real ticket, and the first cut of this
 * change got a branch wrong (a `无需交付记录` waiver started landing in the
 * missing-record ledger), which no string assertion would have caught. So these
 * tests compile each job's inline `github-script` body and run it against
 * synthetic API responses, asserting on the visible effects: labels added,
 * labels removed, comments posted.
 *
 * There is deliberately no YAML parser: the repo carries no direct `yaml`
 * dependency, and the two things needed here (job boundaries and one block
 * scalar) are decided by indentation in a file these tests also guard.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const WORKFLOW = readFileSync(
  join(ROOT, ".github", "workflows", "issue-tracker-signals.yml"),
  "utf8",
);
const require = createRequire(import.meta.url);

beforeAll(() => {
  // The job bodies resolve the gate script from the workspace root, exactly as
  // actions/checkout lays it out on a runner.
  process.env.GITHUB_WORKSPACE = ROOT;
});

/**
 * One job's `github-script` body, dedented.
 * @param {string} name - job id under `jobs:`
 * @returns {string}
 */
function jobScript(name) {
  const marker = `\n  ${name}:\n`;
  const start = WORKFLOW.indexOf(marker);
  if (start === -1) throw new Error(`job ${name} is missing from the workflow`);
  const rest = WORKFLOW.slice(start + marker.length);
  const nextJob = rest.search(/^ {2}[a-z-]+:$/m);
  const job = nextJob === -1 ? rest : rest.slice(0, nextJob);
  const scriptAt = job.indexOf("          script: |\n");
  if (scriptAt === -1) throw new Error(`job ${name} has no inline script`);
  const lines = job.slice(scriptAt + "          script: |\n".length).split("\n");
  const kept = [];
  for (const line of lines) {
    if (line.trim() === "") {
      kept.push("");
      continue;
    }
    if (!line.startsWith("            ")) break;
    kept.push(line.slice(12));
  }
  return kept.join("\n");
}

/**
 * Run one job body with a fake GitHub surface.
 * @param {string} name - job id
 * @param {{comments?: object[], labels?: string[], state?: string, stateReason?: string, newComment?: object}} input
 * @returns {Promise<{added: string[][], removed: string[], comments: string[]}>}
 */
async function runJob(name, input = {}) {
  const { comments = [], labels = [], state = "closed", stateReason = "completed" } = input;
  const calls = { added: [], removed: [], comments: [] };
  const github = {
    paginate: async () => comments,
    rest: {
      issues: {
        get: async () => ({
          data: { number: 353, state, labels: labels.map((value) => ({ name: value })) },
        }),
        addLabels: async (arg) => calls.added.push(arg.labels),
        removeLabel: async (arg) => calls.removed.push(arg.name),
        createComment: async (arg) => calls.comments.push(arg.body),
      },
    },
  };
  const context = {
    repo: { owner: "owner", repo: "repo" },
    issue: { number: 353 },
    payload: {
      issue: { number: 353, state_reason: stateReason, labels: labels.map((l) => ({ name: l })) },
      comment: input.newComment,
    },
  };
  const core = { info: () => {}, setOutput: () => {}, exportVariable: () => {} };
  const body = `return (async () => {\n${jobScript(name)}\n})();`;
  await new Function("github", "context", "core", "require", body)(github, context, core, require);
  return calls;
}

const USER = { type: "User" };
const BOT = { type: "Bot" };

const THREE_SENTENCES = `## 产品视角

- 原本要解决什么用户可见问题：巡检结论只活在终端里，不读那次就没有记录
- 用户现在看到什么变化：每次运行都落盘一份可 diff 的 JSON
- 哪些行为或边界没有变：探哪些源、判定规则与回退链全部未动`;

/** The shape #353 shipped: sha + change list + evidence, nothing about users. */
const RECORD_WITHOUT_VIEW =
  "## 交付记录\n\n- **已合并 PR**：PR #962（squash commit 8dd9e6b6）\n- **核心改动**：新增 --alert\n- **验收证据**：242 tests passed";
const RECORD_WITH_VIEW = `## 交付记录\n\n${THREE_SENTENCES}`;
const WAIVER = "无需交付记录：拒绝项";

describe("check-delivery-record — what a close puts in the ledger", () => {
  it("no record at all keeps landing in delivery-record-missing", async () => {
    const calls = await runJob("check-delivery-record");
    expect(calls.added.flat()).toContain("delivery-record-missing");
    expect(calls.comments).toHaveLength(1);
  });

  it("a record with no product view lands in product-view-missing, not the record ledger", async () => {
    const calls = await runJob("check-delivery-record", {
      comments: [{ user: USER, body: RECORD_WITHOUT_VIEW }],
    });
    expect(calls.added.flat()).toEqual(["product-view-missing"]);
    expect(calls.removed).toContain("delivery-record-missing");
  });

  it("the product-view reminder names the three roles", async () => {
    const calls = await runJob("check-delivery-record", {
      comments: [{ user: USER, body: RECORD_WITHOUT_VIEW }],
    });
    const reminder = calls.comments.join("\n");
    expect(reminder).toContain("原本要解决什么用户可见问题");
    expect(reminder).toContain("用户现在看到什么变化");
    expect(reminder).toContain("没有变");
  });

  it("a compliant record flags nothing and clears both ledgers", async () => {
    const calls = await runJob("check-delivery-record", {
      comments: [{ user: USER, body: RECORD_WITH_VIEW }],
    });
    expect(calls.added).toEqual([]);
    expect(calls.removed).toEqual(
      expect.arrayContaining(["delivery-record-missing", "product-view-missing"]),
    );
    expect(calls.comments).toEqual([]);
  });

  it("the waiver clears both ledgers instead of demanding a record", async () => {
    const calls = await runJob("check-delivery-record", {
      comments: [{ user: USER, body: WAIVER }],
    });
    expect(calls.added).toEqual([]);
    expect(calls.removed).toEqual(
      expect.arrayContaining(["delivery-record-missing", "product-view-missing"]),
    );
  });

  it("a bot comment cannot satisfy the gate", async () => {
    const calls = await runJob("check-delivery-record", {
      comments: [{ user: BOT, body: RECORD_WITH_VIEW }],
    });
    expect(calls.added.flat()).toContain("delivery-record-missing");
  });

  it("not-planned closes are exempt from both ledgers", async () => {
    const calls = await runJob("check-delivery-record", { stateReason: "not_planned" });
    expect(calls.added).toEqual([]);
    expect(calls.comments).toEqual([]);
  });
});

describe("clear-delivery-record — what a late comment clears", () => {
  const both = ["delivery-record-missing", "product-view-missing"];

  it("a record without the three sentences clears only the record ledger", async () => {
    const calls = await runJob("clear-delivery-record", {
      labels: both,
      newComment: { user: USER, body: RECORD_WITHOUT_VIEW },
    });
    expect(calls.removed).toEqual(["delivery-record-missing"]);
    expect(calls.comments).toHaveLength(1);
    expect(calls.comments[0]).not.toContain("产品视角三句已补齐");
  });

  it("a compliant record clears both ledgers", async () => {
    const calls = await runJob("clear-delivery-record", {
      labels: both,
      newComment: { user: USER, body: RECORD_WITH_VIEW },
    });
    expect(calls.removed).toEqual(expect.arrayContaining(both));
  });

  it("the waiver clears both ledgers", async () => {
    const calls = await runJob("clear-delivery-record", {
      labels: both,
      newComment: { user: USER, body: WAIVER },
    });
    expect(calls.removed).toEqual(expect.arrayContaining(both));
  });

  it("an unrelated comment changes nothing", async () => {
    const calls = await runJob("clear-delivery-record", {
      labels: both,
      newComment: { user: USER, body: "thanks!" },
    });
    expect(calls.removed).toEqual([]);
    expect(calls.comments).toEqual([]);
  });

  it("a bot comment cannot clear a ledger", async () => {
    const calls = await runJob("clear-delivery-record", {
      labels: both,
      newComment: { user: BOT, body: RECORD_WITH_VIEW },
    });
    expect(calls.removed).toEqual([]);
  });

  it("open issues are left to the unread-comment signal", async () => {
    const calls = await runJob("clear-delivery-record", {
      state: "open",
      labels: both,
      newComment: { user: USER, body: RECORD_WITH_VIEW },
    });
    expect(calls.removed).toEqual([]);
  });
});
