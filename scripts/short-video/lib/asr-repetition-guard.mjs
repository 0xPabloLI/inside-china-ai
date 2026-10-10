/**
 * 转写重复幻觉护栏（JS 生产侧）—— 与 `lib/asr_repetition_guard.py` 同判据。
 *
 * 为什么需要它：ctx-off（`condition_on_previous_text=False` / `--max-context 0`）
 * 只是**降低**幻觉概率，不是消除。whisper.cpp 生产口径实测仍有循环（`-mc 0`
 * 下 8 分钟 "Thank you." / "visit www.fema.org" 循环）；MLX 侧 145 份 ctx-off
 * 转写里 17 份被本护栏判定需要收敛。
 * 解码层参数在两个后端都不存在等价的惩罚项，所以后处理是唯一能同时覆盖
 * 两个后端的位置。
 *
 * 判据（2026-10-10 扩展后）：**周期感知的连续循环**。
 *   1. 收敛：任意单元长度 p ≤ PERIOD_MAX（16）、连续重复 ≥ MIN_REPEATS（6）次、
 *      跨度 ≥ MIN_RUN_WORDS（18）词 —— 按周期保留首次出现 + 标记。
 *      旧实现只认 stride-3 对齐的 n-gram 块，短语循环（p=4、p=8、p=9…）
 *      整个漏掉；本轮起按单元周期收敛。
 *   2. `worstRun` = **所有** n-gram 的最大连续次数（旧口径只看最高频那个，
 *      "Hard." ×20 因此漏判）。
 *   3. coverage 仍是辅判据（≥40 词且最高频 n-gram 覆盖 > 0.50）。
 * 细节与阈值理由见 Python 参考实现（它带着全部实测证据注释）。本文件是等价
 * 移植，`asr-repetition-guard.test.mjs` 用共享向量逐字段对照两个实现。
 *
 * 保守方向：宁可漏报也不误伤正常口语（"Goal! Goal! Goal!" 是真实解说，
 * "Bang, bang, bang" 是真实歌词 —— 都短于 18 词下限，不动）。
 *
 * 实测覆盖边界（2026-10-10，148 份真实转写：145 份 MLX ctx-off 语料 +
 * 3 份 whisper.cpp 生产输出）——**不要把它当成比这更强的保证**：
 *   1. 收敛条件：p ≤ 16、重复 ≥ 6 次、跨度 ≥ 18 词。17/148 被改写（旧判据
 *      10/148）：单 token 循环（Kampung ×26、go ×56、norge ×71）与短语循环
 *      （"I'm not sure if I can do this." ×14、"Stay in the corner." ×23、
 *      "The pot is being sold for only 6,000 won." ×8）都收得掉。
 *   2. 跨度 < 18 词的连续重复**不动**，即使 inspect 判污染：实测真内容
 *      "Goal!" ×10、"Bang," ×14 在此列；"Thank you." ×8（16 词）也留在未收敛侧。
 *   3. 交错多短语循环仍**判得出、收不了**：生产 whisper.cpp 的 FEMA 循环
 *      （17 段 / 488s / 4 种文本，段长不等）没有单段 ≥18 词的周期运行；
 *      根因是低信噪/音乐段（VAD 领域）。
 * 三条都用测试钉住，改动其中任何一条都要有意识的评审。
 */

/** 判定阈值（与 Python 侧同值）。 */
export const NGRAM = 3;
export const MIN_REPEATS = 6;
export const MAX_COVERAGE = 0.5;
export const MIN_WORDS_FOR_COVERAGE = 40;
export const PERIOD_MAX = 16;
export const MIN_RUN_WORDS = 18;

// 无词边界语言（CJK 汉字/假名）：按空格切词会把整段中文变成一个「词」，
// n-gram 逻辑失效。注意韩语有空格，不属此类。
const NO_SPACE_SCRIPTS = [
  [0x3400, 0x4dbf], // CJK 扩展 A
  [0x4e00, 0x9fff], // CJK 基本区
  [0xf900, 0xfaff], // CJK 兼容
  [0x3040, 0x309f], // 平假名
  [0x30a0, 0x30ff], // 片假名
];
const CJK_RATIO = 0.3;

const STRIP_CHARS = ".,!?;:\"'()[]\u2014\u2013-";
// 标点-only token 的归一化占位（保留位置，不算内容词）。
const PLACEHOLDER = "\u0000";

function words(text) {
  return String(text ?? "")
    .split(/\s+/)
    .filter(Boolean);
}

function norm(word) {
  let start = 0;
  let end = word.length;
  while (start < end && STRIP_CHARS.includes(word[start])) start += 1;
  while (end > start && STRIP_CHARS.includes(word[end - 1])) end -= 1;
  return word.slice(start, end).toLowerCase();
}

/** 归一化词表，与原文 token 一一对应；标点-only token 记为占位符。
 *  收敛与周期扫描都用这份列表 —— 两边必须用同一份，否则会出现
 *  「inspect 判出运行、collapse 找不到」的不一致。 */
function normList(text) {
  return words(text).map((w) => norm(w) || PLACEHOLDER);
}

function isWordlessScript(text) {
  const letters = [...String(text ?? "")].filter((c) => /\p{L}/u.test(c));
  if (letters.length === 0) return false;
  const cjk = letters.filter((c) => {
    const cp = c.codePointAt(0);
    return NO_SPACE_SCRIPTS.some(([lo, hi]) => cp >= lo && cp <= hi);
  }).length;
  return cjk / letters.length > CJK_RATIO;
}

/**
 * 扫描周期连续段，返回 [[start, period, runWords], …]（贪心、左到右）。
 *
 * 对每个起点 i、每个周期 p：把 E 从 p 起尽可能延伸，保持
 * norm[i+E] === norm[i+E-p]（即 [i, i+E) 以 p 为周期）。满足
 * E >= minWords、floor(E/p) >= minRepeats、且单元里至少有一个真词
 * （纯标点段不算内容循环）时算候选；同一 i 取 E 最大者，平手取小 p。
 * 收敛后跳到 i+E 继续，避免重叠计数。
 */
function periodicRuns(norm, pMax = PERIOD_MAX, minRepeats = MIN_REPEATS, minWords = MIN_RUN_WORDS) {
  const runs = [];
  let i = 0;
  const length = norm.length;
  while (i < length) {
    let best = null;
    for (let p = 1; p <= pMax && i + 2 * p <= length; p += 1) {
      let e = p;
      while (i + e < length && norm[i + e] === norm[i + e - p]) e += 1;
      if (
        e >= 2 * p &&
        e >= minWords &&
        Math.floor(e / p) >= minRepeats &&
        norm.slice(i, i + p).some((t) => t !== PLACEHOLDER)
      ) {
        if (best === null || e > best[1] || (e === best[1] && p < best[0])) best = [p, e];
      }
    }
    if (best === null) {
      i += 1;
    } else {
      runs.push([i, best[0], best[1]]);
      i += best[1];
    }
  }
  return runs;
}

/** Python `round(x, 3)` 语义：对**二进制真值**做十进制四舍六入，平手取偶
 * （不是 JS 的 toFixed「平手远离零」）。
 *
 * 两个真实反例（都在共享向量/语料里）：
 *   1.3125 恰好可表示 → 真平手 → 1.312（取偶）
 *   0.0125 的 double 其实是 0.01250000000000000069… → 不是平手 → 0.013
 * 所以判定必须看 20 位十进制展开（`toFixed(20)` 足以区分「真平手」与
 * 「略高于平手」），不能看 `x * 1000` —— 乘法会把后者舍成恰好 12.5。
 */
function roundHalfEven(value, digits) {
  const sign = value < 0 ? -1 : 1;
  const [intPart, fracPart = ""] = Math.abs(value).toFixed(20).split(".");
  const keep = fracPart.slice(0, digits).padEnd(digits, "0");
  const rest = fracPart.slice(digits);
  const first = rest[0] ?? "0";
  const tie = first === "5" && /^0*$/.test(rest.slice(1));
  const roundUp = tie ? Number(keep[keep.length - 1] ?? "0") % 2 === 1 : first >= "5";
  let scaled = BigInt(intPart + keep);
  if (roundUp) scaled += 1n;
  return (sign * Number(scaled)) / 10 ** digits;
}

/**
 * 统计转写里的循环程度。不修改文本。
 *
 * @returns {{words:number, topNgram:string[]|null, topCount:number,
 *            coverage:number, worstRun:number, contaminated:boolean,
 *            skipped:string|null}}
 *   coverage = topCount × n / words（最高频 n-gram 覆盖的正文比例）
 *   worstRun = 所有 n-gram 里最大的**连续**重复次数（不再只看最高频那个）
 *   contaminated = worstRun >= minRepeats
 *                  或（≥40 词且 coverage > MAX_COVERAGE）
 *                  或存在合格周期运行（见 periodicRuns）
 */
export function inspectTranscript(text, n = NGRAM, minRepeats = MIN_REPEATS) {
  let w = words(text).map(norm).filter(Boolean);
  const out = {
    words: w.length,
    topNgram: null,
    topCount: 0,
    coverage: 0,
    worstRun: 0,
    contaminated: false,
    skipped: null,
  };
  if (isWordlessScript(text)) {
    out.skipped = "wordless-script";
    return out;
  }
  if (w.length < n * 2) {
    out.skipped = "too-short";
    return out;
  }

  const grams = [];
  for (let i = 0; i + n <= w.length; i += 1) {
    grams.push(w.slice(i, i + n).join("\u0000"));
  }
  // Counter.most_common(1) 的平手规则是「先出现者胜」（CPython 用 max/nlargest，
  // 保持首次遇到顺序）—— Map 的插入顺序与之相同。
  const counts = new Map();
  for (const g of grams) counts.set(g, (counts.get(g) || 0) + 1);
  let top = null;
  let count = 0;
  for (const [g, c] of counts) {
    if (c > count) {
      top = g;
      count = c;
    }
  }

  // 所有 n-gram 的最大**连续**次数（同一个 n-gram 一次接一次，中间不隔别的）。
  // 2026-10-10 前只统计 top 那一个 —— 7E6i3E-fsj4 的 "Hard." ×20 因此漏判。
  let worst = 0;
  let prev = null;
  let run = 0;
  for (const g of grams) {
    run = g === prev ? run + 1 : 1;
    prev = g;
    if (run > worst) worst = run;
  }

  // 判据用未取整的 coverage（Python 侧同样只在**报告**时取整），
  // 否则 0.4995 这类值会因取整口径不同而翻转结论。
  const coverage = (count * n) / w.length;
  out.topNgram = top === null ? null : top.split("\u0000");
  out.topCount = count;
  out.coverage = roundHalfEven(coverage, 3);
  out.worstRun = worst;
  out.contaminated =
    worst >= minRepeats ||
    (w.length >= MIN_WORDS_FOR_COVERAGE && coverage > MAX_COVERAGE) ||
    periodicRuns(normList(text)).length > 0;
  return out;
}

/**
 * 把连续循环收敛成一次出现，其余内容原样保留。
 *
 * 周期感知：循环单元可以是 1..PERIOD_MAX 个词（"Kampung" ×26 → 一个
 * "Kampung"；"I'm not sure if I can do this." ×14 → 该句一次），保留首次
 * 出现并插入 `[重复×N已收敛]`。**分散**出现的重复（正常口语里同一短语在
 * 片中多次出现）不动 —— 那可能是真实内容，删掉就是篡改转写。
 *
 * 只在 inspect 判污染时改写；跨度 < MIN_RUN_WORDS 的连续重复即使被判污染
 * 也不动（保守不对称：宁可漏收敛也不删真实内容，见模块 docstring）。
 */
export function collapseRepetition(text, n = NGRAM, minRepeats = MIN_REPEATS) {
  const w = words(text);
  if (w.length < n * 2) return text;

  const stats = inspectTranscript(text, n, minRepeats);
  if (!stats.contaminated) return text;

  const runs = periodicRuns(normList(text));
  if (runs.length === 0) return text;

  const out = [];
  let cursor = 0;
  for (const [start, period, span] of runs) {
    out.push(...w.slice(cursor, start));
    out.push(...w.slice(start, start + period)); // 保留第一次出现
    out.push(`[重复×${Math.floor(span / period)}已收敛]`);
    cursor = start + span;
  }
  out.push(...w.slice(cursor));
  return out.join(" ");
}

/**
 * 护栏作用在**消费者实际读到的文本**上，所以两处都收敛：
 *
 * - 每段文本（段内循环）—— whisper.cpp 的 30s 段就是这个形状；
 * - 整篇拼接（跨段循环）—— MLX 小段切分的形状（`0ag_Qi5OEd0` 的
 *   "Kampung" ×26 分散在 26 段里，逐段都判不出来）。
 *
 * 已知边界：跨段循环被收敛后，`fullText` 会比 `segments` 的拼接短——
 * 段级消费者（网格/时间戳）仍看得到原始循环。段感知的收敛需要新的
 * 判据（连续同文本段 + 时长证据），那是有误伤风险的新设计，不在这里做。
 *
 * @param {Array<{text?:string}>} segments
 * @param {string} fullText
 * @returns {{segments:Array, fullText:string, guard:{contaminated:boolean,
 *            changed:boolean, worstRun:number, collapsedSegments:number}}}
 */
export function guardTranscript(segments, fullText, options = {}) {
  const list = Array.isArray(segments) ? segments : [];
  let collapsedSegments = 0;
  const guarded = list.map((seg) => {
    const original = seg?.text ?? "";
    const next = collapseRepetition(original, options.n, options.minRepeats);
    if (next !== original) collapsedSegments += 1;
    return next === original ? seg : { ...seg, text: next };
  });

  const joined = typeof fullText === "string" ? fullText : "";
  const guardedText = collapseRepetition(joined, options.n, options.minRepeats);
  const stats = inspectTranscript(joined, options.n, options.minRepeats);

  return {
    segments: guarded,
    fullText: guardedText,
    guard: {
      contaminated: stats.contaminated,
      changed: collapsedSegments > 0 || guardedText !== joined,
      worstRun: stats.worstRun,
      collapsedSegments,
    },
  };
}
