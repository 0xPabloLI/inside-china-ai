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
 *   node scripts/short-video/measure-text-width.mjs --slot narrative.media-bottom-bar.result 'CLEARS THE STACK@64:900'
 *
 * Candidate syntax: "<text>@<fontSize>[:<fontWeight>][:letterSpacingPx]"
 *
 * The available width defaults to `MEASURED_MAX_WIDTH["narrative.media-bottom-bar.result"]`
 * (the fixed-height case this tool exists for) and is NOT re-declared here — a
 * re-measure of the contract must not leave this instrument reporting against a
 * stale number. Use --slot for another template, SLOT_WIDTH for a raw override.
 */
import { readFileSync } from "fs";
import { MEASURED_MAX_WIDTH } from "./lib/text-slots.mjs";
import { BRAND_FONT_STACK } from "./lib/safe-zones.mjs";
import { CDP_BASE } from "./lib/cdp-client.mjs";

const args = process.argv.slice(2);
const fileIdx = args.indexOf("--file");
const slotIdx = args.indexOf("--slot");
let specs;
if (fileIdx >= 0) {
  specs = readFileSync(args[fileIdx + 1], "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
} else {
  specs = args.filter((a, i) => {
    if (a.startsWith("--")) return false;
    // Skip the value of a value-taking flag.
    const prev = args[i - 1];
    return !(prev === "--file" || prev === "--slot");
  });
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

// Width source, most specific first: raw override > named slot > the
// fixed-height default. Every branch reads the contract; none restates it.
const DEFAULT_SLOT = "narrative.media-bottom-bar.result";
const slot = slotIdx >= 0 ? args[slotIdx + 1] : DEFAULT_SLOT;
const slotWidth = MEASURED_MAX_WIDTH[slot];
if (slotWidth === undefined) {
  console.error(`❌ unknown slot "${slot}". Known: ${Object.keys(MEASURED_MAX_WIDTH).join(", ")}`);
  process.exit(1);
}
const AVAILABLE = process.env.SLOT_WIDTH ? Number(process.env.SLOT_WIDTH) : slotWidth;
const FONT = BRAND_FONT_STACK;

// `</script>` inside a candidate would close the inline script early: the page
// would never set document.title, and the rest would parse as markup inside a
// tab of the logged-in automation profile. JSON.stringify does not escape `/`,
// so escape it for this HTML context explicitly.
const payload = JSON.stringify(parsed).replace(/<\//g, "<\\/");

const html = `<!doctype html><meta charset="utf-8"><body><script>
const items = ${payload};
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

const res = await fetch(`${CDP_BASE}/new`, { method: "POST", body: url });
const { targetId } = await res.json();
if (!targetId) {
  console.error(`CDP proxy did not return a targetId — is it running at ${CDP_BASE}?`);
  process.exit(1);
}

try {
  await new Promise((r) => setTimeout(r, 1500));
  const info = await (await fetch(`${CDP_BASE}/info?target=${targetId}`)).json();
  let rows;
  try {
    rows = JSON.parse(info.title);
  } catch {
    // Almost always the `</script>` case above, or a proxy error page.
    console.error(
      `❌ could not read measurements back (title was not JSON). Page title: ${JSON.stringify(info.title ?? null)}`,
    );
    process.exit(1);
  }

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
  console.log(`\navailable width: ${AVAILABLE}px  (slot: ${slot})`);
  console.log(
    overflow === 0 ? "✅ every candidate fits one line" : `❌ ${overflow} candidate(s) wrap`,
  );
} finally {
  await fetch(`${CDP_BASE}/close?target=${targetId}`).catch(() => {});
}
