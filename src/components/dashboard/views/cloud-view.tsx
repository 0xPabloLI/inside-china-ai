import { useEffect, useRef, useState, useCallback } from "react";
import { KEYWORDS, type Keyword } from "../data/keywords";
import type { Lang } from "../i18n";

interface PlacedWord extends Keyword {
  fontSize: number;
  x: number;
  y: number;
  t: number;
}

function getColor(t: number): string {
  if (t > 0.75) return `rgb(${Math.round(200 + t * 40)},${Math.round(80 + (1 - t) * 40)},${Math.round(50 + (1 - t) * 30)})`;
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

function layoutWords(
  keywords: Keyword[],
  container: HTMLElement,
  lang: Lang,
): PlacedWord[] {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === 0 || h === 0) return [];

  const cx = w / 2;
  const cy = h / 2;
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const results: PlacedWord[] = [];
  const maxFreq = keywords[0].freq;
  const minFreq = keywords[keywords.length - 1].freq;

  keywords.forEach((item) => {
    const word = lang === "zh" ? item.zh : item.en;
    const t = (item.freq - minFreq) / Math.max(1, maxFreq - minFreq);
    const fontSize = Math.round(18 + Math.pow(t, 0.6) * 62);

    // Measure word width
    const tester = document.createElement("span");
    tester.style.cssText = `position:absolute;visibility:hidden;font-weight:700;font-size:${fontSize}px;font-family:Inter,'PingFang SC',sans-serif;white-space:nowrap;`;
    tester.textContent = word;
    container.appendChild(tester);
    const tw = tester.offsetWidth;
    const th = tester.offsetHeight;
    container.removeChild(tester);

    let placedOk = false;
    let angle = Math.random() * Math.PI * 2;
    const step = 0.3;
    let radius = 0;
    let bestX = cx;
    let bestY = cy;

    for (let iter = 0; iter < 2000; iter++) {
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (x - tw / 2 < 10 || x + tw / 2 > w - 10 || y - th / 2 < 10 || y + th / 2 > h - 10) {
        angle += step;
        radius += 1.5;
        continue;
      }
      let collision = false;
      for (const p of placed) {
        if (Math.abs(x - p.x) < (tw + p.w) / 2 + 8 && Math.abs(y - p.y) < (th + p.h) / 2 + 6) {
          collision = true;
          break;
        }
      }
      if (!collision) {
        bestX = x;
        bestY = y;
        placedOk = true;
        break;
      }
      angle += step;
      radius += 1.5;
    }

    if (placedOk) {
      placed.push({ x: bestX, y: bestY, w: tw, h: th });
      results.push({ ...item, fontSize, x: bestX, y: bestY, t });
    }
  });

  return results;
}

export function CloudView({ lang }: { lang: Lang }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [words, setWords] = useState<PlacedWord[]>([]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const render = useCallback(() => {
    if (!containerRef.current) return;
    const items = layoutWords(KEYWORDS, containerRef.current, lang);
    items.sort(
      (a, b) =>
        Math.hypot(a.x - containerRef.current!.clientWidth / 2, a.y - containerRef.current!.clientHeight / 2) -
        Math.hypot(b.x - containerRef.current!.clientWidth / 2, b.y - containerRef.current!.clientHeight / 2),
    );
    setWords(items);
  }, [lang]);

  useEffect(() => {
    // Wait for fonts and container to be ready
    const timer = setTimeout(render, 100);
    return () => clearTimeout(timer);
  }, [render]);

  useEffect(() => {
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 300);
    };
    let resizeTimer: ReturnType<typeof setTimeout>;
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimer);
    };
  }, [render]);

  const maxFreq = KEYWORDS[0].freq;

  return (
    <div>
      <div
        ref={containerRef}
        className="relative h-[400px] w-full overflow-hidden"
      >
        {words.map((item, i) => {
          const displayWord = lang === "zh" ? item.zh : item.en;
          const otherWord = lang === "zh" ? item.en : item.zh;
          const color = getColor(item.t);
          const isHovered = hoveredIdx === i;
          return (
            <div
              key={`${item.zh}-${item.en}`}
              className="absolute cursor-pointer font-bold transition-all duration-200 select-none"
              style={{
                left: `${item.x}px`,
                top: `${item.y}px`,
                fontSize: `${item.fontSize}px`,
                color,
                transform: `translate(-50%, -50%) ${isHovered ? "scale(1.35)" : "scale(1)"}`,
                opacity: hoveredIdx === null || isHovered ? 1 : 0.2,
                zIndex: isHovered ? 5 : 1,
                textShadow: isHovered ? `0 0 30px ${color}, 0 0 60px ${color}` : "none",
              }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {displayWord}
              {isHovered && (
                <div
                  className="fixed bottom-6 left-6 z-10 min-w-[200px] rounded-2xl border border-border/60 bg-card/95 p-5 shadow-lg backdrop-blur"
                  style={{ pointerEvents: "none" }}
                >
                  <div className="text-2xl font-bold" style={{ color }}>
                    {displayWord}
                  </div>
                  <div className="mb-3.5 text-sm text-muted-foreground">{otherWord}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold" style={{ color: "#94640e" }}>
                      {item.freq}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {lang === "zh" ? "次提及" : "mentions"}
                    </span>
                  </div>
                  <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${(item.freq / maxFreq) * 100}%`,
                        background: color,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-center text-[11px] tracking-wide text-muted-foreground/60">
        {lang === "zh" ? "悬停查看词频 · 源自 42 页投资者交流实录" : "Hover for frequency · From 42-page investor meeting transcript"}
      </div>
    </div>
  );
}
