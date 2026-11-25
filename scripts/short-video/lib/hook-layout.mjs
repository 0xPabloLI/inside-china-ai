/**
 * Hook layout selection — which of the three rendered hook layouts this pack
 * should use, and whether the last few packs already used it (#1480).
 *
 * Why this exists: the render layer has carried three hook layouts since
 * 2026-11-15 — number-led (hero-center bigNumber), claim-led (hero-center
 * hookText/revealText) and media-led (`layout: "media-led"`, picture is the
 * protagonist) — but the write step had no rule for choosing one. The result
 * is visible in the corpus: 26 of 37 packs open on a big number, and the
 * selection criterion was the writer's habit. Research §6
 * (`docs/research/industry-knowledge-layer-2026-11.md`) names the two gaps:
 * no selection criteria, and no cross-pack anti-repetition.
 *
 * This module is the pure half: classify what a pack will actually render,
 * judge that layout against its own hard prerequisites, and judge the
 * cross-pack run. `scripts/short-video/hook-layout.mjs` owns the filesystem
 * (pack loading, published history) and the Stage 3 exit code.
 *
 * Two deliberate boundaries:
 * - **No renderer changes.** `classifyHookLayout` calls the renderer's own
 *   `isMediaLedHook` predicate, so the verdict and the pixels cannot disagree.
 * - **No new scene field.** The repeat reason is a Stage 3 argument, not a
 *   second copy of the decision inside scene-data (the ticket's out-of-scope
 *   line: a criteria that needs a new field is its own ticket).
 *
 * @module hook-layout
 */

import { HOOK_MEDIA_LED_LAYOUT, isMediaLedHook } from "./text-slots.mjs";

// ─── The three layouts and their editorial rules ───

/**
 * Rules transcribed from research §6 (`industry-knowledge-layer-2026-11.md`),
 * §6 「提议的选版规则」. `when` is the selection condition; `prerequisite`
 * must hold mechanically; `disallowed` is what the layout may not be used for.
 */
export const HOOK_LAYOUTS = {
  "number-led": {
    label: "数字先行（hero-center bigNumber）",
    when: "开场事实本身是一个跨档数字（2.8T 总参、1M 上下文、234ms 首包）",
    prerequisite: "数字是具体量级，且有可溯源事实（meta.dataPoints 或行业账本的 current 事实）",
    disallowed: "约数/数十倍这类含糊量级、型号铭牌（GPT-5.5 / V4.1 / H100）、属于背景的数字",
  },
  "claim-led": {
    label: "主张先行（hero-center hookText + revealText）",
    when: "新闻点是一句可证伪的判断（「首个开源 3T 级」「不降级」）",
    prerequisite: "主张在正文 30 秒内被证据兑现",
    disallowed: "需要两段以上铺垫才能成立的主张",
  },
  "media-led": {
    label: "素材先行（layout: media-led）",
    when: "画面即证据（官方 demo、K 线、模型卡截图、实拍对比）",
    prerequisite: "素材是 evidence 角色（或原生 K 线）且 provenance 可追",
    disallowed: "氛围图、品牌 logo、图文无互证的装饰素材",
  },
};

const HOOK_LAYOUT_IDS = Object.keys(HOOK_LAYOUTS);

// ─── Classification ───

/**
 * What the hook will actually render, plus what the pack declared.
 *
 * `effective` is the render truth: a `layout: "media-led"` declaration without
 * evidence media resolves to hero-center (isMediaLedHook is false), which is
 * the silent downgrade the media-led criterion must catch.
 *
 * @param {Record<string, any>} scene - the hook scene (scenes[0] by convention)
 * @returns {{declared: string|null, effective: "number-led"|"claim-led"|"media-led"|null}}
 */
export function classifyHookLayout(scene) {
  const declared =
    typeof scene?.layout === "string" && scene.layout.trim() ? scene.layout.trim() : null;
  if (isMediaLedHook(scene)) return { declared, effective: "media-led" };
  const texts = scene?.texts ?? {};
  if (typeof texts.hookText === "string" && texts.hookText.trim()) {
    return { declared, effective: "claim-led" };
  }
  if (typeof texts.bigNumber === "string" && texts.bigNumber.trim()) {
    return { declared, effective: "number-led" };
  }
  return { declared, effective: null };
}

// ─── Per-layout criteria ───

/** Hedged magnitudes: the ticket's 「数字只是大约/数十倍」 disallowed bucket. */
const HEDGED_MAGNITUDE_PATTERN =
  /~|≈|\b(?:about|around|roughly|nearly|almost|approximately|some|dozens|tens of|several times)\b|大约|约|近|数十|几十|上十倍/i;

/**
 * A magnitude the front screen can hold: a digit carrying a unit/magnitude
 * marker (% / B / T / M / K / ms / s / yuan / dollars / users / tokens / x) or
 * a currency prefix, a ratio, or a plain number long enough to be a quantity.
 * `GPT-5.5`, `V4.1` and `H100` carry digits too, but they are model or chip
 * names — a nameplate is not a cross-tier number (the same ruling the hook
 * family tests record for `V4.1 / GLM-6.0 / H100`).
 */
const MAGNITUDE_PATTERN =
  /[$¥€£]\s*\d|\d[\d.,]*\s*(?:%|×|x(?:[^a-z]|$)|B(?:[^a-z]|$)|T(?:[^a-z]|$)|M(?:[^a-z]|$)|K(?:[^a-z]|$)|bn|million|billion|trillion|thousand|ms|sec|s|min|h|day|dollar|yuan|user|people|param|token)|\d+\s*\/\s*\d+/i;

/** A leading letter glued to a number (`H100`, `V4`, `GPT-5`) = nameplate. */
const NAMEPLATE_PATTERN = /^(?:\p{Lu}[\p{L}]*[-\s]?)\d/iu;

/**
 * Is `text` a cross-tier magnitude rather than a nameplate or a bare digit?
 * `160,000` / `20,000` pass on digit count; `5` alone does not — a bare single
 * digit is a label, not a number the viewer can place on an industry scale.
 */
export function hasMagnitude(text) {
  const value = String(text ?? "").trim();
  if (!value || NAMEPLATE_PATTERN.test(value)) return false;
  if (MAGNITUDE_PATTERN.test(value)) return true;
  return value.replace(/[^\d]/g, "").length >= 3;
}

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "as",
  "at",
  "by",
  "than",
  "then",
  "so",
  "not",
  "no",
  "now",
  "just",
  "still",
  "has",
  "have",
  "had",
  "will",
  "would",
  "can",
  "could",
  "should",
  "may",
  "might",
  "one",
  "two",
  "after",
  "before",
  "over",
  "into",
  "out",
  "up",
  "down",
  "all",
  "every",
  "more",
  "most",
  "less",
  "least",
  "new",
  "first",
  "last",
  "next",
  "his",
  "her",
  "their",
  "they",
  "we",
  "you",
  "i",
  "he",
  "she",
  "them",
  "our",
  "your",
  "my",
  "me",
  "us",
]);

/** Content words of a claim: lowercase, punctuation stripped, stopwords out. */
function claimTokens(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%$.\s-]/gu, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[-.]+|[-.]+$/g, ""))
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

/** Scene text corpus: every string field under `texts` plus the voiceover. */
function sceneTextCorpus(scene) {
  const texts = scene?.texts ?? {};
  const values = Object.values(texts).flatMap((value) =>
    typeof value === "string" ? [value] : Array.isArray(value) ? value : [],
  );
  return [...values, scene?.voiceover ?? ""].join(" ");
}

/**
 * Seconds each scene occupies, in order. Uses measured durations when the
 * caller has them (`opts.sceneDurations`, post-TTS `audio/scene-durations.json`);
 * before TTS it projects from the voiceover word count at the #252 budget rate
 * (2.5 words/second), the same rate the hook duration forecast uses.
 */
function sceneTimeline(scenes, opts = {}) {
  const measured = Array.isArray(opts.sceneDurations) ? opts.sceneDurations : null;
  let cursor = 0;
  return scenes.map((scene, index) => {
    const seconds = Number.isFinite(measured?.[index])
      ? measured[index]
      : Math.max(
          1,
          String(scene?.voiceover ?? "")
            .split(/\s+/)
            .filter(Boolean).length / 2.5,
        );
    const entry = { scene, start: cursor, end: cursor + seconds };
    cursor += seconds;
    return entry;
  });
}

/**
 * Judge one hook against its own layout's prerequisites.
 *
 * @param {Record<string, any>} scene - hook scene
 * @param {object} [opts]
 * @param {Array<Record<string, any>>} [opts.scenes] - full film (for claim payoff)
 * @param {number[]} [opts.sceneDurations] - measured per-scene seconds
 * @param {Record<string, any>} [opts.meta] - pack meta (dataPoints provenance)
 * @param {object|null} [opts.industryContext] - pack industry-context.json
 * @returns {{layout: string|null, declared: string|null, findings: Array<object>}}
 */
export function evaluateHookLayout(scene, opts = {}) {
  const { declared, effective } = classifyHookLayout(scene);
  const findings = [];
  const push = (level, code, detail, fix) =>
    findings.push({ level, code, check: "Hook layout selection", detail, fix });

  if (!effective) {
    push(
      "warn",
      "hook-layout-unknown",
      "hook 场景既没有 bigNumber、hookText，也没有可渲染的 media-led 素材 —— 渲染层没有可判的版式",
      '给 hook 声明一个版式：bigNumber（数字先行）/ hookText + revealText（主张先行）/ layout: "media-led" + evidence 素材（素材先行）',
    );
    return { layout: null, declared, findings };
  }

  if (declared === HOOK_MEDIA_LED_LAYOUT && effective !== "media-led") {
    push(
      "fail",
      "hook-layout-media-led-unresolved",
      `声明 layout: "media-led"，但 hook 素材不是 evidence 角色也不是原生 K 线 —— 渲染层会静默回落到 hero-center`,
      '把 hook 素材改成 mediaRole: "evidence"（或写 info.chart: "candle"），否则去掉 layout: "media-led" 并声明真实版式',
    );
  }

  if (effective === "number-led") {
    const big = String(scene?.texts?.bigNumber ?? "").trim();
    if (!hasMagnitude(big)) {
      push(
        "fail",
        "hook-layout-number-no-magnitude",
        `bigNumber "${big}" 不是可撑首屏的跨档数字（型号铭牌或没有量级单位）`,
        "换成带单位的量级（2.8T / 1M / 234ms / 85%），或改用 claim-led（hookText）把判断放上首屏",
      );
    }
    if (HEDGED_MAGNITUDE_PATTERN.test(big)) {
      push(
        "fail",
        "hook-layout-number-hedged",
        `bigNumber "${big}" 是约数/数十倍一类含糊量级 —— 研究 §6 把它列在 number-led 的禁用项`,
        "给出具体数值（写清分母或换算），或把「约」换成可核对的锚点",
      );
    }
    const numbers = (big.match(/[\d][\d.,]*/g) ?? []).map((n) => n.replace(/[,.]$/, ""));
    const traceable = numberIsTraceable(big, numbers, opts);
    if (numbers.length > 0 && !traceable) {
      push(
        "warn",
        "hook-layout-number-untraceable",
        `bigNumber "${big}" 在 meta.dataPoints 与行业账本里都找不到同值事实`,
        "在 meta.dataPoints 补一条带来源的数字事实，或确认它属于本节目的独家测算并写明口径",
      );
    }
  }

  if (effective === "claim-led") {
    const claim = [scene?.texts?.hookText, scene?.texts?.revealText].filter(Boolean).join(" ");
    const payoff = claimPayoff(scene, claim, opts);
    if (payoff.tokens.length === 0) {
      push(
        "warn",
        "hook-layout-claim-no-tokens",
        "hookText/revealText 没有可核对的内容词，无法判断主张是否被兑现",
        "把主张写成一个可核对的名词或判断（「首个开源 3T 级」），而不是语气词",
      );
    } else if (!payoff.paidOff) {
      const where =
        payoff.payoffStart === null
          ? "全片没有任何一场出现"
          : `最早的第 ${payoff.payoffStart.toFixed(0)} 秒才出现`;
      push(
        "fail",
        "hook-layout-claim-unpaid",
        `主张「${claim}」的内容词（${payoff.tokens.slice(0, 5).join(" / ")}）${where} —— 30 秒内没有兑现`,
        payoff.payoffStart === null
          ? "把主张改成正文会回答的那句判断，或在正文补一场兑现它的证据句"
          : "把兑现这场前移到 30 秒内，或把主张收窄到正文开头就能回答的判断",
      );
    }
  }

  if (effective === "media-led") {
    const provenance = mediaProvenance(scene);
    if (!provenance) {
      push(
        "fail",
        "hook-layout-media-no-provenance",
        "media-led 的素材没有 source / credit 字段 —— provenance 不可追",
        "补 media.source（来源）或 info.credit（时点 + 来源），让素材能被审计",
      );
    }
    if (scene?.mediaRole !== "evidence" && scene?.info?.chart !== "candle") {
      push(
        "fail",
        "hook-layout-media-not-evidence",
        'media-led 的素材没有声明 mediaRole: "evidence"',
        "画面是证据才配 media-led；氛围图请改用 number-led / claim-led",
      );
    }
  }

  return { layout: effective, declared, findings };
}

/** Is any numeric token of the bigNumber present in the pack's own fact ledger? */
function numberIsTraceable(big, numbers, opts) {
  if (numbers.length === 0) return false;
  const dataPoints = Array.isArray(opts.meta?.dataPoints) ? opts.meta.dataPoints.join(" ") : "";
  const facts = opts.industryContext?.facts ?? opts.industryContext?.entities ?? [];
  const industryText = JSON.stringify(facts ?? "");
  const haystack = `${dataPoints} ${industryText}`.replace(/,/g, "");
  const needle = numbers.map((n) => n.replace(/,/g, "")).join(" ");
  return numbers.some((n) => haystack.includes(n)) && needle.length > 0;
}

/** Source/credit presence for the media-led provenance prerequisite. */
function mediaProvenance(scene) {
  const media = scene?.media ?? {};
  const credit = scene?.info?.credit;
  return (
    (typeof media.source === "string" && media.source.trim()) ||
    (typeof media.credit === "string" && media.credit.trim()) ||
    (typeof credit === "string" && credit.trim()) ||
    (typeof scene?.texts?.source === "string" && scene.texts.source.trim())
  );
}

/**
 * Claim payoff inside the first 30 seconds: does the film settle at least one
 * of the claim's content words before 30s?
 *
 * The search covers the WHOLE film, hook scene included: the on-screen claim
 * is usually a compression of the line the hook itself speaks ("revenue topped
 * $700M / STRONGEST YEAR EVER"), and counting that as a payoff is correct —
 * the defect this looks for is the claim that nothing in the film answers
 * within 30s (the promise is decoration). The earliest settling scene's start
 * is the payoff point.
 *
 * @returns {{tokens: string[], hits: string[], payoffStart: number|null,
 *            paidOff: boolean, windowSec: number}}
 */
export function claimPayoff(hook, claim, opts = {}) {
  const scenes = Array.isArray(opts.scenes) ? opts.scenes : [hook];
  const timeline = sceneTimeline(scenes, opts);
  const tokens = claimTokens(claim);
  const hits = [];
  let payoffStart = null;
  const settledAt = new Map();
  for (const [index, entry] of timeline.entries()) {
    // The hook's own on-screen words are the claim itself, so they cannot
    // settle it; the line the hook speaks can, because that is the sourced
    // sentence the on-screen text compresses. Index 0 is the hook by the
    // scenes[0] convention, not by object identity — callers routinely
    // rebuild the same hook shape.
    const corpus =
      index === 0
        ? String(hook.voiceover ?? "").toLowerCase()
        : sceneTextCorpus(entry.scene).toLowerCase();
    for (const token of tokens) {
      if (settledAt.has(token)) continue;
      if (corpus.includes(token.toLowerCase())) {
        settledAt.set(token, entry.start);
        hits.push(token);
        if (payoffStart === null || entry.start < payoffStart) payoffStart = entry.start;
      }
    }
  }
  return {
    tokens,
    hits,
    payoffStart,
    paidOff: payoffStart !== null && payoffStart < 30,
    windowSec: 30,
  };
}

// ─── Cross-pack anti-repetition ───

/**
 * Judge a candidate layout against the packs that came before it.
 *
 * Research §6: read the last 3 published packs' hook layouts; the same layout
 * for ≥3 consecutive packs forces a switch, or an explicit「为什么必须重复」
 * one-liner. This implements exactly that: `threshold` counts the candidate,
 * so 2 predecessors on the same layout already makes the candidate the third.
 *
 * @param {object} input
 * @param {Array<{slug: string, layout: string|null}>} input.history - newest first
 * @param {string|null} input.candidate - the layout under review
 * @param {string} [input.repeatReason] - the one-liner justifying a repeat
 * @param {number} [input.threshold] - consecutive count that forces a switch
 * @returns {{status: string, runLength: number, predecessors: object[],
 *            suggested: string|null, detail: string, fix?: string}}
 */
export function evaluateHookLayoutRotation({ history, candidate, repeatReason, threshold = 3 }) {
  const usable = (Array.isArray(history) ? history : []).filter((entry) => entry?.layout);
  const predecessors = [];
  if (candidate) {
    for (const entry of usable) {
      if (entry.layout !== candidate) break;
      predecessors.push(entry);
      if (predecessors.length >= threshold - 1) break;
    }
  }
  const runLength = candidate ? 1 + predecessors.length : predecessors.length;
  const counts = {};
  for (const entry of usable) counts[entry.layout] = (counts[entry.layout] ?? 0) + 1;
  const suggested =
    HOOK_LAYOUT_IDS.filter((id) => id !== candidate).sort(
      (a, b) => (counts[a] ?? 0) - (counts[b] ?? 0),
    )[0] ?? null;

  if (!candidate) {
    return {
      status: "no-candidate",
      runLength: 0,
      predecessors,
      suggested,
      detail: "没有可判的版式",
    };
  }
  if (usable.length === 0) {
    return {
      status: "insufficient-history",
      runLength,
      predecessors,
      suggested,
      detail: `没有可用的历史记录（判定连用 ${threshold} 次需要 ${threshold - 1} 条同版式前序）`,
    };
  }
  if (predecessors.length < threshold - 1) {
    const latest = usable[0];
    return {
      status: "pass",
      runLength,
      predecessors,
      suggested,
      detail:
        predecessors.length === 0
          ? `上一条是 ${latest.slug}（${latest.layout ?? "未判出版式"}），本版式未连用`
          : `同版式前序 ${predecessors.length} 条（${predecessors
              .map((entry) => entry.slug)
              .join(" → ")}），未达 ${threshold} 次阈值`,
    };
  }
  if (!repeatReason || !String(repeatReason).trim()) {
    return {
      status: "needs-reason",
      runLength,
      predecessors,
      suggested,
      detail: `前序 ${predecessors.length} 条记录与本案同为 ${candidate}（${predecessors
        .map((entry) => entry.slug)
        .join(" → ")}），连用 ${runLength} 次`,
      fix: `换一种版式（历史最少用：${suggested ?? "无"}；换版前先确认它的硬前提成立），或在 Stage 3 报告里给一句「为什么必须重复」（CLI --repeat-reason）`,
    };
  }
  return {
    status: "pass-with-reason",
    runLength,
    predecessors,
    suggested,
    detail: `连用 ${runLength} 次 ${candidate}，理由已记录：${String(repeatReason).trim()}`,
  };
}
