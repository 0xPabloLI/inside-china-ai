/**
 * _gate-smoke renders through the Remotion path only (meta has no
 * `renderer: "playwright"`, so main.mjs / render-only.mjs select Remotion).
 * The HTML template generator is therefore never called — but both pipeline
 * entries import this module unconditionally, so it must exist.
 */
export function generateScene() {
  throw new Error("_gate-smoke is a Remotion-only smoke pack — run it without --playwright");
}
