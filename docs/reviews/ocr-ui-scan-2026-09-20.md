# OCR Scan Report: src/components/ui

**Date**: 2026-09-20
**Tool**: open-code-review v1.12.6
**Provider**: Ollama (qwen3:8b local)
**Scope**: shadcn/ui components
**Duration**: ~52 minutes

## Summary

- **Total comments**: 9
- **Critical**: 1
- **Medium**: 5
- **Low**: 3

## Findings

### 1. [CRITICAL] src/components/ui/context-menu.tsx:0-0 (performance)

Incorrect CSS syntax using parentheses instead of square brackets for CSS variables. This will cause styles to fail to apply.

### 2. [MEDIUM] src/components/ui/card.tsx:5-21 (maintainability)

The components share identical structures, leading to duplicated code. Consider extracting a common function to reduce redundancy.

### 3. [MEDIUM] src/components/ui/calendar.tsx:0-0 (maintainability)

Incorrect CSS selectors for RTL handling using String.raw. The CSS selector should use [dir='rtl'] instead of 'rtl:**:' to target RTL directions properly.

### 4. [MEDIUM] src/components/ui/command.tsx:0-0 (maintainability)

The `cmdk-input-wrapper` attribute in CommandInput is unnecessary. Custom attributes like this can introduce confusion and are not standard. Use className for styling instead.

### 5. [MEDIUM] src/components/ui/input-otp.tsx:35-36 (maintainability)

Potential null reference error in InputOTPSlot: The inputOTPContext may not be defined when the component is used, leading to runtime errors.

### 6. [MEDIUM] src/components/ui/separator.tsx:22-22 (maintainability)

The displayName for the Separator component is set to the Radix SeparatorPrimitive's displayName, which may not be helpful for React devtools. It should be set to 'Separator' to clearly identify the component.

### 7. [LOW] src/components/ui/breadcrumb.tsx:91-91 (other)

The component 'BreadcrumbEllipsis' has a typo in its displayName (misspelled as 'BreadcrumbElipssis' instead of 'BreadcrumbEllipsis').

### 8. [LOW] src/components/ui/menubar.tsx:210-210 (style)

Typo in component displayName assignment

### 9. [LOW] src/components/ui/table.tsx:0-0 (maintainability)

The complex CSS selector in TableHead could benefit from an explanatory comment.

