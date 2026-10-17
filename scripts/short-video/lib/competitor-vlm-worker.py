#!/usr/bin/env python3
"""
Competitor breakdown VLM worker (#300 stage 2).

Line-delimited JSON worker that reuses vlm_analyzer.py's model plumbing
(load_model / _warmup / generate_response) but drives it with a
**competitor-specific prompt** instead of the asset-semantics prompt, and
returns the model's raw text rather than the 8-field asset schema.

Why a separate worker instead of the analyze_semantics action:
  - analyze_semantics always builds its prompt from SEMANTICS_PROMPT_VIDEO and
    parses the Markdown into the asset fields (description/subjects/
    contentKind/...). The competitor breakdown needs a different prompt AND a
    raw JSON passthrough, so reusing that action would mean threading an
    override through a module whose contract every asset caller depends on.
  - This worker therefore only *reads* vlm_analyzer (no edits, no regression
    surface) and owns the competitor prompt itself.

Protocol (one JSON object per line, both directions):
  request : {"id": "<video id>", "videoPath": "/abs/path.mp4",
             "prompt": "<full prompt text>", "maxTokens": 2500}
  request : {"action": "exit"}
  response: {"id": "...", "text": "<raw model output>"}
  response: {"id": "...", "error": "..."}

Runs in the VLM venv (~/.venvs/mlx-vlm), same as vlm_analyzer.py. Engine and
model id come from lib/vlm-model.json — the single source of truth — so this
worker can never name a model different from the production one.
"""

import json
import os
import sys

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

import vlm_analyzer as va  # noqa: E402  (path must be set first)

# The breakdown JSON is multi-section (story_level + beats + shots + learnings)
# and up to ~12 shots, so vlm_analyzer's 1000-token asset default truncates the
# reply mid-JSON. The Node caller always sends its own budget (VLM_MAX_TOKENS);
# this default is the fallback when it does not, and mirrors the caller's value.
DEFAULT_MAX_TOKENS = 6000


def resolve_engine_and_model():
    """Read the engine + modelId from vlm-model.json (single source of truth)."""
    cfg_path = os.path.join(_here, "vlm-model.json")
    with open(cfg_path, encoding="utf-8") as fh:
        cfg = json.load(fh)
    engine = cfg.get("engine", "qwen3-vl-moe")
    model_id = os.path.expanduser(cfg["engines"][engine]["modelId"])
    return engine, model_id


def main():
    engine, model_id = resolve_engine_and_model()
    sys.stderr.write(f"[competitor-vlm] engine={engine} model={model_id}\n")
    sys.stderr.flush()

    try:
        model, processor = va.load_model(model_id)
    except Exception as exc:  # noqa: BLE001 — surface to the Node caller
        sys.stdout.write(json.dumps({"id": "", "error": f"model load failed: {exc}"}) + "\n")
        sys.stdout.flush()
        sys.exit(1)

    try:
        va._warmup(model, processor, engine)
    except Exception as exc:  # noqa: BLE001 — warmup is non-fatal
        sys.stderr.write(f"[competitor-vlm] warmup failed (non-fatal): {exc}\n")
        sys.stderr.flush()

    sys.stderr.write("[competitor-vlm] ready\n")
    sys.stderr.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as exc:
            sys.stdout.write(json.dumps({"id": "", "error": f"invalid json: {exc}"}) + "\n")
            sys.stdout.flush()
            continue

        if request.get("action") == "exit":
            break

        video_id = request.get("id", "")
        try:
            text = va.generate_response(
                model,
                processor,
                engine=engine,
                video_path=request["videoPath"],
                prompt_text=request["prompt"],
                max_tokens=int(request.get("maxTokens", DEFAULT_MAX_TOKENS)),
            )
            response = {"id": video_id, "text": text}
        except Exception as exc:  # noqa: BLE001 — one bad video must not kill the batch
            response = {"id": video_id, "error": str(exc)}

        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
