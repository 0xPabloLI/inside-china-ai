export const meta = {
  article: "suno-visuals-minimax-h3",
  subject: "suno",
  pipelineId: "suno-visuals",
  title: "Suno's Music Videos Run on a Chinese Model",
  renderer: "remotion",
  createdAt: "2026-11-22",
  // Measured from content/suno-visuals/assets/ on 2026-11-22:
  // 3 motion clips (7.3s + 10s + 10s counted), 4 usable stills.
  // Hook uses the official Suno Visuals hero clip as evidence media.
  videoFit: 5,
  videoFitFormat: "demo-led",
  videoFitHook:
    "Official Suno Visuals hero clip at 0s, then H3 and MiniMax text overlays by 1s.",
  videoFitEvidence:
    "assets/hero.mp4 7.3s + assets/showcase-pink-fluff.mp4 10.0 counted seconds + assets/showcase-sphere-girl.mp4 10.0 counted seconds = 27.3 counted seconds; stills: feature-vision-1778.jpg, feature-edit-1778.jpg, feature-share-1778.jpg, hero.jpg; hook is hero.mp4 with mediaRole evidence.",
  storySpine: {
    phenomenon:
      "Suno launched Visuals, a paid visual creation product that turns tracks into lip-sync clips, lyric videos and longer visual sequences. Suno's own FAQ says the model is H3 Move, based on MiniMax H3, which Suno optimized for music with extra protections and safeguards.",
    caveat:
      "Suno has not disclosed the commercial terms of the MiniMax relationship. H3 Move is a Suno-tuned model, not raw H3, and MiniMax's open release leaves the H3-Context-IR preprocessing system hosted rather than open.",
    storyType: "phenomenon",
  },
  topics: [
    "china-ai",
    "suno",
    "visuals",
    "minimax",
    "h3",
    "music-video",
    "open-source",
  ],
  keyEntities: {
    companies: ["suno", "minimax"],
    people: ["jack-brody"],
    models: ["h3", "h3-move"],
  },
  dataPoints: [
    "Suno official FAQ, 2026-11-22: 'The model is called H3 Move, based on H3 from MiniMax, which we optimized for our community including adding additional protections and safeguards.'",
    "Suno official Visuals page, 2026-11-22: users can make lip sync videos and lyric videos, edit on a timeline, and choose clip duration and aspect ratio for sharing.",
    "QbitAI, 2026-11-20: Suno Visuals generates clips up to 15 seconds, supports singing lip sync, lyric videos and album covers, uses separate Visual credits, and adds a watermark before sharing.",
    "QbitAI, 2026-11-20: Suno says more than 100 million people have used the platform to create music.",
    "MiniMax official, 2026-08-03: H3 is open source, supports 2K output and 4 to 15 second clips, 32 kHz stereo audio, and 11 stable dialogue languages.",
    "MiniMax official, 2026-08-03: the open-source release does not include H3-Context-IR, the hosted multimodal preprocessing system.",
  ],
  hashtags: ["#suno", "#sunoai", "#minimax", "#chinaai", "#ainews"],
};
