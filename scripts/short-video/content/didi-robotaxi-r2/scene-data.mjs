/**
 * Scene definitions for Didi R2 Robotaxi — China's driverless passenger race.
 * 8 scenes, ~60s. Sources: QbitAI (Didi R2), Pony.ai Q2 earnings, Baidu search.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    assetNeed: "autonomous vehicle driving on city street at night with sensors visible",
    media: {
      type: "image",
      path: "assets/didi-r2-official-01.jpeg",
      source: "QbitAI",
      animation: "ken-burns",
      overlay: 0.7,
    },
    voiceover:
      "Didi's new Robotaxi R2 just launched driverless passenger service. Beijing and Guangzhou residents can hail a ride right now.",
    texts: {
      badge: "BREAKING",
      subject: "DIDI",
      color: "amber",
      bigNumber: "ROBOTAXI",
      numberLabel: "DIDI R2",
      numberHighlight: "DIDI",
      stats: [
        { num: "L4", unit: "FULL", label: "DRIVERLESS" },
        { num: "2", unit: "CITIES", label: "BJ AND GZ" },
      ],
      source: "QBITAI",
    },
  },
  {
    id: 2,
    name: "vehicle",
    visualType: "context",
    layout: "hero-center",
    assetNeed: "self-driving car with lidar sensors on roof driving in urban traffic",
    media: {
      type: "image",
      path: "assets/didi-r2-official-02.png",
      source: "QbitAI",
      animation: "ken-burns",
      overlay: 0.7,
    },
    voiceover:
      "According to QbitAI, R2 runs Didi's full L4 stack. 33 sensors, triple-domain compute, dual five-star safety rated.",
    texts: {
      badge: "THE VEHICLE",
      title: "BUILT WITH ",
      titleHighlight: "GAC AION",
      context: "FULL L4 PERCEPTION AND COMPUTE",
      detail: "DUAL CHINA-EUROPE FIVE-STAR SAFETY",
    },
  },
  {
    id: 3,
    name: "cabin",
    visualType: "info-card",
    layout: "stacked-cards",
    assetNeed: "autonomous vehicle interior cabin with touchscreen and passenger seats",
    media: {
      type: "image",
      path: "assets/didi-r2-official-01.jpeg",
      source: "QbitAI",
      animation: "ken-burns",
      overlay: 0.7,
    },
    voiceover:
      "Inside R2, a 17-inch ceiling screen and AI voice control. Seats recline wide. It feels like a living room on wheels.",
    texts: {
      title: "THE CABIN",
      subtitle: "R2 INTERIOR EXPERIENCE",
      points: [
        "17.3 INCH CEILING SCREEN",
        "AI VOICE CONTROL BUILT IN",
        "WIDE RECLINING REAR SEATS",
      ],
    },
  },
  {
    id: 4,
    name: "pony-surge",
    visualType: "data",
    layout: "media-overlay",
    assetNeed: "robotaxi fleet cars lined up ready for passenger service",
    media: {
      type: "image",
      path: "assets/pony-robotaxi.png",
      source: "QbitAI",
      animation: "ken-burns",
      overlay: 0.7,
    },
    voiceover:
      "And Didi is not alone. Pony.ai just reported Q2 Robotaxi revenue up 691 percent year over year. The business is scaling.",
    texts: {
      stat: "691%",
      statLabel: "AI ROBOTAXI REVENUE",
      subtext: "PONY.AI Q2 2026 EARNINGS",
      source: "PONY.AI EARNINGS",
    },
  },
  {
    id: 5,
    name: "pony-vs-tesla",
    visualType: "contrast",
    layout: "hero-center",
    assetNeed: "modern autonomous vehicle prototype without steering wheel on display",
    media: {
      type: "image",
      path: "assets/tesla-fsd.jpeg",
      source: "QbitAI",
      animation: "ken-burns",
      overlay: 0.7,
    },
    voiceover:
      "Pony.ai's seventh-gen Robotaxi costs under 32 thousand US dollars. That undercuts a Tesla Model 3 on price.",
    texts: {
      title: "PONY VS TESLA",
      vs: "VS",
      left: ["PONY.AI GEN 7 UNDER $32K", "FULL L4 DRIVERLESS"],
      right: ["TESLA MODEL 3 L2 ONLY", "HIGHER PRICE"],
      note: "CHEAPER THAN A TESLA",
      noteHighlight: "CHEAPER",
    },
  },
  {
    id: 6,
    name: "going-global",
    visualType: "info-card",
    layout: "stacked-cards",
    assetNeed: "autonomous vehicle testing on public road in asian city",
    media: {
      type: "image",
      path: "assets/didi-r2-official-02.png",
      source: "QbitAI",
      animation: "ken-burns",
      overlay: 0.7,
    },
    voiceover:
      "China's Robotaxi fleets are going global. Korea, Singapore, Croatia, Dubai. 200 vehicles headed to Seoul alone this year.",
    texts: {
      title: "GOING GLOBAL",
      subtitle: "CHINA ROBOTAXI OVERSEAS",
      points: [
        "KOREA: 200 VEHICLES TO SEOUL",
        "SINGAPORE: PASSENGER SERVICE LIVE",
        "CROATIA AND DUBAI: TESTING",
      ],
    },
  },
  {
    id: 7,
    name: "waymo-vs-china",
    visualType: "contrast",
    layout: "hero-center",
    assetNeed: "waymo self-driving car on city street with passengers",
    media: {
      type: "image",
      path: "assets/pony-robotaxi.png",
      source: "QbitAI",
      animation: "ken-burns",
      overlay: 0.7,
    },
    voiceover:
      "Waymo still leads with 3800 vehicles and 500 thousand weekly rides. But China is closing the gap fast, city by city.",
    texts: {
      title: "WAYMO VS CHINA",
      vs: "VS",
      left: ["WAYMO 3800 VEHICLES", "500K WEEKLY RIDES"],
      right: ["CHINA RAPID CATCH-UP", "DIDI PONY BAIDU"],
      note: "THE GAP IS CLOSING",
      noteHighlight: "CLOSING",
    },
  },
  {
    id: 8,
    name: "cta",
    visualType: "cta",
    layout: "cta",
    voiceover: "China's driverless race is just starting. Follow for more China AI.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "ROBOTAXI",
    },
  },
];
