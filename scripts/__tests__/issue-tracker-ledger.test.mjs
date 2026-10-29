/**
 * The two closing ledgers' shared vocabulary (`scripts/issue-tracker-ledger.mjs`).
 *
 * These rules used to live inline in four `github-script` jobs, written out four
 * times, in a file no linter reads. The first cut of the product-view gate
 * therefore shipped a branch that filed `无需交付记录` waivers under the
 * missing-record ledger: the waiver regex never got the chance to run because the
 * record regex matched its substring first. The unit under test here is exactly
 * that precedence, the "one compliant record covers the issue" rule the workflow
 * delegates to, and the promise that no job has to hold its own prose.
 */
import { describe, expect, it } from "vitest";
import {
  commentCoversProductView,
  decideLedgerState,
  DELIVERY_RECORD_LABEL,
  ESCALATION_MARKERS,
  isRecordComment,
  isWaiverComment,
  LEDGER_CUTOFF_ISO,
  ledgerConfig,
  PRODUCT_VIEW_LABEL,
  productViewEscalation,
  productViewReminder,
  recordMissingEscalation,
  recordMissingReminder,
  STALE_DAYS,
} from "../issue-tracker-ledger.mjs";
import { PRODUCT_VIEW_ROLES } from "../check-product-view.mjs";

const USER = { type: "User" };
const BOT = { type: "Bot" };

const RECORD_WITHOUT_VIEW = "## 交付记录\n\n- 已合并 PR #962\n- 242 tests passed";
const RECORD_WITH_VIEW = `## 交付记录

## 产品视角

- 原本要解决什么用户可见问题：巡检结论只活在终端里
- 用户现在看到什么变化：每次运行都落盘一份可 diff 的 JSON
- 哪些行为或边界没有变：探源与判定规则未动`;

const WAIVER = "无需交付记录：拒绝项";

describe("labels", () => {
  it("are the two names CI writes and the docs point at", () => {
    expect(DELIVERY_RECORD_LABEL).toBe("delivery-record-missing");
    expect(PRODUCT_VIEW_LABEL).toBe("product-view-missing");
    expect(STALE_DAYS).toBe(3);
    expect(LEDGER_CUTOFF_ISO).toBe("2026-09-19T00:00:00Z");
  });
});

describe("waiver precedence", () => {
  it("reads a waiver as a waiver even though it contains the record marker", () => {
    const waiver = { user: USER, body: "无需交付记录：这是拒绝项" };
    expect(isWaiverComment(waiver)).toBe(true);
    expect(isRecordComment(waiver)).toBe(false);
  });

  it("accepts the English waiver spelling", () => {
    expect(isWaiverComment({ user: USER, body: "delivery-record-waived: duplicate" })).toBe(true);
  });

  it("does not read a normal record as a waiver", () => {
    expect(isWaiverComment({ user: USER, body: RECORD_WITHOUT_VIEW })).toBe(false);
    expect(isRecordComment({ user: USER, body: RECORD_WITHOUT_VIEW })).toBe(true);
  });
});

describe("bot comments never count", () => {
  it("rejects a bot record", () => {
    // The reminder CI posts itself contains the marker word, so a bot comment
    // that repeats it must not satisfy the very gate it complains about.
    expect(isRecordComment({ user: BOT, body: RECORD_WITH_VIEW })).toBe(false);
    expect(decideLedgerState([{ user: BOT, body: "无需交付记录" }]).hasWaiver).toBe(false);
  });

  it("tolerates a missing user object without throwing", () => {
    expect(isRecordComment({ body: RECORD_WITH_VIEW })).toBe(true);
    expect(isRecordComment(null)).toBe(false);
    expect(isRecordComment(undefined)).toBe(false);
  });
});

describe("commentCoversProductView", () => {
  it("is false for the #353 shape", () => {
    expect(commentCoversProductView({ body: RECORD_WITHOUT_VIEW })).toBe(false);
  });

  it("is true only when the section holds three substantive units", () => {
    expect(commentCoversProductView({ body: RECORD_WITH_VIEW })).toBe(true);
    expect(
      commentCoversProductView({
        body: "## 交付记录\n\n## 产品视角\n\n- 原本要解决什么用户可见问题：x\n- 用户现在看到什么变化：y",
      }),
    ).toBe(false);
  });

  it("uses the same judgement as the PR-body gate", async () => {
    const { evaluateCommentProductView } = await import("../check-product-view.mjs");
    for (const body of [RECORD_WITHOUT_VIEW, RECORD_WITH_VIEW, ""]) {
      expect(commentCoversProductView({ body })).toBe(evaluateCommentProductView(body).ok);
    }
  });
});

describe("ledgerConfig", () => {
  it("answers the constants without needing an issue", () => {
    const config = ledgerConfig();
    expect(config.labels).toEqual({
      deliveryRecord: "delivery-record-missing",
      productView: "product-view-missing",
    });
    expect(config.staleDays).toBe(3);
    expect(config.ledgerCutoff).toBe(LEDGER_CUTOFF_ISO);
    expect(config.markers).toEqual({
      record: "<!-- delivery-record-escalation -->",
      productView: "<!-- product-view-escalation -->",
    });
    // No owner, no escalation: a body addressed to nobody is worse than none.
    expect(config.escalations).toBeNull();
  });

  it("addresses the escalations to whoever asks, carrying their own dedup markers", () => {
    const config = ledgerConfig("0xPabloLI");
    expect(config.escalations.record.startsWith(ESCALATION_MARKERS.record)).toBe(true);
    expect(config.escalations.productView.startsWith(ESCALATION_MARKERS.productView)).toBe(true);
    expect(config.escalations.record).toContain("@0xPabloLI");
    expect(config.escalations.productView).toContain("@0xPabloLI");
    expect(config.escalations.record).toContain(
      `gh issue list --label ${DELIVERY_RECORD_LABEL} --state closed`,
    );
    expect(config.escalations.productView).toContain(
      `gh issue list --label ${PRODUCT_VIEW_LABEL} --state closed`,
    );
  });
});

describe("decideLedgerState", () => {
  it("reports no record, no waiver, nothing covered for an empty issue", () => {
    const state = decideLedgerState([]);
    expect(state).toMatchObject({
      hasWaiver: false,
      recordCount: 0,
      coversProductView: false,
    });
  });

  it("reports the #353 shape as a record that misses the product view", () => {
    const state = decideLedgerState([{ user: USER, body: RECORD_WITHOUT_VIEW }]);
    expect(state.recordCount).toBe(1);
    expect(state.coversProductView).toBe(false);
  });

  it("lets one compliant record cover an issue that also holds a bare one", () => {
    const state = decideLedgerState([
      { user: USER, body: RECORD_WITHOUT_VIEW },
      { user: USER, body: RECORD_WITH_VIEW },
    ]);
    expect(state.recordCount).toBe(2);
    expect(state.coversProductView).toBe(true);
  });

  it("keeps the waiver ahead of the record it contains", () => {
    const state = decideLedgerState([{ user: USER, body: WAIVER }]);
    expect(state.hasWaiver).toBe(true);
    expect(state.recordCount).toBe(0);
  });

  it("ignores bot records", () => {
    const state = decideLedgerState([{ user: BOT, body: RECORD_WITH_VIEW }]);
    expect(state.recordCount).toBe(0);
    expect(state.coversProductView).toBe(false);
  });

  it("carries both reminders, so the jobs hold no prose of their own", () => {
    const state = decideLedgerState([]);
    expect(state.productViewReminder).toBe(productViewReminder());
    expect(state.recordMissingReminder).toBe(recordMissingReminder());
  });
});

describe("the three roles have one wording", () => {
  it("the reminder, the escalation and the gate's report quote the same three roles", () => {
    // #353's failure mode was a rule everyone had read and nobody followed; the
    // second way to lose it is four surfaces asking for subtly different things.
    for (const text of [
      productViewReminder(),
      productViewEscalation("owner"),
      recordMissingReminder(),
      recordMissingEscalation("owner"),
    ]) {
      for (const role of PRODUCT_VIEW_ROLES) {
        expect(text).toContain(role);
      }
    }
  });

  it("names the ledger query with the label it actually writes", () => {
    expect(productViewReminder()).toContain(
      `gh issue list --label ${PRODUCT_VIEW_LABEL} --state closed`,
    );
    expect(recordMissingReminder()).toContain(
      `gh issue list --label ${DELIVERY_RECORD_LABEL} --state closed`,
    );
  });
});
