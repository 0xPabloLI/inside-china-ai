import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const MAX_ROUNDS = 3;
export const REPORT_FILENAME = "b-roll-report.json";

export function reportPath(outputDir) {
  return `${outputDir}/${REPORT_FILENAME}`;
}

export function emptyReport(content, threshold) {
  return {
    content,
    updatedAt: null,
    threshold,
    scenes: {},
  };
}

export function readReport(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeReport(filePath, report) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify({ ...report, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

export function promptHash(prompt) {
  return createHash("sha1").update(prompt, "utf8").digest("hex").slice(0, 12);
}

/**
 * Cache decision for a scene with a prior report entry.
 * Reuse only when the previous round won, the prompt is unchanged,
 * and the winner file still exists on disk.
 */
export function decideCache(entry, prompt, winnerFileExists) {
  if (!entry) return { reuse: false, reason: "no-report-entry" };
  if (entry.status !== "won") return { reuse: false, reason: `status-${entry.status}` };
  if (!entry.winner || !entry.winner.file) return { reuse: false, reason: "no-winner" };
  if (entry.promptHash !== promptHash(prompt)) return { reuse: false, reason: "prompt-changed" };
  if (!winnerFileExists) return { reuse: false, reason: "winner-file-missing" };
  return { reuse: true, reason: "cache-hit" };
}

// round = cumulative generation count for the scene.
export function nextRound(entry) {
  return entry ? entry.round + 1 : 1;
}

export function shouldRefuse(round) {
  return round > MAX_ROUNDS;
}

function formatScore(relevance) {
  return typeof relevance === "number" ? String(relevance) : "n/a";
}

/**
 * One verify-video line per scene in the report (spec #27) — the only
 * B-roll surface HITL sees. Won scenes pass; anything else warns with the
 * scores and the prompt-iteration fix. Pass `fileExists` to also catch a
 * won clip that has since been deleted from disk (#19).
 * #155: image entries share this summary — the non-won fix text names the
 * prompt field the scene's strategy reads (aiImage.prompt + 6-dimension
 * template for image strategies, aiVideo.prompt + 8-dimension otherwise).
 */
// Single source of truth: scene-rules.mjs exports the image strategy set
// (#155) — never mirror the literal set here.
import { IMAGE_GENERATING_STRATEGIES } from "../scene-rules.mjs";

export function summarizeBrollReport(report, { fileExists = null } = {}) {
  const scenes = report?.scenes;
  if (!scenes || typeof scenes !== "object") return [];
  const threshold = report.threshold;

  return Object.entries(scenes)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([id, entry]) => {
      const status = entry?.status ?? "pending";
      const head = `${entry?.strategy ?? "b-roll"} · ${status} · round ${entry?.round ?? 1}`;
      const check = `Scene ${id} B-roll`;
      const imageEntry = IMAGE_GENERATING_STRATEGIES.has(entry?.strategy);

      if (status === "won" && entry?.winner?.file) {
        const scored = (entry.candidates ?? []).find((c) => c.file === entry.winner.file);
        const relevance = scored?.relevance ?? entry.winner.relevance;
        const detail = `${head} · winner ${entry.winner.file} (relevance ${formatScore(relevance)})`;
        const missing = fileExists && !fileExists(entry.winner.file);
        return missing
          ? {
              level: "warn",
              check,
              detail: `${detail} · winner file missing`,
              fix: `Rerun: node generate-broll.mjs --content ${report.content ?? "<dir>"} --scene ${id} --force`,
            }
          : { level: "pass", check, detail };
      }

      const scores = (entry?.candidates ?? [])
        .map((c) => `${c.seed}:${formatScore(c.relevance)}`)
        .join(" ");
      const detail = [
        head,
        scores ? `scores ${scores}` : "no candidates",
        threshold !== undefined ? `threshold ${threshold}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const field = imageEntry ? "aiImage.prompt" : "aiVideo.prompt";
      const dimensions = imageEntry ? "6-dimension" : "8-dimension";
      return {
        level: "warn",
        check,
        detail,
        fix: `Rewrite ${field} for scene ${id} with the ${dimensions} template, then rerun: node generate-broll.mjs --content ${report.content ?? "<dir>"} --scene ${id}. Rounds beyond ${MAX_ROUNDS} escalate.`,
      };
    });
}
