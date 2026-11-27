export const meta = {
  article: "magi-2-sand-ai",
  subject: "sandai",
  pipelineId: "magi-2-sand-ai",
  title: "MAGI-2: 30 Seconds of 1080p Video for $2.25",
  renderer: "remotion",
  audio: {
    mode: "voice-only",
    reason: "No BGM by user preference; MAGI-2 demo source audio is preserved",
  },
  createdAt: "2026-11-26",
  // Measured from content/magi-2-sand-ai/assets/ on 2026-11-26:
  // 4 official MAGI-2 demo clips (16:9), 1920x1080. Hook is a real motion clip.
  videoFit: 5,
  videoFitFormat: "demo-led",
  assetReady: 1,
  videoFitHook:
    "Official MAGI-2 five-art-style clip at frame one: a hand turns a Paris street into brushstrokes.",
  videoFitEvidence:
    "assets/magi-art-transition.mp4 1920x1080 25fps 6s official five-art-style demo; assets/magi-flower-world.mp4 1920x1080 30fps 6s official multi-reference demo; assets/magi-waterlilies.mp4 1920x1080 25fps 6s official five-art-style demo; assets/magi-timeline.mp4 1920x1080 25fps 6s official timeline-control demo; assets/magi-boat-dialogue.mp4 1260x720 25fps 6s official dialogue demo; assets/magi-art-still.jpg 1920x1080 official still; assets/magi-flower-still.jpg 1920x1080 official still; assets/magi-waterlilies-still.jpg 1920x1080 official still; assets/magi-boat-still.jpg 1260x720 official still",
  storySpine: {
    phenomenon:
      "Sand.ai released MAGI-2, a 480B-parameter video model with about 28B active parameters and 4T pre-training tokens. It generates up to 30 seconds of 1080p, 25fps native audio-video, supports up to 20 image, video and audio references, and reached a four-task average Elo of 1150.3 on Artificial Analysis Video Arena v2.1. Shanghai Securities News reported a price of 0.5 yuan per second, or 15 yuan for 30 seconds.",
    caveat:
      "The 0.5 yuan per second price is reported by Shanghai Securities News, not an official price sheet. Open-source weights are promised but not shipped. Sand.ai itself lists high-speed motion artifacts, soft 2D animation motion and limited soundscape layering as remaining weaknesses.",
    storyType: "model-launch",
  },
  topics: ["china-ai", "video-generation", "magi-2", "sand-ai", "multimodal", "open-source"],
  keyEntities: {
    companies: ["sandai"],
    people: [],
    models: ["magi-2"],
  },
  dataPoints: [
    "Sand.ai official blog, 2026-11-24: MAGI-2 has 480B total parameters, about 28B active parameters, and 4T pre-training tokens.",
    "Sand.ai official blog: MAGI-2 generates up to 30 seconds of 1080p, 25fps native audio-video and supports up to 20 image, video and audio references.",
    "Sand.ai official blog: four-task average Elo on Artificial Analysis Video Arena v2.1 is 1150.3, up 151.8 points from MAGI-2 Preview.",
    "Shanghai Securities News, 2026-11-25: MAGI-2 is priced at 0.5 yuan per second, so a 30-second 1080p clip costs 15 yuan.",
    "Shanghai Securities News: MAGI-2 has been adapted to Hygon and Moore Threads chips.",
    "Sand.ai official blog: MAGI-2 weights and a technical report will be released soon.",
    "Sand.ai official blog: limitations include high-speed motion artifacts, overly smooth 2D animation, and limited soundscape layering.",
  ],
  hashtags: ["#chinaai", "#sandai", "#magi", "#aivideo", "#llm"],
};
