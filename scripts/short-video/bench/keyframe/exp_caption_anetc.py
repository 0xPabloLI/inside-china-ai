#!/usr/bin/env python3
"""#391 — 描述质量评测（ActivityNet Captions，per-event 标准协议），生成端。

为什么用这个基准：用户的目标是「让模型把视频内容描述清楚」，而 Video-MME 的题
「仅凭画面即可作答」、KFS-Bench 的 GT 是「答题必需场景」——两者都测不到描述质量。
ActivityNet Captions 是唯一「分钟级 + 密集人工描述」的主流基准，标准指标是
CIDEr（主）/ METEOR / BLEU-4（同一套 pycocoevalcap）。

协议（照标准做，不做变通）：
  - 官方 val_1 切分，**按事件（per-event）评**：每个事件有 1 条人工参考描述。
  - 生成端对每个事件输出**一句英文描述**（参考也是单句；长段落会被 CIDEr 惩罚，
    这是有发表批评的已知特性）。
  - ⚠️ 因此 prompt 用英文、并要求一句话——生成语言与参考语言不一致会得零分。
  - oracle proposal（用 GT 的事件区间）——这是该基准的标准设定。

生成这段跑在 mlx-vlm 环境（要模型）；评分由 score_captions.py 在 caption-metrics
环境里用 pycocoevalcap 算，两个环境互不污染。

Run: ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/exp_caption_anetc.py
"""

import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
ANETC = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "anetc")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import exp_tiered as et  # noqa: E402

LIMIT = int(os.environ.get("CAP_VIDEOS", "110"))
BUDGET = int(os.environ.get("CAP_FRAMES", "8"))     # events average ~36 s
OUT = os.path.join(RESULTS, "caption_anetc.json")
PROMPT = ("Describe, in one detailed English sentence, what happens in this "
          "video segment. Mention the people, the main action and the setting.")


def main():
    import vlm_analyzer as vlm
    from PIL import Image
    anno = json.load(open(os.path.join(ANETC, "val_1.json"), encoding="utf-8"))
    # yt-dlp 落的文件名是纯 YouTube ID，而标注的 key 带 "v_" 前缀
    stems = sorted(f[:-4] for f in os.listdir(os.path.join(ANETC, "videos"))
                   if f.endswith(".mp4"))
    pairs_ = [(s if s in anno else "v_" + s, s) for s in stems]   # (标注 key, 文件 stem)
    pairs_ = [(k, s) for k, s in pairs_ if k in anno][:LIMIT]
    done = {}
    if os.path.exists(OUT):
        for r in json.load(open(OUT, encoding="utf-8")):
            done[(r["videoID"], r["eventIdx"])] = r
    model, processor = vlm.load_model(vlm.MODEL_ID)
    try:
        vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)
    except Exception as e:
        print(f"warmup: {e}", flush=True)
    rows = list(done.values())
    stem_of = dict(pairs_)
    todo = [(k, i) for k, _s in pairs_
            for i in range(len(anno[k]["sentences"])) if (k, i) not in done]
    print(f"{len(pairs_)} videos | {len(todo)} events to caption "
          f"({len(done)} cached)", flush=True)
    t0 = time.time()
    for k, (vid, ei) in enumerate(todo):
        # 官方 schema：sentences 是字符串列表，timestamps 是并行的 [start, end] 列表
        ev_text = anno[vid]["sentences"][ei]
        lo, hi = (float(x) for x in anno[vid]["timestamps"][ei])
        video = os.path.join(ANETC, "videos", f"{stem_of[vid]}.mp4")
        dur = bc.asset_duration(video)
        hi = min(hi, dur)
        try:
            ts, _ = et.tiered_timestamps(video, budget=BUDGET, densify=True,
                                         enforce_floor=True,
                                         floor=max(2.0, (hi - lo) / BUDGET))
            ts = [t for t in ts if lo <= t <= hi][:BUDGET] or [round((lo + hi) / 2, 2)]
            frames = []
            for t in ts:
                cell = bc.grab_frame(video, t, size_w=448)
                if cell:
                    p = f"/tmp/cap_{vid}_{ei}_{len(frames)}.jpg"
                    Image.open(cell).save(p, quality=88)
                    os.unlink(cell)
                    frames.append(p)
            pred = vlm.generate_response(
                model, processor, engine=vlm.DEFAULT_ENGINE,
                image_paths=frames, prompt_text=PROMPT, max_tokens=120).strip()
            for p in frames:
                os.unlink(p)
        except Exception as e:
            pred = ""
            print(f"  {vid}#{ei} FAILED {type(e).__name__}: {str(e)[:80]}", flush=True)
        rows.append({"videoID": vid, "eventIdx": ei, "start": lo, "end": hi,
                     "ref": ev_text.strip(), "pred": pred})
        if (k + 1) % 20 == 0:
            json.dump(rows, open(OUT, "w", encoding="utf-8"),
                      ensure_ascii=False, indent=1)
            el = time.time() - t0
            print(f"[{k+1}/{len(todo)}] {el:.0f}s elapsed "
                  f"({el/(k+1):.1f}s/event)", flush=True)
    json.dump(rows, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"DONE {len(rows)} captions → {OUT}", flush=True)


if __name__ == "__main__":
    main()
