import { useState } from "react";
import {
  STOCK_POINTS,
  SUMMARY_CARDS,
  type StockPoint,
} from "./data/minimax-stock";

const W = 520;
const H = 220;
const PAD_L = 45;
const PAD_R = 20;
const PAD_T = 15;
const PAD_B = 35;
const CHART_W = W - PAD_L - PAD_R;
const CHART_H = H - PAD_T - PAD_B;

const PRICED = STOCK_POINTS.filter((p): p is StockPoint & { price: number } => p.price !== null);
const MAX_P = Math.max(...PRICED.map((p) => p.price)) * 1.1;
const MIN_P = 0;

function priceToY(price: number): number {
  return PAD_T + CHART_H - (price / MAX_P) * CHART_H;
}

function idxToX(idx: number, total: number): number {
  if (total <= 1) return PAD_L + CHART_W / 2;
  return PAD_L + (idx / (total - 1)) * CHART_W;
}

// Build SVG path for the line
const linePath = PRICED.map((p, i) => {
  const x = idxToX(i, PRICED.length);
  const y = priceToY(p.price);
  return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
}).join(" ");

// Build area fill path
const areaPath =
  linePath +
  ` L${idxToX(PRICED.length - 1, PRICED.length).toFixed(1)},${(PAD_T + CHART_H).toFixed(1)} L${idxToX(0, PRICED.length).toFixed(1)},${(PAD_T + CHART_H).toFixed(1)} Z`;

export function MinimaxStockView() {
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered !== null ? PRICED[hovered] : null;

  // Y-axis ticks
  const ticks = [0, 300, 600, 900, 1200, 1500].filter((t) => t <= MAX_P);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="flex flex-wrap gap-2.5">
        {SUMMARY_CARDS.map((c, i) => (
          <div
            key={i}
            className="flex-1 min-w-[100px] rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-center"
          >
            <div className={`text-base font-bold ${c.color}`}>{c.val}</div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
              {c.label}
            </div>
          </div>
        ))}
      </div>

      {/* SVG line chart */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[400px]"
          style={{ maxHeight: 260 }}
        >
          <defs>
            <linearGradient id="stockArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="stockLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD_L}
                y1={priceToY(t)}
                x2={W - PAD_R}
                y2={priceToY(t)}
                stroke="currentColor"
                strokeOpacity="0.08"
                strokeWidth="1"
              />
              <text
                x={PAD_L - 6}
                y={priceToY(t) + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize="8"
              >
                ${t}
              </text>
            </g>
          ))}

          {/* Area fill */}
          <path d={areaPath} fill="url(#stockArea)" />

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke="url(#stockLine)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Data points */}
          {PRICED.map((p, i) => {
            const x = idxToX(i, PRICED.length);
            const y = priceToY(p.price);
            const isHovered = hovered === i;
            const isHighlight = p.highlight;
            return (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 6 : isHighlight ? 5 : 4}
                  fill={isHighlight ? "#ef4444" : "#f59e0b"}
                  stroke="white"
                  strokeWidth="1.5"
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                />
                {/* Price label for highlight points */}
                {(isHighlight || isHovered) && (
                  <text
                    x={x}
                    y={y - 10}
                    textAnchor="middle"
                    className="fill-foreground font-bold"
                    fontSize="9"
                  >
                    ${p.price}
                  </text>
                )}
                {/* X-axis label */}
                <text
                  x={x}
                  y={H - PAD_B + 14}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize="8"
                >
                  {p.shortDate}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover detail */}
      {active && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold text-foreground">
              HK${active.price}
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground">
              {active.date}
            </span>
          </div>
          <div className="mt-1 text-sm font-bold text-foreground">
            {active.event}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {active.detail}
          </p>
          <a
            href={active.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-block text-[10px] text-primary hover:underline"
          >
            {active.source} ↗
          </a>
        </div>
      )}

      {/* Ticker label */}
      <div className="text-center text-[10px] text-muted-foreground/60">
        HKEX: 0100.HK · MiniMax Group Inc · Source: Google Finance & HKEX
        filings
      </div>
    </div>
  );
}
