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
export const TILE_SIZE = Object.freeze({ width: 270, height: 480 });
// Module-internal: no cross-module consumer, so knip treats an export as dead API.
const MAX_REVIEW_ROUNDS = 3;
const SEVERITIES = Object.freeze(["P0", "P1", "P2"]);

const blockingFindings = (findings) =>
  findings.filter((f) => f.severity === "P0" || f.severity === "P1");

/**
 * Split the flat frame ledger into fixed 3x4 sheets. A cell's grid address is
 * the frame-number evidence: the sheet is deliberately NOT labelled with
 * burned-in text (no font dependency), the ledger maps r1c1 -> frame N.
 *
 * @param {Array<object>} frames
 * @param {{cols:number,rows:number}} [layout]
 */
function groupIntoSheets(frames, layout = SHEET_LAYOUT) {
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
export function renderReviewRequest(
  plan,
  { contentId, videoPath, implementer, packetVersion = 1, round = 1 },
) {
  const lines = [
    `# QA final review — ${contentId}`,
    "",
    `Video: \`${videoPath}\``,
    `Packet version: ${packetVersion} · review round: ${round}.`,
    `Timeline: ${plan.fps} fps, ${plan.totalFrames} frames, ${plan.scenes.length} scenes.`,
    `Declaration: entry +${plan.declaration.entry} / exit -${plan.declaration.exit} ${plan.declaration.unit}.`,
    `Implementer: \`${implementer}\`.`,
    "",
    "## How to review",
    "",
    "You are an **independent** reviewer: your `reviewer` id must differ from the implementer above, which the packet records and the CLI checks — you cannot redefine it in the report.",
    "Read the sheets, then READ each still it points at. Cite every declared frame in `reviewedFrames`, even when there are no findings.",
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
        round,
        packetVersion,
        verdict: "pass",
        reviewedFrames: plan.frames.map((f) => f.frame),
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
  lines.push(
    "- `reviewedFrames` must contain every declared frame, with no extras — a pass with no cited frames is not a review.",
  );
  lines.push("- `severity` is P0, P1 or P2; P0/P1 means `changes-required`, not `pass`.");
  lines.push(
    `- \`round\` is 1..${MAX_REVIEW_ROUNDS} and must advance by one each time; a third round with P0/P1 stops delivery.`,
  );
  lines.push(
    "- `implementer` must equal the value above; the CLI compares it with the packet, not with your own JSON.",
  );
  lines.push(
    `- \`packetVersion\` must equal ${packetVersion}: a report for an older render of this pack is not a review of this packet.`,
  );
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
 * `expectedImplementer` comes from the packet, NOT from the report: otherwise
 * a reviewer could simply write a different implementer name and self-review
 * would pass. The packet's identity is fixed when the stills are built.
 *
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateReviewReport(
  report,
  plan,
  { expectedImplementer, expectedPacketVersion } = {},
) {
  const errors = [];
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return { ok: false, errors: ["report must be a JSON object"] };
  }
  const declared = new Set(plan.frames.map((f) => f.frame));
  const { reviewer, implementer, round, verdict, findings, reviewedFrames } = report;

  if (typeof expectedPacketVersion === "number" && report.packetVersion !== expectedPacketVersion) {
    errors.push(
      `packetVersion must be ${expectedPacketVersion}, got ${JSON.stringify(report.packetVersion)}`,
    );
  }

  if (typeof reviewer !== "string" || !reviewer.trim()) errors.push("reviewer is required");
  if (typeof implementer !== "string" || !implementer.trim()) {
    errors.push("implementer is required");
  }
  if (
    typeof expectedImplementer === "string" &&
    expectedImplementer.trim() &&
    implementer !== expectedImplementer
  ) {
    errors.push(
      `implementer must match the packet (${expectedImplementer}), got ${JSON.stringify(implementer)}`,
    );
  }
  const trustedImplementer = expectedImplementer ?? implementer;
  if (
    typeof reviewer === "string" &&
    typeof trustedImplementer === "string" &&
    reviewer.trim() &&
    reviewer.trim() === trustedImplementer.trim()
  ) {
    errors.push("reviewer must be independent of implementer (self-review rejected)");
  }
  if (!Number.isInteger(round) || round < 1 || round > MAX_REVIEW_ROUNDS) {
    errors.push(`round must be an integer 1..${MAX_REVIEW_ROUNDS}`);
  }
  if (!["pass", "changes-required"].includes(verdict)) {
    errors.push("verdict must be pass or changes-required");
  }
  // A report with zero findings still has to prove the frames were reviewed.
  const cited = Array.isArray(reviewedFrames) ? reviewedFrames : null;
  if (!cited) {
    errors.push("reviewedFrames must be an array of declared frame numbers");
  } else {
    const unique = [...new Set(cited)];
    const missing = plan.frames.map((f) => f.frame).filter((f) => !unique.includes(f));
    const extra = unique.filter((f) => !declared.has(f));
    if (missing.length > 0 || extra.length > 0) {
      errors.push(
        `reviewedFrames must cover exactly the declared frames (missing: ${missing.join(",") || "none"}; extras: ${extra.join(",") || "none"})`,
      );
    }
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
    if (blockingFindings(findings).length > 0 && verdict !== "changes-required") {
      errors.push("verdict must be changes-required when P0/P1 findings exist");
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Decide the delivery outcome from a (possibly pre-validated) report. */
export function decideReviewOutcome(report, plan, validation = validateReviewReport(report, plan)) {
  if (!validation.ok) return { status: "invalid", errors: validation.errors, blockers: [] };
  const blockers = blockingFindings(report.findings);
  if (blockers.length === 0) return { status: "pass", nextRound: null, blockers: [] };
  if (report.round >= MAX_REVIEW_ROUNDS) return { status: "exhausted", nextRound: null, blockers };
  return { status: "fix-required", nextRound: report.round + 1, blockers };
}

/**
 * ffmpeg argv for one sheet. The caller stages `framePaths` as `%02d.png`
 * (padding the last sheet with blank tiles) at `inputPattern`; keeping the
 * command a pure function makes the geometry testable without a renderer.
 */
export function buildSheetCommand({ framePaths, outPath, inputPattern }) {
  const { cols, rows } = SHEET_LAYOUT;
  const { width, height } = TILE_SIZE;
  if (!Array.isArray(framePaths) || framePaths.length === 0) {
    throw new Error("a sheet needs at least one frame");
  }
  if (framePaths.length > cols * rows) {
    throw new Error(`a ${cols}x${rows} sheet holds at most ${cols * rows} frames`);
  }
  const pattern = inputPattern ?? join(dirname(outPath), ".tiles", "%02d.png");
  const filter = [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
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
