/**
 * Test fixture for the standard hook opening card (docs/specs/spec-hook-opening-card.md).
 * Two hookScene variants (claim-led + number-led) plus a standard CTA close.
 *
 * Used by scripts/short-video/verify-scene-dom.mjs to prove the shared
 * template geometry: every element lands inside SAFE_ZONES (top 220–1340,
 * x 60–920) without any hand-written offsets. Scenes delegate to the shared
 * templates in lib/scene-templates.mjs (hookScene / ctaScene).
 */

export const scenes = [
  {
    id: 1,
    name: "hook-claim",
    visualType: "hook",
    voiceover: "DeepSeek runs a lean startup model, funded by a 1.4 billion dollar war chest.",
    texts: {
      badge: "EXCLUSIVE",
      subject: "DEEPSEEK",
      subjectLogo: "deepseek-icon",
      hookText: "0 KPIs. 0 ORG CHARTS.",
      revealText: "ONLY A VISION",
      stats: [{ num: "4", unit: "HR", label: "LEAKED MEETING" }],
      source: "LIANG WENFENG INVESTOR MEETING",
    },
  },
  {
    id: 2,
    name: "hook-number",
    visualType: "hook",
    voiceover: "A leaked four-hour meeting paused DeepSeek's 1.4 billion dollar round.",
    texts: {
      badge: "BREAKING",
      subject: "DEEPSEEK",
      subjectLogo: "deepseek-icon",
      bigNumber: "$1.4B",
      numberLabel: "FUNDING ROUND PAUSED",
      numberHighlight: "FUNDING",
      stats: [
        { num: "4", unit: "HR", label: "LEAKED MEETING" },
        { num: "1", unit: "LAB", label: "PAUSED ROUND" },
      ],
      source: "BLOOMBERG CONFIRMED",
    },
  },
  {
    id: 3,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more China AI intelligence.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];

export const metadata = {
  title: "hook-standard fixture",
  description: "Test fixture for the shared hook opening card template",
  hashtags: ["#chinaai", "#deepseek", "#technews"],
};
