export const meta = {
  article: "runninghub-aigc-film-awards",
  subject: "runninghub",
  pipelineId: "runninghub-aigc-film-awards",
  title: "1,500 AI Films Entered. Twenty Ran Longer Than an Hour.",
  renderer: "remotion",
  createdAt: "2026-11-23",
  // Measured from content/runninghub-aigc-film-awards/assets/ on 2026-11-23:
  // 4 usable stills plus an 8s contest trailer (1920x1080).
  videoFit: 3,
  videoFitFormat: "data-reveal",
  demoRequired: true,
  demoCuts: {
    4: {
      source: "scripts/short-video/output/external-demos/runninghub-trailer-full-with-audio.mp4",
      sourceDurationSec: 119.97,
      startSec: 20,
      endSec: 28,
      why: "0–10s 是静音日历定格，20–28s 才进入人物与对白，是真正的参赛预告片镜头。",
      audio: "source",
      derivedAsset: "assets/runninghub-trailer-with-audio.mp4",
    },
  },
  assetReady: 1,
  videoFitHook:
    "Awards-stage still with 1,500+ / 20 FILMS OVER 60 MIN / ¥5.5M PRIZE POOL at frame one.",
  videoFitEvidence:
    "assets/runninghub-stage.jpg 1080x538; assets/runninghub-awards.jpg 660x441; assets/runninghub-stats.jpg 960x538; assets/runninghub-grid.jpg 800x367; assets/runninghub-key-visual.jpg 780x334 (below inventory height floor); assets/runninghub-trailer.mp4 1920x1080 8s (contest entry trailer). Hook uses the awards stage; the trailer carries the long-form payoff.",
  storySpine: {
    phenomenon:
      "RunningHub, a Chinese AIGC platform run by Anhui Haima Cloud Intelligent Technology, closed a global AI long-form film contest with 1,500+ entries. 116 finalists and 15 winners shared a 5.5 million yuan pool; 20 entries ran longer than 60 minutes.",
    caveat:
      "A prize is not a theatrical release. One winning film has started feature development, but distribution, audience and a sustainable budget model are still unproven.",
    storyType: "event",
  },
  topics: [
    "china-ai",
    "runninghub",
    "aigc-film",
    "ai-video",
    "film-production",
    "long-form",
  ],
  keyEntities: {
    companies: ["runninghub", "haima-cloud", "nebula-awards"],
    people: ["liu-cixin", "chen-qiufan"],
    models: [],
  },
  dataPoints: [
    "RunningHub official event page: the global AIGC long-form creation contest ran from September 8 to November 15, 2026, with awards at the Chengdu Science Fiction Museum on November 14-15.",
    "36Kr, 2026-11-17: 1,500+ works entered; film and long-series entries were over 80%; 20 works ran longer than 60 minutes; 116 finalists; 15 grand prizes.",
    "36Kr: total prize pool 5.5 million yuan, split into 3.5 million cash and 2 million compute; the grand prize was 1 million cash plus 300,000 compute.",
    "RunningHub official page: Liu Cixin is an advisor; judges include Chen Qiufan, Dong Renwei, Feng Yingqian, Lao Bo, Yang Yufei and Zhao Enzhe.",
    "RunningHub official page: the contest partnered with the Chinese Nebula Awards and opened 10 unadapted science-fiction IPs.",
    "36Kr / Dumu: RunningHub launched the Pianchang Plan with nine-figure cash and unlimited compute, targeting 10 theatrical films, 100 premium IP series and 5 film-game crossovers.",
    "Dumu: the grand prize film Empty City has started formal feature development; Best Film winner Bronze Guardian screened at a TK industry event in Los Angeles.",
    "RunningHub service agreement: RunningHub is provided by Anhui Haima Cloud Intelligent Technology Co., Ltd., a Chinese company.",
  ],
  hashtags: ["#chinaai", "#runninghub", "#aigc", "#aifilm", "#nebulaawards"],
};
