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

判据：**n-gram 循环**，不是词级连续重复。
`"when it is, when it is, when it is"` 的重复单元是 3 词短语，逐词比较只能看到
"is, when" 交替，抓不到循环——这是 2026-10-09 第一版检测器漏报的原因
（当时报告「最长连续重复 3」，而人眼一看就是明显循环）。

用法：
    from asr_repetition_guard import inspect_transcript, collapse_repetition
    stats = inspect_transcript(text)      # 检测，不改内容
    clean = collapse_repetition(text)     # 收敛循环，保留首次出现

实测覆盖边界（2026-10-10，147 份真实转写：145 份 MLX ctx-off 语料 + 2 份
whisper.cpp 生产输出）——**不要把它当成比这更强的保证**：
  1. 收敛只对单 token 循环生效：10/147 被改写（Kampung ×26、go ×56、norge ×71…）。
  2. 多词短语循环（周期 ≥ 2）**判得出但收不了**：whisper.cpp 生产口径的 FEMA
     循环（"Thank you." / "For more information, visit www.fema.org" 重复数分钟）
     落在这类 —— contaminated=True 而文本不变。
  3. worst_run 只统计**出现次数最多的那个** n-gram 的连续次数；另一个 n-gram 的
     长连续段看不见（7E6i3E-fsj4 的 "Hard." ×20 因此漏判，同文件
     "Stay in the corner." ×23 是更频繁的分散重复）。
JS 侧等价实现见 lib/asr-repetition-guard.mjs（跨语言向量对照见
scripts/short-video/__tests__/asr-repetition-guard.test.mjs）。
"""

from collections import Counter

# 判定阈值。刻意保守：宁可漏报也不要误伤正常口语（"no, no, no" 是真实内容）。
NGRAM = 3            # 循环单元词数
MIN_REPEATS = 6      # 同一 n-gram 连续出现几次才算循环
MAX_COVERAGE = 0.50  # 分散重复覆盖超过正文这个比例才算污染
MIN_WORDS_FOR_COVERAGE = 40  # 覆盖判据只在长文上采信
#
# 两个信号的地位不同，别混用：
#   · worst_run（**连续**重复次数）是主判据，任何长度都采信 —— 正常口语里同一
#     短语会分散复现，但不会连着一口气重复 6 次以上。实测真循环 run=8..110，
#     正常文本 run≤3。
#   · coverage（**分散**出现占比）是辅判据，且必须配长度下限。它无法区分
#     「真循环」和「主题词反复出现」：实测 5Knkqo-lYF0（正常体育解说，run=1）
#     覆盖 0.312，而 2Gg4OQo7-zA（真循环）只有 0.024 —— 区间完全重叠。
#     短文本更糟：9 个词里出现 3 次就是 0.33，"Thank you. Thank you. Thank you."
#     会被误判。故 coverage 只在 ≥40 词时采信。
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


def _words(text):
    return [w for w in (text or "").split() if w]


def _norm(word):
    return word.lower().strip(".,!?;:\"'()[]—–-")


def _is_wordless_script(text):
    """无词边界语言（中文/日文）：按空格切词无效，n-gram 判定不适用。"""
    letters = [c for c in (text or "") if c.isalpha()]
    if not letters:
        return False
    cjk = sum(1 for c in letters
              if any(lo <= ord(c) <= hi for lo, hi in NO_SPACE_SCRIPTS))
    return cjk / len(letters) > CJK_RATIO


def inspect_transcript(text, n=NGRAM, min_repeats=MIN_REPEATS):
    """统计转写里的 n-gram 循环程度。不修改文本。

    Returns:
        {"words": int, "top_ngram": tuple|None, "top_count": int,
         "coverage": float, "worst_run": int, "contaminated": bool}
        coverage = top_count * n / words —— 被最长循环覆盖的正文比例
        worst_run = 同一 n-gram 连续重复的最大次数
        contaminated = coverage > MAX_COVERAGE 或 worst_run >= min_repeats
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

    # 最长**连续**重复次数（同一个 n-gram 一次接一次，中间不隔别的）
    worst = cur = 0
    for g in grams:
        cur = cur + 1 if g == top else 0
        worst = max(worst, cur)

    coverage = count * n / len(w)
    long_enough = len(w) >= MIN_WORDS_FOR_COVERAGE
    out.update(top_ngram=top, top_count=count, coverage=round(coverage, 3),
               worst_run=worst,
               contaminated=worst >= min_repeats
                            or (long_enough and coverage > MAX_COVERAGE))
    return out


def collapse_repetition(text, n=NGRAM, min_repeats=MIN_REPEATS):
    """把连续重复的 n-gram 循环收敛成一次出现，其余内容原样保留。

    只处理**连续**循环（A A A A → A）。分散出现的重复（正常口语里同一短语
    在片中出现多次）不动——那可能是真实内容，删掉就是篡改转写。

    收敛后如果原本被判为污染，末尾补一个标记，让下游知道这条转写被改过。
    """
    w = _words(text)
    if len(w) < n * 2:
        return text

    stats = inspect_transcript(text, n, min_repeats)
    if not stats["contaminated"]:
        return text

    norm = [_norm(x) or "\x00" for x in w]   # 空串占位，避免与真实空 token 混淆
    out, i = [], 0
    while i < len(w):
        gram = tuple(norm[i:i + n])
        if len(gram) == n:
            # 数一数同一个 n-gram 连续重复几次
            reps, j = 1, i + n
            while j + n <= len(w) and tuple(norm[j:j + n]) == gram:
                reps += 1
                j += n
            if reps >= min_repeats:
                out.extend(w[i:i + n])          # 保留第一次
                out.append(f"[重复×{reps}已收敛]")
                i = j
                continue
        out.append(w[i])
        i += 1
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
