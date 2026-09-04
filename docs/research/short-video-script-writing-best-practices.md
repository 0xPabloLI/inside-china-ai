# Deep Research: Short Video Script Writing Best Practices

> **Research date**: 2026-08-13
> **Depth tier**: Standard (SCOPE → PLAN → RETRIEVE → TRIANGULATE → SYNTHESIZE → PACKAGE)
> **Research question**: What are the proven best practices and psychological techniques for writing short-form video scripts (TikTok/Reels/Shorts) that maximize retention and engagement? How can they be applied to improve our China AI News video scripts?

## Executive Summary

After surveying 15+ sources across content marketing platforms, creator blogs, and social media psychology articles, five frameworks emerge as the most actionable for our use case. The **S.T.A.R.T. framework** (Stop, Tease, Authority, Relay, Tell) provides the overall script skeleton; **open loops** and **pattern interrupts** are the two psychological engines that drive retention between scenes; and the **Hook-Value-Payoff** three-beat structure is the minimum viable script shape. Critically, the research reveals that our current scripts suffer from three systemic weaknesses: (1) flat emotional arcs with no tension peaks, (2) teleprompter-uniform VO line lengths that kill natural rhythm, and (3) hooks that state facts instead of creating curiosity gaps. The fixes are specific and implementable within our existing scene-data structure.

## Key Findings

### 1. The S.T.A.R.T. Framework — Script Skeleton [1][2][3]

ScriptStorm.ai's S.T.A.R.T. framework is the most cited script structure in the 2025-2026 short-form video space, appearing across 8+ of their articles and referenced by multiple other creators [1][2][3]. It maps cleanly onto our 6-10 scene structure:

| Letter | Name      | Job                                                                         | Timing | Our Equivalent        |
| ------ | --------- | --------------------------------------------------------------------------- | ------ | --------------------- |
| **S**  | Stop      | Scroll-stopping first line. Pattern interrupt, bold claim, or visual shock. | 0-3s   | Scene 1 (hook)        |
| **T**  | Tease     | Tease the payoff without revealing it. Create an open loop.                 | 3-8s   | Scene 2 (early body)  |
| **A**  | Authority | Add fast proof. Cite a source, show data, establish credibility.            | 8-20s  | Body scenes with data |
| **R**  | Relay     | Deliver the value. Reveal the answer, tell the story.                       | 20-50s | Core body scenes      |
| **T**  | Tell      | Strong, specific CTA. Not "like and subscribe."                             | 50-60s | Last scene (CTA)      |

**Key insight**: The "Tease" step is almost entirely missing from our current scripts. We go straight from Hook to Context/Paper details without teasing what the viewer will learn. This is the single biggest structural gap.

### 2. Psychological Retention Engines [4][5][6][7]

Three psychological techniques are repeatedly cited as the engines of retention in short-form video:

**Open Loop** [4][5]: Start a thought, don't finish it. The viewer's brain craves closure like it craves oxygen. Example: "China built something unprecedented. But what it actually did is worse than anyone expected." The brain stays watching to close the loop.

**Pattern Interrupt** [6][7]: Break the viewer's expectations at regular intervals. A sudden change in tone, a shocking visual, a contradiction. This re-engages attention every 10-15 seconds. Without pattern interrupts, attention decays linearly after the hook.

**Curiosity Gap** [5][6]: Tease without revealing. "Don't buy another camera until you see this." The gap between what the viewer knows and what they want to know creates forward momentum. The wider the gap, the longer they watch.

**Application to our scripts**: Our current scripts have zero open loops. Each scene delivers its information and moves on. There's no unresolved question pulling the viewer from Scene 3 to Scene 4. Adding a tease in Scene 2 ("But here's what nobody noticed...") would create an open loop that doesn't close until Scene 7 or 8.

### 3. Hook Formulas That Work [1][8][9]

From the research, five hook formula types consistently appear across sources:

| Formula              | Pattern                                              | Example (our domain)                                                                            | When to use              |
| -------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------ |
| **Shocking Number**  | "[Big number] + [unexpected context]"                | "$118B poured into a robot company that admits its robots can't work."                          | Data-driven stories      |
| **Contradiction**    | "[X] is happening, but [opposite of X] is also true" | "China's biggest AI simulation rewrote 4 million minds. The paper never mentions re-education." | Twist stories            |
| **Curiosity Gap**    | "Don't [common action] until you see [this]"         | "Don't dismiss Chinese humanoid robots until you see what their own filing admits."             | Product/analysis         |
| **Problem/Solution** | "You're doing [X] wrong. Here's the fix."            | Less applicable to news format                                                                  | How-to content           |
| **Question**         | "What if [assumption] was wrong?"                    | "What if the billion-agent simulation isn't about AI at all?"                                   | Philosophical/analytical |

**Our current hooks**: We use the Shocking Number formula almost exclusively. The Unitree hook ("$118B into a robot company that admits its robots can't work") is actually strong. But we should rotate formulas to avoid fatigue across videos.

### 4. Writing Style — Write for the Ear, Not the Eye [1][8][10]

Multiple sources converge on the same writing style rules:

- **Contractions**: Use "don't," "can't," "it's" — not "do not," "cannot," "it is"
- **Fragments**: Sentence fragments are fine in spoken language. "Not random bots." is better than "These are not random bots."
- **Short sentences**: Hook sentences should be ≤10 words [10]. Body sentences ≤25 words (one breath)
- **No hedging**: Kill "maybe," "sort of," "kinda," "perhaps" [1]. These signal uncertainty and kill authority
- **No written openers**: Never start with "In this video," "Today we'll," "According to" [1][8]. Open on the payoff
- **Vary line length**: Mix 3-word punch lines with 15-word context lines. Uniform lengths = teleprompter rhythm = AI feel [1][8]
- **One idea per line**: Each VO line carries one idea. If it carries two, split it

**Our current scripts**: We follow most of these rules (our scene-rules.mjs enforces no em-dashes, no AI vocabulary, no written openers, one-breath check, teleprompter rhythm check). But we're still too uniform. The light-society script has VO lines of 14, 15, 16, 16, 15, 15, 15, 14, 14, 6 words. The rhythm is too flat — we need more 3-5 word punch lines mixed in.

### 5. The Payoff — Loop Closure and CTA [8][9]

Two ending strategies dominate the research:

**Perfect Loop** [8]: The last frame flows back into the first. The ending recontextualizes the opening, so a rewatch hits differently. This boosts average view duration — a key algorithmic signal.

Example (our domain): If the hook is "China built a billion-agent simulation," the ending should reference "billion" or "simulation" in a new light: "One billion simulated humans. And we're the ones being simulated."

**Specific CTA** [8][9]: Generic CTAs ("like and subscribe," "follow for more") are dead closers. Specific CTAs drive 3-5x more engagement:

- "Comment which Chinese AI company I should cover next"
- "Save this before your next AI investment"
- "Follow for Part 2: what the simulation discovered about human behavior"

**Our current scripts**: Our CTA ("Follow for more China AI") is a generic dead closer. The unitree CTA is slightly better ("Robots that can't work, but investors don't care") because it loops back to the hook, but the "Follow for more" prefix is still generic.

### 6. Retention Data Points [9][10][11]

- Scripted videos achieve 40-60% retention vs 25-35% for unscripted [9]
- The first 30 seconds decide whether the algorithm pushes the video [9]
- Videos under 10 seconds have the highest completion rates [11], but 30-60s is the sweet spot for value delivery [10]
- 3-second increments: viewers consume content in 3-second micro-decisions [10]. Every 3 seconds, the viewer re-decides whether to keep watching
- 68% of marketers plan to increase short-form video investment in 2025-2026 [10]

### 7. Common Script Killers [1][4][6][8][10]

Synthesized from multiple sources, these are the most cited reasons scripts fail:

1. **Saving the best point for later** — tease it early, deliver it late [1][8]
2. **Slow intros with winding setup** — open on the payoff, not the context [1][8]
3. **Generic CTAs** — "like and subscribe" is a dead closer [8][9]
4. **Side stories and tangents** — one idea per video, zero fluff [8]
5. **Flat pacing** — no tension peaks, no rhythm variation [1][10]
6. **Teleprompter-uniform line lengths** — sounds like AI, not human [1]
7. **Hedging language** — "maybe," "sort of," "kinda" kill authority [1]
8. **Written-style openers** — "In this video, we'll explore..." [1][8]
9. **No open loops** — each scene is self-contained, nothing pulls forward [4][5]
10. **No pattern interrupts** — attention decays without disruption [6][7]

## Detailed Analysis: Current Scripts vs Best Practices

### Diagnosis of Light Society Script

| Scene                 | VO Words | Issue                                                                                                                                    |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (hook)              | 14       | Good shocking number, but no open loop. States the fact, doesn't tease.                                                                  |
| 2 (tweet)             | 15       | Context scene. No tension. Could be an open loop: "The tweet went viral. The truth is bigger." — but then doesn't deliver until Scene 8. |
| 3 (paper)             | 16       | Pure info delivery. No emotional hook.                                                                                                   |
| 4 (real-data)         | 16       | Good contrast structure, but VO is a list of facts.                                                                                      |
| 5 (scale)             | 15       | Good comparison, but flat delivery.                                                                                                      |
| 6 (trust-games)       | 15       | "The simulation mirrors real human behavior." — this is the emotional payoff, but it's buried in Scene 6 of 10.                          |
| 7 (opinion-diffusion) | 15       | Good data, but no tension.                                                                                                               |
| 8 (real-story)        | 14       | This is the twist — but it arrives too late and with no buildup.                                                                         |
| 9 (philosophy)        | 14       | Good philosophical question, but disconnected from the narrative.                                                                        |
| 10 (cta)              | 6        | Generic CTA. "One billion simulated humans. Follow for more China AI." — doesn't loop back meaningfully.                                 |

**Rhythm**: 14, 15, 16, 16, 15, 15, 15, 14, 14, 6 — Too uniform. No punch lines. No 3-5 word lines in the body.

**Open loops**: Zero. Each scene is self-contained.

**Tension curve**: Flat. No peak. The twist in Scene 8 doesn't feel earned because there was no buildup.

### Diagnosis of Unitree Script

| Scene                  | VO Words | Issue                                                                                                  |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| 1 (hook)               | 17       | Strong hook with contradiction. But doesn't tease what's coming.                                       |
| 2 (ipo-details)        | 16       | Pure context. No tension.                                                                              |
| 3 (oversubscription)   | 16       | Good data, but flat delivery.                                                                          |
| 4 (company-background) | 17       | Founder bio. Filler. Could be cut or condensed.                                                        |
| 5 (products)           | 15       | "But their own IPO filing tells a different story." — Good tease! But it's in Scene 5, not Scene 2.    |
| 6 (the-catch)          | 15       | The payoff. But it arrives too late — viewer may have left by Scene 6.                                 |
| 7 (deepseek-backing)   | 14       | Context that doesn't advance the main narrative.                                                       |
| 8 (agibot-rivalry)     | 14       | Interesting but tangential.                                                                            |
| 9 (china-dominance)    | 13       | Good data point.                                                                                       |
| 10 (cta)               | 12       | Better loop closure ("Robots that can't work, but investors don't care") but still generic CTA prefix. |

**Rhythm**: 17, 16, 16, 17, 15, 15, 14, 14, 13, 12 — Gradually decreasing, which is okay, but no punch lines.

**Open loops**: One (Scene 5: "filing tells a different story"), but it's too late. Should be in Scene 2.

**Tension curve**: The contradiction in the hook is strong, but the middle section (Scenes 3-4) is flat context that kills momentum.

## Actionable Recommendations

### R1: Add a Tease Scene (S.T.A.R.T. "T" step)

After the hook, add a 2-3 second tease that creates an open loop. This is the single highest-impact change.

**Before** (light-society):

- Scene 1: "China built the first simulation of one billion AI humans. Four million had their beliefs rewritten in 14 hours."
- Scene 2: "A viral tweet from Jason said China sent agents to camps. The real story is bigger."

**After**:

- Scene 1: "China built the first simulation of one billion AI humans. Four million had their beliefs rewritten in 14 hours."
- Scene 2: "But the paper never mentions re-education. What it actually did is scarier." ← Open loop, doesn't close until Scene 8

### R2: Break the Teleprompter Rhythm

Insert 3-5 word punch lines between 15-word context lines.

**Before**:

- "Agent profiles come from the World Values Survey. 96,000 real respondents. Age, income, education, and values. Not random bots." (16 words)

**After**:

- "Real survey data. 96,000 respondents. Age, income, values." (8 words) ← Shorter, punchier
- "Not random bots." (3 words) ← Punch line

### R3: Front-Load the Contradiction

Move the twist/contradiction tease from Scene 5-8 to Scene 2. The viewer should feel the tension from the second scene.

**Unitree example**: Move "But their own IPO filing tells a different story" from Scene 5 to Scene 2, right after the IPO announcement.

### R4: Replace Generic CTAs with Specific Asks

**Before**: "Follow for more China AI."
**After**: "Follow for Part 2: what the billion-agent simulation discovered about human behavior."

Or loop-closure style: "One billion simulated minds. The question is: are we next?" (no explicit CTA, but creates rewatch impulse)

### R5: Add Pattern Interrupts Every 2-3 Scenes

A pattern interrupt can be:

- A sudden question: "But here's the scary part."
- A tonal shift: From data delivery to emotional reaction
- A visual contradiction: Show one thing, say another
- A direct address: "You need to understand this."

Insert one pattern interrupt around Scene 4-5 to re-engage attention after the initial context delivery.

### R6: Use Multiple Hook Formula Types

Rotate between:

- Shocking Number (current default)
- Contradiction ("X happened, but Y is also true")
- Curiosity Gap ("Don't dismiss X until you see Y")
- Question ("What if X isn't about Y at all?")

This prevents formula fatigue across videos.

## Contrarian Views & Risks

1. **Over-scripting kills authenticity**: Some creators (Alex Cattoni on LinkedIn) advocate for outlines over full scripts, arguing that natural delivery outperforms scripted perfection. This applies more to personality-driven content than our data-news format — our TTS pipeline requires full scripts by design.

2. **Hook fatigue**: The 3-second hook rule is so widely preached that viewers may be developing immunity to pattern interrupts. The research doesn't account for "hook blindness" — the phenomenon where viewers recognize hook formulas and scroll anyway. Mitigation: rotate formulas and avoid the most overused patterns ("Stop scrolling," "You won't believe").

3. **Algorithm vs human preference**: What retains viewers isn't always what satisfies them. A perfectly engineered open loop that never closes may boost retention metrics but leave viewers feeling manipulated. Balance engineering with genuine value delivery.

4. **Tier 3 source caveat**: Most sources in this research are Tier 3 (blog posts, content marketing). The S.T.A.R.T. framework, while widely cited, is not backed by peer-reviewed retention studies. The psychological techniques (open loops, pattern interrupts) are well-established in cognitive psychology but their specific application to short-form video is anecdotal.

## Open Questions

1. **How does our TTS voice affect retention?** The research assumes human delivery with natural prosody. Our TTS voice may need different pacing strategies to compensate for synthetic delivery limitations.

2. **What's the optimal tension curve shape?** The research says "not flat" but doesn't specify whether it should be ascending (build to climax), wave (multiple peaks), or descending (hook peak → gradual release). Our multi-video splitting research [12] suggests 70% completion rate threshold, which implies front-loading value.

3. **How do pattern interrupts work in a data-visualization format?** Our videos are motion graphics, not talking-head. Pattern interrupts in UGC (sudden jump cuts, expression changes) may not translate. We need visual pattern interrupts: color shifts, layout breaks, unexpected animations.

4. **Does the S.T.A.R.T. framework work for news vs entertainment?** Our content is news/analysis, not entertainment. The "Tease" step may feel manipulative in a news context. We need to find a news-appropriate tease style (e.g., "But the filing reveals something else" instead of "You won't believe what happened next").

## Sources

1. ScriptStorm.ai — "Viral TikTok Scripts: 25 Data-Backed Tips to Win 2025 Fast" — Nov 10, 2025 — Tier 3
2. ScriptStorm.ai — "How to Write Viral TikTok Scripts in 2025: 27 Keys" — Dec 5, 2025 — Tier 3
3. ScriptStorm.ai — "Mastering Viral Video Scripts with the START Formula" — Jan 22, 2026 — Tier 3
4. Medium / @Mark Andrew — "3 Psychological Hooks That Make People Watch Your Shorts" — 7 months ago — Tier 3
5. Medium / Pop123 — "Your Content Is Good. So Why Is Nobody Watching It?" — Tier 3
6. ShortGenius — "10 Script Writing Techniques for Viral Videos in 2026" — 7 days ago — Tier 3
7. TransClipper — "10 TikTok Video Ideas That Will Go Viral in 2026" — Tier 3
8. Klap.app — "A Creator's Guide to Viral Short Videos on YouTube" — Mar 4, 2026 — Tier 2
9. Virvid — "Short Video Script Frameworks (With 5 Trending Examples)" — Nov 21, 2025 — Tier 3
10. Captions.ai — "Tips to write short-form video scripts that get views" — Jul 6, 2026 — Tier 3
11. Medium / George J. Ziogas — "The TikTok Effect: How Short Videos Are Rewiring Our Brains" — Tier 3
12. Internal: `docs/research/multi-video-splitting-best-practices.md` — Tier 1 (our own research)
13. LTX Studio — "Short-Form Video: Strategy, Formats, And AI Creation" — May 5, 2026 — Tier 2
14. Stratboost — "AI Script Templates for TikTok, Reels & Shorts (2026)" — Dec 9, 2025 — Tier 3
15. AICUT — "How to Write Video Scripts That Convert in 2026" — Tier 3

---

## Design Decisions & References

- **Why S.T.A.R.T. over other frameworks**: It maps most cleanly onto our existing 6-10 scene structure (Hook → Body → CTA). Other frameworks (HPC loop, Hook-Value-Payoff) are subsets of S.T.A.R.T.
- **Why focus on open loops**: Our scripts' biggest weakness is the absence of forward-pulling tension. Open loops are the lowest-effort, highest-impact fix.
- **Connection to existing rules**: Our `scene-rules.mjs` already enforces many of the writing style rules (no em-dashes, no AI vocabulary, one-breath check, teleprompter rhythm). The new recommendations complement these rules without conflicting.
- **Connection to multi-video splitting research** [12]: The 70% completion rate threshold means we need to front-load value and tension. The S.T.A.R.T. framework's "Tease" step helps by creating early tension without delaying value delivery.
