/**
 * Non-blocking evidence audit (#61).
 *
 * The MRL-1 B4/B6 inline annotations are the human-readable claim layer;
 * this module derives the machine-readable one from them — no separate LLM
 * extraction step. Risk classification follows the deterministic rules in
 * docs/archive/reviews/research-evidence-pipeline-implementation-review.md
 * §2-§3 (7 hard-trigger categories + four 0-2 dimensions). Everything here
 * produces warnings; nothing blocks publication.
 */

export const ANNOTATION_STATUS = {
  "✅": "verified",
  "⚠️": "partially-verified",
  "❌": "unverified",
  "🔴": "contradicts",
};

// Inline format per docs/article-production-guide.md 声明验证标注规范:
//   _(✅ Verified: note)_  — italic-wrapped (underscore or asterisk), at
//   paragraph end. The u flag handles emoji surrogate pairs (🔴).
const ANNOTATION_RE = /\(([✅⚠️❌🔴]\uFE0F?)\s*([A-Za-z ]+?)[:：]\s*(.+?)\)\s*[_*]/gu;

/**
 * Extract the B6 inline claim annotations from an article.
 *
 * @param {string} markdown
 * @returns {Array<{status: string, label: string, note: string, context: string, line: number}>}
 */
export function parseClaimAnnotations(markdown) {
  const claims = [];
  if (!markdown) return claims;
  const lines = String(markdown).split("\n");
  lines.forEach((line, idx) => {
    for (const match of line.matchAll(ANNOTATION_RE)) {
      const [, symbol, label, note] = match;
      const status = ANNOTATION_STATUS[symbol];
      if (!status) continue;
      const context = line
        .slice(0, match.index)
        .replace(/[*_#>]/g, "")
        .trim();
      claims.push({ status, label: label.trim(), note: note.trim(), context, line: idx + 1 });
    }
  });
  return claims;
}

/**
 * Parse the article's Verification Summary table (B6 rule 4).
 *
 * @returns {{found: boolean, counts: Record<string, number>}}
 */
export function parseVerificationSummary(markdown) {
  const counts = {};
  if (!markdown) return { found: false, counts };
  const lines = String(markdown).split("\n");
  const start = lines.findIndex((l) => /^#{2,3}\s*Verification Summary/i.test(l));
  if (start === -1) return { found: false, counts };
  for (const line of lines.slice(start + 1)) {
    if (/^#{2,3}\s/.test(line)) break; // next section
    const match = line.match(/^\|\s*([✅⚠️❌🔴]).*?\|\s*(\d+)\s*claims?\s*\|/i);
    if (match) {
      const status = ANNOTATION_STATUS[match[1]];
      if (status) counts[status] = parseInt(match[2], 10);
    }
  }
  return { found: true, counts };
}

// ─── Risk classification (review doc §2 hard triggers, §3 four dimensions) ───

const HARD_TRIGGERS = [
  ["financial_or_pricing", /融资|估值|营收|利润|市场份额|定价|收购|上市|订单|现金流|市值|funding|valuation|revenue|profit|market share|acquisition|ipo\b|capital raise|pricing/i],
  ["legal_policy_compliance", /禁令|制裁|监管|合规|出口管制|诉讼|立案|备案|sanction|regulat|lawsuit|antitrust|compliance|export control/i],
  ["safety_public_interest", /安全事故|自动驾驶|医疗|关键基础设施|人命|伤亡|safety incident|fatal|critical infrastructure/i],
  ["performance_comparison", /领先|第一|首款|超过|落后|跑分| Benchmark|基准|最优|outperform|state-of-the-art|first\b|fastest|largest/i],
  ["personnel_org_attribution", /任命|离职|辞职|卸任|接任|创始人回归|ceo\b|appoint|resign|steps down|founder returns/i],
  ["current_status", /已上线|目前|当前|现任|在售|最新|实时|currently|as of|latest|now live/i],
];

const DIMENSION_IMPACT = /改变|影响|声誉|合规|政策|安全|商业判断|reputation|compliance|policy|safety|business/i;
const DIMENSION_IMPACT_MILD = /产品|模型|公司|发布|更新|product|model|release|update/i;
const DIMENSION_TIMELINESS_CURRENT = /目前|当前|最新|现在|刚刚|即将|today|currently|now|just announced|upcoming/i;
const DIMENSION_TIMELINESS_MEDIUM = /本月|季度|版本|下周|下周|this month|quarter|version|next week/i;
const DIMENSION_PRECISION = /\d+(\.\d+)?\s*(%|％|亿|万|美元|元|倍|条|款)|第一|排名|top\s?\d|首次/i;
const DIMENSION_PRECISION_MILD = /\d{4}年|\d+\s*月|世纪|year|month/i;

/**
 * Deterministic claim-risk classification (single shared implementation —
 * Brief Builder and MRL-1 must both call this, never fork the rules).
 *
 * @param {string} claimText - claim or its annotation context
 * @param {object} [context]
 * @param {string} [context.annotationStatus] - verified|partially-verified|unverified|contradicts
 * @returns {{riskLevel: "low"|"medium"|"high", riskReasons: string[], riskScore: number,
 *   requiresPrimarySource: boolean, requiresCorroboration: boolean}}
 */
export function classifyClaimRisk(claimText, context = {}) {
  const text = String(claimText ?? "");
  const reasons = [];

  for (const [reason, re] of HARD_TRIGGERS) {
    if (re.test(text)) reasons.push(reason);
  }
  const status = context.annotationStatus;
  if (status === "unverified" || status === "contradicts") {
    reasons.push("unverified_or_conflicting");
  }

  if (reasons.length > 0) {
    // Hard triggers are one-way upgrades (review §2): score reported as the
    // 6-point boundary of the high band, reasons carry the explanation.
    return {
      riskLevel: "high",
      riskReasons: reasons,
      riskScore: 6,
      requiresPrimarySource: true,
      requiresCorroboration: true,
    };
  }

  let score = 0;
  if (DIMENSION_IMPACT.test(text)) score += 2;
  else if (DIMENSION_IMPACT_MILD.test(text)) score += 1;
  if (DIMENSION_TIMELINESS_CURRENT.test(text)) score += 2;
  else if (DIMENSION_TIMELINESS_MEDIUM.test(text)) score += 1;
  if (DIMENSION_PRECISION.test(text)) score += 2;
  else if (DIMENSION_PRECISION_MILD.test(text)) score += 1;
  // Evidence uncertainty: annotation status is the deterministic proxy for
  // "does this claim have independent public support?" (LLM judgment deferred).
  if (status === "partially-verified") score += 1;
  else if (!status) score += 1;

  const riskLevel = score <= 2 ? "low" : score <= 5 ? "medium" : "high";
  return {
    riskLevel,
    riskReasons: [],
    riskScore: score,
    requiresPrimarySource: riskLevel !== "low",
    requiresCorroboration: riskLevel === "high",
  };
}

/**
 * Full non-blocking audit: annotations → risk → cross-checks.
 *
 * @param {string} markdown - article markdown
 * @returns {{claims: Array, summary: object, stats: object, warnings: Array<{code, message, line?}>}}
 */
export function auditClaims(markdown) {
  const claims = parseClaimAnnotations(markdown);
  const summary = parseVerificationSummary(markdown);
  const warnings = [];

  for (const claim of claims) {
    claim.risk = classifyClaimRisk(`${claim.context} ${claim.note}`, { annotationStatus: claim.status });
    if (claim.note.length < 10) {
      warnings.push({
        code: "insufficient_annotation_note",
        message: `「${claim.context.slice(0, 40)}…」的标注说明过短（B6 简洁原则仍要求说明成立依据）`,
        line: claim.line,
      });
    }
  }

  const stats = { total: claims.length };
  for (const status of Object.values(ANNOTATION_STATUS)) {
    stats[status] = claims.filter((c) => c.status === status).length;
  }

  if (summary.found) {
    for (const [status, count] of Object.entries(summary.counts)) {
      if (stats[status] !== count) {
        warnings.push({
          code: "summary_count_mismatch",
          message: `Verification Summary 里 ${status} = ${count}，但正文内联标注实测 ${stats[status]} 条`,
        });
      }
    }
  } else if (claims.length > 0) {
    warnings.push({
      code: "missing_summary_section",
      message: "存在内联标注但缺少 Verification Summary 汇总表（B6 规则 4）",
    });
  }
  if (!summary.found && claims.length === 0) {
    // Pure public-report article — annotations not required (B6 scope note).
  }

  return { claims, summary, stats, warnings };
}

/**
 * Fuzzy evidence matching: token overlap between the claim note/context and
 * discovery evidence (title + snippet). Transparent and cheap — an LLM
 * relevance pass is a later enhancement, not part of v1.
 *
 * @param {Array<{note: string, context: string}>} claims
 * @param {Array<{title: string, snippet?: string}>} evidenceArticles
 * @returns {Array<{matches: Array<{title: string, url?: string, score: number}>}>}
 */
export function matchEvidence(claims, evidenceArticles) {
  const tokenize = (text) => {
    const tokens = new Set();
    for (const word of String(text ?? "").toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []) {
      tokens.add(word);
    }
    const cjk = String(text ?? "").match(/[\u4e00-\u9fff]/g) ?? [];
    for (let i = 0; i < cjk.length - 1; i++) tokens.add(cjk[i] + cjk[i + 1]);
    return tokens;
  };

  const docs = (evidenceArticles ?? []).map((a) => ({
    ...a,
    tokens: tokenize(`${a.title} ${a.snippet ?? ""}`),
  }));

  return (claims ?? []).map((claim) => {
    const claimTokens = tokenize(`${claim.note} ${claim.context}`);
    const matches = [];
    for (const doc of docs) {
      let overlap = 0;
      for (const token of claimTokens) if (doc.tokens.has(token)) overlap++;
      if (overlap >= 2) matches.push({ title: doc.title, url: doc.url, score: overlap });
    }
    matches.sort((a, b) => b.score - a.score);
    return { matches: matches.slice(0, 3) };
  });
}

/**
 * Markdown "Evidence Coverage Report" section to append to the MRL-1 report.
 */
export function generateCoverageReport(audit, evidenceMatches = []) {
  const { stats, warnings, claims } = audit;
  const lines = [];
  lines.push("## Evidence Coverage Report");
  lines.push("");
  lines.push("> 非阻塞审计（#61）——仅输出 warning，不阻断发布 (non-blocking)。机器可读层：MRL-1 B4/B6 内联标注 → 结构化 claim。");
  lines.push("");
  lines.push(
    `内联标注 ${stats.total} 条（verified ${stats.verified} / partially-verified ${stats["partially-verified"]} / unverified ${stats.unverified} / contradicts ${stats.contradicts}）。`,
  );
  const highRisk = claims.filter((c) => c.risk?.riskLevel === "high");
  if (highRisk.length > 0) {
    lines.push(`高风险 claim ${highRisk.length} 条（硬触发或评分 ≥6），行号：${highRisk.map((c) => c.line).join(", ")}。`);
  }
  if (evidenceMatches.length > 0) {
    const withMatch = evidenceMatches.filter((m) => m.matches.length > 0).length;
    lines.push(`discovery 证据匹配：${withMatch}/${evidenceMatches.length} 条 claim 有公开证据重叠。`);
  }
  if (warnings.length > 0) {
    lines.push("");
    lines.push("**Warnings**:");
    for (const w of warnings) {
      lines.push(`- ${w.code}${w.line ? ` (line ${w.line})` : ""}: ${w.message}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
