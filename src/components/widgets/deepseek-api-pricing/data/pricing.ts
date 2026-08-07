export interface PricingTier {
  model: string;
  inputPrice: number;
  outputPrice: number;
  context: string;
  notes: string;
}

export const DEEPSEEK_PRICING: PricingTier[] = [
  {
    model: "DeepSeek-V3",
    inputPrice: 0.14,
    outputPrice: 0.28,
    context: "128K",
    notes: "Flagship reasoning model",
  },
  {
    model: "DeepSeek-Coder",
    inputPrice: 0.07,
    outputPrice: 0.14,
    context: "16K",
    notes: "Code-specialized model",
  },
  {
    model: "DeepSeek-V3.2 Flash",
    inputPrice: 0.01,
    outputPrice: 0.02,
    context: "64K",
    notes: "Fast inference, cost-optimized",
  },
];

export const COMPETITOR_PRICING: Record<string, PricingTier[]> = {
  OpenAI: [
    {
      model: "GPT-4o",
      inputPrice: 2.5,
      outputPrice: 10.0,
      context: "128K",
      notes: "Frontier model",
    },
    {
      model: "GPT-4o-mini",
      inputPrice: 0.15,
      outputPrice: 0.6,
      context: "128K",
      notes: "Cost-optimized",
    },
  ],
  Anthropic: [
    {
      model: "Claude 3.5 Sonnet",
      inputPrice: 3.0,
      outputPrice: 15.0,
      context: "200K",
      notes: "Balanced performance",
    },
    {
      model: "Claude 3 Haiku",
      inputPrice: 0.25,
      outputPrice: 1.25,
      context: "200K",
      notes: "Fast, low-cost",
    },
  ],
  "Moonshot AI (Kimi)": [
    {
      model: "Kimi K3",
      inputPrice: 0.12,
      outputPrice: 0.24,
      context: "1M",
      notes: "Long-context specialist",
    },
  ],
  "Alibaba (Qwen)": [
    {
      model: "Qwen2.5-72B",
      inputPrice: 0.08,
      outputPrice: 0.16,
      context: "32K",
      notes: "Open-source available",
    },
  ],
};
