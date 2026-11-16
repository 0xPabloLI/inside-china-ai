#!/usr/bin/env node
/**
 * Blind pairwise review packet for layout experiments (#1398).
 *
 * The packet randomizes left/right per pair, strips variant labels, and writes
 * a separate key file the reviewer never opens. Reviewers rate four dimensions
 * on 1-7 anchors and choose a preference; the exported JSON feeds the report.
 *
 * Usage:
 *   node scripts/short-video/experiment-review.mjs --manifest <path> [--out <dir>] [--seed 20260101]
 *
 * Manifest:
 *   {
 *     "experimentId": "info-layout-v1",
 *     "title": "Native chart vs chart-card",
 *     "pairs": [
 *       {
 *         "id": "kimi-ipo",
 *         "block": "kimi-ipo",
 *         "a": { "image": "/abs/a.png" },
 *         "b": { "image": "/abs/b.png" }
 *       }
 *     ]
 *   }
 */

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_SEED = 20260101;
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function flip(seed, experimentId, pairId) {
  return (
    createHash("sha256").update([seed, experimentId, pairId].join("\u0000")).digest()[0] % 2 === 1
  );
}

function imageExt(file) {
  const ext = extname(file).toLowerCase();
  if (!IMAGE_EXT.has(ext)) throw new Error(`unsupported image type: ${file}`);
  return ext;
}

/**
 * Build the packet. Returns the paths plus the unblinded key (kept in `outDir`
 * for the analyst, never linked from the review page).
 */
export function buildReviewPacket({
  manifest,
  outDir,
  seed = DEFAULT_SEED,
  now = new Date().toISOString(),
} = {}) {
  if (!manifest || !Array.isArray(manifest.pairs) || manifest.pairs.length === 0) {
    throw new Error("manifest.pairs must contain at least one pair");
  }
  const experimentId = String(manifest.experimentId || "").trim();
  if (!experimentId) throw new Error("manifest.experimentId is required");
  const destination = resolve(
    outDir || join(process.cwd(), "output", "experiments", `${experimentId}-review`),
  );
  mkdirSync(join(destination, "assets"), { recursive: true });

  const key = [];
  const pairs = [];
  for (const pair of manifest.pairs) {
    const id = String(pair.id || "").trim();
    if (!id) throw new Error("each pair needs an id");
    for (const side of ["a", "b"]) {
      const image = pair[side]?.image;
      if (!image || !existsSync(image))
        throw new Error(`pair ${id}: missing ${side}.image (${image})`);
    }
    const shouldFlip = flip(seed, experimentId, id);
    const left = shouldFlip ? pair.b : pair.a;
    const right = shouldFlip ? pair.a : pair.b;
    const leftVariant = shouldFlip ? "B" : "A";
    const rightVariant = shouldFlip ? "A" : "B";
    const leftFile = `${id}-left${imageExt(left.image)}`;
    const rightFile = `${id}-right${imageExt(right.image)}`;
    copyFileSync(left.image, join(destination, "assets", leftFile));
    copyFileSync(right.image, join(destination, "assets", rightFile));
    pairs.push({
      id,
      block: pair.block || id,
      leftImage: `assets/${leftFile}`,
      rightImage: `assets/${rightFile}`,
    });
    key.push({
      pairId: id,
      block: pair.block || id,
      left: leftVariant,
      right: rightVariant,
      leftSource: basename(left.image),
      rightSource: basename(right.image),
    });
  }

  const title = escapeHtml(manifest.title || experimentId);
  const data = JSON.stringify(pairs).replaceAll("</", "<\\/");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — blind review</title>
<style>
  :root { color-scheme: dark; --bg:#111317; --panel:#1b1e24; --line:#343944; --text:#f5f5f5; --muted:#a6adba; --brand:#4d8bff; --amber:#ffb020; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; }
  header { position: sticky; top: 0; z-index: 2; padding: 16px 24px; background: rgba(17,19,23,.94); border-bottom: 1px solid var(--line); display: flex; gap: 16px; align-items: center; justify-content: space-between; }
  h1 { font-size: 18px; margin: 0; font-weight: 600; }
  main { max-width: 1320px; margin: 0 auto; padding: 24px; display: grid; gap: 24px; }
  .pair { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 20px; }
  .pair h2 { font-size: 15px; margin: 0 0 12px; color: var(--muted); font-weight: 500; }
  .stills { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .still { margin: 0; }
  .still img { width: 100%; height: min(74vh, 720px); object-fit: contain; background: #000; border-radius: 8px; border: 1px solid var(--line); }
  .still figcaption { margin-top: 8px; text-align: center; color: var(--muted); font-size: 13px; }
  .questions { margin-top: 16px; display: grid; gap: 12px; }
  .preference { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; padding: 12px; background: rgba(77,139,255,.08); border: 1px solid rgba(77,139,255,.28); border-radius: 8px; }
  .preference strong { font-size: 14px; }
  .preference label { cursor: pointer; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 500; font-size: 13px; }
  td:first-child { width: 36%; }
  select { background: #0e1014; color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; }
  footer { max-width: 1320px; margin: 0 auto; padding: 0 24px 48px; color: var(--muted); font-size: 13px; }
  button { background: var(--brand); color: white; border: 0; border-radius: 8px; padding: 10px 16px; font-weight: 600; cursor: pointer; }
  button.secondary { background: transparent; border: 1px solid var(--line); color: var(--text); }
  .done { color: var(--amber); font-weight: 600; }
  @media (max-width: 760px) { .stills { grid-template-columns: 1fr; } .still img { height: auto; max-height: 70vh; } }
</style>
</head>
<body>
<header>
  <h1>${title} — blind review</h1>
  <div><span id="progress">0 / ${pairs.length}</span> <button id="download" class="secondary" type="button">Download JSON</button></div>
</header>
<main id="pairs"></main>
<footer>
  Rate each side independently on 1–7. Left/right order is randomized per pair; the mapping is not shown.
  Export the JSON when finished and send it to the analyst. Do not open <code>key.json</code>.
</footer>
<script>
const PAIRS = ${data};
const DIMENSIONS = [
  ["clarity", "Clarity — can I tell what the chart says?"],
  ["credibility", "Credibility — does it look like a sourced claim?"],
  ["memorability", "Memorability — would I remember the number?"],
  ["hierarchy", "Visual hierarchy — is there one obvious focal point?"]
];
const root = document.getElementById("pairs");
const responses = {};

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

function select(name, pairId) {
  const s = el("select", { name, "data-pair": pairId });
  s.append(el("option", { value: "" }, ["—"]));
  for (let i = 1; i <= 7; i++) s.append(el("option", { value: String(i) }, [String(i)]));
  return s;
}

for (const pair of PAIRS) {
  const section = el("section", { class: "pair", "data-pair": pair.id });
  section.append(el("h2", {}, [pair.block + " · " + pair.id]));
  const stills = el("div", { class: "stills" });
  for (const [side, src] of [["left", pair.leftImage], ["right", pair.rightImage]]) {
    const fig = el("figure", { class: "still" });
    fig.append(el("img", { src, alt: side + " still" }));
    fig.append(el("figcaption", {}, [side === "left" ? "LEFT" : "RIGHT"]));
    stills.append(fig);
  }
  section.append(stills);

  const questions = el("div", { class: "questions" });
  const pref = el("div", { class: "preference" });
  pref.append(el("strong", {}, ["Which is better overall?"]));
  for (const value of ["left", "right", "tie"]) {
    const label = el("label");
    const input = el("input", { type: "radio", name: "pref-" + pair.id, value });
    label.append(input, " " + value);
    pref.append(label);
  }
  questions.append(pref);

  const table = el("table");
  const head = el("tr");
  head.append(el("th", {}, ["dimension"]), el("th", {}, ["LEFT 1–7"]), el("th", {}, ["RIGHT 1–7"]));
  table.append(head);
  for (const [key, label] of DIMENSIONS) {
    const row = el("tr");
    row.append(el("td", {}, [label]));
    const leftCell = el("td");
    const rightCell = el("td");
    leftCell.append(select(key + "-left", pair.id));
    rightCell.append(select(key + "-right", pair.id));
    row.append(leftCell, rightCell);
    table.append(row);
  }
  questions.append(table);
  section.append(questions);
  root.append(section);
}

function collect() {
  const out = { pairs: {} };
  let complete = 0;
  for (const pair of PAIRS) {
    const pref = document.querySelector('input[name="pref-' + pair.id + '"]:checked');
    const ratings = {};
    let filled = 0;
    for (const [key] of DIMENSIONS) {
      const left = document.querySelector('select[name="' + key + '-left"][data-pair="' + pair.id + '"]').value;
      const right = document.querySelector('select[name="' + key + '-right"][data-pair="' + pair.id + '"]').value;
      ratings[key] = { left: left ? Number(left) : null, right: right ? Number(right) : null };
      if (left && right) filled++;
    }
    if (pref && filled === DIMENSIONS.length) complete++;
    out.pairs[pair.id] = { block: pair.block, preference: pref ? pref.value : null, ratings };
  }
  out.complete = complete;
  out.total = PAIRS.length;
  document.getElementById("progress").textContent = complete + " / " + PAIRS.length;
  document.getElementById("progress").className = complete === PAIRS.length ? "done" : "";
  return out;
}

document.addEventListener("change", collect);
document.getElementById("download").addEventListener("click", () => {
  const payload = {
    experimentId: ${JSON.stringify(experimentId)},
    generatedAt: ${JSON.stringify(now)},
    seed: ${Number(seed)},
    ...collect()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2) + "\\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ${JSON.stringify(`${experimentId}-review-${Date.now()}.json`)};
  a.click();
  URL.revokeObjectURL(a.href);
});
collect();
</script>
</body>
</html>
`;
  writeFileSync(join(destination, "index.html"), html, "utf8");
  writeFileSync(
    join(destination, "key.json"),
    `${JSON.stringify({ experimentId, seed, pairs: key }, null, 2)}\n`,
    "utf8",
  );
  return {
    htmlPath: join(destination, "index.html"),
    keyPath: join(destination, "key.json"),
    outDir: destination,
    pairs,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--manifest") options.manifest = argv[++i];
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--seed") options.seed = Number(argv[++i]);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.manifest) throw new Error("--manifest is required");
  const manifest = JSON.parse(readFileSync(resolve(options.manifest), "utf8"));
  const result = buildReviewPacket({
    manifest,
    outDir: options.out ? resolve(options.out) : undefined,
    seed: options.seed ?? DEFAULT_SEED,
  });
  console.log(`✅ Review packet: ${result.htmlPath}`);
  console.log(`   Key (do not share with reviewers): ${result.keyPath}`);
  console.log(`   ${result.pairs.length} pairs`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}
