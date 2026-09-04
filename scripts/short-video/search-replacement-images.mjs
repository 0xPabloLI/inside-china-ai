/**
 * Search Pexels for replacement stock images for failed scenes.
 * Downloads vertical (portrait) images preferred.
 *
 * Usage: node scripts/short-video/search-replacement-images.mjs
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const __dirname = new URL(".", import.meta.url).pathname.replace(/^\//, "/");
const contentDir = resolve(__dirname, "content/zhipu-glm6-self-training/assets");

const PEXELS_API = "https://api.pexels.com/v1/search";

const searches = [
  {
    sceneId: 4,
    query: "artificial intelligence data analytics performance chart",
    filename: "ai-benchmark-chart.jpg",
  },
  {
    sceneId: 7,
    query: "microchip semiconductor processor technology",
    filename: "microchip.jpg",
  },
];

async function searchPexels(query, perPage = 10) {
  const url = `${PEXELS_API}?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait`;
  const res = await fetch(url, {
    headers: { Authorization: process.env.PEXELS_API_KEY },
  });
  if (!res.ok) throw new Error(`Pexels API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download error: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  return buf.length;
}

async function main() {
  for (const search of searches) {
    console.log(`\nScene ${search.sceneId}: searching "${search.query}"...`);
    const data = await searchPexels(search.query);

    console.log(`  Found ${data.photos.length} photos`);
    for (const photo of data.photos.slice(0, 5)) {
      const ratio = photo.width / photo.height;
      console.log(
        `    [${photo.id}] ${photo.width}x${photo.height} ratio=${ratio.toFixed(2)} alt="${photo.alt?.slice(0, 80)}"`,
      );
    }

    // Pick the first portrait image (height > width)
    const portrait = data.photos.find((p) => p.height > p.width) ?? data.photos[0];
    if (!portrait) {
      console.log(`  No suitable photo found`);
      continue;
    }

    const destPath = join(contentDir, search.filename);
    const url = portrait.src.large2x || portrait.src.large || portrait.src.original;
    console.log(
      `  Downloading [${portrait.id}] ${portrait.width}x${portrait.height} → ${search.filename}`,
    );
    const bytes = await downloadImage(url, destPath);
    console.log(`  Saved: ${(bytes / 1024).toFixed(0)} KB`);
  }

  console.log("\nDone. Now re-run evaluate-stock-relevance.mjs to verify.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
