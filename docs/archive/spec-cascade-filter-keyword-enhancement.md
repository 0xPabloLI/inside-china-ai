# Spec: Cascade-Filter Audit — Keyword Enhancement (Issue #51 V1a)

> Created: 2026-08-23. Archived after implementation.

## Problem

filterChinaAI keyword list too sparse — missed people names, company aliases, product names, policy terms.

## Scope: V1a only (enhance keywords, no LLM fallback)

## Implementation

- Expanded CHINA_AI_KEYWORDS with ~40 entries across 6 categories
- Added 8 test cases covering all scenario matrix rows
- Updated docs/content-pipeline.md filter description

## Scenario Matrix

| #   | Scenario                             | Status |
| --- | ------------------------------------ | ------ |
| 1   | CN person name match                 | PASS   |
| 2   | EN person name match                 | PASS   |
| 3   | CN company alias match               | PASS   |
| 4   | EN company alias match (hyphen)      | PASS   |
| 5   | Product name match                   | PASS   |
| 6   | Policy term match                    | PASS   |
| 7   | ai-in-training no match              | PASS   |
| 8   | extractKeywords returns new keywords | PASS   |

## Reference

- ADR-0016, Issue #51, Issue #33 (closed)
