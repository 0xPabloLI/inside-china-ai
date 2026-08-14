---
name: brand-system
description: Enforce brand consistency across generated visual content (videos, thumbnails, graphics). Reads the project's brand spec document and applies its tokens, typography, and layout templates. Use when creating or modifying any visual content — scenes, thumbnails, UI graphics — to ensure brand consistency.
---

# Brand System

Enforce brand consistency by reading the project's brand spec and applying its tokens.

## Locate the brand spec

Read `docs/brand-system.md` in the project root. This is the **single source of truth** for all brand decisions — color tokens, typography, animation library, scene templates, content patterns.

If no `docs/brand-system.md` exists, ask the user to create one before proceeding with visual content.

## Apply tokens

Every visual artifact must use the CSS variables defined in the brand spec. Never hardcode colors — always reference the token (e.g., `var(--blue)`, not `#4d8bff`).

**Color semantics** — the brand spec defines what each color means (e.g., red = threat, green = positive). Apply these consistently: same entity always same color across all scenes and thumbnails.

## Scene templates

The brand spec defines layout templates for common scene types (hook, timeline, comparison, data-viz, VS card, staircase, talent flow, three-factor, CTA). When creating new scenes, match the closest template's structure, color usage, and animation timing.

## Implementation alignment

Brand spec (the "what") → implementation code (the "how"). When changing brand specs, update `docs/brand-system.md` first, then update implementation files to match. Never let the two drift.

## Content patterns

Apply the brand spec's content patterns — data anchors (oversized numbers as focal points), quotes (left-border accent, italic, keyword highlighted), verdicts (full-width stamp with glow). These patterns create visual rhythm across scenes.
