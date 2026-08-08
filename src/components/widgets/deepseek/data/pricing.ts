export interface PricingModel {
  name: string;
  input: number;
  output: number;
  context: string;
  tier: string;
  sourceUrl: string;
  sourceName: string;
}

export interface PricingVendor {
  vendor: string;
  color: string;
  region: "cn" | "overseas";
  models: PricingModel[];
}

export const PRICING_DATA: PricingVendor[] = [
  // ── Domestic (RMB) ──
  {
    vendor: "DeepSeek",
    color: "#5B8FF9",
    region: "cn",
    models: [
      {
        name: "V4-Pro",
        input: 3,
        output: 6,
        context: "1M",
        tier: "Flagship",
        sourceUrl: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing",
        sourceName: "api-docs.deepseek.com",
      },
      {
        name: "V4-Flash",
        input: 1,
        output: 2,
        context: "1M",
        tier: "Pro",
        sourceUrl: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing",
        sourceName: "api-docs.deepseek.com",
      },
    ],
  },
  {
    vendor: "Zhipu AI",
    color: "#5AD8A6",
    region: "cn",
    models: [
      {
        name: "GLM-5.2",
        input: 8,
        output: 28,
        context: "1M",
        tier: "Flagship",
        sourceUrl: "https://open.bigmodel.cn/pricing",
        sourceName: "open.bigmodel.cn",
      },
      {
        name: "GLM-5.1",
        input: 6,
        output: 24,
        context: "128K",
        tier: "Pro",
        sourceUrl: "https://open.bigmodel.cn/pricing",
        sourceName: "open.bigmodel.cn",
      },
    ],
  },
  {
    vendor: "Kimi (Moonshot)",
    color: "#5D7092",
    region: "cn",
    models: [
      {
        name: "K3",
        input: 20,
        output: 100,
        context: "1M",
        tier: "Flagship",
        sourceUrl: "https://platform.kimi.com/docs/pricing/chat-k3",
        sourceName: "platform.kimi.com",
      },
      {
        name: "K2.7 Code",
        input: 6.5,
        output: 27,
        context: "256K",
        tier: "Pro",
        sourceUrl: "https://platform.kimi.com/docs/pricing/chat-k27-code",
        sourceName: "platform.kimi.com",
      },
    ],
  },
  {
    vendor: "Xiaomi MiMo",
    color: "#FF6900",
    region: "cn",
    models: [
      {
        name: "MiMo-V2.5-Pro",
        input: 3,
        output: 6,
        context: "1M",
        tier: "Flagship",
        sourceUrl: "https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go",
        sourceName: "mimo.mi.com",
      },
      {
        name: "MiMo-V2.5",
        input: 1,
        output: 2,
        context: "1M",
        tier: "Pro",
        sourceUrl: "https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go",
        sourceName: "mimo.mi.com",
      },
    ],
  },
  {
    vendor: "MiniMax",
    color: "#F6BD16",
    region: "cn",
    models: [
      {
        name: "M3",
        input: 4.2,
        output: 16.8,
        context: "512K",
        tier: "Flagship",
        sourceUrl: "https://platform.minimaxi.com/docs/guides/pricing-paygo",
        sourceName: "platform.minimaxi.com",
      },
      {
        name: "M2.7",
        input: 2.1,
        output: 8.4,
        context: "245K",
        tier: "Pro",
        sourceUrl: "https://platform.minimaxi.com/docs/guides/pricing-paygo",
        sourceName: "platform.minimaxi.com",
      },
    ],
  },
  {
    vendor: "Qwen (Alibaba)",
    color: "#E86452",
    region: "cn",
    models: [
      {
        name: "Qwen3.7-Max",
        input: 12,
        output: 36,
        context: "1M",
        tier: "Flagship",
        sourceUrl: "https://help.aliyun.com/zh/model-studio/model-pricing",
        sourceName: "help.aliyun.com",
      },
      {
        name: "Qwen3.6-Max-Preview",
        input: 9,
        output: 54,
        context: "256K",
        tier: "Pro",
        sourceUrl: "https://help.aliyun.com/zh/model-studio/model-pricing",
        sourceName: "help.aliyun.com",
      },
    ],
  },
  {
    vendor: "Tencent Hunyuan",
    color: "#6DC8EC",
    region: "cn",
    models: [
      {
        name: "Hunyuan-role-latest",
        input: 2.4,
        output: 9.6,
        context: "256K",
        tier: "Flagship",
        sourceUrl: "https://cloud.tencent.com/document/product/1729/97731",
        sourceName: "cloud.tencent.com",
      },
      {
        name: "Hunyuan-a13b",
        input: 0.5,
        output: 2.0,
        context: "256K",
        tier: "Pro",
        sourceUrl: "https://cloud.tencent.com/document/product/1729/97731",
        sourceName: "cloud.tencent.com",
      },
    ],
  },
  {
    vendor: "ByteDance Doubao",
    color: "#945FB9",
    region: "cn",
    models: [
      {
        name: "Seed-Evolving",
        input: 6,
        output: 30,
        context: "256K",
        tier: "Flagship",
        sourceUrl: "https://www.volcengine.com/docs/82379/1099320",
        sourceName: "volcengine.com",
      },
      {
        name: "Seed-2.1-Turbo",
        input: 3,
        output: 15,
        context: "128K",
        tier: "Pro",
        sourceUrl: "https://www.volcengine.com/docs/82379/1099320",
        sourceName: "volcengine.com",
      },
    ],
  },
  // ── Overseas (USD) ──
  {
    vendor: "OpenAI",
    color: "#10A37F",
    region: "overseas",
    models: [
      {
        name: "GPT-5.6-Sol",
        input: 5,
        output: 30,
        context: "1M",
        tier: "Flagship",
        sourceUrl: "https://platform.openai.com/docs/pricing",
        sourceName: "platform.openai.com",
      },
      {
        name: "GPT-5.6-Terra",
        input: 2.5,
        output: 15,
        context: "1M",
        tier: "Pro",
        sourceUrl: "https://platform.openai.com/docs/pricing",
        sourceName: "platform.openai.com",
      },
    ],
  },
  {
    vendor: "Anthropic",
    color: "#D97757",
    region: "overseas",
    models: [
      {
        name: "Claude Fable 5",
        input: 10,
        output: 50,
        context: "1M",
        tier: "Flagship",
        sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing",
        sourceName: "docs.anthropic.com",
      },
      {
        name: "Claude Opus 5",
        input: 5,
        output: 25,
        context: "1M",
        tier: "Pro",
        sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing",
        sourceName: "docs.anthropic.com",
      },
    ],
  },
  {
    vendor: "Google Gemini",
    color: "#4285F4",
    region: "overseas",
    models: [
      {
        name: "Gemini 3.1 Pro Preview",
        input: 2,
        output: 12,
        context: "1M",
        tier: "Flagship",
        sourceUrl: "https://ai.google.dev/pricing",
        sourceName: "ai.google.dev",
      },
      {
        name: "Gemini 2.5 Pro",
        input: 1.25,
        output: 10,
        context: "1M",
        tier: "Pro",
        sourceUrl: "https://ai.google.dev/pricing",
        sourceName: "ai.google.dev",
      },
    ],
  },
  {
    vendor: "xAI (Grok)",
    color: "#1DA1F2",
    region: "overseas",
    models: [
      {
        name: "Grok 4.5",
        input: 2,
        output: 6,
        context: "500K",
        tier: "Flagship",
        sourceUrl: "https://docs.x.ai/developers/pricing",
        sourceName: "docs.x.ai",
      },
      {
        name: "Grok 4.3",
        input: 1.25,
        output: 2.5,
        context: "1M",
        tier: "Pro",
        sourceUrl: "https://docs.x.ai/developers/pricing",
        sourceName: "docs.x.ai",
      },
    ],
  },
];
