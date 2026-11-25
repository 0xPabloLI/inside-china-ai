export const meta = {
  article: "phai-a1-m1",
  subject: "phai",
  pipelineId: "phai-a1-m1",
  title: "A 35B Model That Runs on One RTX 3090",
  renderer: "remotion",
  createdAt: "2026-11-20",
  storySpine: {
    phenomenon:
      "Phancy Group, formerly Fourth Paradigm, released Phai-A1 and Phai-M1: a 35B MoE coding and agent model with a 1M-token context that runs on one RTX 3090, and a video model that makes 15 seconds of 720p video with sound in about three minutes.",
    caveat:
      "The benchmarks and speed claims are Phancy's own. Phai-A1 leads every 35B MoE in its class, but not every reference model: Qwen3.8-27B Dense scores higher on SWE-Bench Verified, IFBench and AA-LCR. M1 weights are still coming soon.",
    storyType: "phenomenon",
  },
  topics: ["china-ai", "phancy", "phai", "open-weights", "huawei-ascend", "video-generation"],
  keyEntities: {
    companies: ["phancy", "huawei"],
    people: ["dai_wenyuan"],
    models: ["phai-a1", "phai-m1"],
  },
  dataPoints: [
    "Official Phai page, 2026-11-20: Phai-A1 is a 35B MoE model with 1M-token context, open weights on Hugging Face and ModelScope, post-trained end to end on Huawei Ascend.",
    "Official Phai page: Phai-A1 scores 83.6 on SWE-Bench Verified and 65.0 on SWE-Bench Pro; it leads every 35B MoE model in its class.",
    "Official Phai page: Qwen3.8-27B Dense scores 86.0 on SWE-Bench Verified, 79.5 on IFBench and 82.0 on AA-LCR, higher than Phai-A1 on those three tests.",
    "Official Phai page: both models run on a single RTX 3090; Phancy says Phai-A1 is about 8-10x faster than models of the same parameter class at the same quality.",
    "Official Phai page: Phai-M1 generates 5-20 second video at 480p, 720p or 1080p, with dialogue, effects and ambience generated together with the picture.",
    "Official Phai page: a 15-second 720p video takes about three minutes on a single consumer GPU with 16GB of memory; M1 weights are coming soon.",
    "QbitAI, 2026-11-19: Phancy is the new name of Fourth Paradigm; the company put both models into its own products, including PhanthyCode, ModelSphere and PhanthyMovie.",
    "Company background: Fourth Paradigm was founded in 2014 by Dai Wenyuan and listed on HKEX in 2023 under code 6682.",
  ],
  hashtags: ["#chinaai", "#phai", "#openweights", "#ainews", "#technews"],
};
