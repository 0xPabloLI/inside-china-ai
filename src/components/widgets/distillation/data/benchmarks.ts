export interface MetricRow {
  dimension: string;
  k3: number;
  k26: number;
  claude: number;
  unit: string;
  higherIsBetter: boolean;
  note: string;
}

export const METRICS: MetricRow[] = [
  {
    dimension: "Accuracy (AA-Omniscience)",
    k3: 46,
    k26: 33,
    claude: 72,
    unit: "%",
    higherIsBetter: true,
    note: "K3 improved from K2.6's 33% but remains far behind Claude's 72%.",
  },
  {
    dimension: "Hallucination Rate",
    k3: 51,
    k26: 39,
    claude: 14,
    unit: "%",
    higherIsBetter: false,
    note: "K3's hallucination rate climbed to 51% — worse than K2.6 and far above Claude's 14%.",
  },
  {
    dimension: "Arena Frontend Code Rank",
    k3: 1,
    k26: 18,
    claude: 2,
    unit: "#",
    higherIsBetter: false,
    note: "K3 jumped 17 places to claim #1 on Arena. But Moonshot's own report shows K3 below Claude on coding.",
  },
  {
    dimension: "Coding (SWE-bench)",
    k3: 51.5,
    k26: 40,
    claude: 69,
    unit: "%",
    higherIsBetter: true,
    note: "K3 trails Claude by ~18 points on frontier SWE benchmarks.",
  },
  {
    dimension: "Security Testing",
    k3: 30,
    k26: 35,
    claude: 85,
    unit: "%",
    higherIsBetter: true,
    note: "SCMP: K3 'significantly below' US rivals in security. Score is a rough composite.",
  },
];

export const MODEL_META = {
  k3: { name: "Kimi K3", color: "#3b82f6" },
  k26: { name: "Kimi K2.6", color: "#93c5fd" },
  claude: { name: "Claude", color: "#f59e0b" },
} as const;
