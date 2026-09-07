/**
 * Package meta for the avatar-declarations fixture (#214 ticket 01/03).
 *
 * Exists so the digital-human CLI (ticket 03) and other package-level tooling
 * can load this dir like a real package: meta.mjs + scene-data.mjs. The
 * pipelineId is fixture-scoped — CLI tests point --output-root at a tmpdir so
 * nothing is written into the repo's output/ tree.
 */
export const meta = {
  subject: "avatar-declarations",
  pipelineId: "avatar-declarations-fixture",
  title: "Test fixture — avatar declaration contract (#214)",
  article: "_test-fixtures",
  renderer: "remotion",
  createdAt: "2026-09-07",
  topics: ["fixture"],
  keyEntities: { companies: [], people: [], models: [] },
  dataPoints: [],
};
