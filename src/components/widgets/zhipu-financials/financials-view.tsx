import { METRICS, INFRASTRUCTURE } from "./data/financials";

const translations = {
  title: "Zhipu AI Financials — 2026 H1",
  subtitle: "Revenue, margins, and infrastructure economics",
  infraTitle: "Infrastructure",
  source: "Source: Zhipu AI 2026 H1 earnings call, Sep 2, 2026.",
};

export function ZhipuFinancialsView() {
  const t = translations;
  return (
    <>
      <div className="mb-5">
        <h3 className="text-base font-semibold text-foreground">{t.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {METRICS.map((m) => (
          <div
            key={m.label}
            className="rounded-lg border border-border/50 bg-muted/30 p-3"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">{m.label}</span>
              {m.trend !== "—" && (
                <span className="text-xs font-medium text-success">{m.trend}</span>
              )}
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">{m.value}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{m.subtext}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border/50 bg-muted/20 p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">{t.infraTitle}</div>
        <div className="grid grid-cols-1 gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
          <div>• {INFRASTRUCTURE.chips}</div>
          <div>• {INFRASTRUCTURE.costReduction}</div>
          <div>• {INFRASTRUCTURE.performanceGain}</div>
          <div>• {INFRASTRUCTURE.computeMultiplier}</div>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground italic">{t.source}</p>
    </>
  );
}