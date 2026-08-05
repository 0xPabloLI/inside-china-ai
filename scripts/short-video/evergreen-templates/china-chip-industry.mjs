/**
 * Evergreen Template: "China's Chip Industry"
 * Type: explainer | Duration: 80s
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover: "", // TODO: Insert today's chip news
    texts: { line1: "CHINA'S", line2: "CHIP WAR" },
  },
  {
    id: 2,
    name: "problem",
    visualType: "contrast",
    voiceover:
      "The US banned NVIDIA from selling chips to China. No H100s, no A100s. The goal was to freeze China's AI progress.",
    texts: {
      left: ["NVIDIA BAN", "EXPORT CONTROLS", "CHIP LOCKDOWN"],
      right: ["DEEPSEEK", "HUAWEI ASCEND", "DOMESTIC CHIPS"],
    },
  },
  {
    id: 3,
    name: "solution",
    visualType: "deployment-cost",
    voiceover:
      "China responded by building its own chips. Huawei's Ascend 910B matches the A100. And DeepSeek rewrote the CUDA stack.",
    texts: {
      title: "SELF-SUFFICIENT",
      points: ["Huawei Ascend 910B", "TileLang replaces CUDA", "No gaming GPU needed"],
    },
  },
  {
    id: 4,
    name: "result",
    visualType: "data",
    voiceover:
      "DeepSeek runs on 20,000 GPUs. Not the best chips, but the best software. China turned the chip ban into an advantage.",
    texts: { stat: "20,000", label: "GPUs", note: "Software > Hardware" },
  },
  {
    id: 5,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more China AI intelligence.",
    texts: { title: "SUBSCRIBE" },
  },
];

export const metadata = {
  title: "How China Beat the Chip Ban | China AI News",
  description:
    "The US banned NVIDIA chips. China built its own.\nHuawei Ascend, DeepSeek's TileLang, 20,000 GPUs.\nFollow for more China AI news.",
  hashtags: ["#chinaai", "#chips", "#ai", "#huawei", "#technews"],
};
