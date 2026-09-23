# OCR Scan Report: src/components/widgets

**Date**: 2026-09-20
**Tool**: open-code-review v1.12.6
**Provider**: Ollama (qwen3:8b local)
**Scope**: 37 files in src/components/widgets/ (3 test files filtered)
**Duration**: ~66 minutes
**Concurrency**: 4, --no-plan

## Summary

- **Total comments**: 28
- **Critical**: 1
- **High**: 3
- **Medium**: 21
- **Low**: 3

## Findings

### 1. [CRITICAL] src/components/widgets/content-splitter.ts:18-18 (bug)

The regex pattern fails to capture widget names containing whitespace. The current regex uses \S+ which only matches non-whitespace characters, but widget names may include spaces. This leads to incorrect parsing of widget names with spaces.

### 2. [HIGH] src/components/widgets/deepseek-agi-roadmap/data/phases.ts:0-0 (other)

The 'agents' phase (2025) has status 'current' but 2025 is already in the past relative to current year 2026. Update status to 'past'.

### 3. [HIGH] src/components/widgets/distillation/data/moonshot-funding.ts:0-0 (security)

Hardcoded URLs in FundingEvent objects violate security guidelines. Business-related URLs should not be hardcoded and should be externalized to configuration or environment variables.

### 4. [HIGH] src/components/widgets/distillation/minimax-stock-view.tsx:0-0 (performance)

The linePath and areaPath are computed outside the component, leading to stale data if PRICED changes. These should be calculated inside the component to ensure reactivity.

### 5. [MEDIUM] src/components/widgets/deepseek-agi-roadmap/data/phases.ts:0-0 (maintainability)

Inconsistent casing between 'period' and 'status' fields. 'Past'/'Future' in period should match lowercase 'past'/'future' in status for consistency.

### 6. [MEDIUM] src/components/widgets/deepseek/data/people.ts:12-12 (maintainability)

The 'depart' property name may be a typo. It appears to represent a departure year, but 'depart' is not a standard term. Consider renaming to 'departureYear' or 'leftYear' for clarity.

### 7. [MEDIUM] src/components/widgets/deepseek/data/companies.ts:14-16 (maintainability)

The 'group' property in the Company interface should reference the 'id' from CompanyGroup to ensure consistency and avoid potential mismatches.

### 8. [MEDIUM] src/components/widgets/deepseek/data/companies.ts:8-9 (maintainability)

The 'tone' and 'toneClass' fields in the Quote interface appear redundant. Consider consolidating them into a single field or using an enum for better type safety.

### 9. [MEDIUM] src/components/widgets/deepseek-agi-roadmap/data/phases.ts:0-0 (maintainability)

The 'embodied' phase's period 'Beyond' is ambiguous. Consider specifying a year or time frame for clarity.

### 10. [MEDIUM] src/components/widgets/deepseek/data/funding.ts:0-0 (performance)

Potential null pointer exceptions when accessing nullable fields like 'amount' and 'valuation'. Use optional chaining or null checks to avoid runtime errors.

### 11. [MEDIUM] src/components/widgets/distillation/data/benchmarks.ts:62-62 (maintainability)

Hardcoded model colors in MODEL_META may limit flexibility. Consider using a separate configuration file or environment variables for them.

### 12. [MEDIUM] src/components/widgets/distillation/data/moonshot-funding.ts:0-0 (maintainability)

SUMMARY_CARDS contains hardcoded business values ($3.5B, $35B, etc.) which should be externalized to configuration files to avoid hardcoding business data.

### 13. [MEDIUM] src/components/widgets/deepseek-oss-comparison/oss-comparison-view.tsx:16-17 (maintainability)

The `getStrategyColor` function uses string comparisons for company names. This could fail if the company names in `COMPANIES` aren't strictly capitalized (e.g., 'deepseek' vs 'DeepSeek'). Consider using a case-insensitive comparison or normalizing input first.

### 14. [MEDIUM] src/components/widgets/deepseek-vision/vision-keywords-view.tsx:24-25 (maintainability)

The calculation of maxFreq and minFreq assumes the KEYWORDS array is sorted. If the array is not sorted, this will lead to incorrect t values. Use Math.max and Math.min to ensure correct calculation.

### 15. [MEDIUM] src/components/widgets/deepseek-agi-roadmap/agi-roadmap-view.tsx:20-29 (maintainability)

Duplicate logic in getStatusColor and getStatusBorder functions. Consolidate into a single function returning an object with color and border properties.

### 16. [MEDIUM] src/components/widgets/deepseek-agi-roadmap/agi-roadmap-view.tsx:4-12 (maintainability)

Translations object is duplicated in component. Consider extracting to a shared i18n module for better maintainability.

### 17. [MEDIUM] src/components/widgets/deepseek-vision/vision-keywords-view.tsx:0-0 (maintainability)

The getColor function has repetitive logic that can be refactored into a loop or mathematical formula to reduce redundancy.

### 18. [MEDIUM] src/components/widgets/deepseek/pricing-view.tsx:105-105 (performance)

The calculation of `pct` uses Math.log which may not be necessary. Consider using a linear scale for better performance and readability.

### 19. [MEDIUM] src/components/widgets/deepseek/talent-view.tsx:20-20 (security)

Potential null dereference in p.salary split operation. If p.salary is undefined, splitting will throw an error.

### 20. [MEDIUM] src/components/widgets/deepseek/talent-view.tsx:21-21 (security)

Potential null dereference in p.salaryKnown check. If p.salaryKnown is undefined, this will cause an error.

### 21. [MEDIUM] src/components/widgets/deepseek/pricing-view.tsx:0-0 (maintainability)

Redundant calculation of `toDisplay` in both `sorted` and `prices` arrays. Consider extracting this logic into a single function.

### 22. [MEDIUM] src/components/widgets/deepseek/pricing-view.tsx:138-140 (performance)

The `backgroundImage` for overseas models uses a repeating-linear-gradient which could be performance-intensive. Consider using a simpler gradient or CSS class.

### 23. [MEDIUM] src/components/widgets/distillation/minimax-stock-view.tsx:0-0 (security)

The active.url in the anchor tag could be a security risk if not sanitized. Use sanitizeUrl or similar to prevent XSS.

### 24. [MEDIUM] src/components/widgets/zhipu-financials/financials-view.tsx:0-0 (maintainability)

Potential runtime errors due to missing null checks when accessing properties like m.trend, m.value, and INFRASTRUCTURE properties. Add optional chaining or default values to prevent crashes.

### 25. [MEDIUM] src/components/widgets/distillation/minimax-stock-view.tsx:0-0 (maintainability)

Hardcoded SVG dimensions (W, H, padding) make the component less adaptable to different screen sizes. Consider using responsive design techniques.

### 26. [LOW] src/components/widgets/distillation/data/minimax-stock.ts:0-0 (maintainability)

Inconsistent shortDate formatting in STOCK_POINTS array. 'Feb 2026' → 'Feb', 'Jul 9, 2026' → 'Jul 9', 'Jul 2026' → 'Jul', and 'Late Jul 2026' → 'Jul 28' creates potential confusion. Consider standardizing shortDate format (e.g., 'MMM YYYY' or 'MMM D, YYYY') for consistency.

### 27. [LOW] src/components/widgets/deepseek-agi-roadmap/agi-roadmap-view.tsx:117-120 (security)

Direct use of innerHTML is not present, but ensure all user-generated content is properly escaped to prevent XSS.

### 28. [LOW] src/components/widgets/deepseek/pricing-view.tsx:0-0 (security)

Potential XSS risk in `formatPrice` when formatting numbers with toFixed. Ensure proper escaping of dynamic content.

