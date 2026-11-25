/**
 * Demo cut provenance — the pipeline-side contract for external work clips.
 *
 * A contest package must land a real work demo, but "landed a demo" is not
 * enough: the same source can yield a good 8s tree shot or a useless 8s intro
 * silhouette. The choice used to live only in an agent's head, so a re-render
 * could silently swap the clip. This module makes the choice data:
 *
 *   meta.demoRequired = true
 *   meta.demoCuts = {
 *     4: {
 *       source: "scripts/short-video/output/external-demos/<full>.mp4",
 *       sourceDurationSec: 292.79,
 *       startSec: 34,
 *       endSec: 42,
 *       why: "what is on screen and why this window was chosen",
 *       audio: "source" | "ducked" | "silent",
 *       derivedAsset: "assets/<cut>.mp4",
 *     },
 *   }
 *
 * The gate checks that every evidence video has a record, the record fits the
 * source duration, the derived asset is what the scene actually plays, and the
 * audio policy agrees with `media.volume`. It cannot judge whether the shot is
 * beautiful; it prevents the shot from being chosen by accident and erased on
 * the next render.
 */

import { resolve } from "node:path";

const MIN_SEC = 4;
const MAX_SEC = 10;
const MIN_WHY = 24;
const AUDIO_POLICIES = new Set(["source", "ducked", "silent"]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function baseName(path) {
  return String(path ?? "")
    .split("/")
    .pop();
}

/**
 * @param {object} options
 * @param {Array} options.scenes
 * @param {object} options.meta
 * @param {string} options.contentDirAbs
 * @param {(path: string) => boolean} [options.fileExists]
 * @param {string} [options.repoRoot]
 * @returns {{rows: Array<{level: string, check: string, detail: string, fix?: string}>}}
 */
export function checkDemoCuts({
  scenes = [],
  meta = {},
  contentDirAbs,
  fileExists = (path) => path && path.length > 0,
  repoRoot,
} = {}) {
  const rows = [];
  const required = meta?.demoRequired === true;
  const cuts =
    meta?.demoCuts && typeof meta.demoCuts === "object" && !Array.isArray(meta.demoCuts)
      ? meta.demoCuts
      : {};
  const evidenceVideos = scenes.filter(
    (scene) => scene?.media?.type === "video" && scene?.mediaRole === "evidence",
  );
  const recordIds = Object.keys(cuts);

  if (!required && recordIds.length === 0) {
    return { rows };
  }

  if (required && evidenceVideos.length === 0) {
    rows.push({
      level: "fail",
      check: "Demo cut: an evidence video exists",
      detail: "meta.demoRequired is true but no scene binds a video with mediaRole:'evidence'",
      fix: "Bind the demo video to the payoff/peak scene as mediaRole:'evidence', or clear demoRequired.",
    });
  }

  for (const scene of evidenceVideos) {
    const record = cuts[String(scene.id)];
    if (!record) {
      rows.push({
        level: "fail",
        check: `Demo cut: scene ${scene.id} has a cut record`,
        detail:
          "evidence video without meta.demoCuts entry — the window is undocumented and can drift",
        fix: "Add meta.demoCuts[scene.id] with source/startSec/endSec/why/audio/derivedAsset; see content-pipeline.md Stage 0 'Demo 切段卡'.",
      });
    }
  }

  for (const id of recordIds) {
    const scene = scenes.find((candidate) => String(candidate.id) === id);
    const record = cuts[id];
    const label = `Demo cut: scene ${id}`;

    if (!scene) {
      rows.push({
        level: "fail",
        check: `${label} target exists`,
        detail: "demoCuts key does not match any scene id",
        fix: "Key demoCuts by the scene's numeric id.",
      });
      continue;
    }

    if (scene.media?.type !== "video" || scene.mediaRole !== "evidence") {
      rows.push({
        level: "fail",
        check: `${label} binds evidence video`,
        detail: "the record points at a scene that is not an evidence video",
        fix: "Only demo/evidence videos need a demo-cut record.",
      });
    }

    const source = typeof record?.source === "string" ? record.source : "";
    const sourceDurationSec = record?.sourceDurationSec;
    const startSec = record?.startSec;
    const endSec = record?.endSec;
    const why = typeof record?.why === "string" ? record.why.trim() : "";
    const audio = record?.audio;
    const derivedAsset = typeof record?.derivedAsset === "string" ? record.derivedAsset : "";

    if (!source) {
      rows.push({
        level: "fail",
        check: `${label} source is named`,
        detail: "the full source file is missing from the record",
        fix: "Point source at the full clip with its talk track, not a silent band slice.",
      });
    } else if (fileExists) {
      const candidates = [resolve(repoRoot ?? ".", source)];
      if (contentDirAbs) candidates.push(resolve(contentDirAbs, source));
      if (!candidates.some((candidate) => fileExists(candidate))) {
        rows.push({
          level: "warn",
          check: `${label} source file is available locally`,
          detail: `source not found: ${source}`,
          fix: "Keep the full source on disk (repo or content pack) so the window can be re-cut; record its path and archive it.",
        });
      }
    }

    if (!isFiniteNumber(sourceDurationSec) || sourceDurationSec <= 0) {
      rows.push({
        level: "fail",
        check: `${label} source duration is measured`,
        detail: "sourceDurationSec must be a positive number from ffprobe",
        fix: "Run ffprobe on the full source and record its duration in seconds.",
      });
    }

    if (!isFiniteNumber(startSec) || startSec < 0) {
      rows.push({
        level: "fail",
        check: `${label} start is valid`,
        detail: "startSec must be a non-negative number",
        fix: "Record the cut's actual start in seconds.",
      });
    }
    if (!isFiniteNumber(endSec)) {
      rows.push({
        level: "fail",
        check: `${label} end is valid`,
        detail: "endSec must be a number",
        fix: "Record the cut's actual end in seconds.",
      });
    }

    if (isFiniteNumber(startSec) && isFiniteNumber(endSec)) {
      const duration = endSec - startSec;
      if (duration < MIN_SEC || duration > MAX_SEC) {
        rows.push({
          level: "fail",
          check: `${label} window is ${MIN_SEC}–${MAX_SEC}s`,
          detail: `recorded ${duration.toFixed(2)}s`,
          fix: "A demo cut is one readable piece of work, not a highlight reel. Use 6–8s.",
        });
      }
      if (isFiniteNumber(sourceDurationSec) && endSec > sourceDurationSec + 0.5) {
        rows.push({
          level: "fail",
          check: `${label} end fits inside source`,
          detail: `end ${endSec}s > source ${sourceDurationSec}s`,
          fix: "Re-measure the source duration or move the window earlier.",
        });
      }
      if (startSec === 0) {
        rows.push({
          level: "warn",
          check: `${label} does not start on the intro`,
          detail: "startSec is 0 — confirm the first frames are not title/logo/blur",
          fix: "Start on a shot boundary after the intro unless frame 0 is already the work.",
        });
      }
    }

    if (why.length < MIN_WHY) {
      rows.push({
        level: "fail",
        check: `${label} why is recorded`,
        detail: "why must say what is on screen and why this window, not just 'demo'",
        fix: "Name the shot and the rejected alternative, e.g. '34–42s tree artwork; 0–8s is blurred intro'.",
      });
    }

    if (!AUDIO_POLICIES.has(audio)) {
      rows.push({
        level: "fail",
        check: `${label} audio policy is declared`,
        detail: `audio must be one of ${[...AUDIO_POLICIES].join(", ")}`,
        fix: "Use source for music/film/live sound, ducked when narration must speak, silent only for stage/crowd b-roll.",
      });
    } else {
      const volume = scene.media?.volume ?? 1;
      if (audio === "source" && volume <= 0) {
        rows.push({
          level: "fail",
          check: `${label} keeps the source audible`,
          detail: "audio:'source' but scene.media.volume is 0",
          fix: "Set volume > 0. The demo's own sound is part of the evidence.",
        });
      }
      if (audio === "silent" && volume > 0) {
        rows.push({
          level: "fail",
          check: `${label} silent policy matches volume`,
          detail: "audio:'silent' but scene.media.volume > 0",
          fix: "Set volume: 0 or record the actual audio policy.",
        });
      }
      if (audio === "ducked" && !scene.media?.duckUnderNarration) {
        rows.push({
          level: "fail",
          check: `${label} ducked policy is wired`,
          detail: "audio:'ducked' but duckUnderNarration is false",
          fix: "Set duckUnderNarration: true and duckLevel ≤ 0.25, or keep the source at full level.",
        });
      }
    }

    if (!derivedAsset) {
      rows.push({
        level: "fail",
        check: `${label} derived asset is named`,
        detail: "derivedAsset missing",
        fix: "Record the file the scene actually plays.",
      });
    } else {
      const expected = baseName(scene.media?.path);
      if (expected !== baseName(derivedAsset)) {
        rows.push({
          level: "fail",
          check: `${label} derived asset matches scene`,
          detail: `scene plays ${expected}, record says ${baseName(derivedAsset)}`,
          fix: "Point the scene and the record at the same cut file.",
        });
      }
      if (fileExists && contentDirAbs) {
        const derivedAbs = `${contentDirAbs}/${derivedAsset}`.replace(/\/+/g, "/");
        if (!fileExists(derivedAbs)) {
          rows.push({
            level: "fail",
            check: `${label} derived asset exists`,
            detail: `missing ${derivedAsset}`,
            fix: "Cut the window into content/<slug>/assets and update the scene path.",
          });
        }
      }
    }

    if (!rows.some((row) => row.check.startsWith(label))) {
      rows.push({
        level: "pass",
        check: `${label} provenance`,
        detail: `${startSec}–${endSec}s of ${baseName(source)} · audio ${audio} · ${baseName(derivedAsset)}`,
      });
    }
  }

  return { rows };
}

export const DEMO_CUT_LIMITS = { MIN_SEC, MAX_SEC, MIN_WHY, AUDIO_POLICIES };
