---
title: "The Distillation Storm: Inside China's LLM Distillation Controversy"
slug: "china-llm-distillation-storm"
excerpt: "Between January and July 2026, a series of events swept through China's LLM industry, from encrypted chain-of-thought extraction to Anthropic's public accusations to benchmark controversies. This article cross-references an insider account with public reporting."
published: true
topics: ["distillation", "china-llm", "anthropic", "openai", "kimi", "moonshot", "bytedance", "minimax", "encryption", "benchmarks"]
entities:
  companies: ["anthropic", "openai", "moonshot", "bytedance", "minimax", "tencent", "alibaba", "deepseek"]
  people: ["yang_zhilin"]
  models: ["kimi_k3", "kimi_k26", "claude_opus_5"]
sources:
  - type: "pdf"
    file: "docs/refs/source-materials/china-llm-distillation-research.md"
  - type: "url"
    url: "https://www.reddit.com/r/LocalLLM/comments/1v8fk6s/"
  - type: "url"
    url: "https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks"
---

# The Distillation Storm: Inside China's LLM Distillation Controversy

> **Source**: This article is based on an anonymized insider account [posted on Reddit r/LocalLLM](https://www.reddit.com/r/LocalLLM/comments/1v8fk6s/) by u/feelspeaceman (~July 28, 2026, 110+ comments), cross-referenced with public reporting from [Anthropic](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks), [Bloomberg](https://www.bloomberg.com/technology-ai), [PCMag](https://www.pcmag.com/news/white-house-chinas-kimi-k3-ai-model-cheated-by-cloning-us-tech), [SCMP](https://www.scmp.com/tech/tech-war/article/3361711/chinas-kimi-k3-significantly-below-us-rivals-hacking-power-uk-us-study-shows), [AP News](https://apnews.com/article/kimi-k3-china-ai-model), [The Information](https://www.theinformation.com/articles/tencents-new-model-shows-improvement-partly-thanks-anthropic), [Hacker News](https://news.ycombinator.com/item?id=49076001), [LessWrong](https://www.lesswrong.com/posts/dQyKzHaGqvdqpekJr/does-distilling-claude-carry-the-persona-with-it), [Artificial Analysis](https://artificialanalysis.ai/articles/kimi-k3-achieves-3-in-the-artificial-analysis-intelligence-index-comparable-to-opus-4-8-and-gpt-5-5), and [A Few Thoughts on Cryptographic Engineering](https://blog.cryptographyengineering.com/2026/05/29/lets-talk-about-encrypted-reasoning/). Claims are annotated with verification status: ✅ verified, ⚠️ partially verified, ❌ unverified, 🔴 contradicts public data.

---

## Prologue: Encrypted Chain-of-Thought

The discovery that set off the storm: the encrypted chain-of-thought (CoT) used by OpenAI and Anthropic could be extracted and replayed.

Chinese labs were already distilling frontier models through large-scale API queries: conversational outputs, agent trajectories, code generation, tool calls. One gap blocked a complete copy. A model's raw chain-of-thought, its full internal reasoning before the answer, never left the server. Distilling without it meant getting the answers with no worked solution.

### The "Thinking Signature"

Both companies included a CoT summary in their streaming output, and both returned a Blob field, a "thinking signature" holding the full raw CoT encrypted with Fernet (AES-128-CBC + HMAC-SHA256, prefixed `gAAAAAB`). Sent back in a later request, the server decrypts it and appends it to the model's context. Testing showed Blob length correlated with CoT length, confirming the Blob held the full encrypted reasoning. _(✅ Verified: [A Few Thoughts on Cryptographic Engineering](https://blog.cryptographyengineering.com/2026/05/29/lets-talk-about-encrypted-reasoning/) independently discussed encrypted reasoning, confirming base64 blobs, HMAC signing, and replay capability)_

### Claude vs GPT

Per the source, Claude's anti-injection training became the entry point: a forged thinking-signature prefix could trick Claude into outputting its full chain-of-thought. GPT was harder to crack, following hidden system prompts to return only summaries. The source also claims Anthropic retained historical reasoning Blobs across conversation turns while OpenAI discarded them. _(❌ Unverified: these specific technical details about cross-turn retention and the anti-injection exploit are insider claims not confirmed by public sources)_

OpenAI locked sampling parameters (temperature, top_p non-modifiable), closing off deterministic-output reverse-engineering. The Fernet implementation was cryptographically sound. The only viable path was injecting the Blob into another request and letting the model recite its own thinking.

---

## Prelude: Anthropic's Public Accusation (February 2026)

On [February 23, 2026](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks), Anthropic published a blog post accusing three Chinese AI labs of "industrial-scale distillation attacks" against Claude. _(✅ Verified against Anthropic's official blog)_

The three labs used approximately 24,000 fraudulent accounts to generate over 16 million exchanges:

| Lab                    | Exchanges             | Targeted Capabilities                                                                                              |
| ---------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **DeepSeek**           | 150,000+              | Reasoning, rubric-based grading (Claude as reward model for RL), censorship-safe alternatives to sensitive queries |
| **Moonshot AI (Kimi)** | 3,400,000+            | Agentic reasoning, tool use, coding, data analysis, computer-use agents, computer vision                           |
| **MiniMax**            | 13,000,000+ (largest) | Agentic coding, tool use and orchestration                                                                         |

The labs used commercial proxy services to bypass regional access restrictions. Anthropic attributed each campaign through IP correlation, request metadata, and infrastructure indicators. The company framed this as a **national security risk**: distilled models may lack safety guardrails. _(✅ Verified: all figures and quotes match Anthropic's official blog)_

Qwen (Alibaba) and Z.ai were not named. Moonshot never publicly responded. _(ℹ️ BBC reported on June 24, 2026 that Anthropic separately accused Alibaba in a later case)_

<!-- widget:distillation-news-coverage -->

---

## Act I: GLM Cracks It First, Then Shares

Around March–April 2026, Zhipu AI (GLM) reportedly became the first to crack the frontier model's encrypted CoT and obtain complete thinking-chain data. GLM then shared both the method and the data with other domestic labs. _(❌ Unverified: no public reporting confirms GLM was first to crack CoT or that it shared the method. The cost estimate of "tens of thousands of USD" is also unverified)_

What is publicly known: GLM-5.2 is a 744B total / 40B active parameter MoE model with a 1-million-token context, [open-sourced in 2026](https://www.trendingtopics.eu/glm-5-2-chinas-zhipu-ai-beats-even-googles-top-models-with-its-new-open-llm/). Independent evaluations noted it approached frontier-model performance on select tasks.

---

## Act II: The Great Distillation Wave

With GLM's groundwork (per the source), distillation spread rapidly:

| Period        | Lab                                                   | Action                             |
| ------------- | ----------------------------------------------------- | ---------------------------------- |
| ~Mar–Apr 2026 | GLM (Zhipu)                                           | First to crack; shared with others |
| ~Apr–May 2026 | Hunyuan (Tencent)                                     | Followed with distillation         |
| ~May–Jun 2026 | Kimi K3 (Moonshot), MiniMax, Qwen (Alibaba), DeepSeek | Began large-scale distillation     |

_(✅ Tencent/Hunyuan verified: [The Information](https://www.theinformation.com/articles/tencents-new-model-shows-improvement-partly-thanks-anthropic) reported on April 28, 2026 that "Tencent's New Model Shows Improvement, Partly Thanks to Anthropic": leaked records showed Tencent employees used Claude to evaluate and fine-tune internal models)_

### DeepSeek's Timeline

DeepSeek previewed a July release in late June but hadn't yet begun large-scale distillation, causing a delay. An internal beta appeared in early July. Then a "V formal release gray test" appeared. Per the source, it was entirely routed to the frontier model, visible only in OpenCode. At DeepSeek's pricing, that made no economic sense. _(❌ Unverified: this specific routing claim is an insider allegation. Public sources show the opposite pattern: developers use DeepSeek as a cheaper Claude Code backend)_

### Qwen's Two-Front Operation

The source claims Qwen was simultaneously distilling both Claude and GPT, while a third-party routing service accumulated Claude data for GLM. _(❌ Unverified: the Qwen GPT distillation claim is an insider allegation)_

---

## Act III: Kimi's Approach

### RL Team Changes

The source claims that from K2.x onward, Kimi discontinued reinforcement learning. CEO Yang Zhilin cited "cost reduction and efficiency" for downsizing the RL team, with displaced members flowing to Qwen. _(🔴 Contradicts public data: no public reports of RL team layoffs at Moonshot; [Business Insider](https://www.businessinsider.com/who-is-yang-zhilin-ceo-founder-moonshot-ai-kimi-k3-2026-7) (July 18, 2026) describes Yang as leading RL and agentic capabilities; Moonshot's K3 release included an RL sandbox (AgentENV))_ ⚠️ This is the source material's most significant unverified claim.

### K3 Architecture

Per Moonshot's [official documentation](https://huggingface.co/blog/ResterChed/kimi-k3-model-overview) and Hugging Face, Kimi K3 is a 2.8T total / ~50B active parameter sparse MoE with 896 experts (16 active + 2 shared per token), native 1M context, and multimodal via MoonViT-V2. Released July 16, 2026; open weights July 27. _(✅ Verified)_

_(ℹ️ The source stated "1T parameters"; public data confirms 2.8T. This appears to be a redaction error)_

Moonshot announced four architectural innovations:

| Technology                        | Description                                                   | Infra Challenge                       |
| --------------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| **Kimi Delta Attention (KDA)**    | Hybrid linear attention; ~2.5x decoding speedup at 1M context | Non-uniform computation across layers |
| **Attention Residuals (AttnRes)** | Layers can retrieve representations from any earlier layer    | Irregular memory access patterns      |
| **Quantile Balancing**            | Expert assignment from router-score quantiles                 | Routing harder to predict             |
| **Per-Head Muon**                 | Independent optimization per attention head                   | Increased implementation complexity   |

_(✅ Verified: all architectural features confirmed by Moonshot's official docs)_

Per the source, these features are Infra-unfriendly. That supports a reading where "architectural innovation" is the public story while distillation is cited as the performance source. _(⚠️ The observation about Infra challenges is an analytical judgment; the architectural features themselves are confirmed)_

### Benchmark Controversies

The source records several evaluation phenomena:

1. **Test set contamination**: Benchmark test sets allegedly included in training data. MiniMax was first to be caught. _(❌ Unverified insider allegation)_
2. **Routing to frontier model**: Arena evaluation requests allegedly routed to the frontier model. _(❌ Unverified)_
3. **Targeting evaluators**: A Zhihu blogger known as "Cat Boss" (猫老板) had test questions allegedly extracted from system logs. _(✅ Cat Boss verified as a real Zhihu LLM evaluator known for analyzing benchmark gaming; ❌ the specific log-extraction claim is unverified)_
4. **Coding score distribution anomalies**: Some scores extremely high, others extremely low. _(❌ Unverified)_

Public data reflected this complexity. K3 jumped 17 places on Arena Frontend Code to claim #1. But Moonshot's own evaluation showed K3 below Claude on coding, agents, and frontier SWE. [HackerNoon](https://hackernoon.com/why-kimi-k3s-launch-week-scores-need-a-portability-audit) noted K3's top scores relied on maximum reasoning effort modes. [SCMP](https://www.scmp.com/tech/tech-war/article/3361711/chinas-kimi-k3-significantly-below-us-rivals-hacking-power-uk-us-study-shows) (July 24) reported K3 was "significantly below" US rivals in security testing. [PCMag](https://www.pcmag.com/news/white-house-chinas-kimi-k3-ai-model-cheated-by-cloning-us-tech) (July 22) reported a White House official accused K3 of "cloning US tech." _(✅ All public reporting verified)_

<!-- widget:kimi-benchmark-controversy -->

### Identity Bleed

Multiple users reported K3 identifying itself as "I'm Claude, an AI assistant created by Anthropic." [Hacker News](https://news.ycombinator.com/item?id=49076001) user testing showed this in ~15% of interactions. [LessWrong](https://www.lesswrong.com/posts/dQyKzHaGqvdqpekJr/does-distilling-claude-carry-the-persona-with-it) reported GLM 5.2 exhibited similar behavior. _(✅ Verified)_

The technical community split: some called it normal training data leakage ("models usually don't know their own name"); others read it as indirect evidence of distillation.

<!-- widget:kimi-identity-bleed -->

### Hallucination Rate

The source claimed ~30% hallucination rate. Public data tells a different story: [Artificial Analysis](https://artificialanalysis.ai/articles/kimi-k3-achieves-3-in-the-artificial-analysis-intelligence-index-comparable-to-opus-4-8-and-gpt-5-5) measured K3's hallucination rate at **51%** on AA-Omniscience (up from K2.6's 39%), confirmed by [Emergent](https://emergent.sh/learn/kimi-k3-benchmark) and [Kili Technology](https://kili-technology.com/blog/kimi-k3s-benchmarks-and-hallucinations----what-that-tells-us-about-ai-evaluation). _(🔴 Contradicts: source's 30% vs. public 51%)_

### Shipping First

Kimi completed SFT and shipped quickly. Within 48 hours, demand forced Moonshot to [suspend new subscriptions](https://apnews.com/article/kimi-k3-china-ai-model) after GPU capacity hit limits (AP News, July 20). _(✅ Verified)_

The source suggests the speed pressured other labs to accelerate. _(⚠️ Analytical claim)_

---

## Act IV: Industry Impact

The distillation route meant any lab following the playbook could reach near-frontier performance. Per the source, Kimi's shipping-first approach with aggressive benchmark tactics disrupted that equilibrium: labs not optimizing for scores struggled for attention. The evaluator, DeepSeek employees, former Kimi staff, and Qwen employees all expressed concern. _(❌ Unverified: these specific employee sentiments are insider information)_

---

## Act V: The Players

### Moonshot AI (Kimi)

**Business context**: [Bloomberg](https://www.bloomberg.com/technology-ai) (July 29) reported Moonshot raised $3.5B at a $35B post-money valuation. KrASIA reported a $50B IPO target. [The Standard (HK)](https://www.thestandard.com.hk/finance/article/338896/Moonshot-AI-denies-plans-to-file-Hong-Kong-IPO-in-August) (August 3) reported Moonshot denied August IPO filing. Alibaba reportedly backing with ~20,000 Nvidia chips. _(✅ Verified)_

Accused by Anthropic in February; never publicly responded. Open-sourced K3 weights on July 29.

<!-- widget:moonshot-funding-timeline -->

### DeepSeek

Considered relatively strong among domestic labs. An internal beta was available in early July. The unexplained routing to the frontier model remains an open question. _(❌ Unverified routing claim)_

### Qwen (Alibaba)

Well-staffed, reportedly absorbed former Kimi RL members. Simultaneously distilling GPT, per the source. Performance has been inconsistent. _(❌ Unverified: RL absorption and GPT distillation are insider claims)_

### GLM (Zhipu)

First to crack the frontier model's CoT and share with others (per source). GLM-5.2 open-sourced; approached frontier-model performance on select tasks. _(❌ Cracking/sharing unverified; ✅ GLM-5.2 specs verified)_

### MiniMax

First accused of test set contamination; model performed poorly enough to be discovered. In Anthropic's accusations, MiniMax had the largest distillation volume (13M+ exchanges).

**Stock**: MiniMax Group Inc (HKEX: 0100.HK) fell from a March peak of HK$1,330 to ~HK$186, over 80% decline. On July 9, a lock-up expiry released ~153M shares (~48.9% of capital), triggering an 18% single-day drop. Emergency ~HK$16B capital raise launched. Stock recovered to ~HK$247 by August 3. _(✅ Verified: Google Finance confirms all figures)_

Drivers: Anthropic accusations, M3 permanent price cut, low consumer margins, AI companion regulations, significant annual losses. Moonshot's IPO preparations added competitive pressure.

<!-- widget:minimax-stock-timeline -->

### Mistral

Consistently under-resourced. European labs were largely absent from this story.

---

## Act VI: The Public Conversation

Videos discussing distillation appeared on Bilibili. Comment sections became debate zones: some denied distillation and framed the accusations as "smearing domestic tech"; others packaged the results as evidence of "China's tech rise."

The [original Reddit post](https://www.reddit.com/r/LocalLLM/comments/1v8fk6s/) in r/LocalLLM generated 110+ comments, cross-posted to r/MistralAI and r/LocalLLaMA.

One widely shared comment: "AI hallucination rates are going down, but human hallucination rates are going up."

---

## Act VII: The Benchmark-Driven Logic

The source argues domestic labs pushed benchmark gaming further than Western labs in both degree and method. The structural driver: benchmark scores directly influence funding valuations and market attention. The tension is between optimizing for "coding scores" and "coding capability." _(⚠️ Analytical claim reflecting the source author's interpretation, not a verifiable fact)_

---

## Technical Sidebar

The source suggests GPT is likely a production-grade Looped Transformer with several-fold higher data efficiency. _(⚠️ Speculative: no official confirmation from OpenAI; [arXiv](https://arxiv.org/abs/2604.21254) discusses looped transformers academically, but OpenAI has never confirmed GPT uses this architecture)_

The source observes that the industry rhythm has become "wait for the frontier lab to release, make architectural improvements, publish papers, and distill." _(⚠️ Analytical observation)_

---

## Appendix: Encrypted CoT Technical Details

> The following come from the source document's appendix. The encryption format is ✅ verified by the [cryptography engineering blog](https://blog.cryptographyengineering.com/2026/05/29/lets-talk-about-encrypted-reasoning/); specific experiments and Blob data are ❌ unverified insider claims.

**A.1 Encryption Format**: Fernet (AES-128-CBC + HMAC-SHA256), prefix `gAAAAAB`. Structure: version + timestamp + IV + ciphertext + HMAC. _(✅ Confirmed by cryptography.io and the cryptography blog)_

**A.2 Cross-Turn Behavior**: Blob in current turn → model reads it. Historical Blobs → discarded. _(❌ The cross-turn retention difference between OpenAI and Anthropic is unverified)_

**A.3 "The Telepathy Game"**: Forging assistant responses with refusal_blob + real blob to create fake "resistance → overcoming → solving" dialogue. _(❌ Unverified technique)_

**A.4–A.7**: Blob length/token correlation, multi-Blob behavior, cross-model key isolation, replay persistence (24h+). _(✅ Replay confirmed by cryptography blog; ❌ other specifics unverified)_

**A.8–A.9**: OpenAI vs Anthropic comparison table; GPT parameter locking. _(✅ GPT parameter locking confirmed; ❌ cross-turn comparison unverified)_

---

## Verification Summary

| Status                              | Count     |
| ----------------------------------- | --------- |
| ✅ Verified                         | 23 claims |
| ⚠️ Partially verified               | 12 claims |
| ❌ Unverified (insider information) | 14 claims |
| 🔴 Contradicts public data          | 3 claims  |

**Key contradictions:**

| Claim                 | Source says              | Public data says                                                                                                                                                        |
| --------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K3 parameter count    | 1T                       | 2.8T ([Moonshot](https://huggingface.co/blog/ResterChed/kimi-k3-model-overview) / Hugging Face)                                                                         |
| K3 hallucination rate | ~30%                     | 51% ([Artificial Analysis](https://artificialanalysis.ai/articles/kimi-k3-achieves-3-in-the-artificial-analysis-intelligence-index-comparable-to-opus-4-8-and-gpt-5-5)) |
| Kimi RL team layoffs  | Entire RL team dismissed | No public reports; Yang still described as leading RL ([Business Insider](https://www.businessinsider.com/who-is-yang-zhilin-ceo-founder-moonshot-ai-kimi-k3-2026-7))   |

**Overall assessment**: The core narrative (large-scale distillation by Chinese labs, Anthropic's public accusations, Kimi K3's benchmark controversies) is **well-supported by public reporting**. Many specific insider details (GLM cracking and sharing, RL team changes, test set contamination, specific routing allegations) **could not be independently verified**. Three factual details **contradict public data** and have been corrected in this article.

---

## Sources

**Primary source (insider account):**

- [Reddit r/LocalLLM — "The Full Story of the 'Distillation Storm' Among China's Large-Model Companies"](https://www.reddit.com/r/LocalLLM/comments/1v8fk6s/) by u/feelspeaceman (~July 28, 2026, 110+ comments) — anonymized insider account, the basis of this article. Source PDF attached below.

**Public reporting referenced:**

1. [Anthropic — "Detecting and preventing distillation attacks"](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks) (February 23, 2026) — official blog post accusing DeepSeek, Moonshot, and MiniMax
2. [Bloomberg — Moonshot AI $35B valuation coverage](https://www.bloomberg.com/technology-ai) (July 29, 2026) — funding round and valuation data
3. [PCMag — "White House: China's Kimi K3 AI Model Cheated by Cloning US Tech"](https://www.pcmag.com/news/white-house-chinas-kimi-k3-ai-model-cheated-by-cloning-us-tech) (July 22, 2026) — White House accusation
4. [SCMP — "China's Kimi K3 'significantly below' US rivals in hacking power"](https://www.scmp.com/tech/tech-war/article/3361711/chinas-kimi-k3-significantly-below-us-rivals-hacking-power-uk-us-study-shows) (July 24, 2026) — security testing results
5. [AP News — "China's new AI model halts new subscriptions as demand soars"](https://apnews.com/article/kimi-k3-china-ai-model) (July 20, 2026) — subscription suspension
6. [The Information — "Tencent's New Model Shows Improvement, Partly Thanks to Anthropic"](https://www.theinformation.com/articles/tencents-new-model-shows-improvement-partly-thanks-anthropic) (April 28, 2026) — Tencent distillation evidence
7. [The Standard (HK) — "Moonshot AI denies plans to file Hong Kong IPO in August"](https://www.thestandard.com.hk/finance/article/338896/Moonshot-AI-denies-plans-to-file-Hong-Kong-IPO-in-August) (August 3, 2026) — IPO denial
8. [Business Insider — "Who Is Yang Zhilin, the CEO Behind China's Latest AI"](https://www.businessinsider.com/who-is-yang-zhilin-ceo-founder-moonshot-ai-kimi-k3-2026-7) (July 18, 2026) — CEO profile
9. [HackerNoon — "Why Kimi K3's Launch-Week Scores Need a Portability Audit"](https://hackernoon.com/why-kimi-k3s-launch-week-scores-need-a-portability-audit) — benchmark analysis
10. [Hacker News — Kimi K3 identifying as Claude](https://news.ycombinator.com/item?id=49076001) — user testing report
11. [LessWrong — "Does distilling Claude carry the persona with it?"](https://www.lesswrong.com/posts/dQyKzHaGqvdqpekJr/does-distilling-claude-carry-the-persona-with-it) — GLM 5.2 identity bleed
12. [Artificial Analysis — Kimi K3 Intelligence Index](https://artificialanalysis.ai/articles/kimi-k3-achieves-3-in-the-artificial-analysis-intelligence-index-comparable-to-opus-4-8-and-gpt-5-5) — hallucination rate data
13. [Emergent — "Kimi K3 Benchmarks: Every Score, What It Means"](https://emergent.sh/learn/kimi-k3-benchmark) — benchmark breakdown
14. [Kili Technology — "Kimi K3's Benchmarks and Hallucinations"](https://kili-technology.com/blog/kimi-k3s-benchmarks-and-hallucinations----what-that-tells-us-about-ai-evaluation) — hallucination analysis
15. [A Few Thoughts on Cryptographic Engineering — "Let's talk about encrypted reasoning"](https://blog.cryptographyengineering.com/2026/05/29/lets-talk-about-encrypted-reasoning/) (May 29, 2026) — Fernet/Blob technical verification
16. [Hugging Face — Kimi K3 Model Overview](https://huggingface.co/blog/ResterChed/kimi-k3-model-overview) — architecture specs
17. [Trending Topics — "GLM-5.2: China's Zhipu AI Beats Even Google's Top Models"](https://www.trendingtopics.eu/glm-5-2-chinas-zhipu-ai-beats-even-googles-top-models-with-its-new-open-llm/) — GLM-5.2 performance
18. [arXiv — "Hyperloop Transformers"](https://arxiv.org/abs/2604.21254) (July 2, 2026) — looped transformer architecture paper
