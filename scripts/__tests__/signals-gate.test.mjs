/**
 * Behavioural gate test for `.github/workflows/issue-tracker-signals.yml`.
 *
 * The jobs in that file are inline `github-script` bodies, which no linter and
 * no type checker reads, and which only run on real GitHub events. The first cut
 * of the closing-comment gate shipped a branch that silently filed explicit
 * `无需交付记录` waivers under the missing-record ledger; a string assertion that
 * the YAML mentions the right words would have passed it. So these tests compile
 * each job body and run it against a fake GitHub surface, then assert on the
 * effects a user can see: which labels were added, which were removed, and which
 * comments were posted.
 *
 * Two consequences worth knowing when reading failures here:
 *
 *   - `GITHUB_WORKSPACE` points at this worktree, so each job spawns the real
 *     `scripts/issue-tracker-ledger.mjs`, which imports the real
 *     `scripts/check-product-view.mjs`. A broken gate fails these tests; the
 *     fakes only stand in for the GitHub API, never for the judgement or the
 *     labels.
 *   - There is no YAML parser: the repo carries no direct `yaml` dependency, and
 *     the two things needed (job boundaries, one block scalar) are decided by
 *     indentation. A reformat fails loudly by throwing, never by passing.
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
  // The job bodies resolve the ledger module from the workspace root, exactly as
  // actions/checkout lays it out on a runner.
  process.env.GITHUB_WORKSPACE = ROOT;
});

/**
 * One job's inline `github-script` body, dedented to column 0.
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
const RECORD_LABEL = "delivery-record-missing";
const VIEW_LABEL = "product-view-missing";

/**
 * Run one job body against a fake GitHub surface.
 *
 * `paginate` dispatches on the same thing the real client does — the endpoint it
 * is given — so the nightly recheck, which lists two different ledgers and then
 * fetches comments per issue, sees a coherent world instead of one fixed array.
 *
 * @param {string} name - job id
 * @param {object} [input]
 * @param {Array<{user?: object, body?: string}>} [input.comments] - comments on the payload issue
 * @param {string[]} [input.labels] - labels currently on the payload issue
 * @param {string} [input.state] - payload issue state
 * @param {string} [input.stateReason]
 * @param {{user?: object, body?: string}} [input.newComment] - the triggering comment
 * @param {Array<object>} [input.ledgerIssues] - issues returned for the record ledger listing
 * @param {Array<object>} [input.viewLedgerIssues] - issues returned for the product-view listing
 * @param {Array<object>} [input.sweepIssues] - issues returned by the unfiltered closed listing
 * @param {Record<string, string>} [input.inputs] - workflow_dispatch inputs
 * @param {Record<number, Array<{user?: object, body?: string}>>} [input.commentsByIssue]
 * @returns {Promise<{added: string[][], removed: string[], comments: string[], logged: string[]}>}
 */
async function runJob(name, input = {}) {
  const {
    comments = [],
    labels = [],
    state = "closed",
    stateReason = "completed",
    ledgerIssues = [],
    viewLedgerIssues = [],
    sweepIssues = [],
    inputs = {},
    commentsByIssue = {},
    newComment,
  } = input;
  const calls = { added: [], removed: [], comments: [], logged: [] };
  // GitHub's own listing includes the comment that triggered the event.
  const issueComments = newComment ? [...comments, newComment] : comments;
  // Dispatch on the endpoint function, not on option shapes: the real client is
  // called as `paginate(github.rest.issues.listComments, { issue_number })`, and
  // the close job and the nightly recheck ask for different things through it.
  const endpoints = {
    listForRepo: () => ({}),
    listComments: () => ({}),
  };
  const github = {
    paginate: async (fn, opts = {}) => {
      if (fn === endpoints.listForRepo) {
        if (opts.labels === RECORD_LABEL) return ledgerIssues;
        if (opts.labels === VIEW_LABEL) return viewLedgerIssues;
        // Unfiltered closed listing: the backlog sweep's world.
        return sweepIssues;
      }
      if (opts.issue_number === 353) return issueComments;
      return commentsByIssue[opts.issue_number] ?? [];
    },
    rest: {
      issues: {
        ...endpoints,
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
    eventName: "issues",
    repo: { owner: "owner", repo: "repo" },
    issue: { number: 353 },
    payload: {
      issue: {
        number: 353,
        state,
        state_reason: stateReason,
        labels: labels.map((n) => ({ name: n })),
      },
      comment: newComment,
      inputs,
    },
  };
  const core = {
    info: (message) => calls.logged.push(message),
    setOutput: () => {},
    exportVariable: () => {},
  };
  const body = `return (async () => {\n${jobScript(name)}\n})();`;
  await new Function("github", "context", "core", "require", body)(github, context, core, require);
  return calls;
}

describe("check-delivery-record — what a close puts in the ledgers", () => {
  it("no record at all lands in the missing-record ledger", async () => {
    const calls = await runJob("check-delivery-record");
    expect(calls.added.flat()).toEqual([RECORD_LABEL]);
    expect(calls.comments).toHaveLength(1);
  });

  it("a record with no product view lands in the product-view ledger only", async () => {
    const calls = await runJob("check-delivery-record", {
      comments: [{ user: USER, body: RECORD_WITHOUT_VIEW }],
    });
    expect(calls.added.flat()).toEqual([VIEW_LABEL]);
    expect(calls.removed).toEqual([RECORD_LABEL]);
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
    expect(calls.removed).toEqual(expect.arrayContaining([RECORD_LABEL, VIEW_LABEL]));
    expect(calls.comments).toEqual([]);
  });

  it("one compliant record covers an issue that also holds a bare one", async () => {
    const calls = await runJob("check-delivery-record", {
      comments: [
        { user: USER, body: RECORD_WITHOUT_VIEW },
        { user: USER, body: RECORD_WITH_VIEW },
      ],
    });
    expect(calls.added).toEqual([]);
  });

  it("the waiver clears both ledgers instead of demanding a record", async () => {
    const calls = await runJob("check-delivery-record", {
      comments: [{ user: USER, body: WAIVER }],
    });
    expect(calls.added).toEqual([]);
    expect(calls.removed).toEqual(expect.arrayContaining([RECORD_LABEL, VIEW_LABEL]));
  });

  it("a bot comment cannot stand in for a record, and a waiver containing the marker is still a waiver", async () => {
    const botRecord = await runJob("check-delivery-record", {
      comments: [{ user: BOT, body: RECORD_WITH_VIEW }],
    });
    expect(botRecord.added.flat()).toEqual([RECORD_LABEL]);
    const botWaiver = await runJob("check-delivery-record", {
      comments: [{ user: BOT, body: WAIVER }],
    });
    expect(botWaiver.added.flat()).toEqual([RECORD_LABEL]);
  });

  it("not-planned closes are exempt from both ledgers", async () => {
    const calls = await runJob("check-delivery-record", { stateReason: "not_planned" });
    expect(calls.added).toEqual([]);
    expect(calls.comments).toEqual([]);
  });
});

describe("clear-delivery-record — what a late comment changes", () => {
  it("a late record with no product view fixes the record and opens the product-view ledger", async () => {
    // The hole the spec review found: close with no record -> backfill a record
    // with sha + evidence but no product view. Clearing the record ledger alone
    // would let the delivery pass with no sentence about users, which is exactly
    // what #353 shipped.
    const calls = await runJob("clear-delivery-record", {
      labels: [RECORD_LABEL],
      newComment: { user: USER, body: RECORD_WITHOUT_VIEW },
    });
    expect(calls.removed).toEqual([RECORD_LABEL]);
    expect(calls.added.flat()).toEqual([VIEW_LABEL]);
    expect(calls.comments.join("\n")).toContain("原本要解决什么用户可见问题");
  });

  it("a late compliant record clears both ledgers and asks for nothing", async () => {
    const calls = await runJob("clear-delivery-record", {
      labels: [RECORD_LABEL, VIEW_LABEL],
      newComment: { user: USER, body: RECORD_WITH_VIEW },
    });
    expect(calls.removed).toEqual(expect.arrayContaining([RECORD_LABEL, VIEW_LABEL]));
    expect(calls.added).toEqual([]);
  });

  it("a later compliant record clears a ledger that only tracks the product view", async () => {
    const calls = await runJob("clear-delivery-record", {
      labels: [VIEW_LABEL],
      newComment: { user: USER, body: RECORD_WITH_VIEW },
    });
    expect(calls.removed).toEqual([VIEW_LABEL]);
    expect(calls.added).toEqual([]);
  });

  it("the waiver clears both ledgers", async () => {
    const calls = await runJob("clear-delivery-record", {
      labels: [RECORD_LABEL, VIEW_LABEL],
      newComment: { user: USER, body: WAIVER },
    });
    expect(calls.removed).toEqual(expect.arrayContaining([RECORD_LABEL, VIEW_LABEL]));
  });

  it("an unrelated comment changes nothing", async () => {
    const calls = await runJob("clear-delivery-record", {
      labels: [RECORD_LABEL, VIEW_LABEL],
      newComment: { user: USER, body: "thanks!" },
    });
    expect(calls.removed).toEqual([]);
    expect(calls.added).toEqual([]);
    expect(calls.comments).toEqual([]);
  });

  it("a bot comment cannot clear a ledger", async () => {
    const calls = await runJob("clear-delivery-record", {
      labels: [RECORD_LABEL, VIEW_LABEL],
      newComment: { user: BOT, body: RECORD_WITH_VIEW },
    });
    expect(calls.removed).toEqual([]);
  });

  it("open issues are left to the unread-comment signal", async () => {
    const calls = await runJob("clear-delivery-record", {
      state: "open",
      labels: [RECORD_LABEL, VIEW_LABEL],
      newComment: { user: USER, body: RECORD_WITH_VIEW },
    });
    expect(calls.removed).toEqual([]);
  });

  it("an issue with no ledger label is ignored", async () => {
    const calls = await runJob("clear-delivery-record", {
      labels: [],
      newComment: { user: USER, body: RECORD_WITH_VIEW },
    });
    expect(calls.removed).toEqual([]);
    expect(calls.added).toEqual([]);
  });
});

describe("delivery-record-recheck — the nightly sweep of both ledgers", () => {
  // After the grandfathering cutoff (2026-09-19) and stale by more than the
  // 3-day grace window: the only combination the sweep escalates. A date before
  // the cutoff exercises the silent-clear path instead, which is why it is
  // spelled out here rather than left as "some old date".
  const stale = {
    number: 900,
    closed_at: "2026-10-01T00:00:00Z",
    labels: [],
    state_reason: "completed",
  };

  it("a stale record ledger entry with no record is escalated once", async () => {
    const calls = await runJob("delivery-record-recheck", {
      ledgerIssues: [stale],
      commentsByIssue: { 900: [] },
    });
    // Escalation keeps the label: the entry is still unresolved.
    expect(calls.removed).toEqual([]);
    expect(calls.comments.join("\n")).toContain("交付记录");
    expect(calls.comments.join("\n")).toContain("原本要解决什么用户可见问题");
  });

  it("a record ledger entry whose compliant record arrived is cleared without escalation", async () => {
    const calls = await runJob("delivery-record-recheck", {
      ledgerIssues: [stale],
      commentsByIssue: { 900: [{ user: USER, body: RECORD_WITH_VIEW }] },
    });
    expect(calls.removed).toEqual([RECORD_LABEL]);
    expect(calls.comments).toEqual([]);
    expect(calls.added).toEqual([]);
  });

  it("a late bare record is caught on the nightly path, not only by the comment event", async () => {
    // The recheck exists to backstop a missed comment event. Clearing the record
    // ledger there without opening the product-view ledger would reproduce the
    // #353 hole on exactly the path that is supposed to catch it.
    const calls = await runJob("delivery-record-recheck", {
      ledgerIssues: [stale],
      commentsByIssue: { 900: [{ user: USER, body: RECORD_WITHOUT_VIEW }] },
    });
    expect(calls.removed).toEqual([RECORD_LABEL]);
    expect(calls.added.flat()).toEqual([VIEW_LABEL]);
    expect(calls.comments.join("\n")).toContain("原本要解决什么用户可见问题");
  });

  it("a waiver on the nightly path clears without opening anything", async () => {
    const calls = await runJob("delivery-record-recheck", {
      ledgerIssues: [stale],
      commentsByIssue: { 900: [{ user: USER, body: WAIVER }] },
    });
    expect(calls.added).toEqual([]);
    expect(calls.comments).toEqual([]);
  });

  it("a not-planned closure on the nightly path opens nothing", async () => {
    const calls = await runJob("delivery-record-recheck", {
      ledgerIssues: [{ ...stale, state_reason: "not_planned" }],
      commentsByIssue: { 900: [{ user: USER, body: RECORD_WITHOUT_VIEW }] },
    });
    expect(calls.added).toEqual([]);
  });

  it("a stale product-view entry is escalated, naming the three roles", async () => {
    const calls = await runJob("delivery-record-recheck", {
      viewLedgerIssues: [stale],
      commentsByIssue: { 900: [{ user: USER, body: RECORD_WITHOUT_VIEW }] },
    });
    expect(calls.removed).toEqual([]);
    const escalation = calls.comments.join("\n");
    expect(escalation).toContain("原本要解决什么用户可见问题");
    expect(escalation).toContain("没有变");
  });

  it("a product-view entry whose section arrived is cleared", async () => {
    const calls = await runJob("delivery-record-recheck", {
      viewLedgerIssues: [stale],
      commentsByIssue: { 900: [{ user: USER, body: RECORD_WITH_VIEW }] },
    });
    expect(calls.removed).toEqual([VIEW_LABEL]);
    expect(calls.comments).toEqual([]);
  });

  it("a waiver clears both ledgers on the nightly sweep too", async () => {
    const calls = await runJob("delivery-record-recheck", {
      ledgerIssues: [stale],
      viewLedgerIssues: [stale],
      commentsByIssue: { 900: [{ user: USER, body: WAIVER }] },
    });
    expect(calls.removed).toEqual(expect.arrayContaining([RECORD_LABEL, VIEW_LABEL]));
  });

  it("an entry closed before the grandfathering cutoff is cleared silently, never escalated", async () => {
    const calls = await runJob("delivery-record-recheck", {
      ledgerIssues: [{ ...stale, closed_at: "2026-01-01T00:00:00Z" }],
      commentsByIssue: { 900: [] },
    });
    expect(calls.removed).toEqual([RECORD_LABEL]);
    expect(calls.comments).toEqual([]);
  });

  it("entries inside the 3-day grace window are left alone", async () => {
    const recent = { ...stale, closed_at: new Date().toISOString() };
    const calls = await runJob("delivery-record-recheck", {
      ledgerIssues: [recent],
      viewLedgerIssues: [recent],
      commentsByIssue: { 900: [] },
    });
    expect(calls.removed).toEqual([]);
    expect(calls.comments).toEqual([]);
  });

  it("a second nightly run does not re-ping what the first one escalated", async () => {
    // The contract is "escalates once after 3 days", and the once lives in the
    // marker dedup. Deleting that line would keep every other test green while
    // production re-pinged the owner every night until backfill.
    const first = await runJob("delivery-record-recheck", {
      ledgerIssues: [stale],
      viewLedgerIssues: [stale],
      commentsByIssue: { 900: [{ user: USER, body: RECORD_WITHOUT_VIEW }] },
    });
    expect(first.comments).toHaveLength(2);

    // Next night: the same issue, now carrying the label the first run set and
    // the two escalations this job posts.
    const posted = [
      { user: USER, body: RECORD_WITHOUT_VIEW },
      ...first.comments.map((body) => ({ user: BOT, body })),
    ];
    const second = await runJob("delivery-record-recheck", {
      ledgerIssues: [{ ...stale, labels: [{ name: VIEW_LABEL }] }],
      viewLedgerIssues: [{ ...stale, labels: [{ name: VIEW_LABEL }] }],
      commentsByIssue: { 900: posted },
    });
    expect(second.comments).toEqual([]);
  });
});

describe("sweep-delivery-records — the backlog uses the gate's judgement", () => {
  const pastCutoff = { number: 901, closed_at: "2026-10-01T00:00:00Z", labels: [] };

  it("labels a backlog issue with no record and no waiver", async () => {
    const calls = await runJob("sweep-delivery-records", {
      inputs: { sweep_delivery: "true", apply: "true" },
      sweepIssues: [pastCutoff],
      commentsByIssue: { 901: [] },
    });
    expect(calls.added.flat()).toEqual([RECORD_LABEL]);
  });

  it("leaves a waived backlog issue alone", async () => {
    const calls = await runJob("sweep-delivery-records", {
      inputs: { sweep_delivery: "true", apply: "true" },
      sweepIssues: [pastCutoff],
      commentsByIssue: { 901: [{ user: USER, body: WAIVER }] },
    });
    expect(calls.added).toEqual([]);
  });

  it("leaves a bot-authored record alone, like the event path does", async () => {
    const calls = await runJob("sweep-delivery-records", {
      inputs: { sweep_delivery: "true", apply: "true" },
      sweepIssues: [pastCutoff],
      commentsByIssue: { 901: [{ user: BOT, body: RECORD_WITH_VIEW }] },
    });
    expect(calls.added.flat()).toEqual([RECORD_LABEL]);
  });
});
