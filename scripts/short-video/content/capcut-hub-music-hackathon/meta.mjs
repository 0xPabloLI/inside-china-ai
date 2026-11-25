export const meta = {
  article: "capcut-hub-music-hackathon",
  subject: "capcut",
  pipelineId: "capcut-hub-music-hackathon",
  title: "CapCut Put AI Music Videos on a Live Stage in Three Hours",
  renderer: "remotion",
  createdAt: "2026-11-23",
  // Measured from content/capcut-hub-music-hackathon/assets/ on 2026-11-23:
  // 5 usable stills plus the 8s award-winning demo (1080x1920).
  videoFit: 3,
  videoFitFormat: "demo-led",
  demoRequired: true,
  demoCuts: {
    4: {
      source: "scripts/short-video/output/external-demos/capcut-wasiyou-full-with-audio.mp4",
      sourceDurationSec: 292.79,
      startSec: 34,
      endSec: 42,
      why: "34–42s 是整幅树与文字排版的稳定镜头，原声完整；0–8s 只是片头虚影与灰雾，不能当作品 Demo。",
      audio: "source",
      derivedAsset: "assets/capcut-winner-demo-with-audio.mp4",
    },
  },
  assetReady: 1,
  videoFitHook:
    "A real band playing in front of a giant AI-made stage screen, with 3 HOURS / 20+ CREATORS on frame one.",
  videoFitEvidence:
    "assets/capcut-stage.jpg 1080x656; assets/capcut-group.jpg 1440x960; assets/capcut-work.jpg 1080x598; assets/capcut-kawa.jpg 1080x704; assets/capcut-roundtable.jpg 1080x656; assets/capcut-winner-demo.mp4 1080x1920 8s (award-winning Was I You, Were You Me). Hook is the live stage still; the demo carries the payoff scene.",
  storySpine: {
    phenomenon:
      "CapCut Hub and WaytoAGI / ACE-CON ran the first AI x music visual hackathon in Beijing on November 20 and 21. More than 20 creator teams had a few hours to build music videos and live stage visuals for real bands; some work ran on the main stage that night.",
    caveat:
      "The event proves a production path, not a finished art form. The roundtable said the hard parts remain music sync, a coherent story and human taste; the tool only removes the technical barrier.",
    storyType: "event",
  },
  topics: [
    "china-ai",
    "capcut",
    "jianying",
    "ai-music-video",
    "hackathon",
    "live-visuals",
  ],
  keyEntities: {
    companies: ["capcut", "waytoagi", "ace-con"],
    people: [],
    models: ["seedance-2-5"],
  },
  dataPoints: [
    "QbitAI, 2026-11-21: CapCut ran an AI x music visual hackathon with real bands and real songs; creators used CapCut Hub to make MV and live stage visuals in a few hours.",
    "QbitAI: the event had more than 20 creator teams across four tracks: guofeng, sensory sound, Mandopop and rock.",
    "QbitAI: the four track winners were Xu Heng's team, Rudy, Shibuya Gal and Oli666.",
    "QbitAI: CapCut Hub supports 4K output, enough for the event's main stage screen.",
    "QbitAI: the roundtable included WaytoAGI founder AJ, White Paper band vocalist Liu Jiahui, Berlin Story guitarist OD and Communication University of China professor Ai Shengying; they said music sync, story and taste still matter most.",
    "Official Douyin event page: the event ran November 20-21 at the Beijing National Convention Center; WaytoAGI and ACE-CON co-founded it, CapCut Hub was the exclusive tool.",
  ],
  hashtags: ["#chinaai", "#capcut", "#jianying", "#aimusicvideo", "#hackathon"],
};
