/**
 * `scripts/product-view-section.mjs` — the final report quotes a judged section.
 *
 * §9 step 8 has three surfaces: the PR body, the closing comment, the final
 * report. The first two have mechanical gates (#810, #966). The third is chat
 * text, so CI has no input to judge and a harness hook can only guess from a
 * transcript. The answer is not a third gate but one fewer surface to author:
 * the report renders the section that already passed the gate, so what a reader
 * sees in the chat cannot say something different from what the ticket says.
 *
 * The tests below hold the two properties that make that claim true:
 *
 *   - the renderer picks a section the gate accepts, and refuses to print one it
 *     would reject (a renderer that prints a non-compliant section would turn the
 *     gate into decoration);
 *   - the failure path is loud and names the fix, because "no output" is exactly
 *     the silent failure this replaces.
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { evaluateCommentProductView } from "../check-product-view.mjs";
import { renderProductViewSection, parseArgs } from "../product-view-section.mjs";

const USER = { type: "User", login: "octocat" };
const BOT = { type: "Bot", login: "droid[bot]" };
/** GitHub's `author_association` values: write access vs. a stranger's comment. */
const OWNER = "OWNER";
const STRANGER = "NONE";

/** A comment fixture; `assoc` defaults to write access, the normal case. */
const userComment = (id, body, assoc = OWNER) => ({
  id,
  user: USER,
  author_association: assoc,
  body,
});
const botComment = (id, body) => ({ id, user: BOT, author_association: STRANGER, body });

const OLDER = `## 交付记录

## 产品视角

- 原本要解决什么用户可见问题：旧的巡检结论只活在终端里
- 用户现在看到什么变化：旧的每次运行落盘 JSON
- 哪些行为或边界没有变：旧的探源规则未动`;

const NEWER = `## 交付记录

## 产品视角

- 原本要解决什么用户可见问题：交付记录可以完全不讲用户
- 用户现在看到什么变化：关票缺三句就挂 product-view-missing
- 哪些行为或边界没有变：PR body 的判据与豁免一行未动`;

/** The #353 shape: a record with commits and evidence, nothing about users. */
const BARE_RECORD = "## 交付记录\n\n- 已合并 PR #962\n- 242 tests passed";

const WAIVER = "无需交付记录：拒绝项";

const SECTION_ONLY =
  "## 产品视角\n\n- 原本要解决什么用户可见问题：x 与 y\n- 用户现在看到什么变化：z 与 w";

/**
 * A `gh api` stand-in. It answers the two endpoints the renderer reads, and
 * throws on anything else so a third call cannot slip in unnoticed. `--slurp`
 * wraps every page in an outer array, which is the shape a single page has too.
 */
function fakeGh({ body = "", isPullRequest = false, comments = [], commentPages }) {
  const pages = commentPages ?? [comments];
  return (args) => {
    expect(args[0]).toBe("api");
    const endpoint = args.at(-1);
    if (endpoint.endsWith("/comments?per_page=100")) {
      // Both matter: without `--paginate` only page one is read, and without
      // `--slurp` the multi-page shape is a different structure entirely.
      expect(args).toContain("--paginate");
      expect(args).toContain("--slurp");
      return JSON.stringify(pages);
    }
    if (/\/issues\/\d+$/.test(endpoint)) {
      return JSON.stringify({
        number: 353,
        body,
        ...(isPullRequest ? { pull_request: { url: "https://example.invalid" } } : {}),
      });
    }
    throw new Error(`unexpected gh call: ${endpoint}`);
  };
}

const call = (options) => renderProductViewSection({ number: 353, repo: "owner/repo", ...options });

describe("renderProductViewSection — which section it quotes", () => {
  it("renders the newest compliant record comment, with the heading a reader expects", () => {
    const result = call({
      runGh: fakeGh({
        comments: [userComment(1, OLDER), userComment(2, NEWER)],
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.text.startsWith("## 产品视角\n")).toBe(false);
    expect(result.text).toContain("## 产品视角\n");
    expect(result.text).toContain("交付记录可以完全不讲用户");
    expect(result.text).not.toContain("旧的巡检结论");
    expect(result.source).toEqual({ kind: "comment", id: 2 });
  });

  it("prints a section the gate accepts, so quoting cannot launder a weak section", () => {
    // The round trip is the contract: whatever the report pastes, the same
    // counting that judged the record still judges it.
    const result = call({ runGh: fakeGh({ comments: [userComment(7, NEWER)] }) });
    expect(evaluateCommentProductView(result.text).ok).toBe(true);
  });

  it("falls back to the pull-request body when no record comment carries the section", () => {
    const result = call({
      runGh: fakeGh({
        isPullRequest: true,
        body: NEWER,
        comments: [userComment(8, BARE_RECORD)],
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.source).toEqual({ kind: "pr-body" });
    expect(result.text).toContain("关票缺三句就挂 product-view-missing");
  });

  it("prefers the record comment over the pull-request body, because the record is the ticket's account", () => {
    const result = call({
      runGh: fakeGh({
        isPullRequest: true,
        body: OLDER,
        comments: [userComment(9, NEWER)],
      }),
    });
    expect(result.source).toEqual({ kind: "comment", id: 9 });
  });

  it("reads every page, so a long ticket's newest record is not missed", () => {
    // The comments endpoint returns oldest first, so a record on page two is the
    // newest one. Reading only page one would fall back to the PR body — or fail —
    // while the ticket already carries the section.
    const result = call({
      runGh: fakeGh({
        isPullRequest: true,
        body: OLDER,
        commentPages: [[userComment(30, BARE_RECORD)], [userComment(31, NEWER)]],
      }),
    });
    expect(result.source).toEqual({ kind: "comment", id: 31 });
    expect(result.text).toContain("关票缺三句就挂 product-view-missing");
  });
});

describe("renderProductViewSection — what never counts as the source", () => {
  it("a section without the record marker is not a delivery record", () => {
    const result = call({
      runGh: fakeGh({ comments: [userComment(10, SECTION_ONLY)] }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("#353");
    expect(result.reason).toContain("record comment");
  });

  it("a bot comment is not a delivery record", () => {
    const result = call({ runGh: fakeGh({ comments: [botComment(11, NEWER)] }) });
    expect(result.ok).toBe(false);
  });

  it("names a repeated failure once, so two bare records do not read as two bugs", () => {
    const result = call({
      runGh: fakeGh({
        comments: [userComment(14, BARE_RECORD), userComment(15, BARE_RECORD)],
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("2 record comment(s)");
    expect(result.reason.match(/no product-view section/g)).toHaveLength(1);
  });

  it("an explicit waiver is not a delivery record, even when it carries a section", () => {
    const body = `无需交付记录：拒绝项\n\n${NEWER}`;
    const result = call({ runGh: fakeGh({ comments: [userComment(12, body)] }) });
    expect(result.ok).toBe(false);
  });

  it("a section the gate would reject is not rendered", () => {
    const twoUnits = `## 交付记录\n\n## 产品视角\n\n- 原本要解决什么用户可见问题：只有两条\n- 用户现在看到什么变化：第二条`;
    const result = call({ runGh: fakeGh({ comments: [userComment(13, twoUnits)] }) });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("substantive unit");
  });

  it("an issue with nothing at all fails loudly and names the fix", () => {
    const result = call({ runGh: fakeGh({ comments: [] }) });
    expect(result.ok).toBe(false);
    // The failure text is the instruction: post the record, then render.
    expect(result.reason).toContain("交付记录");
    expect(result.reason).toContain("#353");
    // An issue has no gate-checked body, so the message says there is none.
    expect(result.reason).toContain("no body to fall back to");
  });

  it("never quotes a commenter without write access, however compliant the text", () => {
    // The report presents the text as what the ticket says. A stranger's comment
    // passes the same structural check an injected line would, so it cannot be
    // the source; the message then says how many such comments were skipped.
    const result = call({
      runGh: fakeGh({ comments: [userComment(16, NEWER, STRANGER)] }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("write access");
    expect(result.reason).toContain("1 from other authors");
  });

  it("a writer's record still wins over a stranger's newer one", () => {
    const result = call({
      runGh: fakeGh({
        comments: [userComment(17, OLDER, OWNER), userComment(18, NEWER, "CONTRIBUTOR")],
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.source).toEqual({ kind: "comment", id: 17 });
  });

  it("says why the pull-request body did not qualify when there is no record at all", () => {
    // The body verdict used to be collected and then dropped whenever the ticket
    // had zero record comments, leaving the operator unable to tell whether the
    // fallback had been judged at all.
    const result = call({
      runGh: fakeGh({ isPullRequest: true, body: "## Summary\n\nno section here", comments: [] }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("the pull-request body:");
    expect(result.reason).toContain("no product-view section");
  });
});

describe("the rendered text carries where it came from", () => {
  it("opens with a source marker that the gate ignores when it counts", () => {
    // Quoting is not vouching: the marker travels with the paste so the text
    // never reads as the agent's own verified claim. It is an HTML comment, so
    // the gate strips it and counts the same section either way.
    const result = call({ runGh: fakeGh({ comments: [userComment(19, NEWER)] }) });
    expect(result.ok).toBe(true);
    expect(result.text.startsWith("<!-- product-view: source=comment:19")).toBe(true);
    expect(evaluateCommentProductView(result.text).ok).toBe(true);
  });
});

describe("parseArgs — silence would quote the wrong repository", () => {
  it("reads the number and both spellings of --repo", () => {
    expect(parseArgs(["810"])).toEqual({ number: 810, repo: undefined });
    expect(parseArgs(["810", "--repo", "owner/repo"])).toEqual({ number: 810, repo: "owner/repo" });
    expect(parseArgs(["--repo=owner/repo", "810"])).toEqual({ number: 810, repo: "owner/repo" });
  });

  it("rejects a valueless --repo instead of falling back to the working directory", () => {
    // Falling back means reading the cwd's repo: a section from the wrong
    // repository, reported as success.
    expect(() => parseArgs(["810", "--repo"])).toThrow(/owner\/name/);
    expect(() => parseArgs(["810", "--repo", "--paginate"])).toThrow(/owner\/name/);
    expect(() => parseArgs(["810", "--repo="])).toThrow(/owner\/name/);
    expect(() => parseArgs(["810", "--repo", "-x"])).toThrow(/owner\/name/);
  });

  it("rejects --repo twice, so the winner is never whichever came last", () => {
    expect(() => parseArgs(["810", "--repo", "a/b", "--repo", "c/d"])).toThrow(/twice/);
    expect(() => parseArgs(["810", "--repo=a/b", "--repo", "c/d"])).toThrow(/twice/);
  });

  it("rejects unknown flags and non-numbers", () => {
    expect(() => parseArgs(["810", "--verbose"])).toThrow(/unknown flag/);
    expect(() => parseArgs([])).toThrow(/number/);
    expect(() => parseArgs(["abc"])).toThrow(/number/);
    expect(() => parseArgs(["0"])).toThrow(/number/);
  });
});

describe("the CLI an agent actually runs", () => {
  const root = mkdtempSync(join(tmpdir(), "product-view-section-"));
  const script = join(import.meta.dirname, "..", "product-view-section.mjs");

  /** A `gh` on PATH answering the two endpoints from JSON files, not shell quotes. */
  function stubDir(name, comments, body) {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "comments.json"), JSON.stringify([comments]));
    writeFileSync(join(dir, "issue.json"), JSON.stringify({ number: 353, body }));
    const stub = join(dir, "gh");
    writeFileSync(
      stub,
      [
        "#!/bin/sh",
        'case "$*" in',
        `  *"/comments?"*) cat '${join(dir, "comments.json")}' ;;`,
        `  *) cat '${join(dir, "issue.json")}' ;;`,
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(stub, 0o755);
    return dir;
  }

  const withRecord = stubDir("with-record", [userComment(21, NEWER)], "");
  const empty = stubDir("empty", [], "");
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  /**
   * stdout, stderr and the exit status. `spawnSync` rather than `execFileSync`:
   * the latter only hands back stdout, and this contract puts provenance on
   * stderr — the assertion has to see it on the success path too.
   */
  const run = (bin, args) => {
    const result = spawnSync("node", [script, ...args], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status };
  };

  it("prints the section on stdout and its provenance on stderr", () => {
    const result = run(withRecord, ["353", "--repo", "owner/repo"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("## 产品视角\n");
    expect(evaluateCommentProductView(result.stdout).ok).toBe(true);
    // The source marker travels with a paste; the stderr line is for the operator.
    // Both name the comment the section came from, which is how it is audited.
    expect(result.stdout).toContain("<!-- product-view: source=comment:21");
    expect(result.stderr).toContain("source=comment:21");
  });

  it("exits 1 with an empty stdout when there is nothing compliant to quote", () => {
    // The whole point of this script is that its failure is loud: an agent that
    // forgets to render gets no output at all, not a plausible-looking one.
    const result = run(empty, ["353", "--repo", "owner/repo"]);
    expect(result.status, "the CLI exited 0 with nothing to quote").toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("no compliant");
  });

  it("exits 2 on a malformed command line, before touching gh", () => {
    const result = run(empty, ["353", "--repo"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage:");
  });
});

describe("the docs and the script cannot drift apart", () => {
  // The previous round shipped docs describing a `--comment` flag no job called.
  // A doc naming a command that does not walk the same path is that bug reversed:
  // the next agent follows it and gets nothing.
  const root = join(import.meta.dirname, "..", "..");

  it("§9 step 8 sends the report through the script, and the script is there", () => {
    const workflow = readFileSync(
      join(root, "docs", "agents", "implementation-workflow.md"),
      "utf8",
    );
    expect(workflow).toContain("scripts/product-view-section.mjs");
    expect(existsSync(join(root, "scripts", "product-view-section.mjs"))).toBe(true);
  });

  it("the tracker says the report is rendered, not restated", () => {
    const tracker = readFileSync(join(root, "docs", "agents", "issue-tracker.md"), "utf8");
    expect(tracker).toContain("scripts/product-view-section.mjs");
  });
});
