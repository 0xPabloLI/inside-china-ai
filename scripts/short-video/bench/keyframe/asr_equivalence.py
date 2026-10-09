#!/usr/bin/env python3
"""#418 — 同模型跨运行时词级差异率（**ctx-off 生产口径**）。

票面验收 ① 要的是「同模型下词级差异率」。此前的等价性数字（2026-09-29
`asr_equiv.json`，4 素材 sim 0.55-0.76）全部是**默认上下文**下测的，而默认上下文
会触发重复幻觉——那个差异率量的是幻觉，不是运行时差异。2026-10-09 的评论明确
「ctx-off 是必要不充分」，所以本脚本在**生产口径**（两边都关跨段上下文）下重测：

- whisper.cpp：`whisper-cli -t 8 -fa -mc 0`（与 `video-understand.mjs` 同参）
- MLX：`mlx_whisper.transcribe(..., condition_on_previous_text=False)`
- 同一批音频（`.scratch/keyframe-bench/audio/<vid>.wav`，16k mono）
- 词级差异率 = 1 − difflib 词序列相似度（小写、去标点后按词比对），并给出
  替换/插入/删除的绝对数与「每百词」率
- 另记**最大重复 n-gram 次数**（`asr_ctxoff_spot.json` 同口径）：ctx-off 之后
  两边是否真的不再循环，直接决定差异率能不能归因于运行时
- 文本逐字留档，便于人工复核差异是「同义改写」还是「一方漏内容」

输出：`.scratch/keyframe-bench/asr_equiv_ctxoff.json` + 同名 .log。

Run:
  ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/asr_equivalence.py
"""

import difflib
import glob
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
BENCH = os.path.join(WT_ROOT, ".scratch", "keyframe-bench")
AUDIO = os.path.join(BENCH, "audio")
OUT_JSON = os.path.join(BENCH, "asr_equiv_ctxoff.json")

WHISPER_CLI = "/opt/homebrew/bin/whisper-cli"
MLX_PYTHON = os.path.expanduser("~/.venvs/mlx-vlm/bin/python")
GGML = os.path.expanduser("~/.cache/whisper")

# 与计时矩阵/前序等价性同一批
VIDEOS = ["-ApL8d6tX5U", "-O6mJ0VBTc4", "-qTAeVGl_e8", "026dzf-vc5g"]

GGML_MODEL = "ggml-large-v3-turbo.bin"  # ADR-0020 生产档位
MLX_REPO = "mlx-community/whisper-large-v3-turbo"  # 同权重，不同运行时

WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)


def words(text: str):
    """词序列：小写 + 去标点（只留字母/数字，含非拉丁字母）。"""
    return WORD_RE.findall((text or "").lower())


def max_repeat(words_list, max_n=8):
    """最大重复 n-gram 次数（ctx-off 是否真的压住循环的判据）。"""
    best = {"count": 0, "n": 0, "gram": None}
    for n in range(2, max_n + 1):
        counts = {}
        for i in range(len(words_list) - n + 1):
            g = " ".join(words_list[i:i + n])
            counts[g] = counts.get(g, 0) + 1
        if not counts:
            continue
        gram, c = max(counts.items(), key=lambda kv: kv[1])
        if c > best["count"]:
            best = {"count": c, "n": n, "gram": gram}
    return best


def run_cpp(wav: str, out_prefix: str):
    model_path = os.path.join(GGML, GGML_MODEL)
    if not os.path.exists(model_path):
        raise SystemExit(f"ggml model missing: {model_path}")
    cmd = [WHISPER_CLI, "-m", model_path, "-f", wav, "-t", "8", "-fa", "-mc", "0",
           "-oj", "-of", out_prefix]
    t0 = time.time()
    p = subprocess.run(cmd, capture_output=True, text=True)
    wall = round(time.time() - t0, 2)
    if p.returncode != 0:
        raise SystemExit(f"whisper-cli failed on {wav}: {p.stderr[-400:]}")
    with open(out_prefix + ".json", encoding="utf-8") as fh:
        data = json.load(fh)
    text = " ".join(s.get("text", "") for s in data.get("transcription", [])).strip()
    return text, wall


MLX_SNIPPET = r"""
import json, sys, time
import mlx_whisper
text = mlx_whisper.transcribe(sys.argv[1], path_or_hf_repo=sys.argv[2],
                              condition_on_previous_text=False).get("text") or ""
print("@@TEXT@@" + json.dumps({"text": text.strip()}))
"""


def mlx_snapshot(repo: str) -> str:
    pat = os.path.expanduser(
        f"~/.cache/huggingface/hub/models--{repo.replace('/', '--')}/snapshots/*"
    )
    for d in glob.glob(pat):
        if os.path.exists(os.path.join(d, "config.json")):
            return d
    raise SystemExit(f"MLX snapshot not found for {repo} ({pat})")


def run_mlx(wav: str, snap: str):
    cmd = [MLX_PYTHON, "-c", MLX_SNIPPET, wav, snap]
    t0 = time.time()
    p = subprocess.run(cmd, capture_output=True, text=True)
    wall = round(time.time() - t0, 2)
    if p.returncode != 0:
        raise SystemExit(f"mlx_whisper failed on {wav}: {p.stderr[-400:]}")
    text = ""
    for line in p.stdout.splitlines():
        if line.startswith("@@TEXT@@"):
            text = json.loads(line[len("@@TEXT@@"):])["text"]
    return text, wall


def compare(cpp_text: str, mlx_text: str):
    a, b = words(cpp_text), words(mlx_text)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    opcodes = sm.get_opcodes()
    replace = sum(max(i2 - i1, j2 - j1) for tag, i1, i2, j1, j2 in opcodes if tag == "replace")
    delete = sum(i2 - i1 for tag, i1, i2, _j1, _j2 in opcodes if tag == "delete")
    insert = sum(j2 - j1 for tag, _i1, _i2, j1, j2 in opcodes if tag == "insert")
    sim = round(sm.ratio(), 4)
    denom = max(len(a), len(b)) or 1
    return {
        "cpp_words": len(a),
        "mlx_words": len(b),
        "word_sim": sim,
        "word_diff_rate": round(1 - sim, 4),
        "replace": replace,
        "delete": delete,
        "insert": insert,
        "diff_per_100w": round(100 * (replace + delete + insert) / denom, 1),
        "max_repeat_cpp": max_repeat(a),
        "max_repeat_mlx": max_repeat(b),
    }


def machine_state():
    load = os.getloadavg()
    others = subprocess.run(
        ["pgrep", "-f", "exp_videomme_qa.py|exp_qwen_omni_video.py|asr_timing_matrix.py"],
        capture_output=True, text=True).stdout.strip()
    return {"load_avg": [round(x, 2) for x in load],
            "competing_bench_jobs": bool(others)}


def main():
    snap = mlx_snapshot(MLX_REPO)
    start_state = machine_state()
    print(f"machine at start: {start_state}", flush=True)
    rows = []
    for vid in VIDEOS:
        wav = os.path.join(AUDIO, f"{vid}.wav")
        if not os.path.exists(wav):
            print(f"skip {vid}: no audio", flush=True)
            continue
        cpp_text, cpp_s = run_cpp(wav, os.path.join(BENCH, "asr_equiv_ctxoff_tmp"))
        mlx_text, mlx_s = run_mlx(wav, snap)
        row = {"vid": vid, "cpp_s": cpp_s, "mlx_s": mlx_s,
               "cpp": cpp_text, "mlx": mlx_text, **compare(cpp_text, mlx_text)}
        rows.append(row)
        print(f"[{vid}] sim={row['word_sim']} diff={row['word_diff_rate']} "
              f"({row['diff_per_100w']}/100w) cpp={row['cpp_words']}w mlx={row['mlx_words']}w "
              f"maxrep cpp={row['max_repeat_cpp']['count']} mlx={row['max_repeat_mlx']['count']} "
              f"| {cpp_s}s vs {mlx_s}s", flush=True)

    sims = [r["word_sim"] for r in rows]
    diffs = [r["word_diff_rate"] for r in rows]
    summary = {
        "n": len(rows),
        "word_sim_min": min(sims) if sims else None,
        "word_sim_max": max(sims) if sims else None,
        "word_sim_mean": round(sum(sims) / len(sims), 4) if sims else None,
        "word_diff_rate_min": min(diffs) if diffs else None,
        "word_diff_rate_max": max(diffs) if diffs else None,
        "word_diff_rate_mean": round(sum(diffs) / len(diffs), 4) if diffs else None,
        "max_repeat_cpp": max((r["max_repeat_cpp"]["count"] for r in rows), default=0),
        "max_repeat_mlx": max((r["max_repeat_mlx"]["count"] for r in rows), default=0),
        "definitions": {
            "word_sim": "difflib.SequenceMatcher ratio over lowercased, punctuation-stripped "
                        "word sequences (same model weights, different runtime)",
            "word_diff_rate": "1 - word_sim",
            "diff_per_100w": "(replace+delete+insert) / max(cpp_words, mlx_words) * 100",
            "max_repeat_*": "highest count of any repeated 2..8-gram in that side's output",
        },
    }
    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump({
            "generated_at": time.strftime("%F %T"),
            "config": {
                "audio": "16k mono wav, same 4 videos as asr_timing_matrix.json",
                "ctx": "off on BOTH sides (cpp -mc 0 / mlx condition_on_previous_text=False)",
                "cpp_cmd": "whisper-cli -t 8 -fa -mc 0 -oj",
                "cpp_model": GGML_MODEL,
                "mlx_repo": MLX_REPO,
                "machine_at_start": start_state,
                "machine_at_end": machine_state(),
            },
            "summary": summary,
            "rows": rows,
        }, fh, ensure_ascii=False, indent=1)
    print(f"\nSUMMARY {json.dumps(summary, ensure_ascii=False)}\n→ {OUT_JSON}", flush=True)


if __name__ == "__main__":
    main()
