import { useState } from "react";
import { KEYWORDS, type Keyword } from "./data/keywords";

interface WordCloudProps {
  lang?: "en" | "zh";
}

function getColor(t: number): string {
  if (t > 0.75)
    return `rgb(${Math.round(220 + t * 35)},${Math.round(90 + (1 - t) * 35)},${Math.round(60 + (1 - t) * 30)})`;
  if (t > 0.5) {
    const k = (t - 0.5) / 0.25;
    return `rgb(${Math.round(190 + k * 30)},${Math.round(110 + k * 35)},${Math.round(90 - k * 30)})`;
  }
  if (t > 0.25) {
    const k = (t - 0.25) / 0.25;
    return `rgb(${Math.round(90 + k * 100)},${Math.round(140 + k * 35)},${Math.round(190 - k * 100)})`;
  }
  const k = t / 0.25;
  return `rgb(${Math.round(70 + k * 20)},${Math.round(110 + k * 30)},${Math.round(190 + k * 0)})`;
}

export function VisionKeywordsView({ lang = "en" }: WordCloudProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxFreq = KEYWORDS[0].freq;
  const minFreq = KEYWORDS[KEYWORDS.length - 1].freq;

  const items = KEYWORDS.map((kw, i) => {
    const t = (kw.freq - minFreq) / Math.max(1, maxFreq - minFreq);
    const fontSize = Math.round(14 + Math.pow(t, 0.6) * 42);
    return { ...kw, fontSize, t, idx: i };
  });

  return (
    <div className="my-6 rounded-lg border border-border/60 bg-muted/30 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {lang === "zh" ? "演讲关键词频率" : "Key Themes from the Meeting"}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-brand" />
            <span>{lang === "zh" ? "高" : "High"}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-chart-3" />
            <span>{lang === "zh" ? "中" : "Medium"}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-chart-2" />
            <span>{lang === "zh" ? "低" : "Low"}</span>
          </span>
        </div>
      </div>

      {/* Tag cloud */}
      <div
        className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-3 py-6"
        style={{ lineHeight: 1.9 }}
      >
        {items.map((item) => {
          const displayWord = lang === "zh" ? item.zh : item.en;
          const otherWord = lang === "zh" ? item.en : item.zh;
          const color = getColor(item.t);
          const isHovered = hoveredIdx === item.idx;

          return (
            <span
              key={`${item.zh}-${item.en}`}
              className="cursor-pointer font-bold transition-all duration-200 select-none"
              style={{
                fontSize: `${item.fontSize}px`,
                color,
                opacity: hoveredIdx === null || isHovered ? 1 : 0.25,
                transform: isHovered ? "scale(1.15)" : "scale(1)",
                textShadow: isHovered ? `0 0 24px ${color}88` : "none",
              }}
              onMouseEnter={() => setHoveredIdx(item.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {displayWord}
              {isHovered && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {otherWord} · {item.freq}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Frequency bar for hovered word */}
      {hoveredIdx !== null && (
        <div className="mt-4 flex items-center gap-3 rounded-md bg-background/50 px-4 py-2">
          <span
            className="text-sm font-semibold"
            style={{ color: getColor(items.find((i) => i.idx === hoveredIdx)!.t) }}
          >
            {items.find((i) => i.idx === hoveredIdx)![lang === "zh" ? "zh" : "en"]}
          </span>
          <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${((items.find((i) => i.idx === hoveredIdx)!.freq - minFreq) / (maxFreq - minFreq)) * 100}%`,
                backgroundColor: getColor(items.find((i) => i.idx === hoveredIdx)!.t),
              }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {items.find((i) => i.idx === hoveredIdx)!.freq} {lang === "zh" ? "次" : "mentions"}
          </span>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        {lang === "zh"
          ? "基于 3 小时 44 分钟的演讲文本分析"
          : "Based on analysis of a 3h 44m investor meeting transcript"}
      </p>
    </div>
  );
}
