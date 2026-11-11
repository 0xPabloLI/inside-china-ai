// Sources: Chinese Online (SZ 300364) investor-relations record 2026-004 filed
// with the Shenzhen exchange (CNINFO, published 2026-06-03), plus the CLSA note
// reported by Zhitong Finance on 2026-10-12. Every figure here is traced in
// docs/refs/source-materials/china-us-token-divide-sources.md — edit both together.
export const SOURCE_CARDS = [
  {
    side: "CHINA",
    share: "55%",
    label: "AI short drama and video generation",
    status: "sourced",
    statusLabel: "ONE COMPANY'S FILING",
    note: "Chinese Online's June 3, 2026 investor record. The record gives no sample, data provider, time window, or method.",
  },
  {
    side: "UNITED STATES",
    share: "58%",
    label: "Code generation and enterprise automation",
    status: "unsourced",
    statusLabel: "NO SOURCE FOUND",
    note: "We could not locate a published study, survey, or filing behind this figure. Tidenews and Beijing News reached the same conclusion.",
  },
] as const;

export const OPENROUTER = [
  { label: "Share of tokens", cn: 65, us: 31 },
  { label: "Share of spend", cn: 30, us: 70 },
] as const;

export const DAILY_TOKENS = [
  { date: "END 2025", value: "100T", bar: "20%" },
  { date: "MAR 2026", value: "140T", bar: "28%" },
  { date: "JUN 2026", value: "500T", bar: "100%" },
] as const;
