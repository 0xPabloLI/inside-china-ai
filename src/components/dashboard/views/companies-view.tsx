import { useState } from "react";
import { COMPANIES, COMPANY_GROUPS } from "../data/companies";
import { I18N, type Lang } from "../i18n";

const TONE_STYLES: Record<string, string> = {
  "tone-compare": "bg-blue-500/10 text-blue-600",
  "tone-neutral": "bg-muted text-muted-foreground",
  "tone-critique": "bg-red-500/10 text-red-600",
  "tone-positive": "bg-green-500/10 text-green-600",
  "tone-analogy": "bg-amber-500/10 text-amber-700",
};

export function CompaniesView({ lang }: { lang: Lang }) {
  const t = I18N[lang];
  const isZh = lang === "zh";
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground/70">{t.companiesSource}</div>
      <div className="text-[11px] leading-relaxed text-muted-foreground/70">
        {t.companiesDisclaimer}
      </div>

      {COMPANY_GROUPS.map((group) => {
        const groupName = isZh ? group.zh : group.en;
        const groupCompanies = COMPANIES.filter((co) => co.group === group.id);
        if (!groupCompanies.length) return null;

        return (
          <div key={group.id}>
            <div className="mb-2 mt-4 text-[13px] font-semibold tracking-wide text-muted-foreground">
              {groupName}
            </div>
            <div className="space-y-1.5">
              {groupCompanies.map((co) => {
                const name = isZh ? co.nameZh : co.nameEn;
                const isExpanded = expanded === `${group.id}-${name}`;
                return (
                  <div
                    key={`${group.id}-${name}`}
                    className="overflow-hidden rounded-lg border border-border/40 bg-background/40 transition-colors hover:border-border/60"
                  >
                    <button
                      onClick={() => setExpanded(isExpanded ? null : `${group.id}-${name}`)}
                      className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
                    >
                      <span className="flex-1 text-sm font-bold text-foreground">{name}</span>
                      <span className="text-[11px] text-muted-foreground">{co.quotes.length}</span>
                      <span
                        className={`text-xs text-muted-foreground transition-transform ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      >
                        ▶
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-3 space-y-2.5">
                        {co.quotes.map((q, qi) => {
                          const tone = isZh ? q.toneZh : q.toneEn;
                          const text = isZh ? q.zh : q.en;
                          return (
                            <div key={qi} className="border-t border-border/20 pt-2.5">
                              <span
                                className={`mb-1.5 inline-block rounded px-2 py-0.5 text-[10px] font-medium ${
                                  TONE_STYLES[q.toneClass] || TONE_STYLES["tone-neutral"]
                                }`}
                              >
                                {tone}
                              </span>
                              <p className="text-[13px] leading-relaxed text-muted-foreground">{text}</p>
                              <div className="mt-1 text-[10px] text-muted-foreground/50">P.{q.page}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
