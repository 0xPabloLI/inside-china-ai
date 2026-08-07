export interface Keyword {
  en: string;
  zh: string;
  freq: number;
}

export const KEYWORDS: Keyword[] = [
  { en: "Vision", zh: "愿景", freq: 45 },
  { en: "Restraint", zh: "克制", freq: 42 },
  { en: "Open Source", zh: "开源", freq: 38 },
  { en: "AGI", zh: "通用人工智能", freq: 35 },
  { en: "Team Stability", zh: "团队稳定性", freq: 33 },
  { en: "Kindness", zh: "善意", freq: 30 },
  { en: "Pricing", zh: "定价", freq: 28 },
  { en: "Commercialization", zh: "商业化", freq: 25 },
  { en: "CoT", zh: "思维链", freq: 24 },
  { en: "Agents", zh: "智能体", freq: 22 },
  { en: "Continuous Learning", zh: "持续学习", freq: 20 },
  { en: "Self-Iteration", zh: "自我迭代", freq: 18 },
  { en: "Embodied AI", zh: "具身智能", freq: 16 },
  { en: "Profit", zh: "利润", freq: 15 },
  { en: "Competition", zh: "竞争", freq: 14 },
  { en: "KPI", zh: "绩效考核", freq: 12 },
  { en: "Organization", zh: "组织", freq: 11 },
  { en: "Strategy", zh: "战略", freq: 10 },
  { en: "Ordinary People", zh: "平凡的人", freq: 9 },
  { en: "Dimensionality Reduction", zh: "降维打击", freq: 8 },
];
