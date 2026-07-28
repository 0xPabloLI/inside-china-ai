# Widget breakout layout: wider than article text

Article body text uses `max-w-4xl` (~896px) centered. Widgets break out to a wider container — `min(90vw, 1200px)` — so interactive elements use more screen width while text remains readable. Both are centered, creating a visual hierarchy where widgets are visually distinct from prose.

## Considered Options

- **Two-column layout** (left text, right widget sidebar): rejected — widgets are interspersed inline, not in a fixed sidebar; also fragments reader attention.
- **Full-width everything** (rejected): text lines over 900px hurt readability.
- **Keep max-w-2xl** (rejected): ~47% screen utilization is too wasteful for a screen-presentation context.

## Consequences

- Content splitter must wrap widgets in a wider container than the surrounding markdown segments.
- On mobile, both text and widgets collapse to full width with padding.
