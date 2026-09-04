// Test fixture: 11 scenes (over the 6-10 TikTok limit) but otherwise fully
// compliant, so --long-form downgrades ONLY the scene-count violation.
// The CTA scene carries texts.action (standardized end-card contract,
// enforced by checkCTAActionContract) so the action contract stays pass.
//
// Every rule that verify-video.mjs checks is satisfied:
//   - hook has a number + strong word, no greeting, VO differs from text
//   - no em dashes, no AI blacklist words, one-breath lines (<=25 words)
//   - China/AI/DeepSeek on-screen in >=2 scenes, named sources in >=2 scenes
//   - >=50% scenes carry concrete numbers, no clickbait/dead closers
//   - total VO ~11 x 14 words < 180 (word-count check stays PASS so the
//     --long-form exit-0 assertion isolates the scene-count downgrade)
//   - non-CTA scenes carry layout="hero-center" (checkLayoutField is not a
//     long-form downgrade candidate, so it must PASS here, not WARN)

const SCENE = (id, word) => ({
  id,
  name: word,
  visualType: id === 1 ? "hook" : id === 11 ? "cta" : "data",
  layout: id === 11 ? undefined : "hero-center",
  voiceover: `Scene ${id}: China AI ${word} hit a fresh 1.4 billion dollar mark.`,
  texts:
    id === 1 ? { hookText: "DEEPSEEK HIT", revealText: "$1.4B MARK" } : { stat: `SCENE ${id}` },
});

export const scenes = Array.from({ length: 11 }, (_, i) => {
  const s = SCENE(i + 1, "milestone");
  if (i === 0) {
    // Bloomberg attribution in the hook; differs from on-screen text
    s.voiceover = "Bloomberg reported China AI DeepSeek hit a 1.4 billion dollar mark.";
  }
  if (i === 4) {
    // second named source (soft rule: named sources in >=2 scenes)
    s.voiceover = "Reuters confirmed the same China AI milestone number.";
  }
  if (i === 10) {
    s.voiceover = "Follow China AI News for the next DeepSeek milestone.";
    // cta.hero-center contract: brand + tagline are rendered (must be present),
    // action is optional but required by checkCTAActionContract. `line1` is not
    // in the slot map — the template contract check (#190) fails unknown fields.
    s.texts = {
      brand: "CHINA AI NEWS",
      tagline: "DAILY CHINA AI BRIEFING",
      action: "FOLLOW FOR MORE",
    };
  }
  return s;
});
