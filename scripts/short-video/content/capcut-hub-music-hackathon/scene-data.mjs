// CapCut Hub AI x music visual hackathon, Beijing, 2026-11-20/21.
// Angle: the stage is the proof. Real bands, real deadline, real 4K screen.
// Facts checked against QbitAI (2026-11-21) and the official Douyin event page.

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "media-led",
    hookFamily: "result-first",
    narrativeRole: "S",
    arcRole: "establisher",
    retentionMechanism: null,
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/capcut-stage.jpg",
      source: "QbitAI event photo: Sis & Fan band on the CapCut hackathon stage",
      fit: "contain",
      upscale: "resample",
      animation: "none",
    },
    voiceover:
      "CapCut gave twenty AI creators a real band and three hours. Their visuals went live that night.",
    texts: {
      subject: "AI MUSIC VISUAL",
      bigNumber: "3 HRS",
    },
  },
  {
    id: 2,
    name: "setup",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "T",
    arcRole: "initial",
    retentionMechanism: "open-loop",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/capcut-group.jpg",
      source: "WaytoAGI / ACE-CON event photo: CapCut hackathon group shot",
      fit: "contain",
      upscale: "resample",
      animation: "none",
      overlay: 0.38,
    },
    voiceover:
      "QbitAI reported it was the first AI music visual hackathon, held in Beijing on November 20 and 21.",
    texts: {
      company: "BEIJING",
      action: "NOV 20-21",
      result: "20+ CREATOR TEAMS",
      source: "CAPCUT / QBITAI",
    },
  },
  {
    id: 3,
    name: "method",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "A",
    arcRole: "initial",
    retentionMechanism: null,
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/capcut-work.jpg",
      source: "QbitAI event photo: creators working on CapCut Hub at the hackathon",
      fit: "contain",
      upscale: "resample",
      animation: "none",
      overlay: 0.3,
    },
    voiceover:
      "Teams used CapCut Hub to generate images, cut to the track, and export 4K visuals sized for the stage screen.",
    texts: {
      company: "CAPCUT HUB",
      action: "IDEA TO CUT",
      result: "4K OUTPUT",
      source: "CAPCUT / QBITAI",
    },
  },
  {
    id: 4,
    name: "winners",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "A",
    arcRole: "peak",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "video",
      path: "assets/capcut-winner-demo-with-audio.mp4",
      source: "Award-winning hackathon work: Was I You, Were You Me (Douyin, 2026-11-22)",
      fit: "contain",
      upscale: "resample",
      animation: "none",
      volume: 1,
    },
    voiceover:
      "QbitAI named four winners: Xu Heng, Rudy, Shibuya Gal and Oli666. Some work looked like a shot music video.",
    texts: {
      company: "FOUR TRACKS",
      action: "GUOFENG · ROCK",
      result: "4 WINNING TEAMS",
      source: "QBITAI · NOV 21",
    },
  },
  {
    id: 5,
    name: "real-barrier",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "R",
    arcRole: "initial",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/capcut-roundtable.jpg",
      source: "QbitAI event photo: live band on the CapCut hackathon stage",
      fit: "contain",
      upscale: "resample",
      animation: "none",
      overlay: 0.35,
    },
    voiceover:
      "The tool is fast, but the roundtable said the hard part is still timing the cut to the music and keeping one story.",
    texts: {
      company: "THE REAL BARRIER",
      action: "MUSIC SYNC",
      result: "STORY + TASTE",
      source: "QBITAI ROUNDTABLE",
    },
  },
  {
    id: 6,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    arcRole: "release",
    retentionMechanism: "loop-closure",
    media: null,
    voiceover:
      "A three-hour hackathon put AI visuals on a live stage. Follow China AI News for more.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "CAPCUT · AI MUSIC VISUAL HACKATHON",
    },
  },
];

export const metadata = {
  title: "CapCut Put AI Music Videos on a Live Stage in Three Hours",
  description:
    "CapCut Hub and WaytoAGI / ACE-CON ran the first AI x music visual hackathon in Beijing on November 20 and 21. More than 20 creator teams had a few hours to build music videos and live stage visuals for real bands; some work ran on the main stage that night. CapCut Hub supports 4K output for the stage screen. The roundtable said music sync, story and human taste are still the hard parts.",
  commentHook:
    "A real band, a giant screen, and three hours. Would you trust an AI-made visual in front of a live audience?",
  trendingChecked: true,
  sources: [
    "http://news.qq.com/rain/a/20261121A0E0R900?adChannelId=fx",
    "https://www.iesdouyin.com/share/video/7709756390273634725",
    "https://www.capcut.cn/",
  ],
};
