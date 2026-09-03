---
title: "Zhipu AI Reveals GLM-6.0: The Path to Fully Self-Training"
slug: "zhipu-glm6-self-training"
excerpt: "Zhipu AI chief scientist Tang Jie disclosed GLM-6.0 at the 2026 H1 earnings call. The next model pursues fully self-training across pre-training, mid-training, and post-training."
published: true
---

# Zhipu AI Reveals GLM-6.0: The Path to Fully Self-Training

At Zhipu AI's 2026 mid-year earnings call, chief scientist Tang Jie disclosed the company's next-generation model for the first time: **GLM-6.0**. The headline is not a parameter count or a benchmark score. It is a direction. Tang Jie said the company has started research on **fully self-training**, where the model autonomously handles its own pre-training, mid-training, and post-training, and builds its own harness to make the process self-directed ([earnings call transcript, WeChat, Sep 2, 2026](https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q)).

This is the first public mention of GLM-6.0. Everything below comes from that earnings call, spoken by Tang Jie, chairman Liu Debin, and the CFO.

## The big reveal: GLM-6.0 and self-training

Tang Jie framed the future around one word: self-training. The idea is that the model participates in its own improvement, forming a recursive self-improvement loop. In overseas research, this is often called RSI. The goal is for the model to handle more of its own pre-training, mid-training, and post-training, and to build its own training harness.

The hardest part, Tang Jie said, is not making the model bigger or training it longer. It is making the model able to judge itself, know when to stop, and correct its own errors. Ethics and governance will be built into the model's evolution process ([earnings call transcript, WeChat, Sep 2, 2026](https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q)).

Chairman Liu Debin expanded on this. He described three lines converging on the same endpoint:

1. **Data starts producing itself.** Model-versus-model self-play pipelines mean data quality is no longer capped by human annotation speed, but by the model's own verification ability.
2. **Environments start manufacturing.** Research agents collect task patterns, judge agents try them, and verifiers and environments are synthesized automatically, becoming standard products on the pipeline.
3. **Infrastructure starts optimizing itself.** Inference system optimization is fundamentally a code engineering task, which is exactly what models are best at.

Liu Debin's summary: the next-generation GLM will self-train inside the environment built by the previous-generation GLM ([earnings call transcript, WeChat, Sep 2, 2026](https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q)).

## Financial results: revenue up 400%, API now 86.5% of revenue

<!-- widget:zhipu-financials -->

The CFO reported 2026 H1 total revenue of **954 million RMB** (about $142 million), up nearly **400% year-over-year**. The bigger story is the revenue mix: open-platform and API business revenue reached **825 million RMB** ($123 million), up over **27x** from the same period last year, now accounting for **86.5%** of total revenue, up from 15.2% a year ago ([earnings call transcript, WeChat, Sep 2, 2026](https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q)).

As of August 2026, ARR reached **$1.6 billion** on a monthly-annualized basis. Using the more aggressive weekly-annualized method common among frontier model companies, ARR exceeds **$2 billion**. API average pricing rose about **101%**, while token call volume grew over **40x** since the start of the year. The gross margin of the open-platform and API business improved from -0.4% to **24.6%** ([earnings call transcript, WeChat, Sep 2, 2026](https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q)).

R&D spending was 2.13 billion RMB ($317 million). The adjusted net loss of 1.964 billion RMB was below R&D spending, meaning business gross profit has started to partially fund R&D.

## Model iteration: 32 to 60 in 11 months

<!-- widget:zhipu-model-iteration -->

The GLM family completed six iterations in about 11 months. On Artificial Analysis, the intelligence index went from **32 to 60**, while single-task cost stayed around **$0.20**. GLM-5.3 Flash brought single-task cost down to **$0.045** ([earnings call transcript, WeChat, Sep 2, 2026](https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q)).

GLM-5.3 uses the same base model as GLM-5.2, with all improvements coming from post-training. Same architecture, same total parameters, same active parameters, only expanded post-training scale. End-to-end completion rate improved over **50%**. Tang Jie's conclusion: scaling is not just about parameters. Training is currently the factor with the most room for improvement.

GLM-5.3 Flash uses a new architecture with 320B total parameters and 18B active, fusing sparse and linear attention. It is priced at **1/10 of GLM-5.2**. Before launch, it ran anonymously as model "OX" on OpenCode and OpenRouter. On day one it topped OpenRouter and set a single-day token usage record. In six days it handled over **62 trillion tokens** ([earnings call transcript, WeChat, Sep 2, 2026](https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q)).

## National chips: 100K GPU cluster, 80% cost reduction

Since the start of the year, Zhipu put domestic chips into its main inference compute. GLM-5.3 Flash is the first model served entirely on domestic chip clusters at super-large scale. The chips are connected by a self-developed high-bandwidth interconnect network. The inference engine is accelerated by an Infra Agent driven by GLM-5.3, cutting operator development time in half ([earnings call transcript, WeChat, Sep 2, 2026](https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q)).

Compared to the initial baseline on the same hardware, end-to-end service performance improved **3x**. The company now runs **100K-scale domestic chips** for low-cost inference. Per-token inference cost dropped **80%** since the start of the year. The "compute multiplier" (API revenue per yuan of compute input) improved **14x** year-over-year ([earnings call transcript, WeChat, Sep 2, 2026](https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q)).

## The five-stage ladder: Chat to Autonomous AI

Liu Debin laid out the capability ladder: **Chat, Coding, Agent, Cowork, Autonomous AI**. Each stage has a specific technical gate. Miss the gate, and the business model above it cannot work.

- Chat to Coding: the gate is verifiable results
- Coding to Agent: the gate is long-horizon planning and error recovery
- Agent to Cowork: the gate is reliability reaching a level where professionals are willing to review without redoing
- Cowork to Autonomous AI: the gate is the model judging whether its own results are correct

Zhipu's current position is between Coding and Cowork. Programming is now the company's main revenue source. The long-horizon task ability built in Coding is being transferred to cybersecurity, data analysis, legal, and finance ([earnings call transcript, WeChat, Sep 2, 2026](https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q)).

## Cybersecurity: 84.5% on CyberGym, 2,436 vulnerabilities found

On CyberGym, GLM-5.3 scored **84.5%**, beating WABO5 and GPT-5.6 SOLO. On ExploitGym it completed 130 tasks. Since GLM-5.2, working with domestic security teams on real codebases, Zhipu found about **2,436 vulnerabilities** after expert deduplication, with over **1,000 high-severity**, across **269 projects** ([earnings call transcript, WeChat, Sep 2, 2026](https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q)).

## Platform scale: 7.4 million registered users

As of August 2026, the MaaS platform has over **7.4 million registered users**, up 144% since the start of the year. Paid daily active users grew **603%**. The top ten users' daily call volume grew **98x** by revenue. In the past two months alone, driven by GLM-5.2, 5.3, and 5.3 Flash, users went from 5.8 million to 7.4 million ([earnings call transcript, WeChat, Sep 2, 2026](https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q)).

## My Take: why self-training is the real story

The financial numbers are strong, but they are trailing indicators. The real signal is the direction.

Every frontier lab is scaling. The disagreement is about what to scale. Zhipu's answer, backed by GLM-5.3's 50% completion rate gain from post-training alone, is that training depth is currently the highest-return factor. But Tang Jie and Liu Debin both said the same thing: once post-training is pushed to its limit, growth must return to the base model. The next base model is already training.

Self-training is the longer bet. If a model can judge its own work, correct its own errors, and build its own training environment, the human bottleneck in AI development shifts from annotation and engineering to verification and governance. That is exactly where Zhipu said it is investing: external evaluation, controlled release of sensitive capabilities, third-party security assessment.

The 100K domestic chip cluster and 80% cost reduction matter because they make this bet affordable. Self-training requires enormous iteration. If each iteration depends on imported chips at market prices, the loop is slow and expensive. Domestic chips at 3x the baseline performance, with an Infra Agent optimizing the stack, change the economics of the whole research program.

GLM-6.0 has no release date and no parameter count. But the direction is clear: the model trains the next model, inside the environment the current model built.

---

*Source: Zhipu AI 2026 H1 earnings call transcript, published on WeChat by Baishu Chaozhi Wang, Sep 2, 2026. All quotes and data points are from the transcript. ([full transcript](https://mp.weixin.qq.com/s/u95WhpIZs3jB0RtyPGmw-Q))*