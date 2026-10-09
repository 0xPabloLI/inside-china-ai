/**
 * 转写重复幻觉护栏（JS 生产侧）—— 与 `lib/asr_repetition_guard.py` 同判据。
 *
 * 为什么需要它：ctx-off（`condition_on_previous_text=False` / `--max-context 0`）
 * 只是**降低**幻觉概率，不是消除。whisper.cpp 生产口径实测仍有循环（`-mc 0`
 * 下 8 分钟 "Thank you." / "visit www.fema.org" 循环）；MLX 侧 145 份 ctx-off
 * 转写里 10 份被本护栏判定需要收敛（Kampung ×26、go ×56、norge ×71 …）。
 * 解码层参数在两个后端都不存在等价的惩罚项，所以后处理是唯一能同时覆盖
 * 两个后端的位置。
 *
 * 判据：**n-gram 循环**，不是词级连续重复。细节与阈值理由见 Python 参考实现
 * （它带着全部实测证据注释）。本文件是等价移植，`asr-repetition-guard.test.mjs`
 * 用共享向量逐字段对照两个实现，防止漂移。
 *
 * 保守方向：宁可漏报也不误伤正常口语（"Goal! Goal! Goal!" 是真实解说）。
 *
 * 实测覆盖边界（2026-10-10，147 份真实转写：145 份 MLX ctx-off 语料 +
 * 2 份 whisper.cpp 生产输出）——**不要把它当成比这更强的保证**：
 *   1. 收敛（collapse）只对单 token 循环生效：10/147 被改写（Kampung ×26、
 *      go ×56、norge ×71 …）。
 *   2. 多词短语循环（周期 ≥ 2）**判得出但收不了**：whisper.cpp 生产口径的
 *      FEMA 循环（"Thank you." / "For more information, visit www.fema.org"
 *      重复数分钟）落在这类 —— `contaminated=true` 而 `changed=false`。
 *   3. `worstRun` 只统计**出现次数最多的那个** n-gram 的连续次数；另一个
 *      n-gram 的长连续段看不见（`7E6i3E-fsj4` 的 "Hard." ×20 因此漏判，
 *      同文件 "Stay in the corner." ×23 是更频繁的分散重复）。
 * 三条都用测试钉住，改动其中任何一条都要有意识的评审。
 */

/** 判定阈值（与 Python 侧同值）。 */
export const NGRAM = 3;
export const MIN_REPEATS = 6;
export const MAX_COVERAGE = 0.5;
export const MIN_WORDS_FOR_COVERAGE = 40;

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

function isWordlessScript(text) {
  const letters = [...String(text ?? "")].filter((c) => /\p{L}/u.test(c));
  if (letters.length === 0) return false;
  const cjk = letters.filter((c) => {
    const cp = c.codePointAt(0);
    return NO_SPACE_SCRIPTS.some(([lo, hi]) => cp >= lo && cp <= hi);
  }).length;
  return cjk / letters.length > CJK_RATIO;
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
 * 统计转写里的 n-gram 循环程度。不修改文本。
 *
 * @returns {{words:number, topNgram:string[]|null, topCount:number,
 *            coverage:number, worstRun:number, contaminated:boolean,
 *            skipped:string|null}}
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

  let worst = 0;
  let cur = 0;
  for (const g of grams) {
    cur = g === top ? cur + 1 : 0;
    if (cur > worst) worst = cur;
  }

  // 判据用未取整的 coverage（Python 侧同样只在**报告**时取整），
  // 否则 0.4995 这类值会因取整口径不同而翻转结论。
  const coverage = (count * n) / w.length;
  out.topNgram = top === null ? null : top.split("\u0000");
  out.topCount = count;
  out.coverage = roundHalfEven(coverage, 3);
  out.worstRun = worst;
  out.contaminated =
    worst >= minRepeats || (w.length >= MIN_WORDS_FOR_COVERAGE && coverage > MAX_COVERAGE);
  return out;
}

/**
 * 把连续重复的 n-gram 循环收敛成一次出现，其余内容原样保留。
 * 只处理**连续**循环（A A A A → A）；分散重复不动（可能是真实内容）。
 */
export function collapseRepetition(text, n = NGRAM, minRepeats = MIN_REPEATS) {
  const w = words(text);
  if (w.length < n * 2) return text;

  const stats = inspectTranscript(text, n, minRepeats);
  if (!stats.contaminated) return text;

  const normalized = w.map((x) => norm(x) || "\u0000");
  const out = [];
  let i = 0;
  while (i < w.length) {
    const gram = normalized.slice(i, i + n);
    if (gram.length === n) {
      let reps = 1;
      let j = i + n;
      while (
        j + n <= w.length &&
        normalized.slice(j, j + n).join("\u0000") === gram.join("\u0000")
      ) {
        reps += 1;
        j += n;
      }
      if (reps >= minRepeats) {
        out.push(...w.slice(i, i + n));
        out.push(`[重复×${reps}已收敛]`);
        i = j;
        continue;
      }
    }
    out.push(w[i]);
    i += 1;
  }
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
