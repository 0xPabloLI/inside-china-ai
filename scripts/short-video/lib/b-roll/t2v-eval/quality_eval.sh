#!/bin/bash
# Quality-dimension scoring for the #298 T2V eval (4-dim star rubric from the
# T2I comparison template: prompt adherence / visual quality / B-roll
# suitability / defects).
#
# One subprocess PER CLIP: mlx_vlm's native-video path returns a stale cached
# analysis for every video after the first inside one process (found during
# this eval, see eval report §Bugs). Fresh process per call sidesteps it.
# Uses vlm_analyzer's model loading (the vlm-model.json default engine,
# dispatched explicitly via va.DEFAULT_ENGINE) rather than qwen38_vlm_wrapper, whose configured
# Qwen3.8-27B model no longer exists on disk.
#
# Usage: bash quality_eval.sh
# NOTE: $clip/$QUESTION interpolate unquoted into python -c (fragile) — the
# fixed label set below is trusted input; add no untrusted paths/quotes.
set -uo pipefail

# Roots derive from the script's own location (any checkout/worktree runs);
# clips live in the MAIN checkout's output dir — the shared-media convention
# score_eval.mjs follows. Override with BROLL_EVAL_OUT for other clip sets.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIB="$(cd "$SCRIPT_DIR/../.." && pwd)" # scripts/short-video/lib
ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
case "$ROOT" in *inside-china-ai-wt/*) ROOT="$(cd "$ROOT/../.." && pwd)/inside-china-ai" ;; esac
OUT="${BROLL_EVAL_OUT:-$ROOT/scripts/short-video/output/t2v-eval-fastmetal5b-20260925}"
PY=~/.video-tts-env/bin/python

declare -a CLIPS=(
  "scene-2-conference-stage|$OUT/scene-2-conference-stage.mp4"
  "scene-4-datacenter-racks|$OUT/scene-4-datacenter-racks.mp4"
  "scene-8-milestone-timeline|$OUT/scene-8-milestone-timeline.mp4"
  "scene-9-gpu-card|$OUT/scene-9-gpu-card.mp4"
  "base-scene-2|$OUT/../../content/ant-lingbot-world-13b/assets/b-roll/scene-2-seed1125.mp4"
  "base-scene-4|$OUT/../../content/ant-lingbot-world-13b/assets/b-roll/scene-4-seed1324.mp4"
  "base-scene-8|$OUT/../../content/ant-lingbot-world-13b/assets/b-roll/scene-8-seed1724.mp4"
  "base-scene-9|$OUT/../../content/ant-lingbot-world-13b/assets/b-roll/scene-9-seed1824.mp4"
)

QUESTION='你是短视频 B-roll 画质评审。对这段视频按四个维度打分（1-5 星），格式严格如下，每行一项：
PROMPT: X星 - 一句话理由（是否做出提示词要求的主体/镜头/光线）
QUALITY: X星 - 一句话理由（清晰度、细节丰富度、动态稳定性、有无形变/闪烁/伪影）
SUITABILITY: X星 - 一句话理由（作为 9:16 竖屏短视频 B-roll 背景的适用性）
DEFECTS: X星 - 一句话理由（缺陷越少分越高；点名的具体缺陷）'

for entry in "${CLIPS[@]}"; do
  label="${entry%%|*}"; clip="${entry#*|}"
  dest="$OUT/quality-$label.txt"
  if [ -s "$dest" ]; then echo "[quality] $label: exists, skip"; continue; fi
  echo "[quality] scoring $label ..."
  PYTHONPATH="$LIB" "$PY" -c "
import vlm_analyzer as va
model, processor = va.load_model(va.MODEL_ID)
# Never pass native video to mlx_vlm here: the video input path is
# unreliable in this version (stale repeats across calls, generic
# hallucinations in fresh processes — see eval report §Bugs). Extract
# frames and score them as images, same as the production windowed path.
frames = va.extract_frames('$clip', fps=2.0, max_seconds=8)
assert frames, 'frame extraction failed'
try:
    raw = va.generate_response(model, processor, engine=va.DEFAULT_ENGINE, image_paths=frames, prompt_text='''$QUESTION''')
finally:
    va._cleanup_frames(frames)
print(raw)
" > "$dest" 2>/tmp/quality-err-$label.log
  [ -s "$dest" ] && echo "[quality] $label OK" || { echo "[quality] $label FAILED:"; tail -3 /tmp/quality-err-$label.log; }
done
echo "[quality] done -> $OUT/quality-*.txt"
