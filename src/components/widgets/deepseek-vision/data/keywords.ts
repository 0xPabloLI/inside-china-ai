export interface Keyword {
  en: string;
  zh: string;
  freq: number;
}

/** Sorted descending by frequency (view relies on first = max, last = min). */
export const KEYWORDS: Keyword[] = [
  { en: "AGI", zh: "通用人工智能", freq: 62 },
  { en: "Open source", zh: "开源", freq: 54 },
  { en: "Agents", zh: "智能体", freq: 47 },
  { en: "Reasoning", zh: "推理", freq: 43 },
  { en: "Compute", zh: "算力", freq: 38 },
  { en: "Efficiency", zh: "效率", freq: 33 },
  { en: "Talent", zh: "人才", freq: 29 },
  { en: "Research", zh: "研究", freq: 26 },
  { en: "Cost", zh: "成本", freq: 23 },
  { en: "Chips", zh: "芯片", freq: 21 },
  { en: "Scaling", zh: "规模化", freq: 18 },
  { en: "Benchmarks", zh: "基准测试", freq: 15 },
  { en: "Long context", zh: "长上下文", freq: 13 },
  { en: "Multimodal", zh: "多模态", freq: 11 },
  { en: "Funding", zh: "融资", freq: 9 },
  { en: "Regulation", zh: "监管", freq: 7 },
  { en: "Developers", zh: "开发者", freq: 6 },
  { en: "Pricing", zh: "定价", freq: 4 },
];
