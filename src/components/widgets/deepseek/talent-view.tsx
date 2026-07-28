import { useState } from "react";
import { PEOPLE } from "./data/people";
import { I18N, type Lang } from "./i18n";

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-muted/40 p-0.5">
      <button
        onClick={() => onChange("zh")}
        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${lang === "zh" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
      >
        中文
      </button>
      <button
        onClick={() => onChange("en")}
        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${lang === "en" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
      >
        EN
      </button>
    </div>
  );
}

export function TalentView() {
  const [lang, setLang] = useState<Lang>("en");
  const t = I18N[lang];
  const isZh = lang === "zh";

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <LangToggle lang={lang} onChange={setLang} />
      </div>
      <div className="text-[13px] font-semibold tracking-wide text-muted-foreground">
        {t.sectionPeople}
      </div>

      {PEOPLE.map((p, i) => {
        const name = isZh ? p.nameZh : p.nameEn;
        const role = isZh ? p.roleZh : p.roleEn;
        const tech = isZh ? p.techZh : p.techEn;
        const company = isZh ? p.companyZh : p.companyEn;
        const note = isZh ? p.noteZh : p.noteEn;
        const depart = isZh ? p.departZh : p.departEn;
        const salaryParts = (isZh ? p.salaryZh : p.salaryEn).split("\n");
        const salaryStatus = p.salaryKnown ? t.salaryConfirmed : t.salaryRumored;

        return (
          <div
            key={p.nameEn}
            className="rounded-xl border border-border/60 bg-background/60 transition-colors hover:border-border"
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            {/* Head */}
            <div className="flex flex-wrap items-center gap-2.5 px-5 pt-4 pb-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.techColor }} />
              <span className="text-lg font-bold text-foreground">{name}</span>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-muted-foreground">
                {tech}
              </span>
              <span className="ml-auto text-[11px] font-semibold text-red-500/80 shrink-0">
                {t.departLabel} · {depart}
              </span>
            </div>

            {/* Cols */}
            <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-border/40">
              <div className="px-5 py-3 border-b sm:border-b-0 sm:border-r border-border/40">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  {t.tcLabelRole}
                </div>
                <div className="text-[13px] text-foreground/80 leading-snug">{role}</div>
              </div>
              <div className="px-5 py-3">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  {t.tcLabelFlow}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">DeepSeek</span>
                  <span className="text-sm text-muted-foreground">→</span>
                  <span className="text-[15px] font-bold" style={{ color: p.companyColor }}>
                    {company}
                  </span>
                </div>
                {note ? <div className="mt-1 text-[11px] text-muted-foreground">{note}</div> : null}
              </div>
            </div>

            {/* Salary */}
            <div className="flex flex-wrap items-center gap-2 border-t border-border/40 px-5 py-2.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {t.tcLabelSalary}
              </span>
              <span
                className={`text-sm font-bold ${
                  p.salaryKnown ? "text-amber-600" : "text-amber-700/80"
                }`}
              >
                {salaryParts[0]}
              </span>
              {salaryParts[1] ? (
                <span className="text-[10px] text-muted-foreground">{salaryParts[1]}</span>
              ) : null}
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                  p.salaryKnown
                    ? "bg-amber-500/10 text-amber-600"
                    : "bg-amber-700/5 text-amber-700/80"
                }`}
              >
                {salaryStatus}
              </span>
            </div>
          </div>
        );
      })}

      {/* Info box */}
      <div className="mt-5 rounded-xl border border-border/60 bg-muted/30 px-5 py-4">
        <h3 className="mb-2.5 text-[13px] font-semibold text-foreground/80 tracking-wide">
          {t.infoBoxTitle}
        </h3>
        <ul className="space-y-1.5">
          {t.infoBoxItems.map((item, idx) => (
            <li key={idx} className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold text-amber-600">{item.highlight}</span>
              {item.text}
            </li>
          ))}
        </ul>
      </div>

      {/* Disclaimer */}
      <div className="mt-3 space-y-0.5 text-[11px] leading-relaxed text-muted-foreground/60">
        {t.sourceText.map((s, i) => (
          <div key={i}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground hover:underline"
            >
              {s.label} ↗
            </a>
          </div>
        ))}
        <br />
        {t.disclaimer}
      </div>
    </div>
  );
}
