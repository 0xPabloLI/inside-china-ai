import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Widget token drift guards (spec W2 / ticket W2):
 *
 *   1. No user-facing font size below 12px in widget views — no
 *      `text-[<digits>px]` or `text-[0.<digits>rem]` classes.
 *   2. No Tailwind native color classes in widgets — everything maps to the
 *      design token system (--color-*) or the chart palette.
 *   3. The same rules apply to the Companies page (openness badge etc.).
 *
 * The cleanup is done; these tests keep it done.
 */

const WIDGETS_DIR = new URL(".", import.meta.url).pathname;
const SCANNED_ENTRIES = [WIDGETS_DIR, new URL("../../routes/companies.tsx", import.meta.url).pathname];

const NATIVE_COLOR_CLASS =
  /(?:^|\s)(?:text|bg|border|ring|from|to|via)-(?:blue|green|red|amber|yellow|orange|purple|gray|slate|teal|indigo|rose|emerald|violet|cyan|fuchsia|pink|sky|lime)-(?:[1-9]00|[0-9]{1,3})(?:\\?\/[0-9]{1,3})?(?=\s|"|'|`)/;

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    if (statSync(full).isDirectory()) {
      out.push(...collectTsxFiles(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("widget token drift guards", () => {
  const files = SCANNED_ENTRIES.flatMap((entry) =>
    entry.endsWith(".tsx") ? [entry] : collectTsxFiles(entry),
  );

  it("scans widget views and the companies page", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.includes("pricing-view"))).toBe(true);
    expect(files.some((f) => f.includes("companies.tsx"))).toBe(true);
  });

  it("no sub-12px font-size classes", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const match of src.match(/text-\[[0-9.]+(?:px|rem|em)\]|text-\[[0-9.]+(?:px|rem|em)\]/g) ?? []) {
        const px = /text-\[([0-9.]+)px\]/.exec(match);
        const rem = /text-\[([0-9.]+)rem\]/.exec(match);
        const em = /text-\[([0-9.]+)em\]/.exec(match);
        const size = px ? Number(px[1]) : rem ? Number(rem[1]) * 16 : em ? Number(em[1]) * 16 : 99;
        if (size < 12) offenders.push(`${file}: ${match} (${size}px)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no Tailwind native color classes", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const match of src.match(NATIVE_COLOR_CLASS) ?? []) {
        // Allow chart palette enum? No — chart tokens are bg-chart-N, which do not match.
        offenders.push(`${file}: ${match.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
