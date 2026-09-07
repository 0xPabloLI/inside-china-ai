/**
 * CosyVoice3 NPU (Ascend 910B) engine adapter for AtomGit Notebook.
 *
 * Runs CosyVoice3 on AtomGit NPU 910B (32GB HBM, free) via Jupyter REST API.
 * NPU uses CPU EP for ONNX (no CUDA EP), but torch_npu for model computation.
 *
 * Workflow:
 *   1. Build manifest from scenes (text + instruct_text with <|endofprompt|>)
 *   2. Embed manifest + ref audio (base64) into NPU kernel script
 *   3. Upload script to AtomGit Jupyter via REST API
 *   4. Execute script and poll for completion
 *   5. Download output WAVs via REST API
 *   6. Post-process (resample 44.1kHz) and return results
 *
 * Requirements:
 *   - AtomGit Notebook running with NPU 910B + 32GB CPU tier
 *   - Jupyter URL + token configured (COSYVOICE3_NPU_JUPYTER_URL/TOKEN)
 *   - torch_npu pre-installed in Notebook environment
 *
 * License: Apache-2.0 (CosyVoice3) — commercial OK.
 */

import { exec } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { ROOT_DIR } from "./types.mjs";
import { postProcessBatch } from "./post-process.mjs";

const execAsync = promisify(exec);

// ── Config ──
const NPU_KERNEL_TEMPLATE = join(ROOT_DIR, "npu", "cosyvoice3_npu_kernel.py");
const NPU_JUPYTER_URL = process.env.COSYVOICE3_NPU_JUPYTER_URL || "";
const NPU_JUPYTER_TOKEN = process.env.COSYVOICE3_NPU_JUPYTER_TOKEN || "";
const NPU_TIMEOUT_MS = parseInt(process.env.COSYVOICE3_NPU_TIMEOUT_MS || "1800000", 10); // 30 min
const CV3_REF_AUDIO = join(ROOT_DIR, "voice-samples", "voice-sample-24k.wav");

// ── Emotion instructions (same as Kaggle CUDA — NPU uses PyTorch instruct format) ──
const INSTRUCT_MAP = {
  hook: "You are a helpful assistant. Speak with an excited and shocked tone, as if breaking incredible news.<|endofprompt|>",
  narrative:
    "You are a helpful assistant. Speak with a calm and measured tone, like a narrator.<|endofprompt|>",
  data: "You are a helpful assistant. Speak with a clear and informative tone, emphasizing key data points.<|endofprompt|>",
  cta: "You are a helpful assistant. Speak with an energetic and persuasive tone, encouraging the listener to act now.<|endofprompt|>",
};

export function resolveInstructForScene(scene) {
  const style = scene?.refStyle || scene?.visualType;
  if (!style) return undefined;
  return INSTRUCT_MAP[style];
}

export function buildCV3NpuManifest(scenes) {
  return scenes.map((s) => {
    const entry = {
      sceneId: s.id,
      text: s.voiceover,
      output: `scene-${s.id}.wav`,
    };
    const instruct = resolveInstructForScene(s);
    if (instruct) {
      entry.instruct_text = instruct;
    }
    return entry;
  });
}

/**
 * Check if NPU adapter is available (Jupyter URL + token configured).
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (!existsSync(NPU_KERNEL_TEMPLATE)) return false;
  if (!existsSync(CV3_REF_AUDIO)) return false;
  if (!NPU_JUPYTER_URL || !NPU_JUPYTER_TOKEN) return false;
  return true;
}

/**
 * Upload file to Jupyter via Contents API.
 * @param {string} path - relative path in Jupyter workspace
 * @param {string} content - file content (string or base64)
 * @param {boolean} isBinary
 */
async function jupyterUpload(path, content, isBinary = false) {
  const body = JSON.stringify({
    type: "file",
    format: isBinary ? "base64" : "text",
    content,
  });
  await execAsync(
    `curl -s -X PUT "${NPU_JUPYTER_URL}/api/contents/${path}" ` +
      `-H "Authorization: token ${NPU_JUPYTER_TOKEN}" ` +
      `-H "Content-Type: application/json" -d '${body.replace(/'/g, "'\\''")}'`,
  );
}

/**
 * Execute code in Jupyter kernel via REST API and poll for completion.
 * @param {string} code
 * @returns {Promise<string>} stdout from execution
 */
async function jupyterExecute(code) {
  // Create kernel
  const { stdout: kernelResp } = await execAsync(
    `curl -s -X POST "${NPU_JUPYTER_URL}/api/kernels" ` +
      `-H "Authorization: token ${NPU_JUPYTER_TOKEN}" ` +
      `-H "Content-Type: application/json" -d '{"name":"python3"}'`,
  );
  const kernel = JSON.parse(kernelResp);
  const kernelId = kernel.id;

  try {
    // Execute via websocket-like REST endpoint (Jupyter >7.0)
    // Fall back to creating a notebook and running it
    const body = JSON.stringify({ code });
    const { stdout } = await execAsync(
      `curl -s -X POST "${NPU_JUPYTER_URL}/api/kernels/${kernelId}/execute ` +
        `-H "Authorization: token ${NPU_JUPYTER_TOKEN}" ` +
        `-H "Content-Type: application/json" -d '${body.replace(/'/g, "'\\''")}'`,
      { timeout: NPU_TIMEOUT_MS },
    );
    return stdout;
  } finally {
    // Delete kernel
    await execAsync(
      `curl -s -X DELETE "${NPU_JUPYTER_URL}/api/kernels/${kernelId}" ` +
        `-H "Authorization: token ${NPU_JUPYTER_TOKEN}"`,
    ).catch(() => {});
  }
}

/**
 * Download file from Jupyter via Contents API.
 * @param {string} path
 * @returns {Promise<Buffer>}
 */
async function jupyterDownload(path) {
  const { stdout } = await execAsync(
    `curl -s "${NPU_JUPYTER_URL}/api/contents/${path}" ` +
      `-H "Authorization: token ${NPU_JUPYTER_TOKEN}"`,
  );
  const resp = JSON.parse(stdout);
  return Buffer.from(resp.content, resp.format === "base64" ? "base64" : "utf-8");
}

/**
 * Create CosyVoice3 NPU engine instance.
 * @returns {Promise<TTSEngine|null>}
 */
export async function createCosyVoice3NPUEngine() {
  if (!(await isAvailable())) return null;

  return {
    name: "cosyvoice3-npu",
    info: `CosyVoice3-NPU (Ascend 910B, cloned from ${CV3_REF_AUDIO})`,
    useSilenceFilter: false,
    resample: true,

    async generate(scenes, outputDir) {
      const manifest = buildCV3NpuManifest(scenes);

      for (const s of scenes) {
        const instruct = resolveInstructForScene(s);
        if (instruct) {
          const style = s.refStyle || s.visualType;
          console.log(`  🎭 Scene ${s.id}: ${style} → emotion instruct (NPU)`);
        }
      }

      // ── Generate kernel script ──
      const template = readFileSync(NPU_KERNEL_TEMPLATE, "utf-8");
      const refAudioB64 = readFileSync(CV3_REF_AUDIO).toString("base64");
      const manifestJson = JSON.stringify(manifest);

      const kernelScript = template
        .replaceAll("__MANIFEST_JSON__", manifestJson)
        .replaceAll("__REF_AUDIO_B64__", refAudioB64);

      // ── Upload + execute via Jupyter REST API ──
      console.log(`  📤 Uploading NPU kernel script (${manifest.length} segments)...`);
      await jupyterUpload("cosyvoice3_npu_run.py", kernelScript, false);

      console.log("  ⏳ Executing on NPU (this may take 10-20 min)...");
      const execOutput = await jupyterExecute('exec(open("cosyvoice3_npu_run.py").read())');
      console.log(execOutput);

      // ── Download summary ──
      const summaryBuf = await jupyterDownload("summary.json");
      const summary = JSON.parse(summaryBuf.toString("utf-8"));
      const failed = summary.segments.filter((s) => s.error);
      if (failed.length > 0) {
        console.error(
          `  ⚠️ ${failed.length} segments failed: ${failed.map((f) => `scene-${f.sceneId}`).join(", ")}`,
        );
      }

      // ── Download + post-process each WAV ──
      process.env.TTS_HIGHPASS = "0";
      process.env.TTS_DENOISE = "0";

      const finalResults = [];
      for (const s of summary.segments) {
        if (s.error) continue;
        const wavBuf = await jupyterDownload(s.output);
        const destPath = join(outputDir, s.output);
        writeFileSync(destPath, wavBuf);

        const duration = await postProcessBatch(destPath, {
          useSilenceFilter: false,
          resample: true,
          prosody: null,
        });
        finalResults.push({ sceneId: s.sceneId, audioPath: destPath, duration });
        console.log(`  Scene ${s.sceneId}: ${duration.toFixed(2)}s`);
      }

      if (finalResults.length === 0) {
        throw new Error("No successful TTS results from NPU kernel");
      }

      return finalResults;
    },
  };
}
