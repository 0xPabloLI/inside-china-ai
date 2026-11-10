/**
 * #735 — minimal final-review loop: two declared acceptance frames per scene,
 * a 3x4 QA sheet, and a frame-numbered report from an INDEPENDENT reviewer.
 *
 * Scope is the 2026-11-09 HITL decision (option A): the process increment,
 * not the quantitative thresholds. Static-segment / debris-index thresholds
 * need a vertical-format calibration on a real pack and are deliberately
 * absent. `contact_sheet.py` in the surveyed repos is PolyForm Noncommercial;
 * the tiling here is a fresh ffmpeg `tile` invocation, not a copy.
 *
 * The declaration is in RELATIVE frames inside each scene's clip window. The
 * absolute frame numbers come from lib/timeline.mjs, the same source as the
 * composition and the subtitle track, so a TTS retake moves the frame numbers
 * without invalidating the declaration.
 */
import { dirname, join } from "path";
import { FPS, TRANSITION_FRAMES, sceneTimeline, scheduleTotalFrames } from "./timeline.mjs";

/** Relative offsets (frames) from the start / end of a scene's clip window. */
export const ACCEPTANCE_OFFSETS = Object.freeze({ entry: 15, exit: 15 });
export const SHEET_LAYOUT = Object.freeze({ cols: 3, rows: 4 });
export const MAX_REVIEW_ROUNDS = 3;
export const SEVERITIES = Object.freeze(["P0", "P1", "P2"]);

/**
 * Split the flat frame ledger into fixed 3x4 sheets. A cell's grid address is
 * the frame-number evidence: the sheet is deliberately NOT labelled with
 * burned-in text (no font dependency), the ledger maps r1c1 -> frame N.
 *
 * @param {Array<object>} frames
 * @param {{cols:number,rows:number}} [layout]
 */
export function groupIntoSheets(frames, layout = SHEET_LAYOUT) {
  const { cols, rows } = layout;
  const size = cols * rows;
  const sheets = [];
  for (let start = 0; start < frames.length; start += size) {
    const cells = frames.slice(start, start + size).map((frame, i) => {
      const row = Math.floor(i / cols) + 1;
      const col = (i % cols) + 1;
      return { ...frame, row, col, grid: `r${row}c${col}` };
    });
    const index = sheets.length + 1;
    sheets.push({
      index,
      name: `sheet-${String(index).padStart(2, "0")}.jpg`,
      cells,
    });
  }
  return sheets;
}

/**
 * Turn scene durations into the acceptance-frame declaration.
 *
 * Fail-closed on: missing/zero durations, scenes too short to hold two
 * distinct frames, and any absolute frame outside the composition. The
 * composition is TransitionSeries-based, so a scene's safe window is
 * `[visualStartFrames, visualStartFrames + clipFrames)` — visualFrames adds
 * the transition overlap, which the series gives back when it overlaps.
 *
 * @param {Array<{sceneId:number,duration:number,voiceover?:string}>} sceneDurations
 * @param {{fps?:number,transitionOverlap?:number,offsets?:{entry:number,exit:number}}} [options]
 */
export function planAcceptanceFrames(sceneDurations, options = {}) {
  const {
    fps = FPS,
    transitionOverlap = TRANSITION_FRAMES,
    offsets = ACCEPTANCE_OFFSETS,
  } = options;

  if (!Array.isArray(sceneDurations) || sceneDurations.length === 0) {
    throw new Error("scene durations are required to plan acceptance frames");
  }
  for (const scene of sceneDurations) {
    if (
      !Number.isInteger(scene?.sceneId) ||
      typeof scene?.duration !== "number" ||
      !Number.isFinite(scene.duration) ||
      scene.duration <= 0
    ) {
      throw new Error(`invalid duration for scene ${scene?.sceneId ?? "?"}`);
    }
  }

  const schedule = sceneTimeline(
    sceneDurations.map(({ sceneId, duration }) => ({ sceneId, duration })),
    { fps, transitionOverlap },
  );
  const totalFrames = scheduleTotalFrames(schedule);

  const scenes = schedule.map((entry, i) => {
    const { sceneId, visualStartFrames, clipFrames } = entry;
    const entryRel = Math.min(offsets.entry, clipFrames - 1);
    const exitRel = Math.max(0, clipFrames - 1 - offsets.exit);
    if (entryRel >= exitRel) {
      throw new Error(
        `scene ${sceneId} is too short for two distinct acceptance frames (${clipFrames} frames)`,
      );
    }
    const voiceover = sceneDurations[i]?.voiceover ?? "";
    // `offset` / `offsetFrom` ARE the declaration and never change with TTS;
    // `relativeFrame` / `frame` are the derived positions for this take.
    const frames = [
      {
        label: "entry",
        offset: offsets.entry,
        offsetFrom: "start",
        relativeFrame: entryRel,
        frame: visualStartFrames + entryRel,
      },
      {
        label: "exit",
        offset: -offsets.exit,
        offsetFrom: "end",
        relativeFrame: exitRel,
        frame: visualStartFrames + exitRel,
      },
    ].map((f) => {
      if (f.frame < 0 || f.frame >= totalFrames) {
        throw new Error(
          `scene ${sceneId} ${f.label} frame ${f.frame} falls outside the ${totalFrames}-frame composition`,
        );
      }
      return {
        ...f,
        sceneId,
        voiceover,
        pngName: `frame-${f.frame}.png`,
      };
    });
    return { sceneId, visualStartFrames, clipFrames, voiceover, frames };
  });

  const frames = scenes.flatMap((s) => s.frames);
  return {
    fps,
    totalFrames,
    declaration: { ...offsets, unit: "relative frames inside each scene's clip window" },
    scenes,
    frames,
    sheets: groupIntoSheets(frames, SHEET_LAYOUT),
  };
}

/**
 * The independent reviewer's input packet. Every frame keeps its absolute
 * number, its grid address and the voiceover claim that the frame must
 * satisfy — the claim-versus-footage check no layout gate can make.
 */
export function renderReviewRequest(plan, { contentId, videoPath, implementer }) {
  const lines = [
    `# QA final review — ${contentId}`,
    "",
    `Video: \`${videoPath}\``,
    `Timeline: ${plan.fps} fps, ${plan.totalFrames} frames, ${plan.scenes.length} scenes.`,
    `Declaration: entry +${plan.declaration.entry} / exit -${plan.declaration.exit} ${plan.declaration.unit}.`,
    `Implementer: \`${implementer}\`.`,
    "",
    "## How to review",
    "",
    "You are an **independent** reviewer: your `reviewer` id must differ from the implementer above.",
    "Read the sheets, then READ each still it points at. Every finding cites the frame number.",
    "The sheets carry no burned-in labels; use the grid ledger below (r1c1 = top-left).",
    "Severity is P0 / P1 / P2. P0 or P1 requires a fix round; three rounds is the cap.",
    "",
  ];

  for (const sheet of plan.sheets) {
    lines.push(`## ${sheet.name}`, "");
    lines.push(`| | c1 | c2 | c3 |`, `| --- | --- | --- | --- |`);
    for (let row = 1; row <= SHEET_LAYOUT.rows; row += 1) {
      const cells = [];
      for (let col = 1; col <= SHEET_LAYOUT.cols; col += 1) {
        const cell = sheet.cells.find((c) => c.row === row && c.col === col);
        cells.push(
          cell ? `r${row}c${col}: frame ${cell.frame}<br>scene ${cell.sceneId} ${cell.label}` : "—",
        );
      }
      lines.push(`| r${row} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }

  lines.push("## Frame ledger", "");
  lines.push("| frame | scene | label | grid | still | voiceover claim |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const f of plan.frames) {
    const cell = plan.sheets
      .flatMap((s) => s.cells)
      .find((c) => c.frame === f.frame && c.sceneId === f.sceneId);
    const sheet = plan.sheets.find((s) => s.cells.includes(cell));
    lines.push(
      `| ${f.frame} | ${f.sceneId} | ${f.label} | ${sheet?.name ?? "—"} ${cell?.grid ?? "—"} | \`frames/${f.pngName}\` | ${f.voiceover.replace(/\|/g, "\\|") || "—"} |`,
    );
  }
  lines.push("");
  lines.push("## Report contract", "");
  lines.push("Write `final-review.json` next to this file:", "");
  lines.push("```json");
  lines.push(
    JSON.stringify(
      {
        reviewer: "independent-agent-id",
        implementer,
        round: 1,
        verdict: "pass",
        findings: [
          { frame: plan.frames[0]?.frame ?? 0, severity: "P0", evidence: "frame shows ..." },
        ],
      },
      null,
      2,
    ),
  );
  lines.push("```");
  lines.push("");
  lines.push(
    `- \`frame\` must be one of the declared frames: ${plan.frames.map((f) => f.frame).join(", ")}.`,
  );
  lines.push("- `severity` is P0, P1 or P2; P0/P1 means `changes-required`, not `pass`.");
  lines.push(`- \`round\` is 1..${MAX_REVIEW_ROUNDS}; a third round with P0/P1 stops delivery.`);
  lines.push(
    `node scripts/short-video/qa-final-review.mjs --content ${contentId} --report <final-review.json>`,
  );
  lines.push("");
  return lines.join("\n");
}

/**
 * Mechanical gate on the reviewer's report. It cannot judge taste, but it can
 * reject self-review, invented frame numbers, missing evidence and a verdict
 * that contradicts its own P0/P1 findings.
 *
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateReviewReport(report, plan) {
  const errors = [];
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return { ok: false, errors: ["report must be a JSON object"] };
  }
  const declared = new Set(plan.frames.map((f) => f.frame));
  const { reviewer, implementer, round, verdict, findings } = report;

  if (typeof reviewer !== "string" || !reviewer.trim()) errors.push("reviewer is required");
  if (typeof implementer !== "string" || !implementer.trim()) {
    errors.push("implementer is required");
  }
  if (
    typeof reviewer === "string" &&
    typeof implementer === "string" &&
    reviewer.trim() &&
    reviewer.trim() === implementer.trim()
  ) {
    errors.push("reviewer must be independent of implementer (self-review rejected)");
  }
  if (!Number.isInteger(round) || round < 1 || round > MAX_REVIEW_ROUNDS) {
    errors.push(`round must be an integer 1..${MAX_REVIEW_ROUNDS}`);
  }
  if (!["pass", "changes-required"].includes(verdict)) {
    errors.push("verdict must be pass or changes-required");
  }
  if (!Array.isArray(findings)) {
    errors.push("findings must be an array");
  } else {
    findings.forEach((finding, i) => {
      if (!Number.isInteger(finding?.frame) || !declared.has(finding.frame)) {
        errors.push(`finding ${i}: frame ${finding?.frame} is not a declared acceptance frame`);
      }
      if (!SEVERITIES.includes(finding?.severity)) {
        errors.push(`finding ${i}: severity must be P0, P1 or P2`);
      }
      if (typeof finding?.evidence !== "string" || !finding.evidence.trim()) {
        errors.push(`finding ${i}: evidence is required`);
      }
    });
    const blockers = findings.filter((f) => f.severity === "P0" || f.severity === "P1");
    if (blockers.length > 0 && verdict !== "changes-required") {
      errors.push("verdict must be changes-required when P0/P1 findings exist");
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Decide the delivery outcome from a validated report. */
export function decideReviewOutcome(report, plan) {
  const validation = validateReviewReport(report, plan);
  if (!validation.ok) return { status: "invalid", errors: validation.errors, blockers: [] };
  const blockers = report.findings.filter((f) => f.severity === "P0" || f.severity === "P1");
  if (blockers.length === 0) return { status: "pass", nextRound: null, blockers: [] };
  if (report.round >= MAX_REVIEW_ROUNDS) return { status: "exhausted", nextRound: null, blockers };
  return { status: "fix-required", nextRound: report.round + 1, blockers };
}

/**
 * ffmpeg argv for one sheet. The caller stages `framePaths` as `%02d.png`
 * (padding the last sheet with blank tiles) at `inputPattern`; keeping the
 * command a pure function makes the geometry testable without a renderer.
 */
export function buildSheetCommand({
  framePaths,
  outPath,
  inputPattern,
  cols = SHEET_LAYOUT.cols,
  rows = SHEET_LAYOUT.rows,
  tileWidth = 270,
  tileHeight = 480,
}) {
  if (!Array.isArray(framePaths) || framePaths.length === 0) {
    throw new Error("a sheet needs at least one frame");
  }
  if (framePaths.length > cols * rows) {
    throw new Error(`a ${cols}x${rows} sheet holds at most ${cols * rows} frames`);
  }
  const pattern = inputPattern ?? join(dirname(outPath), ".tiles", "%02d.png");
  const filter = [
    `scale=${tileWidth}:${tileHeight}:force_original_aspect_ratio=decrease`,
    `pad=${tileWidth}:${tileHeight}:(ow-iw)/2:(oh-ih)/2`,
    `tile=${cols}x${rows}`,
  ].join(",");
  return [
    "ffmpeg",
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-framerate",
    "1",
    "-start_number",
    "1",
    "-i",
    pattern,
    "-vf",
    filter,
    "-frames:v",
    "1",
    outPath,
  ];
}
