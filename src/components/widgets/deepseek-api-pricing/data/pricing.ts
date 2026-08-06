export interface PricingTier {
  model: string;
  /** USD per 1M input tokens */
  inputPrice: number;
  /** USD per 1M output tokens */
  outputPrice: number;
  context: string;
  notes: string;
}

export const DEEPSEEK_PRICING: PricingTier[] = [
  {
    model: "DeepSeek-V3",
    inputPrice: 0.27,
    outputPrice: 1.1,
    context: "128K",
    notes: "Cache hits billed at $0.07 / 1M input",
  },
  {
    model: "DeepSeek-R1",
    inputPrice: 0.55,
    outputPrice: 2.19,
    context: "64K",
    notes: "Reasoning tokens billed as output",
  },
];

export const COMPETITOR_PRICING: Record<string, PricingTier[]> = {
  OpenAI: [
    {
      model: "GPT-4o",
      inputPrice: 2.5,
      outputPrice: 10,
      context: "128K",
      notes: "Batch API halves the price",
    },
    {
      model: "GPT-4o mini",
      inputPrice: 0.15,
      outputPrice: 0.6,
      context: "128K",
      notes: "Small-model tier",
    },
  ],
  Anthropic: [
    {
      model: "Claude Sonnet",
      inputPrice: 3,
      outputPrice: 15,
      context: "200K",
      notes: "Prompt caching available",
    },
    {
      model: "Claude Haiku",
      inputPrice: 0.8,
      outputPrice: 4,
      context: "200K",
      notes: "Fast, low-cost tier",
    },
  ],
  Google: [
    {
      model: "Gemini Pro",
      inputPrice: 1.25,
      outputPrice: 10,
      context: "1M",
      notes: "Higher rate above 200K context",
    },
    {
      model: "Gemini Flash",
      inputPrice: 0.3,
      outputPrice: 2.5,
      context: "1M",
      notes: "Throughput-oriented tier",
    },
  ],
  Alibaba: [
    {
      model: "Qwen-Max",
      inputPrice: 1.6,
      outputPrice: 6.4,
      context: "32K",
      notes: "Open-weight siblings are free to self-host",
    },
  ],
};
