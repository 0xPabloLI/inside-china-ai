---
title: "Qwen3.8-Flash-Next: Alibaba Open-Sources the Architecture Behind Qwen4"
slug: "qwen4-preview"
excerpt: "Alibaba's Qwen team released Qwen3.8-Flash-Next on Aug 26, 2026: 125B parameters, 6B active, trained at 1/9 the cost, an open preview of the Qwen4 architecture."
published: true
---

# Qwen3.8-Flash-Next: Alibaba Open-Sources the Architecture Behind Qwen4

On August 26, 2026, Alibaba's Qwen team released the open weights of **Qwen3.8-Flash-Next**, a multimodal mixture-of-experts model that the team describes as an early preview of the architecture that will underpin Qwen4. The weights landed on Hugging Face and ModelScope, with an FP8 build and GGUF/MLX community quantizations following the same day ([official blog](https://qwen.ai/blog?id=qwen3.8-flash-next), [TechNode, Aug 26, 2026](https://technode.com/2026/08/26/alibabas-qwen-to-open-source-qwen3-8-flash-next-previewing-qwen4-architecture/)).

This is not Qwen4. The blog is explicit: the team released the structural changes early so the community can test them before Alibaba builds the full Qwen4 model family on top. Qwen ran the same play before Qwen3.5, when Qwen3-Next introduced the Gated DeltaNet hybrid design that then carried through Qwen3.5, 3.6, 3.7 and 3.8 ([official blog](https://qwen.ai/blog?id=qwen3.8-flash-next)).

## The headline numbers

The specification, from the [official Hugging Face model card](https://huggingface.co/Qwen/Qwen3.8-Flash-Next) and [GitHub README](https://github.com/QwenLM/Qwen3.8-Flash-Next):

- **125B total parameters**, with only **6B activated per token** — plus a separate **51B N-gram embedding table** and a **4B multi-token prediction (MTP) module**
- **262,144 tokens of native context**, extendable to **1,000,000 tokens** with YaRN
- Vision encoder included: this is a multimodal model out of the box

The cost claim is the boldest part. According to the official blog, training Qwen3.8-Flash-Next cost about **1/9 of what Qwen3.7-Plus cost** — Qwen3.7-Plus is a 397B-parameter model with 17B active — while scoring higher on coding and office-work benchmarks ([official blog](https://qwen.ai/blog?id=qwen3.8-flash-next)).

For production use, the team serves a tuned version called **Qwen3.8-Flash** on the Qianwen AI platform with a default 1M context and built-in tools, priced at **0.8 yuan per million input tokens and 2.7 yuan per million output tokens** — roughly $0.11 and $0.38 ([official blog](https://qwen.ai/blog?id=qwen3.8-flash-next)).

## Four architecture changes

The Qwen team frames the release around four upgrades: attention, residual connections, embeddings, and optimization ([official blog](https://qwen.ai/blog?id=qwen3.8-flash-next)).

**1. Hybrid attention: Gated DeltaNet + Qwen Sparse Attention (QSA).** Three of every four layers use Gated DeltaNet (GDN), a linear-attention layer that compresses conversation history into a fixed-size state. The fourth layer keeps global attention — but a new kind called QSA. Instead of scoring every token, QSA's lightweight indexer compresses the sequence into micro-blocks and picks the important ones. The blog's own summary: GDN handles efficient "remembering," QSA handles precise "looking up."

**2. Gated Residual.** A standard transformer passes information through a single residual stream, where early features get diluted as the network deepens. Qwen splits that stream into **four parallel branches** with learned gates that control how much each branch reads and writes. The team observed one branch naturally becoming a long-range channel connecting the first attention layer to most later layers.

**3. N-gram Embedding.** The 51B-parameter lookup table reads the current token together with the previous few tokens, giving common phrases extra representation capacity at almost no extra per-token compute. Because lookup positions are known in advance, the whole table can sit in host memory and prefetch asynchronously while the GPU computes.

**4. Muon optimizer + refitted scaling laws.** The training recipe splits parameters between Muon and AdamW, and the team refitted its scaling laws for the new architecture.

## Benchmarks: strong claims, self-reported

The official numbers put the 6B-active model at or near the top of most rows, against Alibaba's own 397B flagship, DeepSeek's 284B model, and Anthropic's Claude-Opus-4.6 (Max):

- **SWE-bench Pro: 62.5** — ahead of Claude-Opus-4.6 (Max) at 53.4 ([official blog](https://qwen.ai/blog?id=qwen3.8-flash-next))
- **DeepSWE 1.1 agentic coding: 58.7** — versus 16.5 for the much larger Qwen3.7-Plus
- **JobBench: 55.7** — exactly double Qwen3.7-Plus at 27.6
- **AndroidWorld mobile control: 84.5** — versus 62.0 for Claude-Opus-4.6 (Max)
- GPQA Diamond 91.7, LiveCodeBench v6 91.9, SWE-bench Multilingual 81.0

The full matrix, including the rows where Claude still leads (Humanity's Last Exam: 40.0 vs 35.9):

<!-- widget:qwen4-benchmarks -->

Two caveats matter. These are Alibaba's own numbers, run in Alibaba's chosen evaluation frameworks; independent reproduction will take weeks. And on OSWorld 2.0 computer use, the absolute binary score of 19.4 shows how much headroom remains for every model in this generation.

## The 1M-context economics

Long context is where the architecture pays off. On 1M-token sequences, Qwen reports the QSA attention kernel runs up to **7.6x faster at prefill and 4.9x faster at decode**. In a test setup with a 90% prefix-cache hit rate, prefill throughput at 1M context reached **8.6x that of Qwen3.7-Plus** ([official blog](https://qwen.ai/blog?id=qwen3.8-flash-next)).

Combined with 0.8-yuan-per-million input pricing, the pitch is clear: million-token context at commodity prices, on open weights, for agent workloads that read entire codebases or day-long meeting transcripts.

## What it means for the open-weight race

Three takeaways:

**The "Next" preview strategy is now routine.** Alibaba ships the risky architectural bet early, lets llama.cpp, vLLM, MLX and the r/LocalLLaMA crowd shake it out, then builds the flagship family on the validated design. It de-risks Qwen4 and gives China's open-model tooling projects a head start in one move ([official blog](https://qwen.ai/blog?id=qwen3.8-flash-next), [GitHub](https://github.com/QwenLM/Qwen3.8-Flash-Next)).

**Efficiency is the new frontier race.** The competition here is not 2-trillion-parameter monsters. DeepSeek-V4-Flash-0731 (284B/13B active) and Qwen3.8-Flash-Next (125B+51B/6B active) are both aimed at the same target: frontier-adjacent quality per dollar. The 1/9 training-cost claim is a shot across DeepSeek's bow.

**Capacity without compute.** The N-gram embedding trick — 51B parameters that cost almost nothing per token and can live in RAM instead of VRAM — echoes Gemma 3n's per-layer embeddings and DeepSeek's Engram. Expect more labs to grow total parameters while holding active parameters flat.

## My Take: read this as Qwen4's system requirements

The useful frame for Qwen3.8-Flash-Next is not "new model, should I switch?" It is a published spec sheet for what Qwen4 will assume about your infrastructure: hybrid linear attention, sparse block-level retrieval, offloaded embedding tables, multi-token prediction. Teams that serve Qwen models in production have roughly a Qwen4-free development window to test whether their serving stacks handle fixed-size attention states and host-memory prefetch. When the full Qwen4 family lands, the teams that validated on Flash-Next will be first to ship on it.

The risk cuts the other way too: if the community finds stability or quality regressions in the GDN+QSA hybrid at scale, Alibaba gets that feedback before baking it into a whole model generation. Either way, the preview did its job.

---

## Sources

- [Qwen official blog: Qwen3.8-Flash-Next](https://qwen.ai/blog?id=qwen3.8-flash-next) — all architecture details, benchmark tables, pricing
- [Qwen3.8-Flash-Next on Hugging Face](https://huggingface.co/Qwen/Qwen3.8-Flash-Next) — model card, configuration, MTP parameter count
- [QwenLM/Qwen3.8-Flash-Next on GitHub](https://github.com/QwenLM/Qwen3.8-Flash-Next) — README, tech report PDF
- [TechNode: Alibaba's Qwen to open-source Qwen3.8-Flash-Next](https://technode.com/2026/08/26/alibabas-qwen-to-open-source-qwen3-8-flash-next-previewing-qwen4-architecture/) (Aug 26, 2026)
- [The Decoder: Alibaba releases Qwen3.8-Flash-Next](https://the-decoder.com/alibaba-releases-qwen3-8-flash-next-targeting-ultimate-cost-efficiency/)
- [HIC WeChat article](https://mp.weixin.qq.com/s/oxxfPVL35ExmfZiknoAmSQ) — user-supplied secondary source, verified against the official blog
