import { useState } from "react";
import { COMPANIES, type CompanyComparison } from "./data/companies";

interface OSSComparisonViewProps {
  lang?: "en" | "zh";
}

const translations = {
  en: {
    title: "Open Source Strategy Comparison",
    subtitle: "How DeepSeek differs from other Chinese AI labs in open-source approach",
    columns: [
      "Company",
      "Open Source Strategy",
      "Flagship Models",
      "Community",
      "Commercial Model",
    ],
  },
  zh: {
    title: "开源策略对比",
    subtitle: "DeepSeek 与其他中国 AI 实验室在开源策略上的差异",
    columns: ["公司", "开源策略", "旗舰模型", "社区参与", "商业模式"],
  },
};

export function OSSComparisonView({ lang = "en" }: OSSComparisonViewProps) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const t = translations[lang];

  const getStrategyColor = (company: string): string => {
    if (company === "DeepSeek") return "bg-success-muted border-success-muted";
    if (company === "Zhipu AI (GLM)") return "bg-warning-muted border-warning-muted";
    return "bg-muted/40 border-border/60";
  };

  return (
    <div className="my-6 rounded-lg border border-border/60 bg-muted/30 p-6">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-foreground">{t.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {/* Comparison matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/80">
              {t.columns.map((col, i) => (
                <th
                  key={i}
                  className={`py-3 px-3 text-left font-semibold text-muted-foreground ${
                    i === 0 ? "w-28" : i === 1 ? "w-48" : "w-40"
                  }`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPANIES.map((company, idx) => {
              const isHovered = hoveredRow === idx;
              return (
                <tr
                  key={company.company}
                  className={`border-b border-border/40 transition-colors ${
                    isHovered ? "bg-background/80" : ""
                  }`}
                  onMouseEnter={() => setHoveredRow(idx)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <td
                    className={`py-3 px-3 font-medium ${company.company === "DeepSeek" ? "text-success-foreground" : ""}`}
                  >
                    {company.company}
                  </td>
                  <td className="py-3 px-3">
                    <div
                      className={`inline-block px-2 py-1 rounded text-xs ${getStrategyColor(company.company)} border`}
                    >
                      {company.openSourceStrategy}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-muted-foreground">{company.flagshipModels}</td>
                  <td className="py-3 px-3 text-muted-foreground">{company.communityEngagement}</td>
                  <td className="py-3 px-3 text-muted-foreground">{company.commercialModel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend/Note */}
      <div className="mt-5 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded bg-success" />
          <span>{lang === "zh" ? "核心策略" : "Core strategy"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded bg-warning" />
          <span>{lang === "zh" ? "被动响应" : "Reactive"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded bg-muted-foreground/50" />
          <span>{lang === "zh" ? "有限/封闭" : "Limited/Closed"}</span>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground italic">
        {lang === "zh"
          ? "基于公开报道和公司文档整理。不同公司的开源策略随时间调整。"
          : "Compiled from public reporting and company documentation. Strategies evolve over time."}
      </p>
    </div>
  );
}
