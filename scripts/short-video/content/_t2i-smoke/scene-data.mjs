/**
 * _t2i-smoke scene-data — single-scene fixture for the AI image (T2I) path
 * (#155). Lives outside any real content pack because a fixture scene would
 * push a real pack over the 6-10 scene preflight limit. The prompt mirrors
 * the qwen4-preview architecture scene: the exact "abstract diagram with no
 * stock equivalent" case that motivated #155. Field set mirrors the legal
 * scene-data shape (see _gate-smoke for the same convention).
 *
 * Smoke: node generate-broll.mjs --content _t2i-smoke
 */
export const scenes = [
  {
    id: 1,
    name: "t2i-fixture",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: null,
    layout: "media-overlay",
    mediaStrategy: "ai-image",
    aiImage: {
      prompt:
        "Abstract architecture diagram of a transformer memory system: three wide glowing memory channels folding inward into one narrow spotlight beam scanning for matches, isometric blue-cyan data visualization, high detail.",
    },
    voiceover:
      "The blueprint matters because every layer of this design trades memory for precision.",
    texts: {
      badge: "T2I FIXTURE",
      company: "ARCHITECTURE",
      action: "MEMORY CHANNELS VISUALIZED",
      result: "GENERATED, NOT SOURCED",
      highlight: { field: "result", text: "GENERATED" },
      context: "AI IMAGE PATH SMOKE TEST",
      source: "CHINA AI NEWS ANALYSIS",
    },
  },
];
