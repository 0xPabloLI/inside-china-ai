export interface PricingModel {
  nameZh: string;
  nameEn: string;
  input: number;
  output: number;
  context: string;
  tierZh: string;
  tierEn: string;
  sourceUrl: string;
  sourceName: string;
}

export interface PricingVendor {
  vendorZh: string;
  vendorEn: string;
  color: string;
  region: "cn" | "overseas";
  models: PricingModel[];
}

export const PRICING_DATA: PricingVendor[] = [
  // ── Domestic (RMB) ──
  {
    vendorZh: "DeepSeek", vendorEn: "DeepSeek", color: "#5B8FF9", region: "cn",
    models: [
      { nameZh: "V4-Pro", nameEn: "V4-Pro", input: 3, output: 6, context: "1M", tierZh: "旗舰", tierEn: "Flagship", sourceUrl: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing", sourceName: "api-docs.deepseek.com" },
      { nameZh: "V4-Flash", nameEn: "V4-Flash", input: 1, output: 2, context: "1M", tierZh: "专业", tierEn: "Pro", sourceUrl: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing", sourceName: "api-docs.deepseek.com" },
    ],
  },
  {
    vendorZh: "智谱AI", vendorEn: "Zhipu AI", color: "#5AD8A6", region: "cn",
    models: [
      { nameZh: "GLM-5.2", nameEn: "GLM-5.2", input: 8, output: 28, context: "1M", tierZh: "旗舰", tierEn: "Flagship", sourceUrl: "https://open.bigmodel.cn/pricing", sourceName: "open.bigmodel.cn" },
      { nameZh: "GLM-5.1", nameEn: "GLM-5.1", input: 6, output: 24, context: "128K", tierZh: "专业", tierEn: "Pro", sourceUrl: "https://open.bigmodel.cn/pricing", sourceName: "open.bigmodel.cn" },
    ],
  },
  {
    vendorZh: "Kimi", vendorEn: "Kimi (Moonshot)", color: "#5D7092", region: "cn",
    models: [
      { nameZh: "K3", nameEn: "K3", input: 20, output: 100, context: "1M", tierZh: "旗舰", tierEn: "Flagship", sourceUrl: "https://platform.kimi.com/docs/pricing/chat-k3", sourceName: "platform.kimi.com" },
      { nameZh: "K2.7 Code", nameEn: "K2.7 Code", input: 6.5, output: 27, context: "256K", tierZh: "专业", tierEn: "Pro", sourceUrl: "https://platform.kimi.com/docs/pricing/chat-k27-code", sourceName: "platform.kimi.com" },
    ],
  },
  {
    vendorZh: "小米MiMo", vendorEn: "Xiaomi MiMo", color: "#FF6900", region: "cn",
    models: [
      { nameZh: "MiMo-V2.5-Pro", nameEn: "MiMo-V2.5-Pro", input: 3, output: 6, context: "1M", tierZh: "旗舰", tierEn: "Flagship", sourceUrl: "https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go", sourceName: "mimo.mi.com" },
      { nameZh: "MiMo-V2.5", nameEn: "MiMo-V2.5", input: 1, output: 2, context: "1M", tierZh: "专业", tierEn: "Pro", sourceUrl: "https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go", sourceName: "mimo.mi.com" },
    ],
  },
  {
    vendorZh: "MiniMax", vendorEn: "MiniMax", color: "#F6BD16", region: "cn",
    models: [
      { nameZh: "M3", nameEn: "M3", input: 4.2, output: 16.8, context: "512K", tierZh: "旗舰", tierEn: "Flagship", sourceUrl: "https://platform.minimaxi.com/docs/guides/pricing-paygo", sourceName: "platform.minimaxi.com" },
      { nameZh: "M2.7", nameEn: "M2.7", input: 2.1, output: 8.4, context: "245K", tierZh: "专业", tierEn: "Pro", sourceUrl: "https://platform.minimaxi.com/docs/guides/pricing-paygo", sourceName: "platform.minimaxi.com" },
    ],
  },
  {
    vendorZh: "通义千问", vendorEn: "Qwen (Alibaba)", color: "#E86452", region: "cn",
    models: [
      { nameZh: "Qwen3.7-Max", nameEn: "Qwen3.7-Max", input: 12, output: 36, context: "1M", tierZh: "旗舰", tierEn: "Flagship", sourceUrl: "https://help.aliyun.com/zh/model-studio/model-pricing", sourceName: "help.aliyun.com" },
      { nameZh: "Qwen3.6-Max-Preview", nameEn: "Qwen3.6-Max-Preview", input: 9, output: 54, context: "256K", tierZh: "专业", tierEn: "Pro", sourceUrl: "https://help.aliyun.com/zh/model-studio/model-pricing", sourceName: "help.aliyun.com" },
    ],
  },
  {
    vendorZh: "腾讯混元", vendorEn: "Tencent Hunyuan", color: "#6DC8EC", region: "cn",
    models: [
      { nameZh: "Hunyuan-role-latest", nameEn: "Hunyuan-role-latest", input: 2.4, output: 9.6, context: "256K", tierZh: "旗舰", tierEn: "Flagship", sourceUrl: "https://cloud.tencent.com/document/product/1729/97731", sourceName: "cloud.tencent.com" },
      { nameZh: "Hunyuan-a13b", nameEn: "Hunyuan-a13b", input: 0.5, output: 2.0, context: "256K", tierZh: "专业", tierEn: "Pro", sourceUrl: "https://cloud.tencent.com/document/product/1729/97731", sourceName: "cloud.tencent.com" },
    ],
  },
  {
    vendorZh: "字节豆包", vendorEn: "ByteDance Doubao", color: "#945FB9", region: "cn",
    models: [
      { nameZh: "Seed-Evolving", nameEn: "Seed-Evolving", input: 6, output: 30, context: "256K", tierZh: "旗舰", tierEn: "Flagship", sourceUrl: "https://www.volcengine.com/docs/82379/1099320", sourceName: "volcengine.com" },
      { nameZh: "Seed-2.1-Turbo", nameEn: "Seed-2.1-Turbo", input: 3, output: 15, context: "128K", tierZh: "专业", tierEn: "Pro", sourceUrl: "https://www.volcengine.com/docs/82379/1099320", sourceName: "volcengine.com" },
    ],
  },
  // ── Overseas (USD) ──
  {
    vendorZh: "OpenAI", vendorEn: "OpenAI", color: "#10A37F", region: "overseas",
    models: [
      { nameZh: "GPT-5.6-Sol", nameEn: "GPT-5.6-Sol", input: 5, output: 30, context: "1M", tierZh: "旗舰", tierEn: "Flagship", sourceUrl: "https://platform.openai.com/docs/pricing", sourceName: "platform.openai.com" },
      { nameZh: "GPT-5.6-Terra", nameEn: "GPT-5.6-Terra", input: 2.5, output: 15, context: "1M", tierZh: "专业", tierEn: "Pro", sourceUrl: "https://platform.openai.com/docs/pricing", sourceName: "platform.openai.com" },
    ],
  },
  {
    vendorZh: "Anthropic", vendorEn: "Anthropic", color: "#D97757", region: "overseas",
    models: [
      { nameZh: "Claude Fable 5", nameEn: "Claude Fable 5", input: 10, output: 50, context: "1M", tierZh: "旗舰", tierEn: "Flagship", sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing", sourceName: "docs.anthropic.com" },
      { nameZh: "Claude Opus 5", nameEn: "Claude Opus 5", input: 5, output: 25, context: "1M", tierZh: "专业", tierEn: "Pro", sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing", sourceName: "docs.anthropic.com" },
    ],
  },
  {
    vendorZh: "Google", vendorEn: "Google Gemini", color: "#4285F4", region: "overseas",
    models: [
      { nameZh: "Gemini 3.1 Pro Preview", nameEn: "Gemini 3.1 Pro Preview", input: 2, output: 12, context: "1M", tierZh: "旗舰", tierEn: "Flagship", sourceUrl: "https://ai.google.dev/pricing", sourceName: "ai.google.dev" },
      { nameZh: "Gemini 2.5 Pro", nameEn: "Gemini 2.5 Pro", input: 1.25, output: 10, context: "1M", tierZh: "专业", tierEn: "Pro", sourceUrl: "https://ai.google.dev/pricing", sourceName: "ai.google.dev" },
    ],
  },
  {
    vendorZh: "xAI", vendorEn: "xAI (Grok)", color: "#1DA1F2", region: "overseas",
    models: [
      { nameZh: "Grok 4.5", nameEn: "Grok 4.5", input: 2, output: 6, context: "500K", tierZh: "旗舰", tierEn: "Flagship", sourceUrl: "https://docs.x.ai/developers/pricing", sourceName: "docs.x.ai" },
      { nameZh: "Grok 4.3", nameEn: "Grok 4.3", input: 1.25, output: 2.5, context: "1M", tierZh: "专业", tierEn: "Pro", sourceUrl: "https://docs.x.ai/developers/pricing", sourceName: "docs.x.ai" },
    ],
  },
];
