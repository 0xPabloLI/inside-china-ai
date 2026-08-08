import { KEYWORDS } from "./data/keywords";
import { useHoverPin } from "../shared/use-hover-pin";

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

export function CloudView() {
  // Hover/focus reveal + click-to-pin (keyboard equivalent for the hover
  // word detail: focus shows it, blur hides it, click pins it).
  const pin = useHoverPin<number>();

  const maxFreq = KEYWORDS[0].freq;
  const minFreq = KEYWORDS[KEYWORDS.length - 1].freq;

  const items = KEYWORDS.map((kw, i) => {
    const t = (kw.freq - minFreq) / Math.max(1, maxFreq - minFreq);
    const fontSize = Math.round(14 + Math.pow(t, 0.6) * 40);
    return { ...kw, fontSize, t, idx: i };
  });

  const active = pin.current !== null ? items[pin.current] : null;

  return (
    <div>
      {/* Tag cloud */}
      <div
        className="flex flex-wrap items-baseline justify-center gap-x-6 gap-y-3 py-6"
        style={{ lineHeight: 1.8 }}
      >
        {items.map((item) => {
          const color = getColor(item.t);
          const isActive = pin.isActive(item.idx);

          return (
            <span
              key={item.en}
              role="button"
              tabIndex={0}
              aria-expanded={isActive}
              className="cursor-pointer rounded font-bold transition-all duration-200 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              style={{
                fontSize: `${item.fontSize}px`,
                color,
                opacity: !pin.anyActive ? 1 : isActive ? 1 : 0.3,
                transform: isActive ? "scale(1.2)" : "scale(1)",
                textShadow: isActive ? `0 0 20px ${color}66` : "none",
              }}
              onMouseEnter={() => pin.onEnter(item.idx)}
              onMouseLeave={pin.onLeave}
              onFocus={() => pin.onFocus(item.idx)}
              onBlur={pin.onBlur}
              onClick={() => pin.onToggle(item.idx)}
            >
              {item.en}
              {isActive && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  · {item.freq}x
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Frequency bar for active word */}
      {active && (
        <div className="mt-2 flex items-center gap-2 px-4">
          <span className="text-xs font-semibold" style={{ color: getColor(active.t) }}>
            {active.en}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(active.freq / maxFreq) * 100}%`,
                background: getColor(active.t),
              }}
            />
          </div>
          <span className="text-xs font-bold text-muted-foreground">{active.freq}</span>
        </div>
      )}

      <div className="mt-3 text-center text-xs tracking-wide text-muted-foreground/60">
        Hover or focus for frequency · From 42-page investor meeting transcript
      </div>
    </div>
  );
}
