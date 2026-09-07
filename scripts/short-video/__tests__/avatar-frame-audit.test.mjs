// Avatar frame audit tests (#214 ticket 05).
//
// Deterministic fixture-driven coverage of the three-gate audit (spec
// Behavioral Scenario 6): safe-zone compliance / lip-movement presence /
// A/V sync. Every fixture video is SYNTHESIZED at test time with ffmpeg
// (same no-committed-binaries precedent as avatar-card-render.test.mjs):
// a dark static 1080×1920 background + a 420×550 "card" whose content is
// either fully dynamic (spatiotemporal luminance oscillation, std ≈32 — above
// the audit's strong-motion threshold), a static face, or a static face with
// an irregular pulsed mouth patch (matched by an irregular TTS-envelope tone) —
// no real model output, no network.
//
// The card overlay position encodes the scenario: AVATAR_CARD_RECT (compliant
// right-center), shifted down into the subtitle lane, shifted right into the
// action rail, shifted onto the bottom dead zone. The audit must name the
// intruded zone verbatim (ticket acceptance) and cite evidence frames.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import {
  AVATAR_CARD_RECT,
  CANVAS,
  SAFE_ZONES,
  SUBTITLE_LANE_BOTTOM,
  SUBTITLE_LANE_TOP,
} from "../lib/safe-zones.mjs";
import {
  AUDIT_FRAME_WIDTH,
  AV_SYNC_TOLERANCE_SECONDS,
  FRAME_AUDIT_RESULT_NAME,
  LIP_MIN_TEMPORAL_STD,
  auditDigitalHumanPackage,
  audioEnvelope,
  auditScene,
  evaluateLipGate,
  evaluateSafeZoneGate,
  evaluateSyncGate,
  protectedZones,
  readSceneDurationsForTimeline,
  subtitleGapBand,
  toLuminanceGrid,
  createVarianceAccumulator,
  accumulateFrame,
  varianceGridOf,
} from "../lib/avatar-frame-audit.mjs";
import { executePlan, readPlanFile } from "../lib/digital-human.mjs";
import { FFMPEG_PATH } from "../lib/upscale.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_DIR = join(__dirname, "..", "lib");

// ─── Fixture synthesis (all artifacts live in a tmp dir, removed after) ───

const FPS = 30;
const DUR = 4;
const CARD_W = 420;
const CARD_H = 550;

/**
 * Irregular speech-like on/off pattern shared by the moving mouth and the TTS
 * tone envelope: on-intervals 0.4s, 0.6s, 0.6s, 0.6s, 0.6s separated by 0.3s
 * gaps. The sync gate compares FIRST onsets, so the irregular rhythm is not
 * strictly required anymore — it is kept so a mis-detected onset can never
 * alias onto a later, periodic one.
 */
const MOUTH_ON = [
  [0, 0.4],
  [0.7, 1.3],
  [1.6, 2.2],
  [2.5, 3.1],
  [3.4, 4.0],
];
// Mouth patch rect INSIDE the card, in card-relative ratios (must sit inside
// the audit's MOUTH_REGION_RATIO 25-75% × 60-90%).
const PATCH = { x0: 0.3, x1: 0.7, y0: 0.65, y1: 0.85 };

function buildCardClip(outPath, kind) {
  const px = (r) => Math.round(r * CARD_W);
  const py = (r) => Math.round(r * CARD_H);
  const patchTest = `between(X,${px(PATCH.x0)},${px(PATCH.x1)})*between(Y,${py(PATCH.y0)},${py(PATCH.y1)})`;
  let args;
  if (kind === "dynamic") {
    // Fully dynamic card content — the safe-zone fixtures use it so the whole
    // card rect (not just a mouth patch) shows up in the variance map.
    // IMPORTANT: the oscillation amplitude must put every card pixel's
    // temporal std ABOVE the audit's STRONG_MOTION_THRESHOLD (25) — the
    // zone-intrusion logic only traces strong-motion components. testsrc2 was
    // tried here and is NOT suitable: much of its luminance varies by std
    // 8-25 (weak-dynamic only), so the card never registers as strong motion
    // and intrusion fixtures silently pass. 45/√2 ≈ 32 std mirrors the real
    // E2E card (median 33); the (X+Y) phase term makes it read as moving
    // texture rather than a uniform flicker.
    args = [
      "-f", "lavfi", "-i", `color=c=0x303030:s=${CARD_W}x${CARD_H}:r=${FPS}:d=${DUR},format=gray`,
      "-vf", "geq=lum='48+45*sin(N*0.9+(X+Y)*0.15)':cb=128:cr=128",
    ];
  } else if (kind === "moving") {
    // Static gray "face" + a mouth patch whose luminance VARIES EVERY FRAME
    // while "speaking" (frame-number driven). Sustained per-frame motion is
    // what a real talking head produces — a two-level pulse would only emit
    // diffs at the on/off transitions. The variation is centered on the
    // background luminance (48 ± 40, no DC jump at interval edges): an edge
    // spike several times the in-speech energy would alias the sync
    // cross-correlation onto the edge rhythm instead of the utterance.
    const onExpr = MOUTH_ON.map(([a, b]) => `between(N,${Math.round(a * FPS)},${Math.round(b * FPS) - 1})`).join("+");
    args = [
      "-f", "lavfi", "-i", `color=c=0x303030:s=${CARD_W}x${CARD_H}:r=${FPS}:d=${DUR},format=gray`,
      // NOTE the parens around the on/off sum: without them the amplitude
      // would multiply only the LAST between() term (a + b * c == a + (b*c)).
      "-vf", `geq=lum='if(${patchTest},48+(${onExpr})*(40*sin(N*2.4)),48)':cb=128:cr=128`,
    ];
  } else {
    // Fully static card (static face + static mouth patch) — the "static face
    // fake video" fixture.
    args = [
      "-f", "lavfi", "-i", `color=c=0x303030:s=${CARD_W}x${CARD_H}:r=${FPS}:d=${DUR},format=gray`,
      "-vf", `geq=lum='if(${patchTest},200,48)':cb=128:cr=128`,
    ];
  }
  execFileSync(
    FFMPEG_PATH,
    [...args, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "28", "-y", outPath],
    { stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 },
  );
}

function buildToneWav(outPath, { delayMs = 0 } = {}) {
  // TTS stand-in: 440Hz tone with the SAME irregular envelope as the mouth.
  const onExpr = MOUTH_ON.map(([a, b]) => `between(t,${a},${b})`).join("+");
  // Multiply by the sum of between() gates (0/1) — no if(), whose unescaped
  // commas would be treated as lavfi filter separators.
  const expr = `0.6*sin(2*PI*440*t)*(${onExpr.replaceAll(",", "\\,")})`;
  const base = ["-f", "lavfi", "-i", `aevalsrc=${expr}:s=16000:d=${DUR}`, "-c:a", "pcm_s16le", "-y", outPath];
  if (delayMs > 0) {
    execFileSync(FFMPEG_PATH, ["-f", "lavfi", "-i", `aevalsrc=${expr}:s=16000:d=${DUR}`, "-af", `adelay=${delayMs}:all=1`, "-c:a", "pcm_s16le", "-y", outPath], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60_000,
    });
  } else {
    execFileSync(FFMPEG_PATH, base, { stdio: ["pipe", "pipe", "pipe"], timeout: 60_000 });
  }
}

/** Compose the final fixture: card overlaid at (x,y) on a static dark background, optional audio track. */
function buildFixtureVideo(outPath, cardClip, x, y, audioPath) {
  const args = [
    "-y",
    "-f", "lavfi", "-i", `color=c=0x14141e:s=${CANVAS.width}x${CANVAS.height}:r=${FPS}:d=${DUR}`,
    "-i", cardClip,
    ...(audioPath ? ["-i", audioPath] : []),
    "-filter_complex", `[0][1]overlay=x=${x}:y=${y}[v]`,
    "-map", "[v]",
    ...(audioPath ? ["-map", "2:a", "-c:a", "aac", "-shortest"] : []),
    "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "28",
    outPath,
  ];
  execFileSync(FFMPEG_PATH, args, { stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 });
}

// ─── Shared fixture state ───

let rootDir;
let cardMoving;
let cardStatic;
let cardDynamic;
let alignedWav;
let delayedWav;
const fixtures = {};

beforeAll(() => {
  rootDir = mkdtempSync(join(tmpdir(), "t05-frame-audit-"));
  cardMoving = join(rootDir, "card-moving.mp4");
  cardStatic = join(rootDir, "card-static.mp4");
  cardDynamic = join(rootDir, "card-dynamic.mp4");
  alignedWav = join(rootDir, "tone-aligned.wav");
  delayedWav = join(rootDir, "tone-delayed.wav");
  buildCardClip(cardMoving, "moving");
  buildCardClip(cardStatic, "static");
  buildCardClip(cardDynamic, "dynamic");
  buildToneWav(alignedWav);
  buildToneWav(delayedWav, { delayMs: 400 });

  const make = (name, card, x, y, audio) => {
    const p = join(rootDir, `${name}.mp4`);
    buildFixtureVideo(p, card, x, y, audio);
    fixtures[name] = p;
  };
  // AVATAR_CARD_RECT = {x:460, y:598} — the compliant right-center card.
  make("compliant", cardMoving, AVATAR_CARD_RECT.x, AVATAR_CARD_RECT.y, alignedWav);
  make("zone-subtitle", cardDynamic, AVATAR_CARD_RECT.x, 750, null); // bottom 1300 ∈ lane [1188,1350]
  make("zone-rail", cardDynamic, 530, AVATAR_CARD_RECT.y, null); // right edge 950 > rail 880
  make("zone-bottom", cardDynamic, AVATAR_CARD_RECT.x, 1370, null); // card 1370-1920 ⊃ bottom zone [1520,1920]
  make("lip-static", cardStatic, AVATAR_CARD_RECT.x, AVATAR_CARD_RECT.y, null);
  make("lip-moving", cardMoving, AVATAR_CARD_RECT.x, AVATAR_CARD_RECT.y, null);
  make("sync-delayed", cardMoving, AVATAR_CARD_RECT.x, AVATAR_CARD_RECT.y, delayedWav);
}, 300_000);

afterAll(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

/** Run auditScene against a fixture with the standard single-scene parameters. */
function auditFixture(name, { audioPath = null } = {}) {
  const evidenceDir = join(rootDir, `evidence-${name}`);
  return auditScene({
    videoPath: fixtures[name],
    sceneId: 1,
    sceneStartSeconds: 0,
    sceneAudioDurationSeconds: DUR,
    presentIntervals: null,
    audioPath,
    evidenceDir,
  });
}

const gate = (result, name) => result.gates.find((g) => g.gate === name);

// ─── Gate 1: safe-zone compliance (fixtures) ───

describe("safe-zone gate (fixtures, spec Scenario 6)", () => {
  it("compliant right-center card PASSES with no zone named", async () => {
    const r = await auditFixture("compliant", { audioPath: alignedWav });
    const g = gate(r, "safe-zone");
    expect(g.status).toBe("pass");
    expect(g.detail).not.toMatch(/intrudes/);
    expect(g.metrics.presenceRatio).toBeGreaterThan(0.02);
    expect(g.evidence.length).toBeGreaterThan(0);
    expect(g.evidence.every((p) => existsSync(p))).toBe(true);
  });

  it("card intruding the burned-subtitle lane FAILS naming the lane", async () => {
    const r = await auditFixture("zone-subtitle");
    const g = gate(r, "safe-zone");
    expect(g.status).toBe("fail");
    expect(g.detail).toContain("burned-subtitle lane");
    expect(r.ok).toBe(false);
  });

  it("card intruding the right action rail FAILS naming the rail", async () => {
    const r = await auditFixture("zone-rail");
    const g = gate(r, "safe-zone");
    expect(g.status).toBe("fail");
    expect(g.detail).toContain("TikTok right action rail");
  });

  it("card sitting on the bottom dead zone FAILS naming the CTA area zone", async () => {
    const r = await auditFixture("zone-bottom");
    const g = gate(r, "safe-zone");
    expect(g.status).toBe("fail");
    expect(g.detail).toContain("bottom dead zone (platform caption / CTA area)");
    // No playing content at the declared rect either — both findings reported.
    expect(g.findings.some((f) => f.kind === "card-missing")).toBe(true);
  });
});

// ─── Gate 2: lip movement (fixtures) ───

describe("lip gate (fixtures)", () => {
  it("static-face card FAILS the lip check", async () => {
    const r = await auditFixture("lip-static");
    const lip = gate(r, "lip-sync");
    expect(lip.status).toBe("fail");
    expect(lip.detail).toContain("no lip movement");
    expect(lip.metrics.meanStd).toBeLessThan(LIP_MIN_TEMPORAL_STD);
    // A fully static card also means the safe-zone gate cannot see a playing card.
    expect(gate(r, "safe-zone").status).toBe("fail");
  });

  it("moving-mouth card PASSES the lip check", async () => {
    const r = await auditFixture("lip-moving");
    const lip = gate(r, "lip-sync");
    expect(lip.status).toBe("pass");
    expect(lip.metrics.meanStd).toBeGreaterThanOrEqual(LIP_MIN_TEMPORAL_STD);
    expect(gate(r, "safe-zone").status).toBe("pass");
  });

  it("without scene audio the sync gate skips instead of failing", async () => {
    const r = await auditFixture("lip-moving");
    const sync = gate(r, "av-sync");
    expect(sync.status).toBe("skip");
  });
});

// ─── Gate 3: A/V sync (fixtures) ───

describe("av-sync gate (fixtures)", () => {
  it("aligned TTS envelope vs mouth movement PASSES at ~0 offset", async () => {
    const r = await auditFixture("compliant", { audioPath: alignedWav });
    const sync = gate(r, "av-sync");
    expect(sync.status).toBe("pass");
    expect(Math.abs(sync.metrics.offsetSeconds)).toBeLessThanOrEqual(AV_SYNC_TOLERANCE_SECONDS);
    // All three gates green on the fully compliant fixture — the ticket's
    // "合规右中卡片 → 审计 PASS" end-to-end case.
    expect(r.ok).toBe(true);
  });

  it("TTS delayed 400ms FAILS with a negative offset beyond tolerance", async () => {
    const r = await auditFixture("sync-delayed", { audioPath: delayedWav });
    const sync = gate(r, "av-sync");
    expect(sync.status).toBe("fail");
    expect(sync.metrics.offsetSeconds).toBeLessThan(-AV_SYNC_TOLERANCE_SECONDS);
    expect(sync.detail).toContain("audio lags mouth");
    // The offset must measure the DELIBERATE 400ms delay, not just "some" drift.
    expect(Math.abs(sync.metrics.offsetSeconds + 0.4)).toBeLessThan(0.1);
  });
});

// ─── Package-level audit (plan → result JSON, publish-chain contract) ───

describe("auditDigitalHumanPackage (plan-level)", () => {
  /** Build a real package + v1 plan through the ticket-03 exports. */
  function makePackage({ toneWav }) {
    const contentRoot = join(rootDir, `pkg-content-${Math.random().toString(36).slice(2)}`);
    const outputRoot = join(rootDir, `pkg-output-${Math.random().toString(36).slice(2)}`);
    const pkg = join(contentRoot, "t05-audit");
    const audioDir = join(outputRoot, "t05-audit", "audio");
    const { mkdirSync } = require("fs");
    mkdirSync(pkg, { recursive: true });
    mkdirSync(audioDir, { recursive: true });
    writeFileSync(join(pkg, "meta.mjs"), `export const meta = { pipelineId: "t05-audit" };\n`);
    writeFileSync(
      join(pkg, "scene-data.mjs"),
      `export const scenes = [{ id: 1, voiceover: "W1 W2 W3", avatar: {} }];\n`,
    );
    cpSync(toneWav, join(audioDir, "scene-1.wav"));
    writeFileSync(
      join(audioDir, "scene-1.tts-meta.json"),
      JSON.stringify({ duration: DUR, audioPath: "scene-1.wav" }),
    );
    writeFileSync(join(audioDir, "scene-durations.json"), JSON.stringify([{ sceneId: 1, duration: DUR }]));
    return { contentRoot, outputRoot, pkg };
  }

  it("compliant fixture → audit ok=true, result JSON written", async () => {
    const { contentRoot, outputRoot } = makePackage({ toneWav: alignedWav });
    const planResult = await executePlan({ contentSlug: "t05-audit", contentRoot, outputRoot });
    expect(planResult.outcome).toBe("written");
    const plan = readPlanFile(planResult.planPath);
    const result = await auditDigitalHumanPackage({
      plan,
      videoPath: fixtures.compliant,
      outputDir: join(outputRoot, "t05-audit"),
      totalSceneCount: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.totals.scenesPassed).toBe(1);
    expect(existsSync(result.resultPath)).toBe(true);
    expect(result.resultPath).toContain(FRAME_AUDIT_RESULT_NAME);
  });

  it("rail-intruding fixture → audit ok=false, failedGates name the zone; result JSON still written", async () => {
    const { contentRoot, outputRoot } = makePackage({ toneWav: alignedWav });
    const planResult = await executePlan({ contentSlug: "t05-audit", contentRoot, outputRoot });
    const plan = readPlanFile(planResult.planPath);
    const result = await auditDigitalHumanPackage({
      plan,
      videoPath: fixtures["zone-rail"],
      outputDir: join(outputRoot, "t05-audit"),
      totalSceneCount: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.totals.failedGates.some((f) => f.gate === "safe-zone" && /action rail/.test(f.detail))).toBe(true);
    expect(existsSync(result.resultPath)).toBe(true);
  });
});

// ─── CLI subcommand (real subprocess, T6 wiring surface) ───

describe("digital-human.mjs audit subcommand", () => {
  function makeCliPackage({ toneWav, pipelineId }) {
    const contentRoot = join(rootDir, `cli-content-${pipelineId}`);
    const outputRoot = join(rootDir, `cli-output-${pipelineId}`);
    const pkg = join(contentRoot, pipelineId);
    const audioDir = join(outputRoot, pipelineId, "audio");
    const { mkdirSync } = require("fs");
    mkdirSync(pkg, { recursive: true });
    mkdirSync(audioDir, { recursive: true });
    writeFileSync(join(pkg, "meta.mjs"), `export const meta = { pipelineId: "${pipelineId}" };\n`);
    writeFileSync(
      join(pkg, "scene-data.mjs"),
      `export const scenes = [{ id: 1, voiceover: "W1 W2 W3", avatar: {} }];\n`,
    );
    cpSync(toneWav, join(audioDir, "scene-1.wav"));
    writeFileSync(
      join(audioDir, "scene-1.tts-meta.json"),
      JSON.stringify({ duration: DUR, audioPath: "scene-1.wav" }),
    );
    writeFileSync(join(audioDir, "scene-durations.json"), JSON.stringify([{ sceneId: 1, duration: DUR }]));
    return { contentRoot, outputRoot };
  }

  it("compliant render → exit 0 and per-gate PASS lines", async () => {
    const { contentRoot, outputRoot } = makeCliPackage({ toneWav: alignedWav, pipelineId: "t05-cli-pass" });
    const planResult = await executePlan({ contentSlug: "t05-cli-pass", contentRoot, outputRoot });
    const res = spawnSync(
      process.execPath,
      [join(LIB_DIR, "..", "digital-human.mjs"), "audit", "--plan", planResult.planPath, "--video", fixtures.compliant],
      { encoding: "utf8", timeout: 180_000 },
    );
    expect(res.status, res.stderr || res.stdout).toBe(0);
    expect(res.stdout).toContain("[safe-zone] PASS");
    expect(res.stdout).toContain("[lip-sync] PASS");
    expect(res.stdout).toContain("[av-sync] PASS");
    expect(existsSync(join(outputRoot, "t05-cli-pass", "avatar", FRAME_AUDIT_RESULT_NAME))).toBe(true);
  }, 240_000);

  it("rail-intruding render → exit 1, gate + zone named, evidence dir cited (not publish-chain-eligible)", async () => {
    const { contentRoot, outputRoot } = makeCliPackage({ toneWav: alignedWav, pipelineId: "t05-cli-fail" });
    const planResult = await executePlan({ contentSlug: "t05-cli-fail", contentRoot, outputRoot });
    const res = spawnSync(
      process.execPath,
      [join(LIB_DIR, "..", "digital-human.mjs"), "audit", "--plan", planResult.planPath, "--video", fixtures["zone-rail"]],
      { encoding: "utf8", timeout: 180_000 },
    );
    expect(res.status).toBe(1);
    expect(res.stdout).toContain("TikTok right action rail");
    expect(res.stderr).toContain("must NOT enter the publish chain");
  }, 240_000);
});

// ─── Pure-function units (no ffmpeg) ───

/** Synthetic variance grid helper: 270×480 std grid with painted dynamic blobs.
 *  Blob rects accept either {w,h} or {width,height} (expectedGrid uses the latter).
 *  The amp is written to ALL RGB channels — single-channel writes dilute the
 *  luminance swing (0.299×) and undercut the strong-motion threshold. */
function syntheticVarianceGrid(blobs) {
  const width = AUDIT_FRAME_WIDTH;
  const height = 480;
  const acc = createVarianceAccumulator(width, height);
  for (let f = 0; f < 4; f++) {
    const data = Buffer.alloc(width * height * 4, 20);
    for (const blob of blobs) {
      const bw = blob.w ?? blob.width ?? 0;
      const bh = blob.h ?? blob.height ?? 0;
      for (let yy = blob.y; yy < blob.y + bh; yy++) {
        for (let xx = blob.x; xx < blob.x + bw; xx++) {
          const i = (width * yy + xx) << 2;
          const v = f % 2 === 0 ? 20 + blob.amp : 20; // alternating → std ≈ amp/2
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
        }
      }
    }
    accumulateFrame(acc, toLuminanceGrid({ width, height, data }));
  }
  return varianceGridOf(acc);
}

const SCALE = AUDIT_FRAME_WIDTH / CANVAS.width; // 0.25

describe("protected-zone geometry", () => {
  it("zones derive from safe-zones.mjs constants only", () => {
    const zones = Object.fromEntries(protectedZones().map((z) => [z.id, z.rect]));
    expect(zones["top nav band"]).toEqual({ x: 0, y: 0, width: 1080, height: SAFE_ZONES.top });
    expect(zones["TikTok right action rail"].x).toBe(CANVAS.width - SAFE_ZONES.right);
    expect(zones["burned-subtitle lane"]).toEqual({
      x: 0, y: SUBTITLE_LANE_TOP, width: 1080, height: SUBTITLE_LANE_BOTTOM - SUBTITLE_LANE_TOP,
    });
    expect(zones["bottom dead zone (platform caption / CTA area)"].y).toBe(1520);
  });

  it("subtitle gap band spans [card bottom limit, lane top)", () => {
    const band = subtitleGapBand().rect;
    expect(band.y).toBe(SUBTITLE_LANE_TOP - 40);
    expect(band.y + band.height).toBe(SUBTITLE_LANE_TOP);
  });
});

describe("safe-zone gate (pure)", () => {
  const expectedGrid = {
    x: Math.round(AVATAR_CARD_RECT.x * SCALE),
    y: Math.round(AVATAR_CARD_RECT.y * SCALE),
    width: Math.round(AVATAR_CARD_RECT.width * SCALE),
    height: Math.round(AVATAR_CARD_RECT.height * SCALE),
  };

  it("motion confined to the expected card rect passes", () => {
    const grid = syntheticVarianceGrid([{ ...expectedGrid, amp: 120 }]);
    const g = evaluateSafeZoneGate({ varGrid: grid, scale: SCALE, expectedRect: AVATAR_CARD_RECT });
    expect(g.status).toBe("pass");
  });

  it("DISPLACED card deep in the action rail fails naming the rail (card-missing + zone blob)", () => {
    // Physical model: the card is ONE clipped rect — a displaced card leaves
    // the declared rect EMPTY (no rect blob painted here) and shows up as a
    // strong-motion blob inside the rail zone.
    const grid = syntheticVarianceGrid([
      { x: 240, y: 160, w: 20, h: 120, amp: 120 }, // grid x≥240 = canvas ≥960, well past rail edge 880
    ]);
    const g = evaluateSafeZoneGate({ varGrid: grid, scale: SCALE, expectedRect: AVATAR_CARD_RECT });
    expect(g.status).toBe("fail");
    expect(g.detail).toContain("TikTok right action rail");
    expect(g.findings.some((f) => f.kind === "card-missing")).toBe(true);
  });

  it("karaoke-style motion INSIDE the lane (clean gap band) does NOT fail — subtitle false-positive guard", () => {
    const laneGridY = Math.round(SUBTITLE_LANE_TOP * SCALE);
    const laneGridEnd = Math.round(SUBTITLE_LANE_BOTTOM * SCALE);
    const grid = syntheticVarianceGrid([
      { ...expectedGrid, amp: 120 }, // the card itself
      { x: 40, y: laneGridY + 2, w: 160, h: laneGridEnd - laneGridY - 4, amp: 120 }, // subtitles in-lane
    ]);
    const g = evaluateSafeZoneGate({ varGrid: grid, scale: SCALE, expectedRect: AVATAR_CARD_RECT });
    expect(g.status).toBe("pass");
    expect(g.metrics.zones["burned-subtitle lane"].gapBandRatio).toBeLessThanOrEqual(0.01);
  });

  it("card crossing the gap band into the lane fails naming the lane", () => {
    const laneGridY = Math.round(SUBTITLE_LANE_TOP * SCALE);
    const grid = syntheticVarianceGrid([
      { ...expectedGrid, amp: 120 },
      // Vertical stripe from inside the card rect down 30 rows INTO the lane —
      // the crossing signature (20 cols × 30 rows ≈ 5.4% of the lane area,
      // above the 2% intrusion ratio).
      { x: expectedGrid.x + 40, y: expectedGrid.y + 20, w: 20, h: laneGridY + 30 - (expectedGrid.y + 20), amp: 120 },
    ]);
    const g = evaluateSafeZoneGate({ varGrid: grid, scale: SCALE, expectedRect: AVATAR_CARD_RECT });
    expect(g.status).toBe("fail");
    expect(g.detail).toContain("burned-subtitle lane");
  });
});

describe("lip gate (pure)", () => {
  const mouthGrid = { x: 0, y: 0, width: 40, height: 40 };
  const gridOf = (lumAt) => {
    const width = 100;
    const height = 100;
    const lum = new Float32Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) lum[width * y + x] = lumAt(x, y);
    return { width, height, lum };
  };

  it("motion inside the mouth rect passes", () => {
    const grids = [gridOf((x) => x), gridOf((x) => 100 - x)];
    const g = evaluateLipGate(grids, mouthGrid);
    expect(g.status).toBe("pass");
    expect(g.metrics.meanStd).toBeGreaterThanOrEqual(LIP_MIN_TEMPORAL_STD);
  });

  it("static mouth with background motion elsewhere still fails (motion ≠ lip movement)", () => {
    // Mouth rect (y<40) holds the SAME constant in both frames; only the
    // background (y≥50) moves — the gate must not credit it as lip movement.
    const grids = [gridOf((x, y) => (y < 50 ? 50 : x)), gridOf((x, y) => (y < 50 ? 50 : 100 - x))];
    const g = evaluateLipGate(grids, mouthGrid);
    expect(g.status).toBe("fail");
    expect(g.metrics.meanStd).toBeLessThan(LIP_MIN_TEMPORAL_STD);
  });

  it("fewer than 2 frames fails closed", () => {
    expect(evaluateLipGate([gridOf(() => 1)], mouthGrid).status).toBe("fail");
  });
});

describe("audio envelope + sync gate (pure)", () => {
  it("envelope of a constant tone is flat and non-zero", () => {
    const sr = 8000;
    const samples = new Float32Array(sr);
    for (let i = 0; i < sr; i++) samples[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr);
    const env = audioEnvelope({ sampleRate: sr, samples }, 10);
    expect(env.length).toBe(10);
    expect(env[0]).toBeGreaterThan(0.3);
  });

  // Delta-train series with a realistic mouth inter-frame diff energy — it must
  // exceed LIP_ACTIVE_DIFF (4) or the gate skips the series as "flat mouth".
  const series = (onsets, t0) =>
    onsets.map((t) => ({ time: t0 + t, energy: 30 }));

  it("aligned mouth/audio peaks at offset 0 and passes", () => {
    const on = [0.2, 0.9, 1.8, 2.6];
    const g = evaluateSyncGate({
      mouthSeries: series(on, 0.05),
      audioSeries: series(on, 0.05),
    });
    expect(g.status).toBe("pass");
    expect(Math.abs(g.metrics.offsetSeconds)).toBeLessThan(0.01);
  });

  it("audio delayed 0.4s measures offset −0.4 (audio lags mouth) and fails", () => {
    const mouth = series([0.2, 0.9, 1.8, 2.6], 0.05);
    const audio = series([0.2, 0.9, 1.8, 2.6], 0.45);
    const g = evaluateSyncGate({ mouthSeries: mouth, audioSeries: audio });
    expect(g.status).toBe("fail");
    expect(g.metrics.offsetSeconds).toBeCloseTo(-0.4, 5);
    expect(g.detail).toContain("audio lags mouth");
  });

  it("flat mouth signal skips (lip gate owns that failure)", () => {
    const flat = [0.1, 0.2, 0.3, 0.4].map((t) => ({ time: t, energy: 1 }));
    const g = evaluateSyncGate({ mouthSeries: flat, audioSeries: series([0.1, 0.2, 0.3, 0.4], 0) });
    expect(g.status).toBe("skip");
  });

  it("fewer than 4 aligned samples skips", () => {
    const g = evaluateSyncGate({ mouthSeries: series([0.1, 0.2], 0), audioSeries: series([0.1, 0.2], 0) });
    expect(g.status).toBe("skip");
  });

  it("exactly-at-tolerance offset passes (boundary epsilon)", () => {
    // The default tolerance (0.15s) is not representable on the 0.1s
    // correlation grid, so pin an integer lag: audio leads by exactly 2
    // samples and the gate gets tolerance 0.2 — the boundary must pass.
    const on = [0.2, 0.9, 1.8, 2.6];
    const g = evaluateSyncGate({
      mouthSeries: series(on, 0.05),
      audioSeries: series(on, 0.05 - 2 * 0.1),
      tolerance: 0.2,
    });
    expect(g.status).toBe("pass");
    expect(g.metrics.offsetSeconds).toBeCloseTo(0.2, 5);
  });
});

describe("readSceneDurationsForTimeline", () => {
  it("reads scene-durations.json and fails closed when scenes are missing", () => {
    const dir = join(rootDir, `durations-${Math.random().toString(36).slice(2)}`);
    const { mkdirSync } = require("fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "scene-durations.json"),
      JSON.stringify([{ sceneId: 2, duration: 3 }, { sceneId: 1, duration: 4 }]),
    );
    expect(readSceneDurationsForTimeline(dir, 2)).toEqual([
      { sceneId: 1, duration: 4 },
      { sceneId: 2, duration: 3 },
    ]);
    expect(() => readSceneDurationsForTimeline(dir, 3)).toThrow(/only 2 of 3 scene durations/);
  });

  it("falls back to per-scene tts-meta.json when the aggregate file is absent", () => {
    const dir = join(rootDir, `meta-fallback-${Math.random().toString(36).slice(2)}`);
    const { mkdirSync } = require("fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "scene-1.tts-meta.json"), JSON.stringify({ duration: 5.5 }));
    writeFileSync(join(dir, "unrelated.json"), JSON.stringify({ duration: 99 }));
    expect(readSceneDurationsForTimeline(dir, 1)).toEqual([{ sceneId: 1, duration: 5.5 }]);
  });
});
