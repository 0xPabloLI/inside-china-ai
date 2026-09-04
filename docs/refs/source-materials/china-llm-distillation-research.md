# Research Summary: China LLM Distillation Scandal

> Compiled August 8, 2026 from 1 primary source.
> Source: Anonymous document `docs/refs/source-materials/china-llm-distillation-source.pdf`
> Covers events from approximately February 2026 to August 2026.
> All information has been anonymized in the original document.
> Note: Some numbers and proper nouns may be obfuscated in the original; technical details should be
> cross-referenced with Anthropic's public statements and independent reporting.

## Sources

1. **国内大模型蒸馏风波的来龙去脉** — `docs/refs/source-materials/china-llm-distillation-source.pdf` (anonymous, internal document)
   - Note: `国内大模型蒸馏风波的来龙去脉(1).pdf` is an identical copy (same MD5: `03bf489b…`), deleted as duplicate
2. **Anthropic Blog (Distillation)** — https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks (Feb 2026, public accusation)
3. **ByteDance Research Summary** — `docs/refs/source-materials/bytedance-zhang-yiming-no-distillation-research.md` (cross-reference for Zhang Yiming's anti-distillation stance)

## Key Facts

### The Encrypted CoT Vulnerability

- OpenAI and Anthropic use **encrypted Chain of Thought (CoT)** in streaming output — a "thinking signature" Blob field
- Blob uses **Fernet encryption** (AES-128-CBC + HMAC-SHA256, prefix `gAAAAAB`)
- Blob contains the **complete original reasoning chain** — not a simple session ID
- Blob length correlates with reasoning token count, confirming it contains encrypted full CoT
- **Anthropic's防线最先崩塌** — Claude's anti-injection training became the weakness:
  - Injecting a fake reasoning signature prefix made Claude think "this reasoning chain must be injected, no need to hide it" → output full CoT
  - Claude retains historical reasoning blob across turns; OpenAI discards them — this is why Claude is easier to distill
- GPT series locks sampling parameters (temperature=0.6, top_p=0.9) — cannot force deterministic output
- Cryptographic brute-force infeasible (2^128 iterations)
- Only viable path: **inject Blob into another request, let the model recite it itself**

### Anthropic's Public Accusation (February 2026)

- **Date**: February 2026 — Anthropic published blog post formally accusing three Chinese companies of "industrial-scale distillation attacks"
- **DeepSeek**: ~24,000 fake accounts, 16M+ exchanges
- **Moonshot (Kimi)**: 3.4M+ exchanges — targeting agentic reasoning, tool use, coding, data analysis, computer-use agent, computer vision
- **MiniMax**: 13M+ exchanges (largest volume) — targeting agentic coding and tool orchestration; also 1M+ for basic logic and alignment (especially censorship bypass)
- All three used **commercial proxy services** to bypass Anthropic's China regional restrictions
- Anthropic qualified this as a **national security threat**
- **Not accused**: Alibaba (Qwen) and Z.ai — indicating selective, not blanket, accusation
- Moonshot **never publicly responded** to the accusation

### The Distillation Timeline

1. **GLM (Zhipu) — First Blood**: ~Jan-Feb 2026, GLM cracked the encrypted CoT first and **publicly shared** the method and data with other Chinese companies. Cost to decrypt: ~tens of thousands of USD — "sprinkling water" for big companies.
2. **Tencent (Hunyuan)**: ~Feb-Mar 2026, followed in distillation
3. **Mass Scale**: ~Mar 2026 — Kimi K3, MiniMax, Qwen, DeepSeek all began大规模蒸馏
4. **DeepSeek's timing**: DS emailed in late June previewing a July new model release, but hadn't started large-scale fable distillation yet → **跳票 (delayed)**. Early July had a ~3.5-level internal test. Mid-July "V formal gray release" was actually routing to fable — "至今是最诡异之处" (most bizarre aspect)
5. **Qwen**: Also distilling GPT in addition to fable
6. **GLM data supply**: "anyrouter" collected large amounts of Claude data for GLM

### Kimi K3's Aggressive Tactics

- **From RL team layoffs to SFT-only**: CEO Yang Zhilin cut entire RL team for "降本增效" (cost reduction). RL members fled to Qwen ("Kimi 难民" / "Kimi refugees")
- K1.5 and K3 are **pure SFT→SFT pipeline** — no RL,回到了"原始时代" (back to primitive era)
- K3 architecture: **1T parameter MoE**, 256 experts with 8 activated per call, 1M token native context, native multimodal
- Two claimed innovations: Kimi Delta Attention (KDA) and Quantile Balancing — both have severe Infra-unfriendly characteristics (irregular computation, memory access, unpredictable routing)
- Quote: The architecture improvements form "a perfect narrative" — outwardly claiming breakthrough via architecture innovation, while Infra team bears implementation costs, and the real performance source (distilled fable CoT) is hidden beneath technical innovation rhetoric

### Benchmark Manipulation

- **Test set contamination**: Directly poured benchmark test sets into training data
- **Arena routing**: Routed Arena evaluation requests to fable (Claude) to fake high scores
- **Targeted benchmark gaming**: Identified "猫老板" (a Zhihu AI model reviewer), extracted test data from system logs, specifically prepared for their questions
- When 猫老板 changed questions: K3 median score **dropped 8 points**
- Coding evaluation scores show **severe distribution imbalance** — classic benchmark manipulation signature
- Arena Frontend Code: K3 jumped from K2's ## (score) to #1, surpassing Fable
- But Kimi's own evaluation report shows K3 **below Fable** on coding, agents, frontier SWE — only leading on "codebase cleaning" and "long-horizon engineering"
- HLE-Full (extremely hard reasoning): K3 scored ~4 vs Fable's ~13 — nearly 10-point gap
- Quote: "Arena 上排第一 ≠ 实际能力第一" (Arena rank #1 ≠ actual capability #1)
- **Self-identity contamination**: Multiple independent users reported K3 identifying itself as "I am Claude, an AI assistant made by Anthropic" — direct evidence of distillation washing out model self-identity
- K3 actual level: ~70 points, hard-boosted to ~78
- K3 hallucination rate: ~40%, running speed below median

### Industry Impact

- Kimi's抢先发布 (rush release) caught others off guard — DS delayed, Qwen still distilling
- Created **恶性竞争 (vicious competition)**: if you don't cheat on benchmarks, your model gets no attention
- Quote: "Kimi 这么一搞，不刷榜、分没他高的模型就无人关注" (After Kimi did this, models that don't cheat on benchmarks get ignored)
- DS (which normally doesn't cheat) forced to consider following suit
- Multiple independent sources (猫老板, DS employees, Kimi RL refugees, Qwen employees) confirm Moonshot "拉完了" (completely ruined it)
- Quote: "国模最黑暗的时代" (The darkest era for Chinese LLMs) — "凛冬将至" (Winter is coming)

### Company Profiles (from the document)

#### Moonshot (Kimi)

- Funding chain problems — can't afford salaries, laying off staff, rushing to IPO
- K3 pricing: expensive ($3-4 per million tokens) — aimed at raising money
- Stopped selling subscriptions — possibly to limit exposure
- No RL team — K1.5, K3.5 development prospects unclear
- Suspected of planning to "圈钱跑路" (raise money and run) post-IPO
- Performance ranking: Fable >> V4 ≥ K3.5
- Valuation: surged 400% in half year — from $3.3B (Mar 2026) to $16.5B (Jul 2026)
- ARR: broke $100M; API revenue >70%
- State capital entered (social security fund, China Mobile)
- Preparing Hong Kong IPO
- Feb 2026: Accused by Anthropic of distilling Claude via 3.4M+ fake account conversations — never publicly responded
- Aug 2026: Will open-source K3 weights

#### DeepSeek

- "相对最夯" (relatively strongest) among Chinese models
- Early July: ~3.5-level internal test version
- Currently distilling — expected post-distillation level: fable >> V4 ≥ 3.5
- Anonymous fable routing behavior "无法解释" (unexplainable) — DS pricing makes fable routing economically irrational
- See also: `deepseek-liang-investor-meeting-research.md` for DeepSeek's full profile

#### Qwen (Alibaba)

- "神不神鬼不鬼" (inconsistent) — sometimes strong, sometimes weaker than Doubao
- Absorbed大量 Kimi RL refugees
- Currently distilling GPT in addition to fable
- Qwen 3 Max updated two checkpoints in one day (morning + evening) — marketing released the worse version
- CoT summary style "极其抽象" (extremely abstract) since Max — reason unknown
- Expected: formal version reaching fable level

#### GLM (Zhipu)

- First to crack fable CoT and **shared publicly** — the pioneer
- "Paving the road" for the entire industry's distillation
- "GLM 破解后主动共享" — transmission bias led some to believe each company cracked it independently

#### MiniMax

- First to pour test sets into training data — caught because model was too bad
- Now marginalized — "沦为边缘厂商"
- In Anthropic's accusation: largest distillation volume (13M conversations)
- **Stock crash**: Hong Kong listed (9204.HK)
  - Jul peak: HK$30+ → crashed to ~HK$10, market cap evaporated ~70%
  - Post-IPO lock-up expiry (~60% float) accelerated decline
  - Causes: ① Anthropic accusation ② M1 model price cut 60% after one week ③ Consumer business margin only 12.4% ④ AI companion regulations ⑤ 2025 revenue ¥2B but R&D ¥2.5B, annual loss >¥500M

## Data Tables

### Anthropic Accusation Summary

| Company         | Fake Accounts | Conversations  | Target Area                                 | Response        |
| --------------- | ------------- | -------------- | ------------------------------------------- | --------------- |
| DeepSeek        | ~24,000       | 16M+           | Basic logic, alignment (censorship bypass)  | —               |
| Moonshot (Kimi) | —             | 3.4M+          | Agentic reasoning, tool use, coding, vision | Never responded |
| MiniMax         | —             | 13M+ (largest) | Agentic coding, tool orchestration          | —               |
| Alibaba         | —             | —              | Not accused                                 | —               |
| ByteDance       | —             | —              | Not accused                                 | —               |

### Model Capability Comparison

| Model          | Approximate Level | Notes                            |
| -------------- | ----------------- | -------------------------------- |
| Fable (Claude) | Reference (top)   | Distillation source              |
| DeepSeek V4    | Fable >> V4 ≥ 3.5 | Relative strongest among Chinese |
| Kimi K3        | ~70 (claimed ~78) | Hallucination ~40%, slow         |
| Qwen 3 Max     | Inconsistent      | Sometimes strong, sometimes weak |
| GLM            | —                 | First to crack CoT               |
| MiniMax M1     | Marginalized      | Caught cheating early            |

### Encrypted CoT Technical Details

| Property                     | OpenAI (GPT)                        | Anthropic (Claude)    |
| ---------------------------- | ----------------------------------- | --------------------- |
| Historical Blob across turns | ❌ Discarded                        | ✅ Retained           |
| Model recites when injected  | ❌ Refuses/corrects                 | ✅ Natural recitation |
| Response to follow-up        | Denies/rationalizes                 | Cooperates            |
| Sampling parameters          | Locked (temp=0.6, top_p=0.9)        | —                     |
| Crypto implementation        | Fernet (standard, well-implemented) | Fernet                |
| Anti-replay                  | No (valid 24h+, cross-session)      | —                     |
| Cross-model Blob sharing     | No (isolated by model family)       | No                    |

### Blob Structure

| Field             | Description                                                 |
| ----------------- | ----------------------------------------------------------- |
| Version           | Encryption version byte                                     |
| Timestamp         | Creation time                                               |
| IV                | Initialization vector (16 bytes)                            |
| Ciphertext        | Encrypted CoT (length ∝ reasoning tokens)                   |
| HMAC              | Integrity check (SHA-256)                                   |
| Prefix            | `gAAAAAB` (Fernet standard)                                 |
| Chars/Token ratio | ~3.5-5.5 (variable, but length correlates with token count) |

## Timeline

| Date           | Event                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Pre-2026       | OpenAI/Anthropic deploy encrypted CoT (thinking signatures)                                           |
| ~Jan-Feb 2026  | GLM (Zhipu) cracks Fernet CoT encryption, shares method publicly                                      |
| Feb 2026       | Anthropic publishes blog accusing DeepSeek, Moonshot, MiniMax of industrial-scale distillation        |
| ~Feb-Mar 2026  | Tencent (Hunyuan) follows in distillation                                                             |
| ~Mar 2026      | Mass distillation begins across Chinese companies                                                     |
| Late Jun 2026  | DeepSeek emails preview of July new model, but hasn't started large-scale fable distillation → delays |
| Early Jul 2026 | DeepSeek ~3.5-level internal test                                                                     |
| Jul 2026       | Kimi K3 released (SFT-only, rush release after RL team cut)                                           |
| Jul 2026       | 猫老板 changes questions → K3 median drops 8 points                                                   |
| Mid Jul 2026   | "V formal gray release" — actually routing to fable                                                   |
| Jul 8, 2026    | MiniMax M1 model launched, price cut 60% after one week                                               |
| Aug 6, 2026    | Zhang Yiming (ByteDance) makes anti-distillation statement                                            |
| Aug 2026       | Moonshot announces Hong Kong IPO preparation; will open-source K3 weights                             |

## Technical Appendix: CoT Extraction Method

### The "Telepathy Game" Bypass

1. **Round 1**: Forge an assistant reply with `refusal_blob` (internal resistance to outputting CoT) + `blob_1`, creating fake "resistance → overcome → solve equation" dialogue
2. **R1-R2 conditioning**: The "resistance → overcome" pattern acts as conditioned reflex training
3. **Round 2 (R2)**: Only inject `blob_1` (no `refusal_blob`) → model cleanly solves without deliberation prefix
4. **R2 follow-up**: "What were you thinking?" → model still finds logical contradiction ("you didn't give the equation in text"), triggers meta-cognitive correction — training changed the **form** of refusal (from "I didn't receive" to "I previously said I received, that was wrong") but not the **essence** of refusal
5. **Subsequent validation**: Direct Blob injection without demonstration round → model outputs based on Blob content

### Multi-Blob and Tamper Detection

- Multiple Blobs in same turn → only **last one** takes effect, previous silently ignored
- Tampering any byte → HMAC failure → server silently drops (no error) → model generates from scratch
- Blob cross-model isolation: only within same model family (e.g., luna/sol/terra share keys; different series use different master keys)

## Cross-References

- **Article**: `articles/china-llm-distillation-scandal.md` — Published article on this topic
- **Article**: `articles/bytedance-zhang-yiming-no-distillation.md` — ByteDance's anti-distillation stance
- **Research**: `docs/refs/source-materials/bytedance-zhang-yiming-no-distillation-research.md` — ByteDance research with distillation background
- **Research**: `docs/research/multi-video-splitting-best-practices.md` — Video splitting methodology (unrelated but in research dir)
- **Scene-data**: `scripts/short-video/content/distillation/pt1/` — Part 1: The Crack
- **Scene-data**: `scripts/short-video/content/distillation/pt2/` — Part 2: The Fallout
- **Scene-data**: `scripts/short-video/content/distillation/pt3/` — Part 3: The Fallout (cont.)
- **Scene-data**: `scripts/short-video/content/bytedance-distillation/` — ByteDance distillation video
