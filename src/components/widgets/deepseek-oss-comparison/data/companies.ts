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
    openSourceStrategy: "Open weights by default, with technical reports",
    flagshipModels: "DeepSeek-V3, DeepSeek-R1",
    communityEngagement: "High: papers, weights, permissive license",
    commercialModel: "Low-cost API, hardware cost recovered in ~10 months",
  },
  {
    company: "Alibaba (Qwen)",
    openSourceStrategy: "Broad open family plus closed top tier",
    flagshipModels: "Qwen open series, Qwen-Max",
    communityEngagement: "High: many sizes, heavy fine-tune ecosystem",
    commercialModel: "Cloud platform upsell",
  },
  {
    company: "Zhipu AI (GLM)",
    openSourceStrategy: "Reactive: opens weights after competitors do",
    flagshipModels: "GLM-4 series",
    communityEngagement: "Medium: selected releases",
    commercialModel: "Enterprise licensing and API",
  },
  {
    company: "Moonshot AI",
    openSourceStrategy: "Selective open releases",
    flagshipModels: "Kimi series",
    communityEngagement: "Medium: consumer app first",
    commercialModel: "Consumer product plus API",
  },
  {
    company: "MiniMax",
    openSourceStrategy: "Limited: some weights, mostly closed",
    flagshipModels: "MiniMax text and audio models",
    communityEngagement: "Low to medium",
    commercialModel: "API and consumer apps",
  },
  {
    company: "Baidu",
    openSourceStrategy: "Closed first, later open tiers",
    flagshipModels: "ERNIE series",
    communityEngagement: "Low: platform-centric",
    commercialModel: "Cloud and enterprise contracts",
  },
];
