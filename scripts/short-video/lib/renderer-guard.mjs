/**
 * Renderer guard — the HTML/Playwright render path was retired on 2026-09-01
 * (decision 59, docs/archive/spec-text-overflow-hardening.md): 15/15 content packs were on
 * Remotion, so the Playwright branch, its HTML scene templates and the DOM
 * verifier were removed instead of pipelined. Remotion is now the only
 * renderer.
 *
 * Any attempt to opt back into the retired path (`--playwright` flag or
 * `meta.renderer = "playwright"`) fails fast here, before preflight/TTS,
 * with a pointer to the retirement note. The frozen HTML tooling lives in
 * `scripts/short-video/retired-html-path/` for reference only.
 */

/**
 * Throw if argv/meta request the retired HTML/Playwright renderer.
 * @param {{ argv?: string[], meta?: { renderer?: string } }} opts
 */
export function assertRemotionRenderer({ argv = [], meta = {} } = {}) {
  const viaFlag = argv.includes("--playwright");
  const viaMeta = meta?.renderer === "playwright";
  if (!viaFlag && !viaMeta) return;
  const source = viaFlag ? "the --playwright flag" : 'meta.renderer = "playwright"';
  throw new Error(
    `The HTML/Playwright render path was retired on 2026-09-01 (decision 59, ` +
      `docs/archive/spec-text-overflow-hardening.md) — Remotion is the only renderer, but this run requested ` +
      `${source}. Remove it; archived HTML tooling lives in scripts/short-video/retired-html-path/.`,
  );
}
