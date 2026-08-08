/**
 * Calculate reading progress percentage from scroll position.
 *
 * @param scrollTop - current scroll position in pixels (window.scrollY)
 * @param scrollHeight - total document height (document.documentElement.scrollHeight)
 * @param innerHeight - viewport height (window.innerHeight)
 * @returns percentage 0–100
 */
export function calcReadingProgress(
  scrollTop: number,
  scrollHeight: number,
  innerHeight: number,
): number {
  const scrollable = scrollHeight - innerHeight;
  if (scrollable <= 0) return 0;
  return Math.min(100, Math.max(0, (scrollTop / scrollable) * 100));
}
