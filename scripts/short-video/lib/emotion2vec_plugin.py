#!/usr/bin/env python3
"""emotion2vec+ subprocess plugin — 9-class utterance-level emotion recognition.

Runs in ~/.video-tts-env (funasr 1.4.14 + emotion2vec_plus_large).
Communicates with the Node parent (visual-analyzer.mjs) over line-delimited
JSON on stdin/stdout — same IPC convention as vlm_analyzer.py.

Actions:
  - analyze_emotion: {"action": "analyze_emotion", "path": "/abs/path/to/audio"}
      → {"labels": [...], "scores": [...], "topLabel": "...", "topScore": 0.9, "error": null}
  - exit: graceful shutdown

The 9 emotion2vec+ labels (fixed by the model):
  生气/angry, 厌恶/disgusted, 恐惧/fearful, 开心/happy, 中立/neutral,
  其他/other, 难过/sad, 吃惊/surprised, <unk>

On any failure (model missing, file not found, inference error), returns
{"error": "<message>", "labels": [], "scores": [], "topLabel": null, "topScore": null}.
"""

import json
import os
import sys
import signal

MODEL_ID = "iic/emotion2vec_plus_large"
IDLE_TIMEOUT_SECONDS = 300


class IdleTimer:
    """Exit after N seconds of stdin inactivity (no complete lines)."""

    def __init__(self, timeout_seconds):
        self._timeout = timeout_seconds
        self._timer = None

    def touch(self):
        if self._timer:
            self._timer.cancel()
        import threading

        self._timer = threading.Timer(self._timeout, self._expire)
        self._timer.daemon = True
        self._timer.start()

    def stop(self):
        if self._timer:
            self._timer.cancel()
            self._timer = None

    def _expire(self):
        sys.stderr.write("[emotion2vec] Idle timeout, exiting.\n")
        sys.stderr.flush()
        os._exit(0)


def load_model():
    """Load the emotion2vec+ model via funasr."""
    os.environ.setdefault("MODELSCOPE_CACHE", os.path.expanduser("~/.cache/modelscope"))
    from funasr import AutoModel

    model = AutoModel(
        model=MODEL_ID,
        disable_update=True,
        disable_log=True,
        disable_progress=True,
    )
    return model


def analyze_emotion(model, path):
    """Run utterance-level emotion recognition on an audio file.

    Returns (result_dict, error).
    """
    if not os.path.exists(path):
        return {}, f"File not found: {path}"

    try:
        res = model.generate(
            input=path,
            output_dir=None,
            granularity="utterance",
            extract_embedding=False,
        )
    except Exception as e:
        return {}, f"Emotion inference failed: {e}"

    if not res or not isinstance(res, list):
        return {}, "Empty or unexpected result from emotion2vec"

    entry = res[0]
    labels = entry.get("labels", [])
    scores = entry.get("scores", [])

    if not labels or not scores:
        return {}, "No labels/scores in emotion2vec result"

    # Find top emotion (highest score), skipping <unk>
    top_idx = -1
    top_score = -1.0
    for i, (label, score) in enumerate(zip(labels, scores)):
        if label == "<unk>":
            continue
        if score > top_score:
            top_score = score
            top_idx = i

    if top_idx < 0:
        top_label = None
        top_score = None
    else:
        top_label = labels[top_idx]

    return {
        "labels": labels,
        "scores": scores,
        "topLabel": top_label,
        "topScore": top_score,
    }, None


def degraded_result(error):
    return {
        "labels": [],
        "scores": [],
        "topLabel": None,
        "topScore": None,
        "error": error,
    }


def main():
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)

    sys.stderr.write(f"[emotion2vec] Loading model: {MODEL_ID}\n")
    sys.stderr.flush()

    try:
        model = load_model()
        sys.stderr.write("[emotion2vec] Model loaded successfully.\n")
        sys.stderr.flush()
    except Exception as e:
        sys.stderr.write(f"[emotion2vec] Failed to load model: {e}\n")
        sys.stderr.flush()
        sys.stdout.write(json.dumps(degraded_result(f"Model load failed: {e}")) + "\n")
        sys.stdout.flush()
        sys.exit(1)

    idle_timer = IdleTimer(IDLE_TIMEOUT_SECONDS)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        idle_timer.touch()

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            response = degraded_result(f"Invalid JSON: {e}")
        else:
            action = request.get("action", "")
            request_id = request.get("requestId", "")

            if action == "exit":
                idle_timer.stop()
                sys.exit(0)
            elif action == "analyze_emotion":
                path = request.get("path", "")
                result, err = analyze_emotion(model, path)
                if err:
                    response = degraded_result(err)
                else:
                    response = {**result, "error": None}
            else:
                response = degraded_result(f"Unknown action: {action}")

            if request_id:
                response["requestId"] = request_id

        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()

    idle_timer.stop()
    sys.exit(0)


if __name__ == "__main__":
    main()