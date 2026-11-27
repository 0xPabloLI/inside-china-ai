export const meta = {
  article: "metaso-kaiji",
  subject: "metaso",
  pipelineId: "metaso-kaiji",
  title: "Metaso's AI Film Crew Turns One Story Into a 15-Minute Movie",
  renderer: "remotion",
  audio: {
    mode: "voice-only",
    reason: "No BGM by user preference; the hero reel is silent by design",
  },
  createdAt: "2026-11-26",
  // Measured from content/metaso-kaiji/assets/ on 2026-11-26:
  // 6 official 5s hero-reel clips + 1 derived 6s style reel, all 1920x1080.
  videoFit: 5,
  videoFitFormat: "demo-led",
  assetReady: 1,
  videoFitHook:
    "Official Kaiji hero reel at frame one: a rain-soaked face, then a space helmet, then a burning street.",
  videoFitEvidence:
    "assets/metaso-style-reel.mp4 1920x1080 24fps 6s derived from four official hero-reel clips; assets/metaso-visor.mp4 1920x1080 24fps 5.17s official hero reel; assets/metaso-ink.mp4 1920x1080 24fps 5.17s official hero reel; assets/metaso-povgun.mp4 1920x1080 24fps 5.17s official hero reel; assets/metaso-tears.mp4 1920x1080 24fps 5.17s official hero reel; assets/metaso-sakura.mp4 1920x1080 24fps 5.17s official hero reel; assets/metaso-tears-still.jpg 1920x1080 official still; assets/metaso-visor-still.jpg 1920x1080 official still; assets/metaso-ink-still.jpg 1920x1080 official still; assets/metaso-sakura-still.jpg 1920x1080 official still",
  storySpine: {
    phenomenon:
      "Metaso launched Kaiji, a full AI virtual film crew. A user pastes a story of 20 to 10,000 characters or uploads a document, and the system handles script adaptation, shot review, casting, set generation, shooting and editing. QuantumBit reported a 15-minute short film generated in about 10 minutes, with 12 film styles, 3 aspect ratios, an AI assistant director and 83 films already showing in Metaso's Vault.",
    caveat:
      "Ten minutes is a demo run on a polished story, not a guaranteed production time. One-shot output still needs manual fixes, the 15-minute runtime is a ceiling rather than the average, and hit rate and cost at scale are unproven.",
    storyType: "product-launch",
  },
  topics: ["china-ai", "ai-film", "metaso", "kaiji", "video-generation", "short-drama"],
  keyEntities: {
    companies: ["metaso"],
    people: [],
    models: ["kaiji"],
  },
  dataPoints: [
    "Metaso official page, 2026-11: Kaiji accepts a story of 20 to 10,000 characters or a TXT, DOCX, PPTX or PDF file.",
    "Metaso official page: the Vault is showing 83 films.",
    "QuantumBit, 2026-11-25: a 15-minute short film was generated in about 10 minutes from a pasted story.",
    "QuantumBit: Kaiji offers 12 film-style presets and 16:9, 9:16 and 1:1 aspect ratios.",
    "QuantumBit: the virtual crew covers script adaptation, self-review, storyboard, casting, sets, shooting and editing.",
    "QuantumBit: one-shot output still needed manual fixes; the author used the built-in edit room to adjust shots.",
  ],
  hashtags: ["#chinaai", "#metaso", "#kaiji", "#aifilm", "#shortfilm"],
};
