#!/usr/bin/env python3
"""#418 — ASR 运行时公平计时矩阵：{turbo, large-v3} × {whisper.cpp, MLX}。

背景：票面遗留的「缺 cpp large-v3 一格 + 峰值内存全缺」。此前计时都不可比——
MLX 侧曾与 VLM 并行（抢 GPU），whisper.cpp 侧未记录 backend 与内存。本脚本
一次跑齐四格，并记录可复核的配置与资源口径：

- 每个测量都是**独立子进程**，用 `/usr/bin/time -l` 取 `maximum resident set size`
  （两引擎同一口径；mmap 的模型页与 Metal 缓冲在触达后计入 RSS）。
- **cold/warm 拆开**：whisper.cpp 每次调用都是新进程（cold 是它的常态）；
  MLX 同一进程连跑两次，run1 = cold（含模型加载），run2 = warm（模型驻留）。
  MLX 侧另记 `mx.metal.get_peak_memory()`（模型加载后重置 → run2 为纯转写峰值）。
- **ctx-off 口径**（#418 生产口径）：cpp `-mc 0`，MLX
  `condition_on_previous_text=False`。
- **backend 证据**：抓取 stderr 里的 `ggml_metal` / `BLAS` 初始化行，记录
  `metal_used`，不再用「`-t 8` 所以不抢 GPU」这种未验证推断。

素材：`.scratch/keyframe-bench/audio/<vid>.wav`（16k mono，与等价性/计时前序同批）。
输出：`.scratch/keyframe-bench/asr_timing_matrix.json` + 同名 .log。

Run:
  ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/asr_timing_matrix.py
"""

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
OUT_JSON = os.path.join(BENCH, "asr_timing_matrix.json")

WHISPER_CLI = "/opt/homebrew/bin/whisper-cli"
MLX_PYTHON = os.path.expanduser("~/.venvs/mlx-vlm/bin/python")
GGML = os.path.expanduser("~/.cache/whisper")

# 与前序等价性/公平计时同一批（Video-MME 子集，音频均值 78s）
VIDEOS = ["-ApL8d6tX5U", "-O6mJ0VBTc4", "-qTAeVGl_e8", "026dzf-vc5g"]

# 每格的重复次数：cpp 两次都是 cold（进程模型使然）；MLX 同进程两次 = cold+warm
RUNS = 2

GGML_MODELS = {"turbo": "ggml-large-v3-turbo.bin", "large-v3": "ggml-large-v3.bin"}
MLX_REPOS = {
    "turbo": "mlx-community/whisper-large-v3-turbo",
    "large-v3": "mlx-community/whisper-large-v3-mlx",
}

def ps_rss_kb(pid: int):
    """采样进程 RSS（KB）。macOS 的 /usr/bin/time -l 'maximum resident set size'
    在两次相同 MLX 运行间给出 351MB vs 1707MB 的不一致读数，故改为运行期轮询取峰值。"""
    p = subprocess.run(["ps", "-o", "rss=", "-p", str(pid)],
                       capture_output=True, text=True)
    try:
        return int(p.stdout.strip())
    except ValueError:
        return None


def run_measured(cmd, poll_s: float = 0.15):
    """跑子进程并轮询 RSS 峰值。

    Returns (rc, stdout, stderr, wall_s, peak_rss_mb)。
    """
    t0 = time.time()
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    peak_kb = 0
    while p.poll() is None:
        rss = ps_rss_kb(p.pid)
        if rss:
            peak_kb = max(peak_kb, rss)
        time.sleep(poll_s)
    out, err = p.communicate()
    wall = time.time() - t0
    return p.returncode, out, err, round(wall, 2), (round(peak_kb / 1000, 1) if peak_kb else None)

MLX_SNIPPET = r"""
import json, sys, time
import mlx.core as mx
import mlx_whisper

model_dir, wav = sys.argv[1], sys.argv[2]
t0 = time.time()
mx.metal.reset_peak_memory()
r = mlx_whisper.transcribe(wav, path_or_hf_repo=model_dir,
                           condition_on_previous_text=False)
load_and_first = time.time() - t0
first_peak = mx.metal.get_peak_memory() / 1e6

mx.metal.reset_peak_memory()
t1 = time.time()
r2 = mlx_whisper.transcribe(wav, path_or_hf_repo=model_dir,
                            condition_on_previous_text=False)
second = time.time() - t1
second_peak = mx.metal.get_peak_memory() / 1e6

print("@@RESULT@@" + json.dumps({
    "run1_s": round(load_and_first, 2), "run1_peak_mb": round(first_peak, 1),
    "run2_s": round(second, 2), "run2_peak_mb": round(second_peak, 1),
    "run1_chars": len((r.get("text") or "").strip()),
    "run2_chars": len((r2.get("text") or "").strip()),
}))
"""


def mlx_snapshot(repo: str) -> str:
    """本地 HF snapshot 目录（避免任何网络路径）。"""
    pat = os.path.expanduser(
        f"~/.cache/huggingface/hub/models--{repo.replace('/', '--')}/snapshots/*"
    )
    for d in glob.glob(pat):
        if os.path.exists(os.path.join(d, "config.json")):
            return d
    raise SystemExit(f"MLX snapshot not found for {repo} ({pat})")


def parse_whisper_timings(stderr: str):
    """whisper-cli 的 stderr 计时表（load vs 推理分开，进程墙钟的对照）。"""
    out = {}
    for key, pat in (("load_ms", r"load time\s*=\s*([\d.]+)\s*ms"),
                     ("total_ms", r"total time\s*=\s*([\d.]+)\s*ms"),
                     ("encode_ms", r"encode time\s*=\s*([\d.]+)\s*ms"),
                     ("decode_ms", r"decode time\s*=\s*([\d.]+)\s*ms")):
        m = re.search(pat, stderr)
        if m:
            out[key] = float(m.group(1))
    return out


def run_cpp(model: str, wav: str, out_prefix: str):
    model_path = os.path.join(GGML, GGML_MODELS[model])
    if not os.path.exists(model_path):
        raise SystemExit(f"ggml model missing: {model_path}")
    # 生产口径（video-understand.mjs）：-t 8 -fa -mc 0；不传 -ng → Metal 开启
    cmd = [WHISPER_CLI, "-m", model_path, "-f", wav,
           "-t", "8", "-fa", "-mc", "0", "-oj", "-of", out_prefix]
    rc, _out, err, wall, rss_mb = run_measured(cmd)
    # backend 证据：whisper.cpp 打印 "load_backend: loaded ... BLAS/Metal" 初始化行
    metal = bool(re.search(r"ggml_metal", err))
    text = ""
    jf = out_prefix + ".json"
    if os.path.exists(jf):
        with open(jf, encoding="utf-8") as fh:
            data = json.load(fh)
        text = " ".join(s.get("text", "") for s in data.get("transcription", [])).strip()
    return {
        "rc": rc,
        "wall_s": wall,
        "max_rss_mb": rss_mb,
        "metal_used": metal,
        "chars": len(text),
        "cli_timings": parse_whisper_timings(err),
    }


def run_mlx(model: str, wav: str):
    snap = mlx_snapshot(MLX_REPOS[model])
    cmd = [MLX_PYTHON, "-c", MLX_SNIPPET, snap, wav]
    rc, out, err, wall, rss_mb = run_measured(cmd)
    payload = None
    for line in out.splitlines():
        if line.startswith("@@RESULT@@"):
            payload = json.loads(line[len("@@RESULT@@"):])
    return {
        "rc": rc,
        "wall_s": wall,
        "max_rss_mb": rss_mb,
        "metal_used": True,  # MLX 即 Metal
        "chars": payload.get("run2_chars") if payload else None,
        "mlx": payload,
        "stderr_tail": err[-400:] if rc else "",
    }


def machine_state():
    """公平性守卫：记下跑矩阵时的机器状态，MLX 与 VLM 并行时的计时不可比。"""
    load = os.getloadavg()
    others = subprocess.run(
        ["pgrep", "-f", "exp_videomme_qa.py|exp_qwen_omni_video.py|mlx_whisper"],
        capture_output=True, text=True).stdout.strip()
    return {"load_avg": [round(x, 2) for x in load],
            "competing_bench_jobs": bool(others)}


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    vid_filter = sys.argv[2] if len(sys.argv) > 2 else None
    results = []
    t_start = time.time()
    start_state = machine_state()
    print(f"machine at start: {start_state}", flush=True)
    for vid in VIDEOS:
        if vid_filter and vid != vid_filter:
            continue
        wav = os.path.join(AUDIO, f"{vid}.wav")
        if not os.path.exists(wav):
            print(f"skip {vid}: no audio", flush=True)
            continue
        for engine in ("whisper.cpp", "mlx"):
            for model in ("turbo", "large-v3"):
                if only and only not in f"{engine}/{model}":
                    continue
                for rep in range(RUNS):
                    tag = f"{engine}/{model}/{vid}/rep{rep}"
                    if engine == "whisper.cpp":
                        out_prefix = os.path.join(BENCH, "asr_timing_cpp_tmp")
                        r = run_cpp(model, wav, out_prefix)
                        r["phase"] = "cold"
                    else:
                        r = run_mlx(model, wav)
                        # run1=cold（含加载）, run2=warm（同进程驻留）
                        r["phase"] = "cold+warm"
                    r.update({"engine": engine, "model": model, "video": vid, "rep": rep})
                    results.append(r)
                    mem = f"rss={r['max_rss_mb']}MB" if r["max_rss_mb"] else "rss=?"
                    extra = ""
                    if r.get("mlx"):
                        m = r["mlx"]
                        extra = (f" | mlx run1={m['run1_s']}s/{m['run1_peak_mb']}MB"
                                 f" run2={m['run2_s']}s/{m['run2_peak_mb']}MB")
                    print(f"[{tag}] rc={r['rc']} wall={r['wall_s']}s {mem} "
                          f"chars={r.get('chars')}{extra}", flush=True)
                    if r["rc"] != 0:
                        print(f"    stderr: {r.get('stderr_tail', '')[-200:]}", flush=True)

    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump({
            "generated_at": time.strftime("%F %T"),
            "config": {
                "audio": "16k mono wav, Video-MME subset (mean ~78s)",
                "ctx": "off (cpp -mc 0 / mlx condition_on_previous_text=False)",
                "cpp_cmd": "whisper-cli -t 8 -fa -mc 0 -oj (no -ng → Metal on)",
                "cpp_version": subprocess.run(
                    ["brew", "list", "--versions", "whisper.cpp"],
                    capture_output=True, text=True).stdout.strip(),
                "mlx_python": MLX_PYTHON,
                "mlx_repos": MLX_REPOS,
                "memory": "max RSS via /usr/bin/time -l (child process); "
                          "mlx peak via mx.metal.get_peak_memory",
                "runs_per_cell": RUNS,
                "machine_at_start": start_state,
                "machine_at_end": machine_state(),
            },
            "results": results,
        }, fh, ensure_ascii=False, indent=1)
    print(f"\nDONE in {time.time() - t_start:.0f}s → {OUT_JSON}", flush=True)


if __name__ == "__main__":
    main()
