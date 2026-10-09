#!/usr/bin/env python3
"""QA 臂的共享 prompt / 转写 / 答案解析 —— 单一事实来源。

为什么必须共享（2026-10-09，用户裁决「以后都这么执行」）：

prompt 文本此前在 `exp_videomme_qa.py` 和 `exp_qwen_omni_video.py` 里**各写了一份**。
两份当时逐字节相同（已核：带转写 1540 字符、纯视觉 316 字符，均一致），所以**已有
结果不受影响**。但「当时相同」不是保障 —— 改一边忘一边，两个模型臂就不再可比，
而且这种漂移**没有任何信号**：分数照样出，只是对比失效。这正是 Q41⑥ 那类
「事后才发现混杂」的同一个坑，只是这次它还没踩。

跨模型对比的前提是「同一 prompt 逐字节喂给两个模型」。把这个前提做成**一份代码**
而不是「两份代码看着一样」，是唯一能防住漂移的办法。

同理收敛进来的还有转写读取与答案解析：
  · 转写读取：截断长度（2000 字符）与注入措辞必须一致，否则文本通道长度不同
  · 答案解析：lenient（首个 A-D 字符）与 strict（字母即答案）必须两边同款，
    否则「同题不同分」可能只是解析器不同

口径变更须知：改本文件的 prompt 或解析器 = 改所有臂的输入。
已落盘的结果是用旧口径跑的，**改完不能直接和旧结果比**——要么重跑，要么在
结果文件里记下口径版本。故本文件导出 `PROMPT_VERSION`，供结果文件落档。
"""

import json
import os
import re

# prompt 结构或措辞一变就要 +1。结果文件应记录它，否则事后无法判断
# 「两臂分数不同」是模型差异还是口径差异。
PROMPT_VERSION = 1

# 转写注入的两种位置。block = 题目之前（默认，既有结果的口径）；
# after = 题目之后（对照「位置是否影响注意力」）。
ASR_MODES = ("block", "ts", "full", "after")

DEFAULT_MAX_CHARS = 2000

# 转写头措辞：两边必须逐字相同。刻意保留「可能不完整、可能有错」——
# 这是给模型的诚实前提，让它在转写缺信息时回落视觉而非硬编。
ASR_HEAD = "视频的语音转写（可能不完整、可能有错）："
# after 模式的历史措辞少了「有错」二字。保持原样以免改变已跑臂的输入。
ASR_TAIL = "视频的语音转写（可能不完整）："

ANSWER_INSTRUCTION = "Answer with the option letter only (A, B, C, or D)."


def transcript_text(asr_dir, vid, mode="block", max_chars=DEFAULT_MAX_CHARS):
    """读一个视频的转写并按模式成形。缺文件/坏 JSON 返回空串（不抛）。"""
    if not asr_dir:
        return ""
    p = os.path.join(asr_dir, f"{vid}.json")
    if not os.path.exists(p):
        return ""
    try:
        d = json.load(open(p, encoding="utf-8"))
    except Exception:
        return ""
    if mode == "ts":
        return "\n".join(
            f"[{int(s['start'] // 60):02d}:{s['start'] % 60:04.1f}] {s['text']}"
            for s in d.get("segments", [])[:80])
    t = d.get("text", "")
    return t if mode == "full" else t[:max_chars]


def build_prompt(question, options, transcript="", mode="block"):
    """拼一道题的完整 prompt。**跨模型对比的唯一事实来源。**

    mode 只影响转写位置：block/ts/full 放题目之前，after 放之后。
    无转写时四种模式输出相同（纯视觉臂）。

    注意 options 可能为空（Video-MME 有少数无选项题）——此时不产出
    "Options:" 段，与既有口径一致。
    """
    opts = list(options) if isinstance(options, (list, tuple)) else \
        [o.strip() for o in str(options).split("|")]
    body = f"{question}\nOptions:\n" + \
        "\n".join(f"{'ABCD'[i]}. {o}" for i, o in enumerate(opts)) + \
        f"\n\n{ANSWER_INSTRUCTION}"

    if not transcript:
        return body
    if mode == "after":
        return body + f"\n\n{ASR_TAIL}\n{transcript}"
    return f"{ASR_HEAD}\n{transcript}\n\n{body}"


def parse_lenient(raw):
    """首个 A-D 字符。既有臂的口径，保留以维持与已落盘结果可比。"""
    m = re.search(r"[ABCD]", str(raw).strip().upper())
    return m.group(0) if m else "?"


def parse_strict(raw):
    """字母必须**就是**答案，而不是散文里的字母。

    lenient 会把 'D'ON'T / 'B'ASED / 'A'NSWER 里的首字母当成答案。两把尺
    都记进逐行结果，让分歧率被**测量**而不是被争论。
    """
    s = str(raw).strip().upper()
    m = re.match(r"^\s*\[?([ABCD])\]?[\s.:!]*$", s)
    return m.group(1) if m else "?"


def strip_thinking(raw):
    """剥掉推理块，让打分器只看到答案。

    Thinking 模型先输出思维链再给答案，而 `parse_lenient` 会扫到**任意位置**
    的首个 A-D 字符 —— 思维链里的字母会被当成答案。故切在**最后一个**闭合标签
    之后：模型若在答完后又回到推理，仍按最终答案计分。没有闭合标签 = 没有推理
    块，原文原样通过（Instruct 臂不受这条路影响）。
    """
    s = str(raw)
    for close in ("</think" + ">", "</thinking>", "<|/think|>"):
        i = s.rfind(close)
        if i != -1:
            return s[i + len(close):]
    return s


# 未被其他字母粘连的大写 A-D：'The answer is C' 里的 C 命中，
# "answer" 里的 a 不命中。
_THINK_LETTER = re.compile(r"(?<![A-Za-z])([ABCD])(?![A-Za-z])")


def parse_thinking(raw):
    """推理臂的打分器 → (字母, 层级)。

    lenient 在这里不可用：它取任意位置的首个 A-D 字符，而 "answer" 里含 a，
    于是 "The answer is C" 被判成 "A"。历史臂保持 lenient（数字已落盘，打分器
    不能在它们脚下移动）；推理臂是新的，用真正读答案的解析器。层级被记下来，
    让「这次跑依赖了宽松路径」可见而不是静默。
    """
    s = strip_thinking(raw)
    strict = parse_strict(s)
    if strict != "?":
        return strict, "strict"
    m = _THINK_LETTER.search(s)
    if m:
        return m.group(1), "loose"
    return "?", "none"
