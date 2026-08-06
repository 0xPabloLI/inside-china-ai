/**
 * Shared language toggle component for widgets.
 *
 * All widgets that support EN/中文 switching should use this component
 * instead of duplicating the implementation. The Lang type is also
 * exported here so widget i18n modules can reference it without
 * defining their own.
 */

export type Lang = "en" | "zh";

export function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-muted/40 p-0.5">
      <button
        type="button"
        onClick={() => onChange("zh")}
        aria-pressed={lang === "zh"}
        className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          lang === "zh" ? "bg-primary/10 text-primary" : "text-muted-foreground"
        }`}
      >
        中文
      </button>
      <button
        type="button"
        onClick={() => onChange("en")}
        aria-pressed={lang === "en"}
        className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          lang === "en" ? "bg-primary/10 text-primary" : "text-muted-foreground"
        }`}
      >
        EN
      </button>
    </div>
  );
}
