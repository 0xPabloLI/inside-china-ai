#!/usr/bin/env python3
"""结果文件溯源 —— 记录「这一臂到底喂了什么」，不只是「跑出了多少分」。

起因（2026-10-09）：翻遍 27 个结果文件，**没有一个记录喂了几帧、用了多大
像素预算**。于是「Omni 又快又准度低」是模型弱还是喂得少，事后完全查不出来
——只能重新跑探针去猜。同一天还发现两个模型自带的 `max_pixels` 相差 1.96×
（VL 25,165,824 / Omni 12,845,056），视觉 token 数因此差 2 倍：这是**事后
才发现的混杂**，而它本可以在跑的时候就记下来。

这跟 `asr_provenance`（Q41⑤ 的教训）是同一类问题：结果文件缺输入侧字段，
结论就无法自证。故本模块把「输入侧事实」集中采集一次，供各臂直接并入结果。

设计取舍：
  · 只采集**能从运行时对象直接读到**的事实，不做推断。宁可留空也不猜。
  · 读不到就记 None 并附 reason，而不是省略键 —— 缺键和值为空在事后
    是两种不同的信息（前者看不出是否问过）。
  · 不引入依赖：不 import mlx_vlm，处理器对象由调用方传入。
"""

import os


def _rel(path, root):
    """相对路径优先（可读、不含用户名），跨盘/None 时退回原值。"""
    if path is None:
        return None
    try:
        return os.path.relpath(path, root)
    except Exception:
        return str(path)


def _prompt_version():
    """读共享 prompt 模块的版本号；模块不可用时记 None 而非崩。"""
    try:
        import bench_prompt
        return getattr(bench_prompt, "PROMPT_VERSION", None)
    except Exception as e:
        return f"unavailable: {type(e).__name__}"


def processor_budgets(processor):
    """读出各处理器上的 max_pixels —— 分辨率预算的直接读数。

    三个位置都要看：`processor` 本体、`video_processor`、`image_processor`。
    只看一个是 2026-10-05 踩过的坑（只改一个会让同一次调用里的两条路径
    用不同预算）。这里同理：只记一个会漏掉真正生效的那个。
    """
    out = {}
    for name, owner in (("processor", processor),
                        ("video_processor",
                         getattr(processor, "video_processor", None)),
                        ("image_processor",
                         getattr(processor, "image_processor", None))):
        if owner is None:
            continue
        if hasattr(owner, "max_pixels"):
            out[name] = getattr(owner, "max_pixels")
        # 图像侧的另两个常见旋钮：记下来才知道分辨率是被哪一维压的
        for extra in ("min_pixels", "max_pixels_longest_edge"):
            if hasattr(owner, extra):
                out[f"{name}.{extra}"] = getattr(owner, extra)
    return out or None


def video_sampling(processor):
    """读出库级/处理器级的视频采样决议（fps / min_frames / max_frames）。

    帧数 = 时长 × fps（受 max_frames 封顶、min_frames 兜底），所以「喂了几帧」
    由这三个数 + 视频时长唯一决定。探针实测两模型此三项相同（fps=2.0,
    min 4, max 768）—— 但那是**这次**的结论，不记下来下次还得重测。
    """
    try:
        from mlx_vlm.utils import resolve_video_sampling
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}
    try:
        s = resolve_video_sampling(processor, {})
        return {"fps": getattr(s, "fps", None),
                "min_frames": getattr(s, "min_frames", None),
                "max_frames": getattr(s, "max_frames", None)}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}


def collect(processor, root, *, model=None, native_video=None,
            asr_dir=None, asr_mode=None, max_tokens=None,
            temperature=None, extra=None):
    """采集一份可直接 json.dump 的溯源块。

    Args:
        processor: 已加载的 mlx-vlm 处理器（未加载则传 None，各字段记 None）
        root: 仓库根，用于把路径转成相对路径
        model: 模型 id / 本地路径
        native_video: 是否走原生视频输入（vs 抽帧喂图）
        asr_dir: 转写目录（无转写臂传 None）
        asr_mode: 转写注入方式（block/ts/full/after）
        max_tokens / temperature: 解码参数
        extra: 其它需要固化的键值
    """
    prov = {
        "model": model,
        "native_video": native_video,
        # prompt 口径版本：prompt 或打分器一变就 +1。没有它，事后看到两个臂
        # 分数不同时无法排除「口径不同」这个解释。
        "prompt_version": _prompt_version(),
        "max_pixels": processor_budgets(processor) if processor else None,
        "video_sampling": video_sampling(processor) if processor else None,
        "asr": ({"dir": _rel(asr_dir, root), "mode": asr_mode}
                if asr_dir else
                {"dir": None, "mode": None, "note": "arm has no transcript"}),
        "decode": {"max_tokens": max_tokens, "temperature": temperature},
    }
    if extra:
        prov.update(extra)
    return prov


def frame_stats(rows, key="n_frames"):
    """从逐行记录里汇总实际帧数 —— 帧数可能逐视频不同（时长不同）。

    返回 None 表示这一臂**根本没记帧数**（抽帧臂之外的旧结果大多如此）。
    与「记了但都是 0」区分开：后者是采集 bug，前者是没采集。
    """
    vals = [r.get(key) for r in rows if isinstance(r.get(key), int)]
    if not vals:
        return None
    vals_sorted = sorted(vals)
    return {"n": len(vals),
            "min": vals_sorted[0],
            "median": vals_sorted[len(vals_sorted) // 2],
            "max": vals_sorted[-1],
            "mean": round(sum(vals) / len(vals), 1)}
