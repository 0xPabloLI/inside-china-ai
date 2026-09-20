export const ARTICLE_OG_WIDTH = 1200;
export const ARTICLE_OG_HEIGHT = 630;

const XML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeSvg(value: string): string {
  return value.replace(/[&<>"']/g, (character) => XML_ENTITIES[character] ?? character);
}

function estimatedWidth(value: string): number {
  return Array.from(value).reduce((width, character) => {
    if (/\s/.test(character)) return width + 0.3;
    if (/[ilI.,:;'!|]/.test(character)) return width + 0.28;
    if (/[MW@%]/.test(character)) return width + 0.9;
    if (character.codePointAt(0) && (character.codePointAt(0) ?? 0) > 0x2e80) return width + 1;
    return width + 0.56;
  }, 0);
}

function wrapArticleTitle(title: string): { lines: string[]; fontSize: number } {
  const normalized = title.replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").filter(Boolean);
  const configurations = [
    { fontSize: 68, maxWidth: 880, maxLines: 3 },
    { fontSize: 60, maxWidth: 920, maxLines: 4 },
    { fontSize: 52, maxWidth: 940, maxLines: 4 },
  ];

  for (const configuration of configurations) {
    const maxUnits = configuration.maxWidth / configuration.fontSize;
    const lines: string[] = [];
    for (const word of words) {
      const current = lines.at(-1);
      if (!current || estimatedWidth(`${current} ${word}`) > maxUnits) lines.push(word);
      else lines[lines.length - 1] = `${current} ${word}`;
    }
    if (lines.length <= configuration.maxLines) return { lines, fontSize: configuration.fontSize };
  }

  const lines: string[] = [];
  const maxUnits = 940 / 48;
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || estimatedWidth(`${current} ${word}`) > maxUnits) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  const visible = lines.slice(0, 4);
  if (lines.length > 4 && visible.length) {
    visible[visible.length - 1] = `${visible[visible.length - 1].replace(/[.,;:!?]?$/, "")}…`;
  }
  return { lines: visible, fontSize: 48 };
}

function formatArticleDate(value: string | null): string {
  if (!value) return "CHINA AI NEWS";
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function createArticleOgSvg(input: { title: string; publishedAt: string | null }): string {
  const { lines, fontSize } = wrapArticleTitle(input.title);
  const lineHeight = Math.round(fontSize * 1.12);
  const firstLineY = 238 - Math.max(0, lines.length - 2) * Math.round(lineHeight * 0.38);
  const titleLines = lines
    .map(
      (line, index) =>
        `<text x="104" y="${firstLineY + index * lineHeight}" class="headline">${escapeSvg(line)}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ARTICLE_OG_WIDTH}" height="${ARTICLE_OG_HEIGHT}" viewBox="0 0 ${ARTICLE_OG_WIDTH} ${ARTICLE_OG_HEIGHT}">
  <rect width="1200" height="630" fill="#f8f9fb"/>
  <rect x="0" y="0" width="16" height="630" fill="#4d8bff"/>
  <path d="M104 106H1096" stroke="#dfe3e8" stroke-width="2"/>
  <circle cx="1072" cy="70" r="12" fill="#4d8bff"/>
  <text x="104" y="78" class="brand">CHINA <tspan fill="#4d8bff">AI</tspan> NEWS</text>
  <g style="font-family:'Source Serif 4',Georgia,serif;font-size:${fontSize}px;font-weight:600;fill:#1f2226">${titleLines}</g>
  <text x="104" y="548" class="meta">${escapeSvg(formatArticleDate(input.publishedAt))}</text>
  <text x="1096" y="548" text-anchor="end" class="url">chinaai.news</text>
  <path d="M104 580H1096" stroke="#2a2f36" stroke-width="4"/>
  <style>
    .brand { font-family: Inter,Arial,sans-serif; font-size: 30px; font-weight: 700; letter-spacing: 0; fill: #2a2f36; }
    .meta, .url { font-family: Inter,Arial,sans-serif; font-size: 19px; font-weight: 700; letter-spacing: 0; fill: #6b7280; }
  </style>
</svg>`;
}