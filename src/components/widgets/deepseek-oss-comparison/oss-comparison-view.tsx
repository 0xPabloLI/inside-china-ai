import { COMPANIES, type CompanyComparison } from "./data/companies";
import { useHoverPin } from "../shared/use-hover-pin";

const translations = {
  title: "Open Source Strategy Comparison",
  subtitle: "How DeepSeek differs from other Chinese AI labs in open-source approach",
  columns: ["Company", "Open Source Strategy", "Flagship Models", "Community", "Commercial Model"],
};

export function OSSComparisonView() {
  // Hover/focus row highlight + click-to-pin (keyboard equivalent).
  const pin = useHoverPin<number>();
  const t = translations;

  const getStrategyColor = (company: string): string => {
    if (company === "DeepSeek") return "bg-success-muted border-success-muted";
    if (company === "Zhipu AI (GLM)") return "bg-warning-muted border-warning-muted";
    return "bg-muted/30 border-border/60";
  };

  return (
    <>
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
              const isActive = pin.isActive(idx);
              return (
                <tr
                  key={company.company}
                  tabIndex={0}
                  className={`border-b border-border/40 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                    isActive ? "bg-background/80" : ""
                  }`}
                  onMouseEnter={() => pin.onEnter(idx)}
                  onMouseLeave={pin.onLeave}
                  onFocus={() => pin.onFocus(idx)}
                  onBlur={pin.onBlur}
                  onClick={() => pin.onToggle(idx)}
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
          <span>Core strategy</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded bg-warning" />
          <span>Reactive</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded bg-muted-foreground/50" />
          <span>Limited/Closed</span>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground italic">
        Compiled from public reporting and company documentation. Strategies evolve over time.
      </p>
    </>
  );
}
