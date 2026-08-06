/**
 * BrandName — renders "China AI News" with "AI" emphasized in blue.
 *
 * Per docs/brand-system.md: "Brand name presentation: CHINA AI NEWS
 * with AI emphasized in blue, on both surfaces."
 *
 * Website surface uses serif font (Instrument Serif) with title case;
 * video surface uses sans-serif with uppercase. The blue-highlight rule
 * is shared across both surfaces.
 */
export function BrandName() {
  return (
    <>
      China <span className="text-brand">AI</span> News
    </>
  );
}
