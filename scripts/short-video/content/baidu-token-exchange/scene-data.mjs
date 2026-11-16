/**
 * Scene definitions for "Baidu Opens a Token Exchange"
 * Single video, TikTok, content-driven length (~45s)
 *
 * Narrative type: Data reveal / breaking (fact -> mechanism -> caveat -> read across)
 * Hook formula: P1 Result-First (volume number lead)
 * Hook family: result-first (#1289) — 700B a day is a real volume, not a nameplate.
 * A/B arm A: content/baidu-token-market is the same body with a claim-led opening.
 * Sources: unwire.pro (2026-11-12, verified), cysuo.com, datacube_ai (2026-11-11)
 *
 * NOTE: every rendered string lives in `texts`. Templates carry no business copy.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    hookFamily: "result-first",
    voiceover: "Baidu just opened an exchange for AI tokens. 700 billion a day, 100 suppliers.",
    media: null,
    texts: {
      badge: "BAIDU WORLD 2026",
      subject: "TOKEN EXCHANGE",
      bigNumber: "700B",
      numberLabel: "TOKENS PER DAY",
      source: "BAIDU'S OWN FIGURES, NOV 12",
      color: "amber",
    },
  },
  {
    id: 2,
    name: "launch",
    visualType: "context",
    layout: "flow",
    voiceover: "Li Yanhong unveiled it on November 12. He calls it a token exchange.",
    texts: {
      title: "BAIDU WORLD 2026",
      context: "LI YANHONG LAUNCHED IT",
      badge: "NOV 12",
      detail: "CIYUANSUO TOKEN EXCHANGE",
    },
    // #1296: the launch is the one scene with a real, photographable moment.
    assetNeed: "Baidu World 2026 keynote stage with Li Yanhong on screen",
    searchHints: ["baidu world 2026 stage", "li yanhong baidu keynote"],
    aiImage: {
      prompt:
        "A vast conference keynote stage seen from the audience: one speaker silhouetted small against a wall-sized LED screen glowing deep blue, rows of seated attendees in the foreground, stage haze catching amber side light, cinematic wide shot, no readable text on the screen.",
    },
  },
  {
    id: 3,
    name: "mechanism",
    visualType: "context",
    layout: "flow",
    voiceover: "The idea is simple. One model, many suppliers, listed side by side.",
    texts: {
      title: "ONE MODEL",
      context: "MANY SUPPLIERS",
      badge: "CHINA AI MARKET",
      detail: "SAME WEIGHTS, NEW VENDOR",
    },
    // #1296: the mechanism has no photo — one model served from many vendors.
    assetNeed: "identical server racks in a data centre aisle, different vendor plates",
    searchHints: ["server rack aisle", "data centre servers rows"],
    aiImage: {
      prompt:
        "A symmetrical data-centre aisle of identical black server racks receding into depth, each rack front carrying a small different coloured identity plate, cool blue rack lighting with one warm amber highlight at the far end, low eye-level wide angle, shallow atmospheric haze, no logos.",
    },
  },
  {
    id: 4,
    name: "listing",
    visualType: "narrative",
    layout: "stacked-cards",
    voiceover:
      "Every listing shows price, latency, and seven day success rate. One key switches suppliers.",
    texts: {
      company: "SAME MODEL",
      context: "MANY PROVIDERS",
      action: "COMPARE PRICE",
      result: "COMPARE SUCCESS RATE",
      source: "SOURCE: CYSUO.COM",
    },
  },
  {
    id: 5,
    name: "trust",
    visualType: "context",
    layout: "flow",
    voiceover:
      "Baidu said resellers never prove which model answered. Its answer is fingerprinting and a credit score.",
    texts: {
      title: "VERIFY AND RATE",
      context: "FINGERPRINT, SPOT CHECKS",
      badge: "TRUST LAYER",
      detail: "SUPPLIER CREDIT SCORE",
    },
    // #1296: this scene is the trust layer (fingerprinting + credit score), not
    // the launch — the stage assetNeed it used to carry belonged to Scene 2.
    assetNeed: "fingerprint scan glowing over a server rack, verification interface",
    searchHints: ["fingerprint scanner closeup", "biometric verification screen"],
    aiImage: {
      prompt:
        "Close view of a black server rack with a large glowing amber fingerprint ridge pattern projected across its front panel, thin cyan scan lines sweeping over the metal, dark room, macro detail on brushed steel and dust, high contrast, no interface text.",
    },
  },
  {
    id: 6,
    name: "scale",
    visualType: "stat-reveal",
    layout: "hero-center",
    voiceover: "In China, Baidu said 50 million calls a day in month one. None of it is audited.",
    texts: {
      bigNumber: "50M",
      subtext: "CALLS PER DAY, UNAUDITED",
      source: "SOURCE: UNWIRE.PRO",
    },
  },
  {
    id: 7,
    name: "supply",
    visualType: "data",
    layout: "hero-center",
    voiceover:
      "Baidu's ERNIE 5.5 Flash ships 280 billion parameters, 14 billion active, one million token context.",
    texts: {
      stat: "280B",
      subtext: "TOTAL PARAMETERS, 14B ACTIVE",
      source: "SOURCE: DATACUBE AI, NOV 11",
      circle: true,
    },
  },
  {
    id: 8,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    voiceover: "China is pricing compute like a commodity. Follow for what changes next.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "AI TOKENS",
    },
  },
];
