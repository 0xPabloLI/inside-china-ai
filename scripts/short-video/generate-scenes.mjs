/**
 * Generates HTML for each scene as a 1080×1920 vertical video frame.
 * 12 scenes based on full article content. ~2.5 minutes total.
 * CSS animations timed to match TTS audio duration.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load whisper subtitle timing if available (word-level timestamps from audio)
const TIMING_PATH = join(__dirname, "output", "audio", "subtitle-timing.json");
let WHISPER_TIMING = null;
try {
  if (existsSync(TIMING_PATH)) {
    WHISPER_TIMING = JSON.parse(readFileSync(TIMING_PATH, "utf8"));
  }
} catch {}

const LOGO_SVG = readFileSync(new URL("assets/deepseek-logo.svg", import.meta.url), "utf8")
  .replace(/<\?xml[^>]*\?>\s*/, "")
  .replace(/<!--[\s\S]*?-->/g, "");

// Use vtracer-generated vector SVG, post-processed to remove noise paths.
// 867 clean vector paths (originally 1415, removed 267 anti-aliasing artifacts).
// Generated via: vtracer --input logo.png --output logo.svg --filter_speckle 8
// Then post-processed to remove gray noise paths.
const BRAND_MARK_SVG = readFileSync(
  new URL("assets/china-ai-news-logo-vector.svg", import.meta.url),
  "utf8",
)
  .replace(/<\?xml[^>]*\?>\s*/, "")
  .replace(/<!--[\s\S]*?-->/g, "");

function baseStyles(duration) {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1080px; height: 1920px; overflow: hidden;
      font-family: 'Helvetica Neue', 'Arial Black', Arial, sans-serif;
      background: #050508;
    }
    :root {
      --d: ${duration}s;
      --blue: #4d8bff; --purple: #6d4eff; --red: #ef4444;
      --amber: #f59e0b; --green: #34d399; --cyan: #22d3ee;
      --white: #f5f5f5; --sec: #94a3b8; --muted: #475569;
    }
    .scene { width: 1080px; height: 1920px; position: relative; overflow: hidden; }
    .grid-bg {
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(77,139,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(77,139,255,0.03) 1px, transparent 1px);
      background-size: 60px 60px;
    }
    .glow-red {
      position: absolute; top: -200px; right: -200px; width: 800px; height: 800px;
      background: radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 60%); border-radius: 50%;
    }
    .glow-blue {
      position: absolute; bottom: -250px; left: -200px; width: 900px; height: 900px;
      background: radial-gradient(circle, rgba(77,139,255,0.08) 0%, transparent 60%); border-radius: 50%;
    }
    .scanlines {
      position: absolute; inset: 0;
      background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.008) 3px, rgba(255,255,255,0.008) 4px);
      pointer-events: none;
    }
    .logo { width: 80px; height: 80px; }
    .logo svg { width: 100%; height: 100%; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideLeft { from { opacity: 0; transform: translateX(-50px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes scaleIn { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
    @keyframes stampIn { from { opacity: 0; transform: scale(2); } to { opacity: 1; transform: scale(1); } }
    .brand-watermark { position: absolute; bottom: 50px; right: 50px; width: 55px; height: 55px; opacity: 0.18; z-index: 100; pointer-events: none; }
    .brand-watermark svg { width: 100%; height: 100%; }
.subtitle-bar {
position: absolute; bottom: 200px; left: 50%; transform: translateX(-50%);
max-width: 950px; text-align: center;
font-size: 42px; font-weight: 800; color: var(--white); line-height: 1.3;
z-index: 200; pointer-events: none; opacity: 0;
/* TikTok-style: no background box, just heavy text outline */
background: transparent; padding: 0;
text-shadow: 0 0 3px #000, 0 0 3px #000, 0 0 3px #000, 0 0 3px #000, 0 0 3px #000, 0 0 3px #000, 0 3px 6px rgba(0,0,0,0.9);
-webkit-text-stroke: 2px rgba(0,0,0,0.7);
}
.subtitle-bar .sub-word { color: rgba(255,255,255,0.25); display: inline; transition: color 0.1s; }
.subtitle-bar .sub-word.active { color: var(--white); }
`;
}

/* ── S1: Hook (v4 — Clean & bold, one core message, mobile-first) ── */
function s1(duration) {
  const d = Math.max(duration, 5).toFixed(1);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s1 { display: flex; flex-direction: column; align-items: center; }

/* Scan line sweep */
.s1 .scan-sweep {
  position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, transparent, rgba(77,139,255,0.8), transparent);
  box-shadow: 0 0 20px rgba(77,139,255,0.5);
  animation: scanSweep ${d}s linear infinite; z-index: 50;
}
@keyframes scanSweep { 0% { top: 0; opacity: 0; } 5% { opacity: 1; } 95% { opacity: 1; } 100% { top: 100%; opacity: 0; } }

/* Top brand bar */
.s1 .brand-bar {
  position: absolute; top: 80px; left: 60px; right: 60px;
  display: flex; align-items: center; gap: 16px;
  animation: slideDown 0.5s ease-out 0.1s forwards; opacity: 0;
}
@keyframes slideDown { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); } }
.s1 .brand-bar .b-logo { width: 56px; height: 56px; }
.s1 .brand-bar .b-logo svg { width: 100%; height: 100%; }
.s1 .brand-bar .b-text { font-size: 28px; font-weight: 900; color: var(--white); letter-spacing: 3px; }
.s1 .brand-bar .b-text .hl { color: var(--blue); }
.s1 .brand-bar .briefing-tag {
  margin-left: auto; font-size: 18px; font-weight: 700; color: var(--sec);
  letter-spacing: 2px; padding: 6px 14px; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px;
}

/* Breaking badge */
.s1 .breaking-badge {
  position: absolute; top: 210px; left: 50%; transform: translateX(-50%);
  background: var(--red); color: white; padding: 14px 40px;
  font-size: 28px; font-weight: 900; letter-spacing: 4px; border-radius: 8px;
  box-shadow: 0 0 40px rgba(239,68,68,0.6);
  display: flex; align-items: center; gap: 10px;
  animation: stampIn 0.4s ease-out 0.3s forwards; opacity: 0;
}
.s1 .breaking-badge .pulse-dot {
  width: 12px; height: 12px; border-radius: 50%; background: white;
  animation: pulseDot 1s ease-in-out infinite;
}
@keyframes pulseDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(0.7); } }

/* Subject row */
.s1 .subject-row {
  position: absolute; top: 340px; left: 0; right: 0;
  display: flex; align-items: center; justify-content: center; gap: 20px;
  animation: slideUp 0.4s ease-out 0.5s forwards; opacity: 0;
}
.s1 .subject-row .ds-logo { width: 64px; height: 64px; }
.s1 .subject-row .ds-logo svg { width: 100%; height: 100%; }
.s1 .subject-row .subject-text { font-size: 56px; font-weight: 800; color: var(--sec); letter-spacing: 4px; }

/* Headline — giant number, the ONE core message */
.s1 .headline { position: absolute; top: 480px; left: 0; right: 0; text-align: center; }
.s1 .big-number {
  font-size: 260px; font-weight: 900; color: var(--amber); letter-spacing: -10px; line-height: 0.9;
  text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3);
  animation: scaleIn 0.6s cubic-bezier(0.16,1,0.3,1) 0.8s forwards, numberPulse 2s ease-in-out 1.5s infinite;
  opacity: 0;
}
@keyframes numberPulse {
  0%, 100% { text-shadow: 0 0 60px rgba(245,158,11,0.5), 0 0 120px rgba(245,158,11,0.3); }
  50% { text-shadow: 0 0 80px rgba(245,158,11,0.7), 0 0 160px rgba(245,158,11,0.4); }
}
.s1 .subtitle {
  font-size: 52px; font-weight: 800; color: var(--white); letter-spacing: 3px; margin-top: 12px;
  animation: slideUp 0.5s ease-out 1.1s forwards; opacity: 0;
}
.s1 .subtitle .hl { color: var(--red); }

/* Key stats grid — 2 cards only, bigger */
.s1 .stats-grid {
  position: absolute; top: 950px; left: 80px; right: 80px;
  display: flex; gap: 20px; justify-content: center;
}
.s1 .stat-card {
  flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px; padding: 32px 20px; text-align: center;
  animation: slideUp 0.5s ease-out forwards; opacity: 0;
}
.s1 .stat-card:nth-child(1) { animation-delay: 1.3s; border-top: 4px solid var(--amber); }
.s1 .stat-card:nth-child(2) { animation-delay: 1.5s; border-top: 4px solid var(--blue); }
.s1 .stat-card .stat-num { font-size: 64px; font-weight: 900; line-height: 1; }
.s1 .stat-card .stat-num .unit { font-size: 32px; font-weight: 700; }
.s1 .stat-card:nth-child(1) .stat-num { color: var(--amber); }
.s1 .stat-card:nth-child(2) .stat-num { color: var(--blue); }
.s1 .stat-card .stat-label { font-size: 22px; font-weight: 700; color: var(--sec); letter-spacing: 1px; margin-top: 10px; }

/* Source badge — bottom */
.s1 .source-badge {
  position: absolute; bottom: 120px; left: 0; right: 0; text-align: center;
  font-size: 24px; font-weight: 700; color: var(--muted); letter-spacing: 3px;
  animation: fadeIn 0.5s ease-out 2.0s forwards; opacity: 0;
}

/* Glitch flash */
.s1 .glitch { position: absolute; inset: 0; pointer-events: none; animation: glitchFlash 0.4s ease-out 0.8s; opacity: 0; }
@keyframes glitchFlash { 0% { opacity: 0; } 10% { opacity: 1; background: rgba(239,68,68,0.1); transform: translateX(-3px); } 20% { opacity: 0; transform: translateX(3px); } 30% { opacity: 1; background: rgba(77,139,255,0.08); } 40% { opacity: 0; } 100% { opacity: 0; } }
</style></head><body>
<div class="scene s1">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="scan-sweep"></div>
  <div class="brand-bar">
    <div class="b-logo">${BRAND_MARK_SVG}</div>
    <div class="b-text">CHINA <span class="hl">AI</span> NEWS</div>
    <div class="briefing-tag">INTELLIGENCE BRIEFING</div>
  </div>
  <div class="breaking-badge"><span class="pulse-dot"></span> BREAKING</div>
  <div class="subject-row">
    <div class="ds-logo">${LOGO_SVG}</div>
    <div class="subject-text">DEEPSEEK</div>
  </div>
  <div class="headline">
    <div class="big-number">$1.4B</div>
    <div class="subtitle">FUNDING ROUND <span class="hl">PAUSED</span></div>
  </div>
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-num">4<span class="unit">HR</span></div><div class="stat-label">LEAKED MEETING</div></div>
    <div class="stat-card"><div class="stat-num">JULY 25</div><div class="stat-label">BLOOMBERG CONFIRMED</div></div>
  </div>
  <div class="source-badge">VIA BLOOMBERG</div>
  <div class="glitch"></div>
</div></body></html>`;
}

/* ── S2: Timeline ─────────────────────────────────────── */
function s2(duration) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s2 { display: flex; flex-direction: column; justify-content: center; padding: 120px 80px; }
.s2 .title { font-size: 42px; font-weight: 800; color: var(--sec); letter-spacing: 3px; margin-bottom: 60px; animation: fadeIn 0.3s ease-out 0.1s forwards; opacity: 0; }
.s2 .timeline { position: relative; padding-left: 60px; }
.s2 .timeline::before { content: ''; position: absolute; left: 20px; top: 30px; bottom: 30px; width: 3px; background: linear-gradient(180deg, var(--blue), var(--purple), var(--red)); }
.s2 .event { margin-bottom: 50px; position: relative; animation: slideLeft 0.5s cubic-bezier(0.16,1,0.3,1) forwards; opacity: 0; }
.s2 .event:nth-child(1) { animation-delay: 0.3s; }
.s2 .event:nth-child(2) { animation-delay: 1.0s; }
.s2 .event:nth-child(3) { animation-delay: 2.0s; }
.s2 .event:nth-child(4) { animation-delay: 3.2s; }
.s2 .event::before { content: ''; position: absolute; left: -48px; top: 8px; width: 18px; height: 18px; border-radius: 50%; border: 3px solid var(--blue); background: #050508; }
.s2 .event:nth-child(2)::before { border-color: var(--purple); }
.s2 .event:nth-child(3)::before { border-color: var(--amber); }
.s2 .event:nth-child(4)::before { border-color: var(--red); background: var(--red); }
.s2 .event .date { font-size: 28px; font-weight: 800; color: var(--blue); letter-spacing: 2px; }
.s2 .event:nth-child(2) .date { color: var(--purple); }
.s2 .event:nth-child(3) .date { color: var(--amber); }
.s2 .event:nth-child(4) .date { color: var(--red); }
.s2 .event .text { font-size: 40px; font-weight: 700; color: var(--white); margin-top: 6px; line-height: 1.2; }
</style></head><body>
<div class="scene s2">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">WHAT HAPPENED</div>
  <div class="timeline">
    <div class="event"><div class="date">MAY</div><div class="text">Closed-door investor meeting</div></div>
    <div class="event"><div class="date">JULY 22</div><div class="text">Full transcript leaks on WeChat</div></div>
    <div class="event"><div class="date">HOURS LATER</div><div class="text">Articles removed — screenshots spread</div></div>
    <div class="event"><div class="date">JULY 25</div><div class="text">Bloomberg: funding round paused</div></div>
  </div>
</div></body></html>`;
}

/* ── S3: Contrast (Not for profit) ────────────────────── */
function s3(duration) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s3 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s3 .title { font-size: 48px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 50px; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s3 .cols { display: flex; gap: 40px; margin-bottom: 60px; }
.s3 .col { flex: 1; }
.s3 .col-title { font-size: 28px; font-weight: 700; letter-spacing: 3px; margin-bottom: 24px; animation: fadeIn 0.3s ease-out 0.3s forwards; opacity: 0; }
.s3 .col.left .col-title { color: var(--red); }
.s3 .col.right .col-title { color: var(--green); }
.s3 .item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 24px 28px; margin-bottom: 16px; border-radius: 10px; font-size: 36px; font-weight: 800; color: var(--white); animation: slideLeft 0.4s ease-out forwards; opacity: 0; }
.s3 .col.left .item { border-left: 4px solid var(--red); text-decoration: line-through; text-decoration-color: rgba(239,68,68,0.4); }
.s3 .col.right .item { border-left: 4px solid var(--green); }
.s3 .col.left .item:nth-child(2) { animation-delay: 0.5s; }
.s3 .col.left .item:nth-child(3) { animation-delay: 0.7s; }
.s3 .col.left .item:nth-child(4) { animation-delay: 0.9s; }
.s3 .col.left .item:nth-child(5) { animation-delay: 1.1s; }
.s3 .col.right .item:nth-child(2) { animation-delay: 1.4s; }
.s3 .col.right .item:nth-child(3) { animation-delay: 1.6s; }
.s3 .col.right .item:nth-child(4) { animation-delay: 1.8s; }
.s3 .col.right .item:nth-child(5) { animation-delay: 2.0s; }
.s3 .quote { background: rgba(77,139,255,0.06); border-left: 5px solid var(--blue); border-radius: 0 12px 12px 0; padding: 30px 36px; font-size: 36px; font-style: italic; color: var(--sec); line-height: 1.4; animation: slideUp 0.5s ease-out 2.5s forwards; opacity: 0; }
.s3 .quote .keyword { color: var(--blue); font-style: normal; font-weight: 700; }
</style></head><body>
<div class="scene s3">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">NOT BUILT FOR PROFIT</div>
  <div class="cols">
    <div class="col left"><div class="col-title">✕ WHAT THEY DON'T DO</div><div class="item">IPO</div><div class="item">Exit strategy</div><div class="item">KPIs</div><div class="item">Hierarchy</div></div>
    <div class="col right"><div class="col-title">✓ WHAT THEY DO</div><div class="item">Consensus</div><div class="item">Strategic restraint</div><div class="item">Vision-first</div><div class="item">AGI above all</div></div>
  </div>
  <div class="quote">"Vision isn't a slogan on the wall. Vision is <span class="keyword">how you actually operate</span>."</div>
</div></body></html>`;
}

/* ── S4: Price comparison ─────────────────────────────── */
function s4(duration) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s4 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s4 .title { font-size: 44px; font-weight: 800; color: var(--white); letter-spacing: 2px; margin-bottom: 50px; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s4 .bars { display: flex; flex-direction: column; gap: 30px; margin-bottom: 50px; }
.s4 .bar-row { display: flex; align-items: center; gap: 24px; animation: slideLeft 0.5s ease-out forwards; opacity: 0; }
.s4 .bar-row:nth-child(1) { animation-delay: 0.3s; }
.s4 .bar-row:nth-child(2) { animation-delay: 0.8s; }
.s4 .bar-row:nth-child(3) { animation-delay: 1.3s; }
.s4 .bar-label { width: 240px; font-size: 36px; font-weight: 800; text-align: right; }
.s4 .bar-track { flex: 1; height: 70px; background: rgba(255,255,255,0.04); border-radius: 8px; overflow: hidden; position: relative; }
.s4 .bar-fill { height: 100%; border-radius: 8px; display: flex; align-items: center; padding: 0 20px; font-size: 32px; font-weight: 900; color: white; animation: barGrow 0.8s cubic-bezier(0.16,1,0.3,1) forwards; width: 0; }
.s4 .bar-row:nth-child(1) .bar-fill { animation-delay: 0.5s; background: linear-gradient(90deg, #ef4444, #dc2626); --target: 100%; }
.s4 .bar-row:nth-child(2) .bar-fill { animation-delay: 1.0s; background: linear-gradient(90deg, #f59e0b, #d97706); --target: 33%; }
.s4 .bar-row:nth-child(3) .bar-fill { animation-delay: 1.5s; background: linear-gradient(90deg, #4d8bff, #6d4eff); --target: 5%; }
@keyframes barGrow { from { width: 0; } to { width: var(--target); } }
.s4 .bar-row:nth-child(1) .bar-label { color: var(--red); }
.s4 .bar-row:nth-child(2) .bar-label { color: var(--amber); }
.s4 .bar-row:nth-child(3) .bar-label { color: var(--blue); }
.s4 .ratio-box { display: flex; gap: 40px; justify-content: center; animation: scaleIn 0.5s ease-out 2.2s forwards; opacity: 0; }
.s4 .stat { text-align: center; }
.s4 .stat .num { font-size: 72px; font-weight: 900; line-height: 1; }
.s4 .stat .lbl { font-size: 24px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 6px; }
.s4 .stat:nth-child(1) .num { color: var(--blue); }
.s4 .stat:nth-child(2) .num { color: var(--green); }
.s4 .stat:nth-child(3) .num { color: var(--purple); }
.s4 .note { margin-top: 30px; text-align: center; font-size: 30px; font-style: italic; color: var(--sec); animation: fadeIn 0.5s ease-out 2.8s forwards; opacity: 0; }
.s4 .note .hl { color: var(--red); font-weight: 700; font-style: normal; }
</style></head><body>
<div class="scene s4">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">API PRICING: 1/20 OF CLAUDE</div>
  <div class="bars">
    <div class="bar-row"><div class="bar-label">Claude</div><div class="bar-track"><div class="bar-fill">$3.00</div></div></div>
    <div class="bar-row"><div class="bar-label">GPT-5.6</div><div class="bar-track"><div class="bar-fill">$1.00</div></div></div>
    <div class="bar-row"><div class="bar-label">DeepSeek</div><div class="bar-track"><div class="bar-fill">$0.14</div></div></div>
  </div>
  <div class="ratio-box">
    <div class="stat"><div class="num">10 MO</div><div class="lbl">HARDWARE RECOVERY</div></div>
    <div class="stat"><div class="num">6x</div><div class="lbl">MARGIN</div></div>
    <div class="stat"><div class="num">1/20</div><div class="lbl">VS CLAUDE</div></div>
  </div>
  <div class="note">Could double the price. <span class="hl">Chose not to.</span></div>
</div></body></html>`;
}

/* ── S5: Open source ──────────────────────────────────── */
function s5(duration) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s5 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s5 .title { font-size: 52px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 40px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s5 .title .hl { color: var(--green); }
.s5 .vs { display: flex; gap: 30px; margin-bottom: 50px; }
.s5 .card { flex: 1; border-radius: 16px; padding: 40px 32px; text-align: center; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s5 .card.deepseek { background: rgba(77,139,255,0.08); border: 2px solid rgba(77,139,255,0.3); animation-delay: 0.4s; }
.s5 .card.competitors { background: rgba(239,68,68,0.06); border: 2px solid rgba(239,68,68,0.2); animation-delay: 0.9s; }
.s5 .card .icon { font-size: 60px; margin-bottom: 16px; }
.s5 .card .name { font-size: 32px; font-weight: 800; letter-spacing: 1px; margin-bottom: 16px; }
.s5 .card.deepseek .name { color: var(--blue); }
.s5 .card.competitors .name { color: var(--red); }
.s5 .card .desc { font-size: 26px; color: var(--sec); line-height: 1.4; }
.s5 .points { margin-bottom: 40px; }
.s5 .point { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; font-size: 34px; font-weight: 700; color: var(--white); animation: slideLeft 0.4s ease-out forwards; opacity: 0; }
.s5 .point:nth-child(1) { animation-delay: 1.4s; }
.s5 .point:nth-child(2) { animation-delay: 1.7s; }
.s5 .point:nth-child(3) { animation-delay: 2.0s; }
.s5 .point .check { color: var(--green); font-size: 36px; }
.s5 .quote { background: rgba(245,158,11,0.06); border-left: 5px solid var(--amber); border-radius: 0 12px 12px 0; padding: 28px 32px; font-size: 32px; font-style: italic; color: var(--sec); line-height: 1.4; animation: slideUp 0.5s ease-out 2.5s forwards; opacity: 0; }
.s5 .quote .hl { color: var(--amber); font-style: normal; font-weight: 700; }
</style></head><body>
<div class="scene s5">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">OPEN SOURCE = <span class="hl">STRONGEST MODEL</span></div>
  <div class="vs">
    <div class="card deepseek"><div class="icon">🔓</div><div class="name">DeepSeek</div><div class="desc">Production weights.<br>No watered-down version.</div></div>
    <div class="card competitors"><div class="icon">🔒</div><div class="name">Competitors</div><div class="desc">"Forced" open source.<br>Inferior public versions.</div></div>
  </div>
  <div class="points">
    <div class="point"><span class="check">✓</span> Same weights as production</div>
    <div class="point"><span class="check">✓</span> Actively helps rivals deploy</div>
    <div class="point"><span class="check">✓</span> Cost barrier is structural</div>
  </div>
  <div class="quote">"Like <span class="hl">BYD batteries</span> — same tech, but can you match that price?"</div>
</div></body></html>`;
}

/* ── S6: Deployment Cost / CUDA Erosion (NEW) ─────────── */
function s6(duration) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s6 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s6 .title { font-size: 52px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 50px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s6 .title .hl { color: var(--cyan); }
.s6 .tilelang-box {
  background: rgba(34,211,238,0.06); border: 2px solid rgba(34,211,238,0.25); border-radius: 16px;
  padding: 40px; text-align: center; margin-bottom: 50px;
  animation: scaleIn 0.5s ease-out 0.3s forwards; opacity: 0;
}
.s6 .tilelang-box .name { font-size: 56px; font-weight: 900; color: var(--cyan); letter-spacing: 1px; }
.s6 .tilelang-box .desc { font-size: 30px; color: var(--sec); margin-top: 8px; }
.s6 .factors { display: flex; flex-direction: column; gap: 24px; margin-bottom: 50px; }
.s6 .factor {
  display: flex; align-items: flex-start; gap: 24px; padding: 30px 36px; border-radius: 12px;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
  animation: slideLeft 0.5s ease-out forwards; opacity: 0;
}
.s6 .factor:nth-child(1) { animation-delay: 0.8s; border-left: 5px solid var(--cyan); }
.s6 .factor:nth-child(2) { animation-delay: 1.3s; border-left: 5px solid var(--blue); }
.s6 .factor:nth-child(3) { animation-delay: 1.8s; border-left: 5px solid var(--purple); }
.s6 .factor .num { font-size: 64px; font-weight: 900; line-height: 0.9; width: 70px; flex-shrink: 0; }
.s6 .factor:nth-child(1) .num { color: var(--cyan); }
.s6 .factor:nth-child(2) .num { color: var(--blue); }
.s6 .factor:nth-child(3) .num { color: var(--purple); }
.s6 .factor .text { font-size: 32px; font-weight: 700; color: var(--white); line-height: 1.3; padding-top: 8px; }
.s6 .verdict {
  text-align: center; font-size: 48px; font-weight: 900; color: var(--red); letter-spacing: 2px;
  text-shadow: 0 0 30px rgba(239,68,68,0.3);
  animation: stampIn 0.5s ease-out 2.5s forwards; opacity: 0;
}
</style></head><body>
<div class="scene s6">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">THE <span class="hl">COST MOAT</span></div>
  <div class="tilelang-box"><div class="name">TileLang</div><div class="desc">DeepSeek's compiler — rewrites the full CUDA stack</div></div>
  <div class="factors">
    <div class="factor"><div class="num">1</div><div class="text">AI can now generate<br>compatible ecosystem code</div></div>
    <div class="factor"><div class="num">2</div><div class="text">TileLang replaces<br>the CUDA software layer</div></div>
    <div class="factor"><div class="num">3</div><div class="text">Dedicated AI chips don't need<br>gaming GPU compatibility</div></div>
  </div>
  <div class="verdict">NVIDIA'S MOAT IS ERODING</div>
</div></body></html>`;
}

/* ── S7: AGI Staircase ────────────────────────────────── */
function s7(duration) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s7 { display: flex; flex-direction: column; justify-content: center; padding: 80px 60px; }
.s7 .title { font-size: 44px; font-weight: 800; color: var(--white); letter-spacing: 2px; margin-bottom: 50px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s7 .title .hl { color: var(--blue); }
.s7 .stairs { display: flex; flex-direction: column-reverse; gap: 12px; }
.s7 .step { display: flex; align-items: center; gap: 20px; padding: 22px 30px; border-radius: 10px; animation: slideLeft 0.4s ease-out forwards; opacity: 0; }
.s7 .step:nth-child(1) { animation-delay: 0.3s; margin-right: 0px; }
.s7 .step:nth-child(2) { animation-delay: 0.6s; margin-right: 40px; }
.s7 .step:nth-child(3) { animation-delay: 0.9s; margin-right: 80px; }
.s7 .step:nth-child(4) { animation-delay: 1.2s; margin-right: 120px; }
.s7 .step:nth-child(5) { animation-delay: 1.5s; margin-right: 160px; }
.s7 .step:nth-child(6) { animation-delay: 1.8s; margin-right: 200px; }
.s7 .step.done { background: rgba(52,211,153,0.08); border-left: 5px solid var(--green); }
.s7 .step.current { background: rgba(77,139,255,0.1); border-left: 5px solid var(--blue); box-shadow: 0 0 30px rgba(77,139,255,0.15); }
.s7 .step.next { background: rgba(245,158,11,0.08); border-left: 5px solid var(--amber); }
.s7 .step.future { background: rgba(255,255,255,0.03); border-left: 5px solid var(--muted); }
.s7 .step .num { font-size: 40px; font-weight: 900; width: 50px; }
.s7 .step.done .num { color: var(--green); }
.s7 .step.current .num { color: var(--blue); }
.s7 .step.next .num { color: var(--amber); }
.s7 .step.future .num { color: var(--muted); }
.s7 .step .text { font-size: 32px; font-weight: 700; color: var(--white); }
.s7 .step .badge { margin-left: auto; font-size: 22px; font-weight: 800; padding: 4px 14px; border-radius: 6px; }
.s7 .step.done .badge { background: rgba(52,211,153,0.2); color: var(--green); }
.s7 .step.current .badge { background: rgba(77,139,255,0.2); color: var(--blue); }
.s7 .step.next .badge { background: rgba(245,158,11,0.2); color: var(--amber); }
.s7 .arrow { text-align: center; margin-top: 40px; font-size: 36px; font-weight: 800; color: var(--amber); animation: fadeIn 0.5s ease-out 2.2s forwards; opacity: 0; }
</style></head><body>
<div class="scene s7">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">THE <span class="hl">6-STEP</span> PATH TO AGI</div>
  <div class="stairs">
    <div class="step done"><span class="num">1</span><span class="text">Language Models</span><span class="badge">DONE</span></div>
    <div class="step done"><span class="num">2</span><span class="text">Chain of Thought</span><span class="badge">DONE</span></div>
    <div class="step current"><span class="num">3</span><span class="text">Agents</span><span class="badge">NOW</span></div>
    <div class="step next"><span class="num">4</span><span class="text">Continuous Learning</span><span class="badge">NEXT</span></div>
    <div class="step future"><span class="num">5</span><span class="text">Self-Iteration</span></div>
    <div class="step future"><span class="num">6</span><span class="text">Embodied AI</span></div>
  </div>
  <div class="arrow">↑ NEXT BOTTLENECK: CONTINUOUS LEARNING</div>
</div></body></html>`;
}

/* ── S8: Talent drain ─────────────────────────────────── */
function s8(duration) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s8 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s8 .title { font-size: 48px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 40px; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s8 .title .hl { color: var(--red); }
.s8 .quote { background: rgba(239,68,68,0.06); border-left: 5px solid var(--red); border-radius: 0 12px 12px 0; padding: 28px 32px; font-size: 36px; font-weight: 700; color: var(--white); line-height: 1.4; margin-bottom: 50px; animation: slideUp 0.5s ease-out 0.3s forwards; opacity: 0; }
.s8 .quote .hl { color: var(--red); }
.s8 .departures-title { font-size: 30px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-bottom: 24px; animation: fadeIn 0.4s ease-out 0.8s forwards; opacity: 0; }
.s8 .flow { display: flex; flex-direction: column; gap: 20px; }
.s8 .flow-row { display: flex; align-items: center; gap: 20px; padding: 24px 28px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); animation: slideLeft 0.4s ease-out forwards; opacity: 0; }
.s8 .flow-row:nth-child(1) { animation-delay: 1.0s; }
.s8 .flow-row:nth-child(2) { animation-delay: 1.3s; }
.s8 .flow-row:nth-child(3) { animation-delay: 1.6s; }
.s8 .flow-row .person { font-size: 36px; font-weight: 800; color: var(--white); width: 400px; }
.s8 .flow-row .arrow { font-size: 36px; color: var(--muted); }
.s8 .flow-row .company { font-size: 36px; font-weight: 800; }
.s8 .flow-row:nth-child(1) .company { color: var(--blue); }
.s8 .flow-row:nth-child(2) .company { color: var(--amber); }
.s8 .flow-row:nth-child(3) .company { color: var(--purple); }
.s8 .conclusion { margin-top: 40px; text-align: center; font-size: 34px; font-weight: 700; color: var(--green); animation: fadeIn 0.5s ease-out 2.2s forwards; opacity: 0; }
</style></head><body>
<div class="scene s8">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">THE ONE THING THEY <span class="hl">CAN'T LOSE</span></div>
  <div class="quote">"As long as I can maintain <span class="hl">team stability</span>, we will achieve AGI."</div>
  <div class="departures-title">CORE RESEARCHERS ALREADY GONE:</div>
  <div class="flow">
    <div class="flow-row"><span class="person">Wang Bingxuan</span><span class="arrow">→</span><span class="company">Tencent</span></div>
    <div class="flow-row"><span class="person">Guo Daya</span><span class="arrow">→</span><span class="company">ByteDance</span></div>
    <div class="flow-row"><span class="person">Luo Fuli</span><span class="arrow">→</span><span class="company">Xiaomi</span></div>
  </div>
  <div class="conclusion">If seniors stay → everyone stays</div>
</div></body></html>`;
}

/* ── S9: Compute gap ──────────────────────────────────── */
function s9(duration) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s9 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s9 .title { font-size: 48px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 60px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s9 .title .hl { color: var(--red); }
.s9 .gap-viz { display: flex; align-items: flex-end; justify-content: center; gap: 80px; margin-bottom: 50px; }
.s9 .gpu-col { text-align: center; }
.s9 .gpu-bar { width: 200px; border-radius: 12px 12px 0 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 30px; font-size: 48px; font-weight: 900; color: white; animation: growUp 0.8s cubic-bezier(0.16,1,0.3,1) forwards; height: 0; }
.s9 .gpu-bar.have { background: linear-gradient(180deg, var(--blue), rgba(77,139,255,0.3)); animation-delay: 0.4s; --target-h: 200px; }
.s9 .gpu-bar.need { background: linear-gradient(180deg, var(--red), rgba(239,68,68,0.3)); animation-delay: 0.8s; --target-h: 700px; }
@keyframes growUp { to { height: var(--target-h); } }
.s9 .gpu-num { font-size: 80px; font-weight: 900; line-height: 1; margin-bottom: 10px; animation: scaleIn 0.5s ease-out forwards; opacity: 0; }
.s9 .have-num { color: var(--blue); animation-delay: 0.3s; }
.s9 .need-num { color: var(--red); animation-delay: 0.7s; }
.s9 .gpu-label { font-size: 28px; font-weight: 700; color: var(--sec); letter-spacing: 2px; }
.s9 .vs-text { font-size: 40px; font-weight: 900; color: var(--muted); align-self: center; margin-bottom: 200px; }
.s9 .reserve-box { background: rgba(239,68,68,0.06); border: 2px solid rgba(239,68,68,0.2); border-radius: 12px; padding: 30px 40px; text-align: center; margin-bottom: 30px; animation: stampIn 0.5s ease-out 1.5s forwards; opacity: 0; }
.s9 .reserve-box .amount { font-size: 72px; font-weight: 900; color: var(--red); }
.s9 .reserve-box .label { font-size: 28px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 6px; }
.s9 .verdict { text-align: center; font-size: 40px; font-weight: 900; color: var(--white); animation: fadeIn 0.5s ease-out 2.2s forwards; opacity: 0; }
.s9 .verdict .hl { color: var(--red); }
</style></head><body>
<div class="scene s9">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">THE GAP IS <span class="hl">COMPUTE</span>, NOT TALENT</div>
  <div class="gap-viz">
    <div class="gpu-col"><div class="gpu-num have-num">20K</div><div class="gpu-bar have">GPUs</div><div class="gpu-label">CURRENT</div></div>
    <div class="vs-text">vs</div>
    <div class="gpu-col"><div class="gpu-num need-num">200K</div><div class="gpu-bar need">GPUs</div><div class="gpu-label">FRONTIER SCALE</div></div>
  </div>
  <div class="reserve-box"><div class="amount">$7.4B</div><div class="label">ALL RESERVES — STILL NOT ENOUGH</div></div>
  <div class="verdict">10x gap. <span class="hl">Money alone can't close it.</span></div>
</div></body></html>`;
}

/* ── S10: Huawei GPU Ecosystem (NEW) ──────────────────── */
function s10(duration) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s10 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s10 .title { font-size: 48px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 50px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s10 .title .hl { color: var(--red); }
.s10 .versus { display: flex; align-items: center; justify-content: center; gap: 40px; margin-bottom: 60px; }
.s10 .chip-card {
  flex: 1; border-radius: 16px; padding: 40px 32px; text-align: center;
  animation: scaleIn 0.5s ease-out forwards; opacity: 0;
}
.s10 .chip-card.huawei { background: rgba(239,68,68,0.08); border: 2px solid rgba(239,68,68,0.3); animation-delay: 0.3s; }
.s10 .chip-card.nvidia { background: rgba(52,211,153,0.06); border: 2px solid rgba(52,211,153,0.2); animation-delay: 0.7s; }
.s10 .chip-card .chip-name { font-size: 72px; font-weight: 900; line-height: 1; }
.s10 .chip-card.huawei .chip-name { color: var(--red); }
.s10 .chip-card.nvidia .chip-name { color: var(--green); }
.s10 .chip-card .chip-label { font-size: 26px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 10px; }
.s10 .chip-card .chip-match { font-size: 24px; color: var(--white); margin-top: 14px; font-weight: 600; }
.s10 .vs-circle {
  width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--muted);
  display: flex; align-items: center; justify-content: center;
  font-size: 32px; font-weight: 900; color: var(--muted);
  animation: fadeIn 0.4s ease-out 0.5s forwards; opacity: 0; flex-shrink: 0;
}
.s10 .stats-row { display: flex; gap: 40px; justify-content: center; margin-bottom: 50px; }
.s10 .stat-box {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
  padding: 30px 40px; text-align: center;
  animation: slideLeft 0.5s ease-out forwards; opacity: 0;
}
.s10 .stat-box:nth-child(1) { animation-delay: 1.2s; }
.s10 .stat-box:nth-child(2) { animation-delay: 1.6s; }
.s10 .stat-box .num { font-size: 64px; font-weight: 900; line-height: 1; }
.s10 .stat-box:nth-child(1) .num { color: var(--amber); }
.s10 .stat-box:nth-child(2) .num { color: var(--purple); }
.s10 .stat-box .lbl { font-size: 22px; font-weight: 700; color: var(--sec); letter-spacing: 2px; margin-top: 8px; }
.s10 .prediction {
  background: rgba(52,211,153,0.06); border: 2px solid rgba(52,211,153,0.2); border-radius: 12px;
  padding: 30px 40px; text-align: center;
  animation: stampIn 0.5s ease-out 2.2s forwards; opacity: 0;
}
.s10 .prediction .text { font-size: 36px; font-weight: 900; color: var(--green); letter-spacing: 1px; }
.s10 .prediction .sub { font-size: 24px; color: var(--sec); margin-top: 8px; }
</style></head><body>
<div class="scene s10">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">CHINA'S <span class="hl">CHIP ANSWER</span></div>
  <div class="versus">
    <div class="chip-card huawei"><div class="chip-name">950</div><div class="chip-label">HUAWEI SUPERNODE</div><div class="chip-match">Matches GB300<br>in all tasks</div></div>
    <div class="vs-circle">VS</div>
    <div class="chip-card nvidia"><div class="chip-name">GB300</div><div class="chip-label">NVIDIA FLAGSHIP</div><div class="chip-match">Industry benchmark</div></div>
  </div>
  <div class="stats-row">
    <div class="stat-box"><div class="num">4 : 1</div><div class="lbl">HUAWEI : NVIDIA</div></div>
    <div class="stat-box"><div class="num">2 YEARS</div><div class="lbl">GENERATION GAP</div></div>
  </div>
  <div class="prediction"><div class="text">ECOSYSTEM PROBLEM SOLVED</div><div class="sub">Liang's prediction: within 1 year</div></div>
</div></body></html>`;
}

/* ── S11: Three factors ───────────────────────────────── */
function s11(duration) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s11 { display: flex; flex-direction: column; justify-content: center; padding: 100px 80px; }
.s11 .title { font-size: 48px; font-weight: 900; color: var(--white); letter-spacing: 2px; margin-bottom: 60px; text-align: center; animation: slideUp 0.4s ease-out 0.1s forwards; opacity: 0; }
.s11 .title .hl { color: var(--red); }
.s11 .factors { display: flex; flex-direction: column; gap: 30px; }
.s11 .factor { display: flex; align-items: flex-start; gap: 28px; padding: 36px 40px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); animation: slideLeft 0.5s ease-out forwards; opacity: 0; }
.s11 .factor:nth-child(1) { animation-delay: 0.3s; border-left: 5px solid var(--red); }
.s11 .factor:nth-child(2) { animation-delay: 1.0s; border-left: 5px solid var(--amber); }
.s11 .factor:nth-child(3) { animation-delay: 1.7s; border-left: 5px solid var(--purple); }
.s11 .factor .num { font-size: 80px; font-weight: 900; line-height: 0.9; width: 80px; flex-shrink: 0; }
.s11 .factor:nth-child(1) .num { color: var(--red); }
.s11 .factor:nth-child(2) .num { color: var(--amber); }
.s11 .factor:nth-child(3) .num { color: var(--purple); }
.s11 .factor .content { flex: 1; }
.s11 .factor .ftitle { font-size: 40px; font-weight: 900; color: var(--white); margin-bottom: 8px; letter-spacing: 1px; }
.s11 .factor .ftext { font-size: 30px; color: var(--sec); line-height: 1.3; }
</style></head><body>
<div class="scene s11">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="title">WHY THIS LEAK WAS <span class="hl">DEVASTATING</span></div>
  <div class="factors">
    <div class="factor"><div class="num">1</div><div class="content"><div class="ftitle">SECRECY</div><div class="ftext">Near-zero public presence. Declined all media for 3 years.</div></div></div>
    <div class="factor"><div class="num">2</div><div class="content"><div class="ftitle">NAMED RIVALS</div><div class="ftext">Direct criticism of Zhipu, ByteDance, Alibaba, Tencent — in his own words.</div></div></div>
    <div class="factor"><div class="num">3</div><div class="content"><div class="ftitle">TRADE SECRETS</div><div class="ftext">GPU stockpile numbers & pricing logic that competitors would pay to know.</div></div></div>
  </div>
</div></body></html>`;
}

/* ── S12: CTA (with brand logo) ──────────────────────── */
function s12(duration) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s12 { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.s12 .brand-logo-large {
  width: 130px; height: 130px; margin-bottom: 30px;
  filter: drop-shadow(0 0 30px rgba(77,139,255,0.4));
  animation: scaleIn 0.6s ease-out 0.1s forwards, logoPulse 3s ease-in-out 1s infinite; opacity: 0;
}
@keyframes logoPulse { 0%, 100% { filter: drop-shadow(0 0 30px rgba(77,139,255,0.4)); } 50% { filter: drop-shadow(0 0 50px rgba(77,139,255,0.6)); } }
.s12 .brand-logo-large svg { width: 100%; height: 100%; }
.s12 .brand-name { font-size: 72px; font-weight: 900; color: var(--white); letter-spacing: 4px; margin-bottom: 16px; animation: scaleIn 0.6s ease-out 0.3s forwards; opacity: 0; }
.s12 .brand-name .hl { color: var(--blue); }
.s12 .tagline { font-size: 32px; font-weight: 600; color: var(--sec); letter-spacing: 3px; margin-bottom: 80px; animation: fadeIn 0.5s ease-out 0.7s forwards; opacity: 0; }
.s12 .line1 { font-size: 64px; font-weight: 800; color: var(--amber); letter-spacing: 2px; margin-bottom: 16px; animation: slideUp 0.5s ease-out 1.0s forwards; opacity: 0; text-shadow: 0 0 30px rgba(245,158,11,0.4); }
.s12 .subscribe { position: absolute; bottom: 120px; text-align: center; font-size: 30px; font-weight: 700; color: var(--muted); letter-spacing: 3px; animation: fadeIn 0.5s ease-out 1.4s forwards; opacity: 0; }
.s12 .fade-to-black { position: absolute; inset: 0; background: #050508; pointer-events: none; animation: fadeOut 0.8s ease-in ${Math.max(duration - 1.2, 1.5).toFixed(1)}s forwards; opacity: 0; }
@keyframes fadeOut { to { opacity: 1; } }
</style></head><body>
<div class="scene s12">
  <div class="grid-bg"></div><div class="glow-red"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <div class="brand-logo-large">${BRAND_MARK_SVG}</div>
  <div class="brand-name">CHINA <span class="hl">AI</span> NEWS</div>
  <div class="tagline">China's AI, decoded.</div>
  <div class="line1">Subscribe for more</div>
  <div class="subscribe">Follow for daily China AI deep dives</div>
  <div class="fade-to-black"></div>
</div></body></html>`;
}

/**
 * Split voiceover text into subtitle chunks for timed display.
 * Each chunk is 3-7 words — short enough to read in 1.5-3 seconds on mobile.
 * Returns array of { text, startPct, endPct } — percentages of total duration.
 *
 * If whisper timing data is available for this scene, uses actual audio timestamps.
 * Otherwise falls back to word-count estimation (~2.8 words/sec).
 */
export function splitSubtitles(voiceover, duration, sceneId) {
  // Try whisper-based alignment first
  if (WHISPER_TIMING && sceneId) {
    const sceneTiming = WHISPER_TIMING.find((t) => t.sceneId === sceneId);
    if (sceneTiming && sceneTiming.segments && sceneTiming.segments.length > 0) {
      return alignWithWhisper(sceneTiming.segments, duration);
    }
  }

  // Fallback: estimate by word count
  return splitByWordCount(voiceover, duration);
}

/**
 * Align subtitles using force-align timing data.
 * Splits long segments (>7 words) into smaller chunks for readability.
 * Ensures no chunk has 0 duration.
 */
function alignWithWhisper(segments, duration) {
  // First, split any segment with >7 words into sub-chunks
  const splitSegments = [];
  for (const seg of segments) {
    const words = seg.text.split(/\s+/);
    if (words.length <= 7) {
      // For karaoke: keep word-level timing from whisperx
      const end = Math.max(seg.end, seg.start + 0.5);
      splitSegments.push({ ...seg, end, words: seg.words || [] });
    } else {
      // Split long segment into 3-7 word sub-chunks
      const subChunks = Math.ceil(words.length / 5); // ~5 words per chunk
      const wordsPerChunk = Math.ceil(words.length / subChunks);
      const segDuration = seg.end - seg.start;
      const timePerWord = segDuration / words.length;
      for (let i = 0; i < words.length; i += wordsPerChunk) {
        const chunkWords = words.slice(i, i + wordsPerChunk);
        const chunkStart = seg.start + i * timePerWord;
        const chunkEnd = seg.start + Math.min(i + wordsPerChunk, words.length) * timePerWord;
        splitSegments.push({
          text: chunkWords.join(" "),
          start: chunkStart,
          end: Math.max(chunkEnd, chunkStart + 0.5),
        });
      }
    }
  }

  // Group sub-segments into 3-7 word chunks
  const chunks = [];
  let currentChunk = [];
  const maxWords = 7;
  const minWords = 3;

  for (const seg of splitSegments) {
    currentChunk.push(seg);

    const chunkWordCount = currentChunk.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
    const isSentenceEnd = /[.!?:;]$/.test(seg.text);
    const isComma = /,$/.test(seg.text);
    const reachedMax = chunkWordCount >= maxWords;
    const reachedMin = chunkWordCount >= minWords;

    if (isSentenceEnd || reachedMax || (isComma && reachedMin)) {
      const start = currentChunk[0].start;
      const end = Math.max(currentChunk[currentChunk.length - 1].end, start + 0.5);
      const text = currentChunk
        .map((s) => s.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      // Collect word-level timestamps for karaoke-style highlighting
      const words = [];
      for (const seg of currentChunk) {
        if (seg.words) {
          for (const w of seg.words) {
            words.push({
              text: w.text || w.word || "",
              startPct: Math.min((w.start / duration) * 100, 92),
              endPct: Math.min((w.end / duration) * 100, 98),
            });
          }
        } else {
          // Fallback: split segment text into words with proportional timing
          const segWords = seg.text.split(/\s+/);
          const segDur = seg.end - seg.start;
          const perWord = segDur / segWords.length;
          for (let wi = 0; wi < segWords.length; wi++) {
            words.push({
              text: segWords[wi],
              startPct: Math.min(((seg.start + wi * perWord) / duration) * 100, 92),
              endPct: Math.min(((seg.start + (wi + 1) * perWord) / duration) * 100, 98),
            });
          }
        }
      }
      chunks.push({
        text,
        startPct: Math.min((start / duration) * 100, 92),
        endPct: Math.min((end / duration) * 100, 98),
        words,
      });
      currentChunk = [];
    }
  }
  // Remaining words
  if (currentChunk.length > 0) {
    const start = currentChunk[0].start;
    const end = Math.max(currentChunk[currentChunk.length - 1].end, start + 0.5);
    const text = currentChunk
      .map((s) => s.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const words = [];
    for (const seg of currentChunk) {
      if (seg.words) {
        for (const w of seg.words) {
          words.push({
            text: w.text || w.word || "",
            startPct: Math.min((w.start / duration) * 100, 92),
            endPct: Math.min((w.end / duration) * 100, 98),
          });
        }
      } else {
        const segWords = seg.text.split(/\s+/);
        const segDur = seg.end - seg.start;
        const perWord = segDur / segWords.length;
        for (let wi = 0; wi < segWords.length; wi++) {
          words.push({
            text: segWords[wi],
            startPct: Math.min(((seg.start + wi * perWord) / duration) * 100, 92),
            endPct: Math.min(((seg.start + (wi + 1) * perWord) / duration) * 100, 98),
          });
        }
      }
    }
    chunks.push({
      text,
      startPct: Math.min((start / duration) * 100, 92),
      endPct: Math.min((end / duration) * 100, 98),
      words,
    });
  }

  // Extend chunk end times to fill gaps: each chunk stays visible until next chunk starts
  for (let i = 0; i < chunks.length - 1; i++) {
    const nextStart = (chunks[i + 1].startPct / 100) * duration;
    const currentEnd = (chunks[i].endPct / 100) * duration;
    if (nextStart > currentEnd) {
      // Extend end to next chunk's start (minus 0.1s gap)
      chunks[i].endPct = Math.min(((nextStart - 0.1) / duration) * 100, 99);
    }
  }
  // Last chunk: extend to end of scene
  if (chunks.length > 0) {
    chunks[chunks.length - 1].endPct = 99;
  }

  return chunks;
}

/**
 * Fallback: estimate subtitle timing by word count.
 */
function splitByWordCount(voiceover, duration) {
  const words = voiceover.trim().split(/\s+/);
  if (words.length === 0) return [];

  // Group words into chunks of 3-7 words, breaking on natural pauses
  const chunks = [];
  let currentChunk = [];
  const maxWords = 7;
  const minWords = 3;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    currentChunk.push(word);

    const isSentenceEnd = /[.!?:;]$/.test(word);
    const isComma = /,$/.test(word);
    const reachedMax = currentChunk.length >= maxWords;
    const reachedMin = currentChunk.length >= minWords;

    if (isSentenceEnd) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [];
    } else if (reachedMax) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [];
    } else if (isComma && reachedMin) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [];
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  // Character-weighted timing: longer words get more time
  const chunkWordArrays = chunks.map((c) => c.split(/\s+/));
  const chunkCharCounts = chunkWordArrays.map((ws) =>
    ws.reduce((sum, w) => sum + Math.max(w.length, 1), 0),
  );
  const totalChars = chunkCharCounts.reduce((a, b) => a + b, 0);
  const secondsPerChar = duration / totalChars;

  let elapsed = 0;
  return chunks.map((text, i) => {
    const charCount = chunkCharCounts[i];
    const chunkDuration = Math.max(charCount * secondsPerChar, 0.5);
    const startPct = (elapsed / duration) * 100;
    const endPct = ((elapsed + chunkDuration) / duration) * 100;

    // Generate word-level timestamps for fallback karaoke (character-weighted)
    const ws = chunkWordArrays[i];
    const wordTimes = [];
    let wElapsed = elapsed;
    for (const w of ws) {
      const wDur = Math.max(w.length, 1) * secondsPerChar;
      wordTimes.push({
        text: w,
        startPct: (wElapsed / duration) * 100,
        endPct: ((wElapsed + wDur) / duration) * 100,
      });
      wElapsed += wDur;
    }

    elapsed += chunkDuration;
    return {
      text,
      startPct: Math.min(startPct, 92),
      endPct: Math.min(endPct, 98),
      words: wordTimes,
    };
  });
}

/**
 * CSS for subtitles is now static (no per-chunk @keyframes).
 * JS controls visibility via requestAnimationFrame.
 */

/**
 * Build subtitle HTML with JS-based visibility control.
 * Uses requestAnimationFrame + performance.now() for precise timing.
 * Subtitles show at startPct, hide at next chunk's startPct (or 99% for last).
 */
function buildSubtitleHTML(subtitles, duration) {
  if (!subtitles || subtitles.length === 0) return "";
  let html = "";
  // Build subtitle elements — show full chunk text, no per-word highlighting
  for (let i = 0; i < subtitles.length; i++) {
    const sub = subtitles[i];
    html += `<div class="subtitle-bar" id="sub-${i}">${sub.text}</div>`;
  }
  // Build JS timing data — show at startPct, hide at next chunk startPct (or 99% for last)
  const subsData = subtitles.map((s, i) => ({
    s: s.startPct,
    e: i < subtitles.length - 1 ? subtitles[i + 1].startPct : 99,
  }));
  html += `<script>
(function(){
const SUBS = ${JSON.stringify(subsData)};
const DUR = ${duration.toFixed(2)};
const t0 = performance.now();
function tick(){
const el = (performance.now() - t0) / 1000;
const pct = (el / DUR) * 100;
let cur = -1;
for (let i = 0; i < SUBS.length; i++) {
if (pct >= SUBS[i].s && pct < SUBS[i].e) { cur = i; break; }
}
for (let i = 0; i < SUBS.length; i++) {
const e = document.getElementById('sub-' + i);
if (e) e.style.opacity = (i === cur) ? '1' : '0';
}
if (el < DUR) requestAnimationFrame(tick);
}
tick();
})();
</script>`;
  return html;
}

export function generateSceneHTML(sceneId, duration, voiceover = null) {
  const generators = [null, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12];
  const gen = generators[sceneId];
  if (!gen) throw new Error(`Unknown scene ID: ${sceneId}`);
  let html = gen(duration);

  // Build subtitles if voiceover is provided (skip for hook scene 1 and CTA scene 12)
  let subtitleHTML = "";
  if (voiceover && sceneId !== 12) {
    const subtitles = splitSubtitles(voiceover, duration, sceneId);
    subtitleHTML = buildSubtitleHTML(subtitles, duration);
  }

  // Inject brand watermark + subtitles before closing scene div
  const watermark = `<div class="brand-watermark">${BRAND_MARK_SVG}</div>`;
  html = html.replace(/<\/div><\/body>/, `${watermark}${subtitleHTML}</div></body>`);
  return html;
}
