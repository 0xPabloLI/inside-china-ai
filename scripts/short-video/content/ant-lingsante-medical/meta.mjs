export const meta = {
  article: "ant-lingsante-medical",
  subject: "ant-ling",
  pipelineId: "ant-lingsante-medical",
  title: "Ant's Health AI Already Sees 20 Million People a Day",
  renderer: "remotion",
  createdAt: "2026-11-24",
  // Measured from content/ant-lingsante-medical/assets/ on 2026-11-24:
  // 6 usable stills, no motion demo. The product UI and official model card carry it.
  videoFit: 3,
  videoFitFormat: "explainer",
  assetReady: 1,
  videoFitHook:
    "Official Afu video-call UI at frame one: a live face scan, with 20 million consultations a day over it.",
  videoFitEvidence:
    "assets/afu-video-call.jpg 640x1383 official product UI; assets/lingsante-five-models.jpg 640x328 third-party chart; assets/lingsante-hf.png 1280x960 official model card; assets/lingsante-hf-eval.png 1280x960 official benchmark table; assets/ant-ling-blog.png 1280x960 official blog; assets/lingsante-blog-post.png 1280x960 official blog post; assets/lingsante-qbitai.png 1280x960 third-party article screenshot",
  storySpine: {
    phenomenon:
      "Ant Ling released five medical and health models on November 23: a 124B-parameter vision model that runs locally, a 560B long-context model, a live video consultation model, a 150-plus disease risk model, and a medical safety guard. Its Afu app already has 150 million users and nearly 20 million consultations a day.",
    caveat:
      "The benchmark numbers and user counts are company-reported. This is a triage, evidence and workflow tool, not a diagnosis. Clinician oversight, liability and real-world error rates remain the hard tests.",
    storyType: "release",
  },
  topics: [
    "china-ai",
    "medical-ai",
    "lingsante",
    "ant-group",
    "afu",
    "open-source",
  ],
  keyEntities: {
    companies: ["ant-group", "ant-ling"],
    people: [],
    models: [
      "lingsante-3-1-air-vl",
      "lingsante-3-1-flash",
      "lingsante-live",
      "lingsante-pulse",
      "lingsante-medguard",
    ],
  },
  dataPoints: [
    "Ant Ling, 2026-11-23: LingSante-3.1-air-VL has 124B total parameters, 5.5B active, accepts text and images, and is open source.",
    "Ant Ling, 2026-11-23: LingSante-3.1-flash has 560B total parameters, a 1M-token context window, and is open source.",
    "Ant Ling, 2026-11-23: LingSante Live does real-time video consultation; LingSante Pulse predicts 150-plus disease risks; LingSante MedGuard checks medical safety, compliance and ethics.",
    "QbitAI, 2026-11-23: Afu has 150 million users and nearly 20 million health consultations a day; about one quarter are elderly users.",
    "QbitAI, 2026-11-23: Afu covers 16 departments and more than 10 Chinese dialects, including Cantonese, Shanghainese, Hunanese and Sichuanese.",
    "QbitAI, 2026-11-23: HealthBench Professional 66.03% and MentalHealthBench 55.58% for the medical model family.",
    "Hugging Face model card: LingSante-3.1-air-VL is a 124B/5.5B-active MoE built on Ling-3.0-flash-VL and supports a 256K-token context window.",
  ],
  hashtags: ["#chinaai", "#lingsante", "#medicalai", "#antgroup", "#afu"],
};
