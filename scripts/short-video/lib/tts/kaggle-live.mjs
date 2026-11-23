/**
 * #1515 — live Kaggle kernel control plane.
 *
 * The 5–6 minute model load is paid once per kernel push. A quality-gate
 * retry that re-pushes the kernel pays it again for four scenes. This module
 * is the host half of the "keep the kernel alive" protocol:
 *
 *   host -> kernel : secret GitHub gist (raw URL, `?cb=` cache-buster).
 *                   Request latency is ~27s — measured, not assumed.
 *   kernel -> host : `kaggle kernels logs -f` line stream. Mid-run
 *                   `kaggle kernels output` returns zero files, so this is the
 *                   only channel that actually delivers bytes mid-run.
 *
 * Both sides are deliberately boring: the gist carries only scene ids and
 * speed overrides (no copy), every take travels as lossless FLAC + sha256, and
 * the decoded PCM hash is compared against the hash computed on the kernel.
 * A live take is therefore byte-identical to the classic download, not
 * "close enough".
 *
 * @module tts/kaggle-live
 */

import { spawn } from "child_process";
import { createHash, randomUUID } from "crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createInterface } from "readline";
import { walkRiffChunks } from "../audio/wav.mjs";
import { ffmpegCmd } from "./ffmpeg-cmd.mjs";

const DEFAULT_KAGGLE_BIN = process.env.KAGGLE_BIN || "kaggle";

/** Marker prefixes emitted by kaggle/cosyvoice3_cuda_kernel.py. */
const MARK = {
  fileBegin: "__TTS_FILE_BEGIN__",
  fileChunk: "__TTS_FILE_CHUNK__",
  fileEnd: "__TTS_FILE_END__",
  batchEnd: "__TTS_BATCH_END__",
};

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Is the GitHub CLI usable? A failed probe is not an error: the engine simply
 * falls back to the classic one-shot path.
 */
async function isGhAvailable({ exec, log = () => {} } = {}) {
  try {
    const { stdout } = await exec("gh --version 2>&1");
    log(`  [TTS Live] gh available: ${String(stdout).split("\n")[0]}`);
    return true;
  } catch (err) {
    log(`  [TTS Live] gh unavailable (${err.message.split("\n")[0]}) — classic mode`);
    return false;
  }
}

function ghApiArgs(method, path, payloadFile) {
  return payloadFile
    ? `gh api -X ${method} ${path} --input "${payloadFile}"`
    : `gh api -X ${method} ${path}`;
}

/**
 * Create a secret gist as the host→kernel channel.
 *
 * Secret (not public) gist: discoverable only by URL, but not truly private.
 * That is acceptable because the payload is only `{requestId, batch, action,
 * sceneIds, speeds}` — no script, no copy, no credentials. The gist is deleted
 * when the session closes.
 *
 * @returns {Promise<{url: string, id: string, update: Function, close: Function}|null>}
 */
export async function createControlChannel({
  exec,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = () => {},
} = {}) {
  if (!(await isGhAvailable({ exec, log }))) return null;
  const id = randomUUID().slice(0, 8);
  const description = `tts-live-control ${id}`;

  const writePayload = (obj) => {
    const file = join(tmpdir(), `tts-live-${process.pid}-${Date.now()}-${randomUUID()}.json`);
    writeFileSync(file, JSON.stringify(obj));
    return file;
  };

  let createFile = null;
  try {
    createFile = writePayload({
      description,
      public: false,
      files: { "control.json": { content: JSON.stringify({ action: "wait" }) } },
    });
    const { stdout } = await exec(ghApiArgs("POST", "/gists", createFile), { timeout: 30000 });
    const body = JSON.parse(stdout);
    if (!body?.id || !body?.owner?.login) throw new Error("gist response carried no id/owner");
    // Stable raw URL: the versioned URL (raw/<sha>/control.json) would pin the
    // kernel to the CREATE revision and every PATCH would be invisible.
    const url = `https://gist.githubusercontent.com/${body.owner.login}/${body.id}/raw/control.json`;
    log(`  [TTS Live] control gist ${body.id} → ${url}`);

    const update = async (payload) => {
      let lastErr = null;
      for (let i = 0; i < 3; i += 1) {
        let file = null;
        try {
          file = writePayload({ files: { "control.json": { content: JSON.stringify(payload) } } });
          await exec(ghApiArgs("PATCH", `/gists/${body.id}`, file), { timeout: 30000 });
          log(`  [TTS Live] control → ${JSON.stringify(payload)}`);
          return true;
        } catch (err) {
          lastErr = err;
          await sleep(2000);
        } finally {
          if (file) rmSync(file, { force: true });
        }
      }
      throw new Error(`gist control update failed after 3 attempts: ${lastErr?.message}`);
    };

    const close = async () => {
      try {
        await exec(ghApiArgs("DELETE", `/gists/${body.id}`), { timeout: 30000 });
        log(`  [TTS Live] control gist ${body.id} deleted`);
      } catch (err) {
        log(`  [TTS Live] control gist delete failed (${err.message.split("\n")[0]}) — leaving it`);
      }
    };

    return { url, id: body.id, update, close };
  } catch (err) {
    log(`  [TTS Live] gist control unavailable (${err.message.split("\n")[0]}) — classic mode`);
    return null;
  } finally {
    if (createFile) rmSync(createFile, { force: true });
  }
}

/**
 * Follow `kaggle kernels logs -f` and assemble binary batches from marker
 * lines. `exec` is unusable here: promisify(exec) buffers up to 32MB and only
 * resolves at exit, while this stream is read continuously and can carry
 * several MB per batch.
 */
export function startLogStream({
  kernelId,
  spawnFn = spawn,
  bin = DEFAULT_KAGGLE_BIN,
  log = () => {},
}) {
  const child = spawnFn(bin, ["kernels", "logs", "-f", kernelId], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const batches = new Map();
  const waiters = [];
  const tail = [];
  let current = null; // {meta, chunks}
  let exited = false;
  let exitCode = null;
  let spawnError = null;
  let stopped = false;
  let resolveExit;
  const exitPromise = new Promise((resolve) => {
    resolveExit = resolve;
  });

  const remember = (line) => {
    tail.push(line);
    if (tail.length > 40) tail.shift();
  };
  const settleExit = (code, err) => {
    if (exited) return;
    exited = true;
    exitCode = code;
    spawnError = err ?? null;
    const reason = err
      ? `kernel log stream failed: ${err.message}`
      : `kernel log stream ended (exit ${code}) before the expected batch`;
    for (const w of waiters.splice(0))
      w.reject(new Error(`${reason}\n${tail.slice(-12).join("\n")}`));
    resolveExit();
  };

  const pendingFiles = [];
  const handleLine = (raw) => {
    const line = raw.replace(/\r$/, "");
    remember(line);
    const idx = (marker) => line.indexOf(marker);
    if (idx(MARK.fileBegin) >= 0) {
      const meta = JSON.parse(line.slice(idx(MARK.fileBegin) + MARK.fileBegin.length));
      current = { meta, chunks: [] };
      return;
    }
    if (idx(MARK.fileChunk) >= 0) {
      if (!current) throw new Error("file chunk before file begin");
      // Each chunk is independently base64-padded: decode then concatenate.
      // Joining the strings first fails the moment a chunk length is not a
      // multiple of 3 (padding lands mid-string and Buffer truncates).
      current.chunks.push(
        Buffer.from(line.slice(idx(MARK.fileChunk) + MARK.fileChunk.length).trim(), "base64"),
      );
      return;
    }
    if (idx(MARK.fileEnd) >= 0) {
      if (!current) throw new Error("file end before file begin");
      const end = JSON.parse(line.slice(idx(MARK.fileEnd) + MARK.fileEnd.length));
      const buf = Buffer.concat(current.chunks);
      if (buf.length !== current.meta.bytes) {
        throw new Error(
          `streamed take ${current.meta.name} is ${buf.length} bytes, expected ${current.meta.bytes}`,
        );
      }
      if (sha256(buf) !== (end.sha256 ?? current.meta.sha256)) {
        throw new Error(`streamed take ${current.meta.name} failed sha256 verification`);
      }
      pendingFiles.push({ meta: current.meta, buffer: buf });
      current = null;
      return;
    }
    if (idx(MARK.batchEnd) >= 0) {
      const summary = JSON.parse(line.slice(idx(MARK.batchEnd) + MARK.batchEnd.length));
      const files = new Map(pendingFiles.map((f) => [f.meta.name, f.buffer]));
      pendingFiles.length = 0;
      const batch = { batch: summary.batch, summary, files };
      batches.set(batch.batch, batch);
      for (const w of waiters.splice(0)) {
        if (batches.has(w.batch)) w.resolve(batches.get(w.batch));
        else waiters.push(w);
      }
    }
  };

  const stdout = createInterface({ input: child.stdout });
  stdout.on("line", (line) => {
    try {
      handleLine(line);
    } catch (err) {
      log(`  [TTS Live] stream parse error: ${err.message}`);
      child.kill();
      settleExit(null, err);
    }
  });
  const stderr = createInterface({ input: child.stderr });
  stderr.on("line", (line) => remember(`[stderr] ${line}`));

  child.on("error", (err) => settleExit(null, err));
  // `close`, not `exit`: exit fires before stdout drains, and a COMPLETE
  // kernel's final batch must be parsed before waiters are rejected.
  child.on("close", (code) => settleExit(code));

  const waitForBatch = (batch, timeoutMs) =>
    new Promise((resolve, reject) => {
      if (batches.has(batch)) return resolve(batches.get(batch));
      if (exited) {
        return reject(
          new Error(
            `kernel log stream already ended (${spawnError?.message ?? `exit ${exitCode}`}) ` +
              `before batch ${batch}\n${tail.slice(-12).join("\n")}`,
          ),
        );
      }
      const waiter = { batch, resolve, reject };
      const timer = setTimeout(() => {
        const idx = waiters.indexOf(waiter);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(
          new Error(
            `timed out after ${Math.round(timeoutMs / 1000)}s waiting for live batch ${batch}\n` +
              tail.slice(-12).join("\n"),
          ),
        );
      }, timeoutMs);
      const wrappedResolve = (value) => {
        clearTimeout(timer);
        resolve(value);
      };
      const wrappedReject = (err) => {
        clearTimeout(timer);
        reject(err);
      };
      waiter.resolve = wrappedResolve;
      waiter.reject = wrappedReject;
      waiters.push(waiter);
    });

  return {
    waitForBatch,
    waitForExit: (ms) => {
      // Clear the race timer when the kernel exits first: an uncleared 90s
      // timer keeps the host process alive long after the pipeline finished
      // (measured: one acceptance driver hung 90s past its RESULT line).
      let timer = null;
      return Promise.race([
        exitPromise.then(() => {
          if (timer) clearTimeout(timer);
          return true;
        }),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(false), ms);
        }),
      ]);
    },
    stop() {
      if (!stopped && !exited) {
        stopped = true;
        child.kill();
      }
    },
    get exited() {
      return exited;
    },
    get exitCode() {
      return exitCode;
    },
  };
}

/**
 * Write a live batch into a classic download-shaped directory:
 *   <dir>/output/<scene-N>.wav + <dir>/output/summary.json
 * then prove the transport: FLAC sha256 (already checked by the stream) and
 * decoded PCM sha256 must both match what the kernel computed.
 */
export async function materializeLiveBatch({ batch, dir, exec, log = () => {} }) {
  const outDir = join(dir, "output");
  mkdirSync(outDir, { recursive: true });
  const segments = batch.summary?.segments ?? [];
  for (const seg of segments) {
    if (seg.error) continue;
    const buf = batch.files.get(seg.output);
    if (!buf) {
      throw new Error(`live batch ${batch.batch} is missing bytes for ${seg.output}`);
    }
    const flacPath = join(dir, `${seg.sceneId}.flac`);
    writeFileSync(flacPath, buf);
    const wavPath = join(outDir, seg.output);
    const rate = seg.sampleRate || 24000;
    await exec(
      `"${ffmpegCmd}" -v error -y -i "${flacPath}" -ac 1 -ar ${rate} -c:a pcm_s16le "${wavPath}" 2>&1`,
    );
    if (seg.pcmSha256) {
      const wavBuf = readFileSync(wavPath);
      let pcm = null;
      walkRiffChunks(wavBuf, (id, size, offset) => {
        if (id === "data") pcm = wavBuf.subarray(offset + 8, offset + 8 + size);
      });
      if (!pcm) throw new Error(`decoded wav ${seg.output} has no data chunk`);
      if (sha256(pcm) !== seg.pcmSha256) {
        throw new Error(
          `live take ${seg.output} decoded to different PCM than the kernel produced ` +
            `(${sha256(pcm)} vs ${seg.pcmSha256}) — refusing to promote`,
        );
      }
    }
    log(`  [TTS Live] batch ${batch.batch} scene ${seg.sceneId}: ${seg.output} verified`);
  }
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(batch.summary, null, 2));
  return dir;
}
