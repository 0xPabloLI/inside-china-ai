export const meta = {
  article: "zhipu-glm54",
  subject: "zhipu",
  pipelineId: "zhipu-glm54",
  title: "GLM-5.4 Is Already in Coding Plan. Zhipu Still Won't Show the Receipts",
  renderer: "remotion",
  createdAt: "2026-11-24",
  // Measured from content/zhipu-glm54/assets/ on 2026-11-24:
  // 6 usable stills, no motion demo. UI screenshots and the official model family carry it.
  videoFit: 3,
  videoFitFormat: "explainer",
  assetReady: 1,
  videoFitHook:
    "Coding Plan model list at frame one: the GLM-5.4 row with 1M and vision badges, plus the 5.4 number.",
  videoFitEvidence:
    "assets/coding-plan-models.jpg 1200x1131 verified Coding Plan screenshot; assets/coding-plan-list.png 1200x400 verified model-list crop; assets/bigmodel.png 1280x960 official BigModel homepage; assets/bigmodel-family.png 1280x960 official model family; assets/ithome-glm.png 1280x960 IT之家 screenshot; assets/glm-lizixuan.jpg 756x403 Zhipu global lead post screenshot",
  storySpine: {
    phenomenon:
      "Zhipu's GLM-5.4 quietly went live in Coding Plan. The model list shows a 1M tag and vision. Zhipu says it scaled both the loop and the model for three months, and its official page calls GLM-5.4 a Loop Transformer model comparable to 2-3T-class systems with native multimodal support.",
    caveat:
      "There is no official model card or independent benchmark. The 1M badge is unexplained, and reported context specs conflict: 1M on the plan, 200K in one report. Treat the marketing claims as claims, not measured results.",
    storyType: "release",
  },
  topics: ["china-ai", "zhipu", "glm-5-4", "coding-plan", "large-language-model", "multimodal"],
  keyEntities: {
    companies: ["zhipu-ai"],
    people: ["li-zixuan"],
    models: ["glm-5-4", "glm-5-3"],
  },
  dataPoints: [
    "IT之家, 2026-11-23: Zhipu's official operator said GLM-5.4 is live on Coding Plan; the team spent three months scaling both the loop and model size, and Loop Transformer was the surprise.",
    "IT之家, 2026-11-23: GLM-5.4 adds vision and stronger general coding; V2, V3 and team-plan users get 1.5x quota; the model name is glm-5.4.",
    "Coding Plan model list: GLM-5.4 carries a 1M badge and a vision badge.",
    "Sohu / Bianews, 2026-11-23: Zhipu global lead Li Zixuan said weekly quota is 50% higher than GLM-5.3; official specs are 200K context and 64K max output.",
    "Zhipu BigModel official page: GLM-5.4 uses Loop Transformer, is positioned against 2-3T-class models, and supports native multimodal input.",
    "No official GLM-5.4 model card or benchmark table has been published as of 2026-11-24.",
  ],
  hashtags: ["#chinaai", "#zhipu", "#glm54", "#coding", "#llm"],
};
