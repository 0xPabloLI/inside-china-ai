import { useState } from "react";
import { DEEPSEEK_PRICING, COMPETITOR_PRICING, type PricingTier } from "./data/pricing";

interface APIPricingViewProps {
  lang?: "en" | "zh";
}

const translations = {
  en: {
    title: "API Pricing Comparison",
    subtitle: "DeepSeek's cost-optimized pricing vs major competitors (USD per 1M tokens)",
    columns: ["Model", "Input (per 1M)", "Output (per 1M)", "Context", "Notes"],
    company: "Company",
    highlight: "DeepSeek",
  },
  zh: {
    title: "API 定价对比",
    subtitle: "DeepSeek 的成本优化定价 vs 主要竞争对手（美元/百万 Token）",
    columns: ["模型", "输入 (每百万)", "输出 (每百万)", "上下文", "备注"],
    company: "公司",
    highlight: "DeepSeek",
  },
};

function formatPrice(price: number): string {
  return price.toFixed(2);
}

export function APIPricingView({ lang = "en" }: APIPricingViewProps) {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const t = translations[lang];

  const companies = ["DeepSeek", ...Object.keys(COMPETITOR_PRICING)];
  const selectedPricing = selectedCompany
    ? selectedCompany === "DeepSeek"
      ? DEEPSEEK_PRICING
      : COMPETITOR_PRICING[selectedCompany] || []
    : DEEPSEEK_PRICING;

  const calculateSavings = (deepSeekPrice: number, competitorPrice: number): number => {
    if (competitorPrice === 0) return 0;
    return ((competitorPrice - deepSeekPrice) / competitorPrice) * 100;
  };

  return (
    <div className="my-6 rounded-lg border border-border/60 bg-muted/30 p-6">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-foreground">{t.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {/* Company selector */}
      <div className="mb-4 flex flex-wrap gap-2">
        {companies.map((company) => (
          <button
            key={company}
            onClick={() => setSelectedCompany(company === selectedCompany ? null : company)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              selectedCompany === company || (!selectedCompany && company === "DeepSeek")
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 hover:bg-muted/80 text-muted-foreground"
            }`}
          >
            {company}
          </button>
        ))}
      </div>

      {/* Pricing table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/80">
              {t.columns.map((col, i) => (
                <th
                  key={i}
                  className={`py-3 px-3 text-left font-semibold text-muted-foreground ${
                    i === 0 ? "w-32" : i === 1 || i === 2 ? "w-28" : "w-24"
                  }`}
                >
                  {col}
                </th>
              ))}
              {selectedCompany && selectedCompany !== "DeepSeek" && (
                <th className="py-3 px-3 text-left font-semibold text-muted-foreground w-32">
                  {lang === "zh" ? "vs DeepSeek" : "vs DeepSeek"}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {selectedPricing.map((tier) => {
              const deepSeekTier = DEEPSEEK_PRICING[0]; // Use V3 for comparison
              const inputSavings = selectedCompany && selectedCompany !== "DeepSeek"
                ? calculateSavings(deepSeekTier.inputPrice, tier.inputPrice)
                : null;
              const outputSavings = selectedCompany && selectedCompany !== "DeepSeek"
                ? calculateSavings(deepSeekTier.outputPrice, tier.outputPrice)
                : null;

              return (
                <tr key={tier.model} className="border-b border-border/40 hover:bg-background/50">
                  <td className="py-3 px-3 font-medium">
                    {tier.model}
                    {selectedCompany === "DeepSeek" && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-success-muted text-success-foreground">
                        {lang === "zh" ? "核心" : "Flagship"}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 font-mono">
                    ${formatPrice(tier.inputPrice)}
                    {inputSavings !== null && (
                      <span className={`ml-2 text-xs ${inputSavings > 0 ? "text-success-foreground" : "text-danger"}`}>
                        {inputSavings > 0 ? `-${inputSavings.toFixed(0)}%` : `+${Math.abs(inputSavings).toFixed(0)}%`}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 font-mono">
                    ${formatPrice(tier.outputPrice)}
                    {outputSavings !== null && (
                      <span className={`ml-2 text-xs ${outputSavings > 0 ? "text-success-foreground" : "text-danger"}`}>
                        {outputSavings > 0 ? `-${outputSavings.toFixed(0)}%` : `+${Math.abs(outputSavings).toFixed(0)}%`}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-muted-foreground">{tier.context}</td>
                  <td className="py-3 px-3 text-muted-foreground text-xs">{tier.notes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Key insight */}
      <div className="mt-5 rounded-md bg-background/50 border border-border/40 p-4">
        <p className="text-sm">
          <span className="font-semibold text-foreground">
            {lang === "zh" ? "10 个月回本原则：" : "10-month recovery principle:"}
          </span>{" "}
          {lang === "zh"
            ? "DeepSeek 定价基于硬件成本在 10 个月内回收，约 6 倍利润。这与其他厂商追求更高利润率形成对比。"
            : "DeepSeek's pricing is based on recovering hardware costs within 10 months, approximately 6x profit. This contrasts with competitors pursuing higher profit margins."}
        </p>
      </div>

      <p className="mt-3 text-xs text-muted-foreground italic">
        {lang === "zh"
          ? "价格截至 2026 年 7 月。实际价格可能随时间调整。基于各公司公开定价页面。"
          : "Prices as of July 2026. Actual prices may vary over time. Based on public pricing pages from each company."}
      </p>
    </div>
  );
}