import { KEYWORDS } from "./data/keywords";
import { useHoverPin } from "../shared/use-hover-pin";

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

export function VisionKeywordsView() {
  // Hover/focus reveal + click-to-pin (keyboard equivalent): focusing a
  // keyword shows the frequency bar, blur hides it, click pins it.
  const pin = useHoverPin<number>();

  const maxFreq = KEYWORDS[0].freq;
  const minFreq = KEYWORDS[KEYWORDS.length - 1].freq;

  const items = KEYWORDS.map((kw, i) => {
    const t = (kw.freq - minFreq) / Math.max(1, maxFreq - minFreq);
    const fontSize = Math.round(14 + Math.pow(t, 0.6) * 42);
    return { ...kw, fontSize, t, idx: i };
  });

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">Key Themes from the Meeting</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-brand" />
            <span>High</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-chart-3" />
            <span>Medium</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-chart-2" />
            <span>Low</span>
          </span>
        </div>
      </div>

      {/* Tag cloud */}
      <div
        className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-3 py-6"
        style={{ lineHeight: 1.9 }}
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
                opacity: !pin.anyActive ? 1 : isActive ? 1 : 0.25,
                transform: isActive ? "scale(1.15)" : "scale(1)",
                textShadow: isActive ? `0 0 24px ${color}88` : "none",
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
                  · {item.freq}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Frequency bar for active word */}
      {pin.current !== null ? (
        <div className="mt-4 flex items-center gap-3 rounded-md bg-muted/30 px-4 py-2">
          <span
            className="text-sm font-semibold"
            style={{
              color: getColor(items.find((i) => i.idx === pin.current)!.t),
            }}
          >
            {items.find((i) => i.idx === pin.current)!.en}
          </span>
          <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${((items.find((i) => i.idx === pin.current)!.freq - minFreq) / (maxFreq - minFreq)) * 100}%`,
                backgroundColor: getColor(items.find((i) => i.idx === pin.current)!.t),
              }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {items.find((i) => i.idx === pin.current)!.freq} mentions
          </span>
        </div>
      ) : null}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Based on analysis of a 3h 44m investor meeting transcript
      </p>
    </>
  );
}
