#!/usr/bin/env python3
"""转写重复幻觉守卫 —— 后端无关的检测 + 收敛。

为什么需要它：ctx-off（`condition_on_previous_text=False`）只是**降低**幻觉概率，
不是消除。2026-10-09 实测：

  · MLX whisper-large-v3 + ctx-off：`0ag_Qi5OEd0` 输出 74 词里 28 个连续 "Kampung"
  · whisper.cpp large-v3-turbo + `-mc 0`（生产口径）：同一视频输出 8 分钟
    "Thank you." / "For more information, visit www.fema.org" 循环
  · 两个后端都会在低信噪 / 长静音 / 音乐段上陷入循环

所以「关上下文」是必要不充分条件。本模块提供第二道防线，且**不依赖任何后端参数**
——因为 MLX 后端没有 `repetition_penalty`（`mlx_whisper.transcribe` 无此参数），
whisper.cpp 也没有等价的惩罚项，只有 `-mc/-et/-nth/-sns` 这些间接旋钮。
后处理是唯一能同时覆盖两个后端的位置。

判据：**周期感知的连续循环**，不是词级连续重复。
`"when it is, when it is, when it is"` 的重复单元是 3 词短语，逐词比较只能看到
"is, when" 交替，抓不到循环 —— 这是 2026-10-09 第一版检测器漏报的原因。
2026-10-10 扩展：单元长度 p 不再固定为 3，而是 1..16 的任意周期；收敛按周期
保留首次出现。同一轮把 worst_run 从「最高频 n-gram 的连续次数」改成
「所有 n-gram 的最大连续次数」（7E6i3E-fsj4 的 "Hard." ×20 因此从漏判变判出）。

用法：
    from asr_repetition_guard import inspect_transcript, collapse_repetition
    stats = inspect_transcript(text)      # 检测，不改内容
    clean = collapse_repetition(text)     # 收敛循环，保留首次出现

实测覆盖（2026-10-10，148 份真实转写：145 份 MLX ctx-off 语料 + 3 份
whisper.cpp 生产输出）——**不要把它当成比这更强的保证**：
  1. 收敛条件：周期 p ≤ 16、重复 ≥ 6 次、跨度 ≥ 18 词。148 份里 17 份被改写
     （旧判据 10 份）：单 token 循环（Kampung ×26、go ×56、norge ×71）与
     短语循环（"I'm not sure if I can do this." ×14、"Stay in the corner." ×23、
     "The pot is being sold for only 6,000 won." ×8、德语 ×8）都收得掉。
  2. 跨度 < 18 词的连续重复**不动**，即使 inspect 判污染：实测真内容
     "Goal!" ×10（体育解说）与 "Bang," ×14（歌词）在此列。同一条也把
     "Thank you." ×8（1pHkv4KUiFY，16 词）留在未收敛侧 —— 同形状在真实
     演讲里出现（CwzjlmBLfrQ 的 ×6 致谢）。
  3. 交错多短语循环仍**判得出、收不了**：生产 whisper.cpp 的 FEMA 循环
     （17 段 / 488s / 4 种文本，"fema 语 + thank you" 段长不等）没有单段
     ≥18 词的周期运行。根因是低信噪/音乐段（VAD 领域），
     不是文本后处理能安全收敛的形状。

JS 侧等价实现见 lib/asr-repetition-guard.mjs（跨语言向量对照见
scripts/short-video/__tests__/asr-repetition-guard.test.mjs）。
"""

from collections import Counter

# 判定阈值。刻意保守：宁可漏报也不要误伤正常口语（"no, no, no" 是真实内容）。
NGRAM = 3            # 辅判据（coverage / worst_run）的 n-gram 词数
MIN_REPEATS = 6      # 同一单元连续重复几次才算循环
MAX_COVERAGE = 0.50  # 分散重复覆盖超过正文这个比例才算污染
MIN_WORDS_FOR_COVERAGE = 40  # 覆盖判据只在长文上采信
PERIOD_MAX = 16      # 循环单元最长词数（更长的"单元"更像正常内容而非解码循环）
MIN_RUN_WORDS = 18   # 一次收敛至少要覆盖的连续词数（= 6 个 3 词单元）
#
# 两个信号的地位不同，别混用：
#   · worst_run（**连续**重复次数，取所有 n-gram 的最大值）是主判据，任何长度
#     都采信 —— 正常口语里同一短语会分散复现，但不会连着一口气重复 6 次以上。
#     实测真循环 run=8..110，正常文本 run≤3。
#   · coverage（**分散**出现占比）是辅判据，且必须配长度下限。它无法区分
#     「真循环」和「主题词反复出现」：实测 5Knkqo-lYF0（正常体育解说，run=1）
#     覆盖 0.312，而 2Gg4OQo7-zA（真循环）只有 0.024 —— 区间完全重叠。
#     短文本更糟：9 个词里出现 3 次就是 0.33，"Thank you. Thank you. Thank you."
#     会被误判。故 coverage 只在 ≥40 词时采信。
#   · periodic run（周期感知连续段）是 2026-10-10 新增的判据，与收敛共用同一
#     扫描：p ≤ PERIOD_MAX、reps ≥ MIN_REPEATS、E ≥ MIN_RUN_WORDS。三者的
#     关系是「同一条规则的三种视角」，改阈值必须同时改 collapse 与两语言实现。
#
# 无词边界语言（CJK 汉字/假名）：按空格切词会把整段中文变成一个「词」，
# n-gram 逻辑失效（实测 InHaW59CmDw 的 9 个「词」里塞了整段 3000 字中文）。
# 注意韩语有空格，不属此类 —— 早期版本按「非 ASCII 占比」判断，把韩语
# 误判为无词边界，导致 0FM64MrRuZE 的 "아" ×37 真循环被跳过。
NO_SPACE_SCRIPTS = (
    (0x3400, 0x4DBF),    # CJK 扩展 A
    (0x4E00, 0x9FFF),    # CJK 基本区
    (0xF900, 0xFAFF),    # CJK 兼容
    (0x3040, 0x309F),    # 平假名
    (0x30A0, 0x30FF),    # 片假名
)
CJK_RATIO = 0.30     # 上述文字占比超过此值视为无词边界

PLACEHOLDER = "\x00"  # 标点-only token 的归一化占位（保留位置，不算内容词）


def _words(text):
    return [w for w in (text or "").split() if w]


def _norm(word):
    return word.lower().strip(".,!?;:\"'()[]—–-")


def _norm_list(text):
    """归一化词表，与原文 token 一一对应；标点-only token 记为占位符。

    收敛与周期扫描都用这份列表 —— 两边必须用同一份，否则会出现
    「inspect 判出运行、collapse 找不到」的不一致。
    """
    return [_norm(x) or PLACEHOLDER for x in _words(text)]


def _is_wordless_script(text):
    """无词边界语言（中文/日文）：按空格切词无效，n-gram 判定不适用。"""
    letters = [c for c in (text or "") if c.isalpha()]
    if not letters:
        return False
    cjk = sum(1 for c in letters
              if any(lo <= ord(c) <= hi for lo, hi in NO_SPACE_SCRIPTS))
    return cjk / len(letters) > CJK_RATIO


def _periodic_runs(norm, p_max=PERIOD_MAX, min_repeats=MIN_REPEATS,
                   min_words=MIN_RUN_WORDS):
    """扫描周期连续段，返回 [(start, period, run_words)]（贪心、左到右）。

    对每个起点 i、每个周期 p：把 E 从 p 起尽可能延伸，保持
    norm[i+E] == norm[i+E-p]（即 [i, i+E) 以 p 为周期）。满足
    E >= min_words、E // p >= min_repeats、且单元里至少有一个真词
    （纯标点段不算内容循环）时算候选；同一 i 取 E 最大者，平手取小 p。
    收敛后跳到 i+E 继续，避免重叠计数。
    """
    runs = []
    i = 0
    length = len(norm)
    while i < length:
        best = None
        p = 1
        while p <= p_max and i + 2 * p <= length:
            e = p
            while i + e < length and norm[i + e] == norm[i + e - p]:
                e += 1
            if (e >= 2 * p and e >= min_words and e // p >= min_repeats
                    and any(t != PLACEHOLDER for t in norm[i:i + p])):
                if best is None or e > best[1] or (e == best[1] and p < best[0]):
                    best = (p, e)
            p += 1
        if best is None:
            i += 1
        else:
            runs.append((i, best[0], best[1]))
            i += best[1]
    return runs


def inspect_transcript(text, n=NGRAM, min_repeats=MIN_REPEATS):
    """统计转写里的循环程度。不修改文本。

    Returns:
        {"words": int, "top_ngram": tuple|None, "top_count": int,
         "coverage": float, "worst_run": int, "contaminated": bool,
         "skipped": str|None}
        coverage = top_count * n / words —— 被最高频 n-gram 覆盖的正文比例
        worst_run = 所有 n-gram 里最大的**连续**重复次数（不再只看最高频那个）
        contaminated = worst_run >= min_repeats
                      或（≥40 词且 coverage > MAX_COVERAGE）
                      或存在合格周期运行（见 _periodic_runs）
    """
    w = [_norm(x) for x in _words(text)]
    # 标点-only token 归一后变成空串，会造出 ('','','') 这种伪 n-gram。
    # 实测 2za5RwplXdI / QtKT3q7xB4M 就是这样被判污染的。
    w = [x for x in w if x]
    out = {"words": len(w), "top_ngram": None, "top_count": 0,
           "coverage": 0.0, "worst_run": 0, "contaminated": False,
           "skipped": None}
    if _is_wordless_script(text):
        out["skipped"] = "wordless-script"
        return out
    if len(w) < n * 2:
        out["skipped"] = "too-short"
        return out

    grams = [tuple(w[i:i + n]) for i in range(len(w) - n + 1)]
    top, count = Counter(grams).most_common(1)[0]

    # 所有 n-gram 的最大**连续**次数（同一个 n-gram 一次接一次，中间不隔别的）。
    # 2026-10-10 前只统计 top 那一个 —— 7E6i3E-fsj4 的 "Hard." ×20 因此漏判。
    worst = 0
    prev, run = None, 0
    for g in grams:
        run = run + 1 if g == prev else 1
        prev = g
        worst = max(worst, run)

    coverage = count * n / len(w)
    long_enough = len(w) >= MIN_WORDS_FOR_COVERAGE
    has_periodic_run = bool(_periodic_runs(_norm_list(text)))
    out.update(top_ngram=top, top_count=count, coverage=round(coverage, 3),
               worst_run=worst,
               contaminated=worst >= min_repeats
                            or (long_enough and coverage > MAX_COVERAGE)
                            or has_periodic_run)
    return out


def collapse_repetition(text, n=NGRAM, min_repeats=MIN_REPEATS):
    """把连续循环收敛成一次出现，其余内容原样保留。

    周期感知：循环单元可以是 1..PERIOD_MAX 个词（"Kampung" ×26 → 一个
    "Kampung"；"I'm not sure if I can do this." ×14 → 该句一次），保留首次
    出现并插入 `[重复×N已收敛]`。**分散**出现的重复（正常口语里同一短语在
    片中多次出现）不动 —— 那可能是真实内容，删掉就是篡改转写。

    只在 inspect 判污染时改写；跨度 < MIN_RUN_WORDS 的连续重复即使被判污染
    也不动（保守不对称：宁可漏收敛也不删真实内容，见模块 docstring）。
    """
    w = _words(text)
    if len(w) < n * 2:
        return text

    stats = inspect_transcript(text, n, min_repeats)
    if not stats["contaminated"]:
        return text

    runs = _periodic_runs(_norm_list(text))
    if not runs:
        return text

    out, cursor = [], 0
    for start, period, span in runs:
        out.extend(w[cursor:start])
        out.extend(w[start:start + period])   # 保留第一次出现
        out.append(f"[重复×{span // period}已收敛]")
        cursor = start + span
    out.extend(w[cursor:])
    return " ".join(out)


if __name__ == "__main__":
    import sys
    for path in sys.argv[1:]:
        import json
        d = json.load(open(path, encoding="utf-8"))
        t = d.get("text", "") if isinstance(d, dict) else str(d)
        s = inspect_transcript(t)
        print(f"{path}: {s}")
        if s["contaminated"]:
            print("  收敛后:", collapse_repetition(t)[:300])
