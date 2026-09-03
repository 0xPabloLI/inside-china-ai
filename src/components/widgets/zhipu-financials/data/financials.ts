// Source: Zhipu AI 2026 H1 earnings call transcript (WeChat, Sep 2, 2026)
// URL: https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q
// All data points verified against source material:
// docs/refs/source-materials/zhipu-glm6-self-training-wechat.md lines 56-58

export interface FinancialMetric {
  label: string;
  value: string;
  subtext: string;
  /** "—" = no reported change (value itself is the headline); otherwise a change label like "+400%" */
  trend: string;
}

export const METRICS: FinancialMetric[] = [
  {
    label: "Total Revenue (H1 2026)",
    value: "¥954M ($142M)",
    subtext: "Up ~400% year-over-year",
    trend: "+400%",
  },
  {
    label: "API Revenue Share",
    value: "86.5%",
    subtext: "Up from 15.2% a year ago — 27x growth",
    trend: "27x",
  },
  {
    label: "ARR (Aug 2026)",
    value: "$1.6B",
    subtext: "Monthly-annualized; >$2B weekly-annualized",
    trend: "—",
  },
  {
    label: "Gross Margin",
    value: "24.6%",
    subtext: "Up from -0.4% a year ago (+25pp)",
    trend: "+25pp",
  },
];

export const INFRASTRUCTURE = {
  chips: "100K-scale domestic chips",
  costReduction: "80% per-token inference cost drop",
  performanceGain: "3x end-to-end service performance",
  computeMultiplier: "14x API revenue per yuan of compute",
};