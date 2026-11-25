// RunningHub global AIGC long-form film contest, awards in Chengdu, 2026-11-14/15.
// Angle: the entry count is the story. AI films are getting long, and money is
// moving from demo clips to feature development. A prize is not a release date.

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
      path: "assets/runninghub-stage.jpg",
      source: "RunningHub awards stage photo, Chengdu, 2026-11-14/15",
      fit: "contain",
      upscale: "resample",
      animation: "none",
    },
    voiceover:
      "RunningHub's AI film contest drew more than fifteen hundred entries, including twenty films longer than an hour.",
    texts: {
      subject: "AIGC FILM CONTEST",
      bigNumber: "1,500+",
    },
  },
  {
    id: 2,
    name: "context",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "T",
    arcRole: "initial",
    retentionMechanism: "open-loop",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "image",
      path: "assets/runninghub-awards.jpg",
      source: "RunningHub awards ceremony photo, Chengdu, 2026-11-14/15",
      fit: "cover",
      mode: "card",
      upscale: "resample",
      animation: "none",
      overlay: 0.35,
    },
    voiceover:
      "It partnered with the Chinese Nebula Awards, took more than two months, and handed out awards in Chengdu on November 14 and 15.",
    texts: {
      company: "RUNNINGHUB",
      action: "NEBULA AWARDS",
      result: "CHENGDU · NOV 14-15",
      source: "RUNNINGHUB OFFICIAL",
    },
  },
  {
    id: 3,
    name: "funnel",
    visualType: "data",
    layout: "chart",
    narrativeRole: "A",
    arcRole: "initial",
    retentionMechanism: null,
    media: null,
    voiceover:
      "More than fifteen hundred entries. One hundred sixteen finalists. Fifteen winners.",
    texts: {
      label: "FROM ENTRY TO AWARD",
      subtext: "CHINA AI · 1,500+ → 116 → 15 · RUNNINGHUB / 36KR",
    },
    info: {
      relationship: "magnitude",
      chart: "bar",
      data: [
        { label: "ENTRIES", value: 1500 },
        { label: "FINALISTS", value: 116 },
        { label: "WINNERS", value: 15 },
      ],
      unit: "works",
      baseline: 0,
      sort: "desc",
      highlight: "ENTRIES",
      decimals: 0,
    },
  },
  {
    id: 4,
    name: "long-form",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "A",
    arcRole: "peak",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    mediaRole: "evidence",
    media: {
      type: "video",
      path: "assets/runninghub-trailer-with-audio.mp4",
      source: "RunningHub contest entry trailer: Ni Ti Zai Lai (Douyin)",
      fit: "contain",
      upscale: "resample",
      animation: "none",
      volume: 1,
    },
    voiceover:
      "Chinese tech media reported that more than eighty percent of entries were films or long series. Twenty ran past sixty minutes.",
    texts: {
      company: "80%",
      action: "FILM + LONG SERIES",
      result: "20 FILMS >60 MIN",
      source: "RUNNINGHUB / 36KR",
    },
  },
  {
    id: 5,
    name: "industry-plan",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "A",
    arcRole: "initial",
    retentionMechanism: "open-loop",
    media: null,
    voiceover:
      "RunningHub also launched a film plan: nine figures of yuan in cash and unlimited compute for ten feature films.",
    texts: {
      badge: "THE NEXT STEP",
      company: "PIANCHANG PLAN",
      action: "NINE-FIGURE CASH",
      context: "UNLIMITED COMPUTE",
      result: "10 FEATURE FILMS",
      source: "RUNNINGHUB / 36KR",
    },
  },
  {
    id: 6,
    name: "caveat",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "R",
    arcRole: "initial",
    retentionMechanism: "loop-closure",
    media: null,
    voiceover:
      "Dumu reported the grand prize film has started feature development. A prize is not a release date.",
    texts: {
      badge: "THE CAVEAT",
      company: "GRAND PRIZE FILM",
      action: "FEATURE DEVELOPMENT",
      context: "NO RELEASE DEAL",
      result: "DISTRIBUTION NEXT",
      source: "DUMU / 36KR",
    },
  },
  {
    id: 7,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    arcRole: "release",
    retentionMechanism: "loop-closure",
    media: null,
    voiceover:
      "AI can now finish a sixty-minute film. The cinema is the next test. Follow China AI News.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "RUNNINGHUB · AIGC FILM CONTEST",
    },
  },
];

export const metadata = {
  title: "1,500 AI Films Entered. Twenty Ran Longer Than an Hour.",
  description:
    "RunningHub, a Chinese AIGC platform run by Anhui Haima Cloud Intelligent Technology, closed a global AI long-form film contest with 1,500+ entries. 116 finalists and 15 winners shared a 5.5 million yuan pool; 20 entries ran longer than 60 minutes. The company also launched a film plan with nine-figure cash and unlimited compute for 10 feature films. One winning film has started feature development, but a prize is not a theatrical release.",
  commentHook:
    "1,500 AI films entered, and 20 ran longer than an hour. Would you watch a 60-minute AI film in a theater?",
  trendingChecked: true,
  sources: [
    "https://pre.runninghub.cn/inspire",
    "https://36kr.com/newsflashes/3974536043507975",
    "http://m.toutiao.com/group/7710172971167531558/",
  ],
};
