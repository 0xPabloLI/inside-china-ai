/**
 * Remotion scene parity guard — ensures Remotion scene components render
 * the `source` field when scene-data provides it.
 *
 * This is a static source-level guard. It reads each Remotion scene component
 * file and checks whether it references `txt.source` — the source attribution
 * line that appears in the support slot of data/narrative/hook/quote scenes.
 *
 * Motivation: NarrativeScene.tsx was missing `txt.source` rendering — the
 * (since retired) Playwright HTML templates had it, but the Remotion React
 * component omitted it, causing source attribution to silently disappear in
 * all Remotion-rendered narrative scenes.
 *
 * Scope: only checks the `source` field (the cross-scene-type attribution
 * line). The HTML path was retired on 2026-09-01 (decision 59); this guard
 * remains as a source-level lock so the field cannot silently disappear
 * again from the Remotion components.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REMOTION_SCENES_DIR = join(__dirname, "..", "remotion", "src", "scenes");

/**
 * Check whether a source file references `txt.source`.
 * @param {string} filePath - absolute path to the .tsx file
 * @returns {boolean}
 */
function rendersTxtSource(filePath) {
  const src = readFileSync(filePath, "utf8");
  return /\btxt\.source\b/.test(src);
}

/**
 * Map visualType to the Remotion component file name.
 * Only scene types that should render source attribution are checked.
 */
const SCENE_TYPES_WITH_SOURCE = [
  { visualType: "hook", file: "HookScene.tsx" },
  { visualType: "data", file: "DataScene.tsx" },
  { visualType: "narrative", file: "NarrativeScene.tsx" },
  { visualType: "quote", file: "QuoteScene.tsx" },
  { visualType: "stat-reveal", file: "StatRevealScene.tsx" },
];

// CTA and FullscreenMedia are excluded — CTA uses brand/tagline/action/topic
// (no source line by design); FullscreenMedia renders media.source, not txt.source.

describe("Remotion scene parity — source field rendering", () => {
  for (const { visualType, file } of SCENE_TYPES_WITH_SOURCE) {
    it(`${visualType} (${file}) renders txt.source`, () => {
      const componentPath = join(REMOTION_SCENES_DIR, file);
      expect(
        rendersTxtSource(componentPath),
        `${file} does not render txt.source — source attribution is silently dropped in Remotion renders. ` +
          `Add {txt.source && (<FadeIn delay={1.0}><div style={{fontSize:20,fontWeight:600,color:"#94a3b8",letterSpacing:"1px"}}>{txt.source as string}</div></FadeIn>)} to the support slot. See DataScene.tsx for the pattern.`,
      ).toBe(true);
    });
  }
});
