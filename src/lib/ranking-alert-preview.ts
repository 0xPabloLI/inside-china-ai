import type { isDrop } from "./keyword-tracking.functions";

export type PreviewRow = { id: number; keyword: string; from: string; to: string };

export type IsDrop = typeof isDrop;

export type EvaluatedRow = {
  row: PreviewRow;
  from: number | null;
  to: number | null;
  valid: boolean;
  wouldAlert: boolean;
  alertType: "drop" | "lost" | null;
  reason: string;
};

// Pure preview evaluation for the ranking-alert settings form. The drop
// predicate is injected so this module stays free of server-function
// imports and is unit-testable in isolation. Extracted from the component
// to keep its cyclomatic complexity under the repo ceiling.
export function evaluateRows(
  rows: PreviewRow[],
  threshold: string,
  lostRanking: boolean,
  isDropFn: IsDrop,
): EvaluatedRow[] {
  const parsedThreshold = Number(threshold);
  const previewThreshold =
    Number.isInteger(parsedThreshold) && parsedThreshold >= 1 ? parsedThreshold : null;
  return rows.map((row) => {
    const from = row.from.trim() === "" ? null : Number(row.from);
    const to = row.to.trim() === "" ? null : Number(row.to);
    const valid =
      previewThreshold !== null &&
      from !== null &&
      Number.isInteger(from) &&
      from >= 1 &&
      (to === null || (Number.isInteger(to) && to >= 1));
    const wouldAlert = valid ? isDropFn(to, from, previewThreshold!, lostRanking) : false;
    const alertType: "drop" | "lost" | null = !wouldAlert ? null : to === null ? "lost" : "drop";
    const reason = !valid
      ? "Incomplete input"
      : !wouldAlert
        ? to === null
          ? "Left top 100 but lost-ranking alerts are off"
          : `Moved ${to! - from! >= 0 ? "↓" : "↑"}${Math.abs(to! - from!)} — below the ${previewThreshold}-position threshold`
        : to === null
          ? `Left the top 100 (was #${from})`
          : `Fell from #${from} to #${to} (−${to! - from!}), at or past the ${previewThreshold}-position threshold`;
    return { row, from, to, valid, wouldAlert, alertType, reason };
  });
}
