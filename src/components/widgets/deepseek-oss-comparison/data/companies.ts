export interface CompanyComparison {
  company: string;
  openSourceStrategy: string;
  flagshipModels: string;
  communityEngagement: string;
  commercialModel: string;
}

export const COMPANIES: CompanyComparison[] = [
  {
    company: "DeepSeek",
    openSourceStrategy:
      "Core strategy — models are intentionally open-sourced as part of company vision",
    flagshipModels: "DeepSeek-V3, DeepSeek-Coder, DeepSeek-MoE",
    communityEngagement: "Active — provides deployment help, encourages third-party use",
    commercialModel: "API at 10-month hardware cost recovery (6x profit), enterprise hosting",
  },
  {
    company: "Zhipu AI (GLM)",
    openSourceStrategy: "Reactive — open-sources after closed-source commercial releases",
    flagshipModels: "GLM-4, GLM-5.2 (744B MoE)",
    communityEngagement: "Moderate — releases weights but limited support",
    commercialModel: "API + enterprise licensing + cloud services",
  },
  {
    company: "Alibaba (Qwen)",
    openSourceStrategy: "Hybrid — tiered releases with gated access for larger models",
    flagshipModels: "Qwen2.5-72B, Qwen2-VL",
    communityEngagement: "Limited — some open weights, heavy enterprise focus",
    commercialModel: "API + cloud integration + enterprise solutions",
  },
  {
    company: "ByteDance (Doubao)",
    openSourceStrategy: "Minimal — primarily closed-source, internal use",
    flagshipModels: "Doubao (internal), limited public releases",
    communityEngagement: "None — models not available to public",
    commercialModel: "Integrated into products (TikTok, Douyin), enterprise API",
  },
  {
    company: "Moonshot AI (Kimi)",
    openSourceStrategy: "Selective — open-sourced K3 after closed-source period",
    flagshipModels: "Kimi K3 (2.8T MoE)",
    communityEngagement: "Limited — open weights but focused on product",
    commercialModel: "C-end app + API + enterprise solutions",
  },
];
