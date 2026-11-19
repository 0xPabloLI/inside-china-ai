/**
 * Publish receipts for run-scoped artifact history (#1432 S4).
 *
 * A run's publish package lives in its own directory, but until S4 the publish
 * record (`content/<slug>/pending-analysis.json`) only named the slug: two
 * runs of the same slug could not be told apart, and a second publish silently
 * replaced the first record. This module gives every publish attempt a
 * receipt *inside the run it belongs to*:
 *
 *   output/<slug>/runs/<runId>/publish/receipt.json
 *
 * The per-slug pending-analysis record stays the analytics workflow's single
 * active record (it gains a `runId` field), while the receipts preserve every
 * run's own publish method / postGroupId / publishedAt for auditing. That is
 * what lets `run-history.mjs receipts` answer "which receipt belongs to which
 * run" without crossing two runs of one slug.
 *
 * Decisions:
 * - A receipt is written for every explicit publish attempt: manual guide,
 *   CDP draft/prepared editor, Publora draft/scheduled/published.
 * - `postGroupId` is present but null when the method has no Publora draft
 *   (manual-guide / cdp), keeping one schema across methods.
 * - Only an actual Publora publish moves the run to PUBLISHED; guide and
 *   draft receipts deliberately leave the run's render status alone.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readJsonFile, isJsonObject, writeJsonAtomic } from "./json-file.mjs";
import { readManifest, runDir } from "./run-history.mjs";

export const PUBLISH_RECEIPT_STATE = Object.freeze({
  GUIDE: "guide",
  DRAFT: "draft",
  PREPARED: "prepared",
  SCHEDULED: "scheduled",
  PUBLISHED: "published",
});

const STATES = new Set(Object.values(PUBLISH_RECEIPT_STATE));
const RUN_PATH_PATTERN = /[\\/]runs[\\/](r-\d{8}T\d{6}-[0-9a-f]{6})[\\/]/;

/**
 * Extract a run id from an artifact path that lives under
 * `output/<slug>/runs/<runId>/`. Used by the publish CLIs so a video copied
 * from an older run pulls that run's package, instead of silently pairing it
 * with a newer `latest`.
 */
export function detectRunIdFromPath(pathLike) {
  if (!pathLike) return null;
  const match = String(pathLike).match(RUN_PATH_PATTERN);
  return match ? match[1] : null;
}

export function publishReceiptFile(root, slug, runId) {
  return join(runDir(root, slug, runId), "publish", "receipt.json");
}

function assertReceipt(record) {
  if (!isJsonObject(record)) throw new Error("publish receipt: record must be a JSON object");
  if (!STATES.has(record.state)) {
    throw new Error(`publish receipt: unknown state ${JSON.stringify(record.state)}`);
  }
  if (typeof record.publishMethod !== "string" || !record.publishMethod.trim()) {
    throw new Error("publish receipt: publishMethod is required");
  }
  if (record.postGroupId !== null && typeof record.postGroupId !== "string") {
    throw new Error("publish receipt: postGroupId must be a string or null");
  }
  if (record.publishedAt !== null && typeof record.publishedAt !== "string") {
    throw new Error("publish receipt: publishedAt must be an ISO string or null");
  }
  const published = record.publishedAt === null ? null : new Date(record.publishedAt);
  if (published && Number.isNaN(published.getTime())) {
    throw new Error(`publish receipt: publishedAt is not a date: ${record.publishedAt}`);
  }
}

/**
 * Write one receipt into the run it describes. Refuses a run that is not in
 * the manifest, so a receipt can never create a phantom artifact directory.
 *
 * @returns {{path: string, receipt: object}}
 */
export function writePublishReceipt({ root, slug, runId, receipt, now = new Date() } = {}) {
  const cleanRun = String(runId ?? "").trim();
  const manifest = readManifest(root, slug);
  const entry = manifest.runs.find((run) => run.runId === cleanRun);
  if (!entry) {
    throw new Error(`publish receipt: run ${cleanRun} is not in the manifest for ${slug}`);
  }
  assertReceipt(receipt);

  const file = publishReceiptFile(root, slug, cleanRun);
  const previous = existsSync(file) ? readPublishReceipt(root, slug, cleanRun) : null;
  const record = {
    runId: cleanRun,
    slug: String(slug),
    publishMethod: receipt.publishMethod,
    state: receipt.state,
    postGroupId: receipt.postGroupId ?? null,
    publishedAt: receipt.publishedAt ?? null,
    videoPath: receipt.videoPath ?? null,
    firstRecordedAt: previous?.firstRecordedAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  };
  mkdirSync(join(runDir(root, slug, cleanRun), "publish"), { recursive: true });
  writeJsonAtomic(file, record);
  return { path: file, receipt: record };
}

/** Read a run's receipt, or null when no publish attempt was recorded. */
export function readPublishReceipt(root, slug, runId) {
  const file = publishReceiptFile(root, slug, runId);
  if (!existsSync(file)) return null;
  const parsed = readJsonFile(file, "publish receipt");
  if (!isJsonObject(parsed)) {
    throw new Error(`publish receipt: ${file} is not a JSON object`);
  }
  return parsed;
}

/**
 * Audit view: every run in the manifest, in creation order, with its receipt.
 * A run without a receipt is listed as `receipt: null` rather than omitted —
 * "no publish attempt" is information the operator needs.
 */
export function listRunReceipts({ root, slug } = {}) {
  const manifest = readManifest(root, slug);
  return [...manifest.runs]
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")))
    .map((run) => ({
      runId: run.runId,
      status: run.status,
      createdAt: run.createdAt ?? null,
      updatedAt: run.updatedAt ?? null,
      receipt: readPublishReceipt(root, slug, run.runId),
      receiptPath: publishReceiptFile(root, slug, run.runId),
    }));
}
