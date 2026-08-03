/**
 * Content calendar generation utilities.
 *
 * Pure functions — no file IO, no side effects.
 * Distributes trending topics across 7 days by pillar ratio.
 */

// Pillar ratio: breaking 40% / fermenting 30% / data 20% / explainer 10%
const PILLAR_RATIO = {
  breaking: 0.4,
  fermenting: 0.3,
  data: 0.2,
  explainer: 0.1,
};

// Hook formula mapping per content type
const HOOK_FORMULA_MAP = {
  breaking: "T1 (Surprise/Payoff)",
  fermenting: "T3 (Analysis Hook)",
  data: "T4 (Data Drop)",
  explainer: "T7 (Explainer Hook)",
};

// Default duration per content type (seconds)
const DURATION_MAP = {
  breaking: 60,
  fermenting: 75,
  data: 65,
  explainer: 80,
};

const PILLAR_ORDER = ["breaking", "fermenting", "data", "explainer"];

/**
 * Distribute topics across 7 days by pillar ratio.
 *
 * @param {Object} topicsData - Output from discover-trends.mjs
 * @returns {Array} 7 day objects with { day, type, topic, hookFormula, duration }
 */
export function distributeTopics(topicsData, customRatio) {
  const ratio = customRatio || PILLAR_RATIO;
  const topics = topicsData?.topics || {};
  const total = topicsData?.totalTopics || 0;

  if (total === 0) {
    return Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      type: null,
      topic: null,
      hookFormula: null,
      duration: null,
    }));
  }

  // Calculate how many of each type to assign across 7 days
  const DAYS = 7;
  const assignments = [];
  for (const pillar of PILLAR_ORDER) {
    const pool = topics[pillar] || [];
    // Proportion of 7 days for this pillar
    const count = Math.min(pool.length, Math.round(DAYS * ratio[pillar]));
    for (let i = 0; i < count; i++) {
      assignments.push({ type: pillar, topic: pool[i] });
    }
  }

  // If we have more topics than assignments (rounding), add remaining
  for (const pillar of PILLAR_ORDER) {
    const pool = topics[pillar] || [];
    const assigned = assignments.filter((a) => a.type === pillar).length;
    for (let i = assigned; i < pool.length && assignments.length < 7; i++) {
      assignments.push({ type: pillar, topic: pool[i] });
    }
  }

  // Distribute across 7 days
  const days = [];
  for (let i = 0; i < 7; i++) {
    const assignment = assignments[i] || null;
    days.push({
      day: i + 1,
      type: assignment?.type || null,
      topic: assignment?.topic || null,
      hookFormula: assignment ? HOOK_FORMULA_MAP[assignment.type] : null,
      duration: assignment ? DURATION_MAP[assignment.type] : null,
    });
  }

  return days;
}

/**
 * Build the final weekly plan JSON structure.
 *
 * @param {Object} topicsData - Output from discover-trends.mjs
 * @returns {Object} { generatedAt, totalTopics, sourceStats, days }
 */
export function buildWeeklyPlan(topicsData, customRatio) {
  const days = distributeTopics(topicsData, customRatio);

  // Add dates (starting tomorrow)
  const today = new Date();
  const daysWithDates = days.map((d, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i + 1);
    return {
      ...d,
      date: date.toISOString().split("T")[0],
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    totalTopics: topicsData?.totalTopics || 0,
    sourceStats: topicsData?.sourceStats || {},
    days: daysWithDates,
  };
}
