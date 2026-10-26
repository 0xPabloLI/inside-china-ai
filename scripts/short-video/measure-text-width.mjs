#!/usr/bin/env node
/**
 * Measure rendered text width for candidate on-screen strings, in the real
 * brand font stack, at the slot's real size/weight.
 *
 * Why: `slotCharBudget` is an advisory WARN built on an average uppercase em
 * (0.55), and TextGate is the hard gate. A string inside the char budget can
 * still wrap in the fixed-height `media-bottom-bar`, and a wrapped field pushes
 * the whole flex column above its content box (container-overflow). Measuring
 * the real advance width is the only way to know before a render.
 *
 * Usage:
 *   node scripts/short-video/measure-text-width.mjs 'REAL FOOTAGE@60:900' 'ONE TAKE@64:900'
 *   node scripts/short-video/measure-text-width.mjs --file candidates.txt
 *
 * Candidate syntax: "<text>@<fontSize>[:<fontWeight>][:letterSpacingPx]"
 */
import { readFileSync } from "fs";

const args = process.argv.slice(2);
const fileIdx = args.indexOf("--file");
let specs;
if (fileIdx >= 0) {
  specs = readFileSync(args[fileIdx + 1], "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
} else {
  specs = args.filter((a) => !a.startsWith("--"));
}
if (specs.length === 0) {
  console.error("no candidates given");
  process.exit(1);
}

const parsed = specs.map((raw) => {
  const at = raw.lastIndexOf("@");
  if (at < 0) throw new Error(`missing @<size> in: ${raw}`);
  const text = raw.slice(0, at);
  const [size, weight = "900", spacing = "0"] = raw.slice(at + 1).split(":");
  return { text, size: Number(size), weight, spacing: Number(spacing) };
});

const AVAILABLE = Number(process.env.SLOT_WIDTH || 724);
const FONT = "'Times New Roman', Times, serif";

const html = `<!doctype html><meta charset="utf-8"><body><script>
const items = ${JSON.stringify(parsed)};
const c = document.createElement("canvas").getContext("2d");
const out = items.map((it) => {
  c.font = it.weight + " " + it.size + "px " + ${JSON.stringify(FONT)};
  if ("letterSpacing" in c) c.letterSpacing = it.spacing + "px";
  const base = c.measureText(it.text).width;
  return { ...it, width: base + it.spacing * Math.max(0, it.text.length - 1) };
});
document.title = JSON.stringify(out);
</script></body>`;

const url = "data:text/html;charset=utf-8," + encodeURIComponent(html);

const res = await fetch("http://localhost:3456/new", { method: "POST", body: url });
const { targetId } = await res.json();
if (!targetId) {
  console.error("CDP proxy did not return a targetId — is it running on :3456?");
  process.exit(1);
}

try {
  await new Promise((r) => setTimeout(r, 1500));
  const info = await (await fetch(`http://localhost:3456/info?target=${targetId}`)).json();
  const rows = JSON.parse(info.title);

  const pad = Math.max(...rows.map((r) => r.text.length));
  console.log(
    `${"text".padEnd(pad)}  ${"px".padStart(6)}  ${"size".padStart(4)}  ${"lines".padStart(5)}  status`,
  );
  console.log("-".repeat(pad + 34));
  let overflow = 0;
  for (const r of rows) {
    const lines = Math.max(1, Math.ceil(r.width / AVAILABLE));
    const bad = lines > 1;
    if (bad) overflow++;
    console.log(
      `${r.text.padEnd(pad)}  ${r.width.toFixed(0).padStart(6)}  ${String(r.size).padStart(4)}  ` +
        `${String(lines).padStart(5)}  ${bad ? "WRAPS -> container-overflow" : "ok"}`,
    );
  }
  console.log(`\navailable width: ${AVAILABLE}px`);
  console.log(
    overflow === 0 ? "✅ every candidate fits one line" : `❌ ${overflow} candidate(s) wrap`,
  );
} finally {
  await fetch(`http://localhost:3456/close?target=${targetId}`).catch(() => {});
}
