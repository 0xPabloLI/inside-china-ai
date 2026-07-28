import { useState } from "react";
import { KEYWORDS } from "./data/keywords";
import type { Lang } from "./i18n";

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

function getColor(t: number): string {
  if (t > 0.75)
    return `rgb(${Math.round(200 + t * 40)},${Math.round(80 + (1 - t) * 40)},${Math.round(50 + (1 - t) * 30)})`;
  if (t > 0.5) {
    const k = (t - 0.5) / 0.25;
    return `rgb(${Math.round(180 + k * 20)},${Math.round(100 + k * 30)},${Math.round(80 - k * 30)})`;
  }
  if (t > 0.25) {
    const k = (t - 0.25) / 0.25;
    return `rgb(${Math.round(80 + k * 100)},${Math.round(130 + k * 30)},${Math.round(180 - k * 100)})`;
  }
  const k = t / 0.25;
  return `rgb(${Math.round(60 + k * 20)},${Math.round(100 + k * 30)},${Math.round(180 + k * 0)})`;
}

export function CloudView({ lang = "en" }: { lang: Lang }) {
  const [currentLang, setCurrentLang] = useState<Lang>(lang);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxFreq = KEYWORDS[0].freq;
  const minFreq = KEYWORDS[KEYWORDS.length - 1].freq;

  const items = KEYWORDS.map((kw, i) => {
    const t = (kw.freq - minFreq) / Math.max(1, maxFreq - minFreq);
    const fontSize = Math.round(16 + Math.pow(t, 0.6) * 32);
    return { ...kw, fontSize, t, idx: i };
  });

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <LangToggle lang={currentLang} onChange={setCurrentLang} />
      </div>

      {/* Tag cloud */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 py-4">
        {items.map((item) => {
          const displayWord = currentLang === "zh" ? item.zh : item.en;
          const otherWord = currentLang === "zh" ? item.en : item.zh;
          const color = getColor(item.t);
          const isHovered = hoveredIdx === item.idx;

          return (
            <span
              key={`${item.zh}-${item.en}`}
              className="cursor-pointer font-bold transition-all duration-200 select-none"
              style={{
                fontSize: `${item.fontSize}px`,
                color,
                opacity: hoveredIdx === null || isHovered ? 1 : 0.3,
                transform: isHovered ? "scale(1.2)" : "scale(1)",
                textShadow: isHovered ? `0 0 20px ${color}66` : "none",
              }}
              onMouseEnter={() => setHoveredIdx(item.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {displayWord}
              {isHovered && (
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                  {otherWord} · {item.freq}
                  {currentLang === "zh" ? "次" : "x"}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Frequency bar for hovered word */}
      {hoveredIdx !== null && (
        <div className="mt-2 flex items-center gap-2 px-4">
          <span
            className="text-xs font-semibold"
            style={{ color: getColor(items.find((i) => i.idx === hoveredIdx)!.t) }}
          >
            {currentLang === "zh"
              ? items.find((i) => i.idx === hoveredIdx)!.zh
              : items.find((i) => i.idx === hoveredIdx)!.en}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(items.find((i) => i.idx === hoveredIdx)!.freq / maxFreq) * 100}%`,
                background: getColor(items.find((i) => i.idx === hoveredIdx)!.t),
              }}
            />
          </div>
          <span className="text-xs font-bold text-muted-foreground">
            {items.find((i) => i.idx === hoveredIdx)!.freq}
          </span>
        </div>
      )}

      <div className="mt-3 text-center text-[11px] tracking-wide text-muted-foreground/60">
        {currentLang === "zh"
          ? "悬停查看词频 · 源自 42 页投资者交流实录"
          : "Hover for frequency · From 42-page investor meeting transcript"}
      </div>
    </div>
  );
}
