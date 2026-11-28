/**
 * #1528 R2 orchestration: one warm kernel across several content packs.
 *
 * The CLI (`tts-batch.mjs`) owns argument parsing, engine selection and the
 * concrete `runTtsOnly` call; everything that decides *order, reuse flags,
 * failure isolation and teardown* lives here so it can be tested without a
 * GPU, Kaggle or real content packs.
 *
 * Contract:
 *  - pack 1 opens the session (`reuseLiveSession: false`);
 *  - packs 2..n ride it (`reuseLiveSession: true`);
 *  - every pack but the last leaves the session open (`keepLiveSession`);
 *  - one pack failing marks its run failed and does NOT abort the batch;
 *  - the batch driver always closes the session once, at the end.
 *
 * #1566: when a session ledger handle is supplied, one `session.start` opens
 * the lane, every pack appends a `session.pack` carrying the shared `sessionId`
 * and its batch index, and one `session.end` closes it — the cross-pack reuse
 * that per-pack ledgers cannot show.
 */

import { UNKNOWN } from "./tts/ledger.mjs";

/**
 * @param {object} options
 * @param {string[]} options.contents - content dir names, in order
 * @param {object} options.engine - TTS engine with `setBatchMode`/`endLiveSession`
 * @param {(contentDir: string) => Promise<{meta: object, scenes: Array}>} options.loadPack
 * @param {(pack: object) => Promise<{runId: string}>} options.runPack
 * @param {(failure: {contentDir: string, pipelineId: string, runId: string|null, error: Error}) => void} [options.onPackFailed]
 * @param {string|null} [options.sessionId] - shared TTS session id (#1566)
 * @param {object|null} [options.sessionLedger] - `openTtsLedger` handle for
 *   `output/tts-sessions.jsonl`; absent = no session-level recording
 * @param {(line: string) => void} [options.log]
 * @param {(line: string) => void} [options.warn]
 * @returns {Promise<{summary: Array, ok: boolean}>}
 */
export async function runTtsBatch({
  contents,
  engine,
  loadPack,
  runPack,
  onPackFailed = () => {},
  sessionId = null,
  sessionLedger = null,
  log = () => {},
  warn = () => {},
}) {
  const summary = [];
  const batchStartMs = Date.now();
  const provider = engine.name ?? UNKNOWN;
  if (sessionId && sessionLedger) {
    sessionLedger.sessionStart({
      sessionId,
      provider,
      engineInfo: engine.info ?? null,
      contents,
    });
  }

  for (const [index, contentDir] of contents.entries()) {
    const isLast = index === contents.length - 1;
    const startedMs = Date.now();
    let pipelineId = contentDir;
    let runId = null;
    try {
      const { meta, scenes } = await loadPack(contentDir);
      pipelineId = meta?.pipelineId ?? contentDir;
      if (!Array.isArray(scenes) || scenes.length === 0) {
        throw new Error(`no scenes in content/${contentDir}/scene-data.mjs`);
      }

      engine.setBatchMode({ reuseLiveSession: index > 0 });
      const result = await runPack({
        contentDir,
        pipelineId,
        scenes,
        meta,
        reuseLiveSession: index > 0,
        keepLiveSession: !isLast,
        sessionId,
        batchIndex: index + 1,
        sessionReused: index > 0,
        onRunCreated: (id) => {
          runId = id;
        },
      });

      const seconds = (Date.now() - startedMs) / 1000;
      summary.push({
        contentDir,
        pipelineId,
        runId: result?.runId ?? runId,
        scenes: scenes.length,
        seconds,
        status: "ok",
      });
      sessionLedger?.sessionPack({
        sessionId,
        runId: summary.at(-1).runId,
        batchIndex: index + 1,
        contentDir,
        pipelineId,
        scenes: scenes.length,
        seconds,
        status: "ok",
      });
      log(`✅ ${contentDir} → ${summary.at(-1).runId} (${seconds.toFixed(1)}s)`);
    } catch (error) {
      const seconds = (Date.now() - startedMs) / 1000;
      warn(`❌ ${contentDir} failed: ${String(error.message).split("\n")[0]}`);
      try {
        onPackFailed({ contentDir, pipelineId, runId, error });
      } catch (markError) {
        warn(`  ⚠️  could not record failed run ${runId}: ${markError.message}`);
      }
      summary.push({
        contentDir,
        pipelineId,
        runId,
        status: "failed",
        error: error.message,
        seconds,
      });
      sessionLedger?.sessionPack({
        sessionId,
        runId,
        batchIndex: index + 1,
        contentDir,
        pipelineId,
        seconds,
        status: "failed",
        error: String(error.message).split("\n")[0],
      });
    }
  }

  // The driver owns the kernel lifetime: even an all-failed batch releases GPU.
  try {
    await engine.endLiveSession?.();
  } catch (error) {
    warn(`  ⚠️ [TTS Live] session close failed: ${error.message}`);
  }

  const ok = summary.every((row) => row.status === "ok");
  if (sessionId && sessionLedger) {
    sessionLedger.sessionEnd({
      sessionId,
      provider,
      packs: summary.length,
      ok,
      seconds: (Date.now() - batchStartMs) / 1000,
      status: ok ? "ok" : "failed",
      runIds: summary.map((row) => row.runId).filter(Boolean),
    });
  }

  return { summary, ok };
}

/**
 * Pure argument parser: `--content` may repeat; at least two packs are
 * required, because a single pack has nothing to amortize.
 *
 * @param {string[]} argv
 * @returns {{contents: string[], error: string|null}}
 */
export function parseBatchArgs(argv) {
  const contents = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--content") continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      return { contents, error: "--content needs a value" };
    }
    contents.push(value);
    i += 1;
  }
  if (contents.length < 2) {
    return {
      contents,
      error: "usage: tts-batch.mjs --content <dir> --content <dir> [--content ...]",
    };
  }
  return { contents, error: null };
}
