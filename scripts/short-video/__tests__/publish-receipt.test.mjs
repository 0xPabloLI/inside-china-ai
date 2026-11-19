import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildManualPendingAnalysis, buildPendingAnalysis } from "../lib/publish-utils.mjs";
import {
  PUBLISH_RECEIPT_STATE,
  detectRunIdFromPath,
  listRunReceipts,
  publishReceiptFile,
  readPublishReceipt,
  writePublishReceipt,
} from "../lib/publish-receipt.mjs";
import { createRun, markRun, RUN_STATUS } from "../lib/run-history.mjs";

const roots = [];

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "publish-receipt-"));
  roots.push(root);
  mkdirSync(join(root, "output"), { recursive: true });
  return root;
}

function makeRun(root, slug, runId, status = RUN_STATUS.RENDERED) {
  const run = createRun({ root, slug, runId });
  mkdirSync(join(run.dir, "publish", "tiktok"), { recursive: true });
  markRun({ root, slug, runId, status });
  return run;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe("publish receipt binding (#1432 S4)", () => {
  it("writes the receipt into the run directory, not the slug root", () => {
    const root = makeRoot();
    const run = makeRun(root, "qwen4", "r-20261119T043012-a1b2c3");

    const written = writePublishReceipt({
      root,
      slug: "qwen4",
      runId: run.runId,
      receipt: {
        publishMethod: "manual-guide",
        state: PUBLISH_RECEIPT_STATE.GUIDE,
        postGroupId: null,
        publishedAt: "2026-11-19T04:30:12.000Z",
        videoPath: join(run.dir, "video.mp4"),
      },
    });

    expect(written.path).toBe(publishReceiptFile(root, "qwen4", run.runId));
    expect(written.path).toBe(join(run.dir, "publish", "receipt.json"));
    expect(readPublishReceipt(root, "qwen4", run.runId)).toMatchObject({
      runId: run.runId,
      slug: "qwen4",
      publishMethod: "manual-guide",
      state: "guide",
      postGroupId: null,
    });
  });

  it("keeps two runs' postGroupIds apart in the audit listing", () => {
    const root = makeRoot();
    const first = makeRun(root, "qwen4", "r-20261119T043012-aaaaaa");
    const second = makeRun(root, "qwen4", "r-20261119T050000-bbbbbb");
    writePublishReceipt({
      root,
      slug: "qwen4",
      runId: first.runId,
      receipt: {
        publishMethod: "api",
        state: PUBLISH_RECEIPT_STATE.PUBLISHED,
        postGroupId: "grp-first",
        publishedAt: "2026-11-19T04:35:00.000Z",
      },
    });
    writePublishReceipt({
      root,
      slug: "qwen4",
      runId: second.runId,
      receipt: {
        publishMethod: "api",
        state: PUBLISH_RECEIPT_STATE.PUBLISHED,
        postGroupId: "grp-second",
        publishedAt: "2026-11-19T05:05:00.000Z",
      },
    });

    const listing = listRunReceipts({ root, slug: "qwen4" });
    expect(listing).toHaveLength(2);
    expect(listing.map((entry) => [entry.runId, entry.receipt?.postGroupId])).toEqual([
      [first.runId, "grp-first"],
      [second.runId, "grp-second"],
    ]);
  });

  it("lists runs without a receipt instead of hiding them", () => {
    const root = makeRoot();
    const run = makeRun(root, "qwen4", "r-20261119T043012-cccccc");
    const listing = listRunReceipts({ root, slug: "qwen4" });
    expect(listing).toHaveLength(1);
    expect(listing[0]).toMatchObject({ runId: run.runId, receipt: null });
  });

  it("refuses a run id that is not in the manifest", () => {
    const root = makeRoot();
    expect(() =>
      writePublishReceipt({
        root,
        slug: "qwen4",
        runId: "r-20261119T043012-dddddd",
        receipt: { publishMethod: "api", state: PUBLISH_RECEIPT_STATE.PUBLISHED },
      }),
    ).toThrow(/not in the manifest/);
  });

  it("detects the run id from a run-scoped video path", () => {
    expect(
      detectRunIdFromPath(
        "/repo/scripts/short-video/output/qwen4/runs/r-20261119T043012-a1b2c3/qwen4.mp4",
      ),
    ).toBe("r-20261119T043012-a1b2c3");
    expect(detectRunIdFromPath("/tmp/standalone.mp4")).toBeNull();
  });
});

describe("pending analysis run binding (#1432 S4)", () => {
  it("carries runId on the api record", () => {
    const record = buildPendingAnalysis("grp-1", "2026-11-19T04:30:12.000Z", {
      runId: "r-20261119T043012-a1b2c3",
    });
    expect(record.runId).toBe("r-20261119T043012-a1b2c3");
  });

  it("carries runId on the manual record and defaults to null", () => {
    const bound = buildManualPendingAnalysis({
      publishedAt: "2026-11-19T04:30:12.000Z",
      runId: "r-20261119T043012-a1b2c3",
    });
    expect(bound.runId).toBe("r-20261119T043012-a1b2c3");
    expect(
      buildManualPendingAnalysis({ publishedAt: "2026-11-19T04:30:12.000Z" }).runId,
    ).toBeNull();
  });
});
