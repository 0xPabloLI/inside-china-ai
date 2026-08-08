# Element Iteration Method (Scientific A/B Testing)

> Source: 自媒体实战方法论 (乱码老师). A systematic approach to content optimization — not random testing, but controlled single-variable experiments.
>
> **Purpose**: This document preserves the methodology behind the A/B testing approach used in the video pipeline. `video-workflow.md` contains the execution commands; this document explains WHY the methodology works and HOW to think about iteration.

## Core Principle

Change ONE element per iteration. Keep what works, discard what doesn't.

## Iteration Cycle

1. Round 1: Discover element B works well → B + everything else
2. Round 2: Discover B + D works better → keep BD, swap other elements
3. Round 3: Discover B + D + E works even better → continue adding new variables
4. All good elements stay; all bad elements get eliminated. Each round changes only ONE element.

## What to Iterate On

- Hook formula (T1 cold-open vs T3 number reveal vs T4 question)
- Hook angle (same formula, different framing)
- Video length (30s vs 45s vs 60s)
- Posting time (morning vs evening)
- Visual style (data-heavy vs text-heavy)
- TTS engine/speed (F5 vs XTTS, 1.0x vs 1.15x)

## How to Use with ab-test-tracker.mjs

```bash
# Round 1: Test hook formula
ab-test-tracker.mjs add --variable hook --variant A --description "T1 cold-open"
ab-test-tracker.mjs add --variable hook --variant B --description "T3 number reveal"
# Record results, keep winner

# Round 2: Fix hook (use winner), test video length
ab-test-tracker.mjs add --variable length --variant A --description "30s"
ab-test-tracker.mjs add --variable length --variant B --description "45s"
# Record results, keep winner

# Round 3: Fix hook + length, test posting time
# ... continue
```

## Key Insight

"媒体终究是数据说话的事" (Media is ultimately a data-driven business). Don't rely on gut feeling — let the data decide which elements to keep.

## Related

- Title/Cover strategy principle: "封面给眼球，标题给算法。标题是给搜索和推荐算法看的，封面是给活人的眼睛看的。" (Source: 自媒体实战方法论)
- Content Publishing Red Lines: see `video-workflow.md` → Content Publishing Red Lines section
