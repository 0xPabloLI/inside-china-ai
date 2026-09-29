/**
 * Scene data for the DeepSeek Harness desktop launch.
 * 10 scenes, ~63s. Sources: DeepSeek Harness team announcement (WeChat,
 * Sept 29, 2026 20:04 CST), deepseek.com/harness, GitHub release tags
 * dsh-v0.1.7-rc.1 .. dsh-v0.2.0-rc.2, 36Kr / Sina Finance / iFeng leak
 * coverage (Sept 24-25), Datawhale hands-on (Sept 29).
 *
 * Narrative type: Breaking News (fact shock -> background -> impact -> next)
 * Hook pattern: P2 Contradiction, claim-led (hookText + revealText). Rotation:
 * the three previous packages (deepseek-huawei-cluster, vidu-s2-ai-streamer,
 * ant-lingbot-world-13b) all opened number-led P1.
 *
 * Media: every screenshot is first-party (DeepSeek's own announcement page and
 * WeChat post), hand-bound here so the run does not spend remote GPU time
 * searching for product shots that are already in hand.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    narrativeRole: "S",
    retentionMechanism: null,
    layout: "hero-center",
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/wx06-official-download-page.png",
      source: "DeepSeek Harness team announcement, Sept 29, 2026",
      animation: "ken-burns",
      overlay: 0.85,
      upscale: false,
    },
    voiceover: "DeepSeek's desktop app leaked five days before it went official.",
    texts: {
      badge: "LEAKED",
      subject: "DEEPSEEK",
      bigNumber: "5",
      numberLabel: "DAYS FROM LEAK TO LAUNCH",
      stats: [
        { num: "v0.2", unit: "", label: "HARNESS DESKTOP" },
        { num: "6 YUAN", unit: "", label: "FREE CREDIT" },
      ],
      source: "SOURCE: DeepSeek Harness team, Sept 29, 2026",
    },
  },
  {
    id: 2,
    name: "open-loop",
    visualType: "narrative",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    layout: "media-overlay",
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/wx00-official-site.png",
      source: "DeepSeek Harness team announcement, Sept 29, 2026",
      animation: "zoom",
      overlay: 0.82,
      upscale: false,
    },
    voiceover:
      "The installer works today. The bigger question: can a Chinese AI lab ship consumer software?",
    texts: {
      badge: "OPEN QUESTION",
      company: "DEEPSEEK GOES TO SOFTWARE",
      action: "MAC AND WINDOWS, NO TERMINAL",
      result: "CHINA AI, NOW AN APP",
      context: "v0.2 preview, MIT licensed, open source",
      source: "SOURCE: deepseek.com/harness, Sept 29, 2026",
    },
  },
  {
    id: 3,
    name: "what-shipped",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: null,
    layout: "media-overlay",
    mediaStrategy: "asset",
    media: {
      type: "video",
      path: "assets/wx01-demo-office.mp4",
      source: "DeepSeek Harness team announcement, Sept 29, 2026",
      animation: "fade",
      overlay: 0.82,
      volume: 0,
      upscale: false,
    },
    voiceover:
      "DeepSeek's own team announced it Tuesday night: macOS and Windows installers, no Node, no terminal.",
    texts: {
      badge: "WHAT SHIPPED",
      company: "DEEPSEEK HARNESS V0.2",
      action: "INSTALLERS, FIRST-RUN GUIDE",
      result: "NO TERMINAL NEEDED",
      context: "Plugins install by npm package name",
      source: "SOURCE: DeepSeek Harness team, Sept 29, 2026",
    },
  },
  {
    id: 4,
    name: "architecture",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: null,
    layout: "media-overlay",
    mediaStrategy: "asset",
    media: {
      type: "video",
      path: "assets/off-demo-d.mp4",
      source: "DeepSeek Harness team announcement, Sept 29, 2026",
      animation: "fade",
      overlay: 0.85,
      volume: 0,
      upscale: false,
    },
    voiceover:
      "Every capability arrives as a plugin, and the client is MIT open source. Official telemetry: 60 percent run third-party plugins.",
    texts: {
      badge: "ARCHITECTURE",
      company: "EVERYTHING IS A PLUGIN",
      action: "BUILT ON CORDIS, MIT LICENSED",
      result: "60% RUN PLUGINS",
      context: "Official API user base, DeepSeek's own count",
      source: "SOURCE: DeepSeek announcement, Sept 2026",
    },
  },
  {
    id: 5,
    name: "pattern-interrupt",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    media: null,
    voiceover: "It writes its own plugins.",
    texts: {
      badge: "SELF-EXTENDING",
      company: "CREATOR MODE",
      action: "DESCRIBE IT, GET IT",
      result: "EXPERIMENTAL",
      context: "New plugins land in the manager like installed ones",
      source: "SOURCE: DeepSeek Harness team, Sept 29, 2026",
    },
  },
  {
    id: 6,
    name: "creator-demo",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: null,
    layout: "media-overlay",
    mediaStrategy: "asset",
    media: {
      type: "video",
      path: "assets/wx02-demo-plugin.mp4",
      source: "DeepSeek Harness team announcement, Sept 29, 2026",
      animation: "fade",
      overlay: 0.85,
      volume: 0,
      upscale: false,
    },
    voiceover:
      "A timer plugin from one prompt, according to DeepSeek's own demo. 5 minutes 24 seconds.",
    voiceoverTts:
      "A timer plugin from one prompt, according to DeepSeek's own demo. 5 minutes 24 seconds.",
    texts: {
      badge: "THE DEMO",
      company: "RUN TRACE, STEP BY STEP",
      action: "SKILL, TWO FILES, INSTALL, CHECK",
      result: "5 MIN 24 SEC",
      context: "Timer plugin built from one prompt",
      source: "SOURCE: deepseek.com/harness demo",
    },
  },
  {
    id: 7,
    name: "roadmap",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: null,
    layout: "media-overlay",
    mediaStrategy: "asset",
    media: {
      type: "video",
      path: "assets/off-demo-c.mp4",
      source: "DeepSeek Harness team announcement, Sept 29, 2026",
      animation: "fade",
      overlay: 0.82,
      volume: 0,
      upscale: false,
    },
    voiceover:
      "Scheduled tasks ship as a plugin. The roadmap: browser control, desktop app automation, better agent teams, long-term memory, mobile.",
    texts: {
      badge: "NEXT UP",
      company: "AUTOMATION AND ROADMAP",
      action: "TASKS ON A SCHEDULE",
      result: "GUI CONTROL IS COMING",
      context: "Agent teams already live, marked Beta",
      source: "SOURCE: DeepSeek announcement, Sept 29, 2026",
    },
  },
  {
    id: 8,
    name: "peak",
    visualType: "stat-reveal",
    narrativeRole: "R",
    retentionMechanism: null,
    layout: "hero-center",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "Six yuan of free credit. DeepSeek says that is about 120 million input tokens.",
    texts: {
      bigNumber: "120M",
      label: "CACHED INPUT TOKENS",
      subtext: "6 yuan credit, off-peak V4.1 Flash pricing",
      source: "SOURCE: DeepSeek announcement footnote, Sept 2026",
    },
  },
  {
    id: 9,
    name: "loop-closure",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: "loop-closure",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "Five days from a leaked build to a signed installer. China's lab now ships software.",
    texts: {
      badge: "SEP 24 TO SEP 29",
      company: "LEAK: SIGNED, UNLISTED",
      context: "36Kr, Sina and iFeng ran it first",
      action: "OFFICIAL: V0.2 PLUS INSTALLERS",
      result: "CHINA AI GOES APP",
      source: "CHINA AI NEWS ANALYSIS",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    narrativeRole: "T-Tell",
    retentionMechanism: "loop-closure",
    layout: "hero-center",
    mediaStrategy: "asset",
    voiceover: "DeepSeek leaked it, then launched it five days later. Follow for more China AI news.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "DEEPSEEK'S SOFTWARE PUSH",
    },
  },
];

export const metadata = {
  title: "DeepSeek AI Desktop App Leaked 5 Days Early",
  description: `DeepSeek's desktop app was sitting on its own download server on Sept 24, with no announcement. On Sept 29 the DeepSeek Harness team made it official: v0.2 preview, macOS and Windows installers, no Node, no terminal.

Inside the app: a plugin manager that installs by npm package name, scheduled tasks, and an experimental creator mode that writes plugins from a prompt. In DeepSeek's own demo it built a Pomodoro timer plugin in 5 minutes 24 seconds. The client is MIT licensed and open source, built on the Cordis everything-is-a-plugin design, and DeepSeek says about 60 percent of its official API users already run a third-party plugin.

The catch: it runs on account credit. DeepSeek is giving eligible users 6 yuan (about $0.89), which it estimates covers roughly 120 million cache-hit input tokens at off-peak V4.1 Flash prices. 36Kr's testers also found a funded account and real-name verification at the door.

Roadmap: better sandboxing, agent teams, personalized long-term memory, browser and desktop GUI automation, mobile access, session sharing. And DeepSeek says it will optimize model training for how its models behave inside this app.

Which China AI lab ships software like this next? Tell me in the comments.
Full article in the pinned comment.`,
  commentHook:
    "DeepSeek is now shipping desktop software, not just models. Would you use a Chinese coding agent as your daily driver, or keep it to the API? What's your call?",
  articleUrl: "https://chinaainews.com/posts/deepseek-harness-desktop",
  trendingChecked: true,
  trendingHashtags: [],
};
