/**
 * Materialize a run's TTS artifacts out of the shared cache (#1432 S2, #1531).
 *
 * The cache at `output/<slug>/audio/` is shared across runs and is an
 * ACCELERATOR, never a contract: a run must stay re-renderable from its own
 * directory after the cache changes. #1432 materialized only the takes
 * (`scene-*.wav`); the approved/candidate sidecars and the alignment pair
 * stayed cache-only, so Step 4.5 looked for `subtitle-timing.json` in the run,
 * found nothing, and failed closed on a legitimate cache hit — LingSante
 * `r-20261124T045718-2ba2b0` was hand-patched with two copied files (#1531).
 *
 * Materialized set, per run:
 *
 *  - `scene-<id>.wav` — hardlink (same volume, no extra bytes), copy otherwise;
 *  - `scene-<id>.tts-meta.json` / `scene-<id>.tts-candidate.json` — the take
 *    provenance `scene-audio.mjs` and the digital-human planner resolve
 *    through. Their `audioPath` is rewritten to the run copy: the sidecars
 *    record absolute cache paths, and scene-audio rejects any path outside the
 *    run's audio dir, so a verbatim copy would silently fall back to probing;
 *  - `subtitle-timing.json` + `subtitle-timing.meta.json` — the alignment
 *    contract Step 4 / Step 4.5 / `render-only --run` read.
 *
 * Existing run files always win. A repair realign writes into the run itself;
 * replacing that with an older cache copy would undo the repair.
 */
import { copyFileSync, existsSync, linkSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";

/** Provenance sidecars `scene-audio.mjs` resolves before extension probing. */
const SCENE_SIDECARS = [".tts-meta.json", ".tts-candidate.json"];

/** The forced-alignment pair — timing plus the signature that guards it. */
const ALIGNMENT_FILES = ["subtitle-timing.json", "subtitle-timing.meta.json"];

/** A bare file name: no separator, no parent hop, nothing that can climb out. */
const BARE_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Join a file name we built ourselves onto a directory this run owns.
 *
 * Both ends are pipeline-internal: `dir` is the run's `audio/` dir or the slug
 * cache dir handed over by `main.mjs`, and `name` is a scene id formatted from
 * `scenes` or `basename()` of a take path — no user text reaches it. The name is
 * validated to a bare file before the join, so a `../` can never be expressed;
 * the `nosemgrep` is on the syntactic sink only, not on an unchecked flow.
 *
 * @param {string} dir
 * @param {string} name
 * @returns {string}
 */
function runFile(dir, name) {
  if (!BARE_FILE_RE.test(String(name))) {
    throw new Error(`refusing to build a path from "${name}" — not a bare file name`);
  }
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  return join(dir, name);
}

/**
 * Place one cache file into the run without clobbering run-local work.
 *
 * @returns {"link"|"copy"|"present"|"missing"}
 */
function placeFile(src, dest) {
  if (existsSync(dest)) return "present";
  if (!existsSync(src)) return "missing";
  try {
    linkSync(src, dest);
    return "link";
  } catch {
    copyFileSync(src, dest);
    return "copy";
  }
}

/**
 * Copy a scene sidecar with `audioPath` re-bound to the run copy.
 *
 * The recorded digest stays valid — hardlink/copy shares the exact bytes — so
 * only the path field changes. A relative name keeps the run relocatable and
 * keeps `isInsideAudioDir()` satisfied.
 *
 * @returns {"rebound"|"present"|"missing"|"unreadable"}
 */
function placeSceneSidecar(src, dest, audioName) {
  if (existsSync(dest)) return "present";
  if (!existsSync(src)) return "missing";
  let meta;
  try {
    meta = JSON.parse(readFileSync(src, "utf8"));
  } catch {
    return "unreadable";
  }
  writeFileSync(dest, JSON.stringify({ ...meta, audioPath: audioName }));
  return "rebound";
}

/**
 * Make this run's audio directory self-contained.
 *
 * Mutates each result's `audioPath` to the run copy so every downstream reader
 * (subtitles, alignment, render staging, the manifest) sees the run path.
 *
 * @param {object} options
 * @param {Array<{sceneId: number, audioPath: string, duration: number}>} options.results
 * @param {string} options.cacheDir - shared `output/<slug>/audio`
 * @param {string} options.audioDir - this run's `runs/<runId>/audio`
 * @param {(line: string) => void} [options.log] - one line per placed artifact
 * @returns {{links: number, copies: number, sidecars: number, timing: string[]}}
 */
export function materializeRunAudio({ results, cacheDir, audioDir, log = () => {} }) {
  const summary = { links: 0, copies: 0, sidecars: 0, timing: [] };

  for (const result of results) {
    const name = basename(result.audioPath);
    const dest = runFile(audioDir, name);
    const outcome = placeFile(result.audioPath, dest);
    if (outcome === "link") {
      summary.links += 1;
      log(`  🔗 audio hardlink ${name}`);
    } else if (outcome === "copy") {
      summary.copies += 1;
      log(`  📄 audio copy ${name}`);
    }
    result.audioPath = dest;

    for (const suffix of SCENE_SIDECARS) {
      const src = runFile(cacheDir, `scene-${result.sceneId}${suffix}`);
      const destSidecar = runFile(audioDir, `scene-${result.sceneId}${suffix}`);
      const placed = placeSceneSidecar(src, destSidecar, name);
      if (placed === "rebound") {
        summary.sidecars += 1;
        log(`  🧾 sidecar ${basename(destSidecar)} (audioPath → ${name})`);
      } else if (placed === "unreadable") {
        log(`  ⚠️  sidecar ${basename(src)} unreadable — left in the cache`);
      }
    }
  }

  // A visual-only run has no takes and no alignment of its own: copying a
  // cache timing into it would hand the render a subtitle contract for audio
  // this run does not have.
  if (results.length === 0) return summary;

  for (const file of ALIGNMENT_FILES) {
    const outcome = placeFile(runFile(cacheDir, file), runFile(audioDir, file));
    if (outcome === "link" || outcome === "copy") {
      summary.timing.push(file);
      log(`  ${outcome === "link" ? "🔗" : "📄"} ${file} (${outcome})`);
    }
  }

  return summary;
}
