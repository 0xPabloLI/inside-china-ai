#!/usr/bin/env node
/**
 * CI guard: every ASR transcription call must pin the cross-segment context off.
 *
 * Why a guard and not just a fix (2026-10-09): the ctx switch was already
 * decided (#418) and documented (`video-production-runbook.md` 「转写一律
 * ctx-off」, `spec-video-loader-417.md` §4), yet two things silently drifted
 * back to ctx-on — the production `asr_worker.py` (relied on the upstream
 * default) and every short-tier bench script (defaulted to the ctx-on `asr/`
 * directory). Nothing failed; the transcripts just quietly carried repetition
 * hallucinations, and later analysis could not tell which results were
 * affected because the results files did not record the transcript source.
 *
 * Same class as ADR-0020 (`lint-asr-model-defaults.mjs`): a decision that is
 * real but not enforced. So it gets the same treatment — a guard that fails
 * loudly instead of a convention that decays.
 *
 * Rule: a call that transcribes audio must pass
 * `condition_on_previous_text=False` (MLX/whisperx spelling) or the equivalent
 * `--max-context 0` / `max_context=0` (whisper.cpp spelling) within the call.
 *
 * Exit 0 = pass, 1 = violations found.
 */
import { readFileSync } from "fs";
import { execSync } from "child_process";

const CTX_OFF = [
  /condition_on_previous_text\s*=\s*False/,
  /--max-context\s+0/,
  /max_context\s*=\s*0/,
  /(?:^|\s)-mc\s+0(?:\s|$)/, // whisper-cli short form
];
// A transcription call. `align(` is whisperx forced alignment (no ctx switch).
const CALL = /\.transcribe\s*\(/;
// A whisper.cpp CLI invocation. Detected by the flag signature of an actual
// command (`-m <model>` + `-f <audio>`), NOT by any mention of the binary:
// path constants, comments, log strings and test names all say "whisper-cli"
// without transcribing anything, and flagging those makes the guard noise that
// gets ignored.
const CLI_CMD = /-m\s+\S/;
const CLI_AUDIO = /-f\s+\S/;
const CLI = /whisper-cli|WHISPER_CLI|whisper\.cpp/;

let files = "";
try {
  files = execSync(
    "rg -l --no-heading -e '\\.transcribe\\s*\\(' -e 'whisper-cli' " +
      "-e 'WHISPER_CLI' scripts/ --glob '!node_modules' --glob '!lint-*'",
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
} catch {
  // rg exits 1 on no match — no transcription call sites at all.
  files = "";
}

const violations = [];
for (const file of files ? files.split("\n") : []) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (!CALL.test(line) && !CLI.test(line)) return;
    // A whisper-cli command is one line; an API call may span lines. For the
    // API shape, scan from the call until its closing paren (bounded, so a
    // malformed file cannot scan the whole file).
    if (!CALL.test(line)) {
      // CLI shape: the command is a single shell string, so the ctx switch must
      // be on the same line. Require the full flag signature so that mere
      // mentions of the binary do not count.
      const isCommand = CLI.test(line) && CLI_CMD.test(line) && CLI_AUDIO.test(line);
      if (!isCommand) return;
      if (!CTX_OFF.some((re) => re.test(line))) {
        violations.push(`${file}:${i + 1}\n    ${line.trim()}`);
      }
      return;
    }
    let depth = 0;
    let sawOpen = false;
    const chunk = [];
    for (let j = i; j < Math.min(i + 40, lines.length); j += 1) {
      const text = lines[j];
      chunk.push(text);
      for (const ch of text) {
        if (ch === "(") {
          depth += 1;
          sawOpen = true;
        } else if (ch === ")") depth -= 1;
      }
      if (sawOpen && depth <= 0) break;
    }
    const body = chunk.join("\n");
    if (!CTX_OFF.some((re) => re.test(body))) {
      violations.push(`${file}:${i + 1}\n    ${line.trim()}`);
    }
  });
}

if (violations.length) {
  console.error(
    "❌ ASR ctx-off violation — transcription call without " +
      "condition_on_previous_text=False:\n" +
      violations.join("\n") +
      "\n",
  );
  console.error(
    "Cross-segment context makes Whisper loop on low-SNR/silent/music spans " +
      "(repetition hallucination); large-v3 is not immune. Pass " +
      "condition_on_previous_text=False (whisperx/MLX) or --max-context 0 " +
      "(whisper.cpp). See docs/video-production-runbook.md and " +
      "docs/specs/spec-video-loader-417.md §4.",
  );
  process.exit(1);
}
console.log("✅ ASR ctx-off: every transcription call pins the context off.");
