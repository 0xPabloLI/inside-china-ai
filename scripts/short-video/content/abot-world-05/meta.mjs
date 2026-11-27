export const meta = {
  article: "abot-world-05",
  subject: "abot",
  pipelineId: "abot-world-05",
  title: "Amap's ABot-World Turns One Photo Into a Drivable World",
  renderer: "remotion",
  audio: {
    mode: "voice-only",
    reason: "No BGM by user preference; the official launch film audio is not used",
  },
  createdAt: "2026-11-26",
  // Measured from content/abot-world-05/assets/ on 2026-11-26:
  // 6 official 6s demo clips, 720p/768p/1080p, plus 4 official-frame stills.
  videoFit: 5,
  videoFitFormat: "demo-led",
  assetReady: 1,
  videoFitHook:
    "Official launch film at frame one: a camera flies through a Great Wall valley that was generated from a single image.",
  videoFitEvidence:
    "assets/abot-greatwall.mp4 6s official launch film; assets/abot-camel.mp4 6s official launch film; assets/abot-speedup.mp4 6s official launch film; assets/abot-shanghai.mp4 6s official launch film; assets/abot-laundry.mp4 6s official embodied demo; assets/abot-fire.mp4 6s official Incendio demo; assets/abot-greatwall-still.jpg official still; assets/abot-laundry-still.jpg official still; assets/abot-fire-still.jpg official still; assets/abot-shanghai-still.jpg official still",
  storySpine: {
    phenomenon:
      "Amap's computer-vision lab launched ABot-World 0.5, a world model that turns one image into a navigable world. Its site lists 120+ worlds and 3,800 hours of total roaming, with under 1.5 seconds of render latency. Iris-5B runs on a single desktop GPU at 21 FPS on an RTX 5090; Halo-30B streams audio and video from the cloud at 24 FPS, 480p on one B200 and 720p on four. QuantumBit reported ABot-World 0.5 first on WBench physical consistency and total score.",
    caveat:
      "1.5 seconds is render latency per frame, not proof that every world is a playable game. The launch film is a curated cut, the 120+ worlds vary in quality, and Halo needs cloud-grade GPU capacity.",
    storyType: "product-launch",
  },
  topics: ["china-ai", "world-model", "abot", "amap", "embodied-ai", "video-generation"],
  keyEntities: {
    companies: ["amap"],
    people: [],
    models: ["abot-world", "iris", "halo"],
  },
  dataPoints: [
    "ABot-World official site, 2026-11: 120+ worlds, 3,800 hours of total roaming, under 1.5 seconds render latency.",
    "GitHub README: Iris-5B runs real time on a single desktop GPU; 21 FPS on RTX 5090; Halo-30B streams audio-video from the cloud at 24 FPS, 480p on one B200, 720p on four.",
    "QuantumBit, 2026-11-24: ABot-World 0.5 ranks first on WBench physical consistency and total score; Halo average 84.8, physical 74.2.",
    "QuantumBit: Physical Score rises from 32.43 to 68.07 on Iris and from 41.50 to 84.32 on Halo.",
    "GitHub README: FantasyDecoder delivers 8.26x speedup, +0.79 dB PSNR and 13.9% less flicker.",
    "Official launch film: 145 seconds, 720p, a curated montage across Great Wall, camel, Shanghai and UI-grid scenes.",
  ],
  hashtags: ["#chinaai", "#abot", "#amap", "#worldmodel", "#embodiedai"],
};
