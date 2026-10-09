#!/usr/bin/env python3
"""#418 — ASR 运行时公平计时矩阵：{turbo, large-v3} × {whisper.cpp, MLX}。

背景：票面遗留的「缺 cpp large-v3 一格 + 峰值内存全缺」。此前计时都不可比——
MLX 侧曾与 VLM 并行（抢 GPU），whisper.cpp 侧未记录 backend 与内存。本脚本
一次跑齐四格，并记录可复核的配置与资源口径：

- 每个测量都是**独立子进程**，峰值内存取**运行期轮询子进程 RSS**（`ps -o rss=`
  @0.15s）。曾用 `/usr/bin/time -l` 的 `maximum resident set size`，但同一份 MLX
  运行两次给出 351MB vs 1707MB 的矛盾读数，故弃用（见 `ps_rss_kb`）。轮询分辨率
  0.15s，短任务的瞬时峰值可能被低估——四格同口径，横向可比。
- **cold/warm 拆开**：whisper.cpp 每次调用都是新进程（cold 是它的常态）；
  MLX 同一进程连跑两次，run1 = cold（含模型加载），run2 = warm（模型驻留）。
  MLX 侧另记 `mx.metal.get_peak_memory()`（每次转写前重置）。
- **ctx-off 口径**（#418 生产口径）：cpp `-mc 0`，MLX
  `condition_on_previous_text=False`。
- **backend 证据**：cpp 抓 stderr 里的 `ggml_metal` 初始化行；MLX 由子进程回报
  `mx.metal.is_available()` 与 `mx.default_device()`。两者都是实测值，
  不用「`-t 8` 所以不抢 GPU」这种未验证推断。
- **`summary` 块**：脚本自己把逐次记录聚合成文档引用的数字（定义写在
  `summary.definitions` 里），避免「文档里的数在原始数据里找不到」。

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
    "metal_available": bool(mx.metal.is_available()),
    "default_device": str(mx.default_device()),
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
    metal_evidence = re.search(r"ggml_metal[^\n]*", err)
    metal = bool(metal_evidence)
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
        "metal_evidence": metal_evidence.group(0)[:120] if metal_evidence else None,
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
    # backend 证据来自 MLX 子进程自报（此前这里硬编码 True，是推断不是实测）
    metal = bool(payload and payload.get("metal_available"))
    return {
        "rc": rc,
        "wall_s": wall,
        "max_rss_mb": rss_mb,
        "metal_used": metal,
        "metal_evidence": payload.get("default_device") if payload else None,
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


def summarize(results):
    """把逐次记录聚合成文档会引用的数字（定义随数据一起落盘）。

    cold = 该格全部逐次墙钟的均值；cpp 每次都是新进程，MLX 的 `wall_s` 含
    解释器启动，故另给 `mlx_run1_s_mean`（进程内首次调用，含模型加载）作
    冷启动口径。warm 只对 MLX 有意义（同进程第二次调用，模型驻留）。

    **`single_call_s_*`（生产形态）**：一次转写、冷进程。cpp 的每次 `wall_s`
    本来就是一次转写；MLX 的 `wall_s` 覆盖了同一进程里的 run1+run2 **两次**
    转写，所以 `single_call_s = wall_s - run2_s`（= 解释器启动 + run1）。此前
    文档直接拿 MLX 的 `wall_s` 和 cpp 的 `wall_s` 比，是两种口径混用，已修。
    中位数比均值稳（每格首条含一次性 Metal 冷编译，会拉高均值）。
    """
    def mean(xs):
        return round(sum(xs) / len(xs), 2) if xs else None

    def median(xs):
        xs = sorted(xs)
        if not xs:
            return None
        n = len(xs)
        return round(xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2, 2)

    cells = {}
    for engine in ("whisper.cpp", "mlx"):
        for model in ("turbo", "large-v3"):
            rs = [r for r in results if r["engine"] == engine and r["model"] == model]
            if not rs:
                continue
            rss = [r["max_rss_mb"] for r in rs if r["max_rss_mb"]]
            mlx = [r["mlx"] for r in rs if r.get("mlx")]

            def single_call(r):
                """生产形态：一次转写、冷进程。

                cpp 的 wall_s 本来就是一次转写；MLX 的 wall_s 覆盖同一进程里的
                run1+run2 两次，故减去 run2。**失败的 MLX 运行没有 payload**，
                它的 wall_s 是「启动 + 两次尝试」而不是任何一次转写的测量——
                这种记录必须排除，不能回退成另一种口径（此前正是这样静默混入）。
                """
                if r.get("mlx"):
                    return r["wall_s"] - r["mlx"]["run2_s"]
                return r["wall_s"] if r["engine"] == "whisper.cpp" else None

            singles = [s for s in (single_call(r) for r in rs) if s is not None]
            failed = len(rs) - len(singles)
            cells[f"{engine}/{model}"] = {
                "n": len(rs),
                "cold_wall_s_mean": mean([r["wall_s"] for r in rs]),
                "cold_wall_s_min": min(r["wall_s"] for r in rs),
                "single_call_n": len(singles),
                "single_call_failed_excluded": failed,
                "single_call_s_mean": mean(singles),
                "single_call_s_median": median(singles),
                "single_call_s_min": min(singles) if singles else None,
                "cpp_compute_s_mean": (mean([(r["cli_timings"].get("total_ms", 0)
                                              - r["cli_timings"].get("load_ms", 0)) / 1000
                                             for r in rs if r.get("cli_timings")])
                                       if engine == "whisper.cpp" else None),
                "peak_rss_mb": max(rss) if rss else None,
                "metal_measured": sum(1 for r in rs if r["metal_used"]),
                "metal_evidence": sorted({r.get("metal_evidence") for r in rs if r.get("metal_evidence")}),
                "chars": sorted({r["chars"] for r in rs if r["chars"]}),
                **({
                    "mlx_run1_s_mean": mean([x["run1_s"] for x in mlx]),
                    "mlx_run2_s_mean": mean([x["run2_s"] for x in mlx]),
                    "mlx_startup_s_median": median([r["wall_s"] - x["run1_s"] - x["run2_s"]
                                                    for r in rs if r.get("mlx")
                                                    for x in [r["mlx"]]]),
                    "mlx_run1_peak_mb_mean": mean([x["run1_peak_mb"] for x in mlx]),
                    "mlx_run2_peak_mb_mean": mean([x["run2_peak_mb"] for x in mlx]),
                    "mlx_run2_peak_mb_max": max(x["run2_peak_mb"] for x in mlx),
                } if mlx else {}),
            }
    return {
        "definitions": {
            "cold_wall_s_mean": "mean of per-run process wall time (includes interpreter "
                                "start for MLX, model load for both)",
            "single_call_s_mean": "PRODUCTION SHAPE: one transcription in a cold process. "
                                  "cpp: wall_s as-is. mlx: wall_s - run2_s (= interpreter "
                                  "start + run1), because the MLX process ran run1+run2 "
                                  "(two transcriptions) inside one wall_s",
            "single_call_s_median": "median of the same per-run values (more robust than "
                                    "mean: each cell's first run pays a one-off Metal "
                                    "shader compile)",
            "single_call_s_min": "fastest single-call value in the cell",
            "single_call_n": "runs contributing to single_call_s_* (must equal n unless a "
                             "run failed)",
            "single_call_failed_excluded": "runs dropped from single_call_s_* because the "
                                           "child produced no payload — a failed MLX run's "
                                           "wall_s is 'start + two attempted "
                                           "transcriptions', not a single-call measurement, "
                                           "so it is excluded rather than silently counted "
                                           "under a different basis",
            "cpp_compute_s_mean": "cpp only: mean of (cli_timings.total_ms - load_ms) = the "
                                  "inference part alone, excluding model load and process "
                                  "start. This is the like-for-like partner of MLX's warm "
                                  "run2 (both are 'model resident, no process overhead')",
            "mlx_startup_s_median": "median of wall_s - run1_s - run2_s = Python start + "
                                    "imports + exit (measured, not assumed)",
            "mlx_run1_s_mean": "in-process first transcribe, includes model load",
            "mlx_run2_s_mean": "in-process second transcribe, model resident (warm)",
            "peak_rss_mb": "max over runs of polled child-process RSS peak (ps @0.15s)",
            "mlx_*_peak_mb*": "mx.metal.get_peak_memory(), reset before each transcribe",
            "metal_measured": "runs whose Metal use was observed (cpp: ggml_metal stderr "
                              "line; mlx: mx.metal.is_available() reported by the child)",
        },
        "cells": cells,
    }


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
                "memory": "peak child RSS via ps -o rss= polling @0.15s (macOS "
                          "/usr/bin/time -l gave contradictory readings for identical "
                          "MLX runs: 351MB vs 1707MB, so it was discarded); mlx peak "
                          "via mx.metal.get_peak_memory() reset per run",
                "runs_per_cell": RUNS,
                "machine_at_start": start_state,
                "machine_at_end": machine_state(),
            },
            "summary": summarize(results),
            "results": results,
        }, fh, ensure_ascii=False, indent=1)
    print(f"\nDONE in {time.time() - t_start:.0f}s → {OUT_JSON}", flush=True)


if __name__ == "__main__":
    main()
