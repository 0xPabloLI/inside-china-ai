import { useState, useCallback } from "react";
import { I18N, type Lang } from "../i18n";
import { CloudView } from "./cloud-view";
import { TalentView } from "./talent-view";
import { CompaniesView } from "./companies-view";
import { PricingView } from "./pricing-view";
import { FundingView } from "./funding-view";

type ViewName = "talent" | "funding" | "pricing" | "companies" | "cloud";

const VIEW_ORDER: ViewName[] = ["talent", "funding", "pricing", "companies", "cloud"];

export function DeepSeekDashboard() {
  const [lang, setLang] = useState<Lang>("en");
  const [view, setView] = useState<ViewName>("talent");

  const t = I18N[lang];

  const handleLangChange = useCallback((newLang: Lang) => {
    setLang(newLang);
  }, []);

  return (
    <div className="my-12 rounded-2xl border border-border/60 bg-card/50 overflow-hidden">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex flex-wrap gap-1.5">
          {VIEW_ORDER.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                view === v
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t[`tab${v.charAt(0).toUpperCase() + v.slice(1)}` as keyof typeof t] as string}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 p-0.5">
          <button
            onClick={() => handleLangChange("zh")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              lang === "zh" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            中文
          </button>
          <button
            onClick={() => handleLangChange("en")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              lang === "en" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            EN
          </button>
        </div>
      </div>

      {/* View content */}
      <div className="max-h-[600px] overflow-y-auto px-5 py-5">
        {view === "talent" && <TalentView lang={lang} />}
        {view === "funding" && <FundingView lang={lang} />}
        {view === "pricing" && <PricingView lang={lang} />}
        {view === "companies" && <CompaniesView lang={lang} />}
        {view === "cloud" && <CloudView lang={lang} />}
      </div>
    </div>
  );
}
