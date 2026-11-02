/**
 * One bundle + one browser per test file, then N stills through them (#1097).
 *
 * Why this module exists: every render assertion used to shell out to
 * `npx remotion still <entry>`, and each call paid the same fixed costs again —
 * npx resolution, the Remotion CLI's whole renderer/bundler require graph, a
 * fresh webpack build, and a new headless browser. Measured on a dev box, one
 * still cost 13.2 s of which the render was 0.8 s:
 *
 *   npx remotion still <entry>            13.2 s   (what every assertion paid)
 *   ./.bin/remotion still <entry>         10.6 s   (drop npx)
 *   ./.bin/remotion still <bundle-dir>     6.8 s   (bundle once)
 *   this module (bundle + browser reused)  1.4 s   (0.65 s select + 0.7 s render)
 *
 * It is the ONLY sanctioned way for a render test to produce a still:
 * `render-suite-policy.test.mjs` fails any suite that spawns the CLI itself,
 * because going around this module silently multiplies the job's wall clock.
 *
 * Error contract — unchanged on purpose: `renderStill()` rejects with an Error
 * whose `message` is the same first line the CLI printed to stderr (e.g.
 * `[TextFitError] {json}`), and the same text is mirrored onto `stderr`, so call
 * sites that read `err.stdout`/`err.stderr` keep working verbatim (verified
 * against `f1-lock56`: `reason:"fit-bottom"` round-trips).
 *
 * The bundle is memoized per process, never on disk: test files run in their own
 * worker and each file's `beforeAll` generates the media it renders, so a
 * disk-cached bundle from an earlier run could embed the previous run's public
 * assets and render the wrong picture.
 */
import { mkdirSync, rmSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const REMOTION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "remotion");

/** Gitignored scratch space next to the stills (`scripts/short-video/output/`). */
const CACHE_ROOT = resolve(REMOTION_DIR, "..", "output", ".remotion-bundles");

/** entry -> serve URL, for this process only. */
const serveUrls = new Map();

let browserPromise = null;
let modulesPromise = null;

/** The workspace's own packages — the root `node_modules` has neither. */
const loadFromWorkspace = (specifier) =>
  import(pathToFileURL(join(REMOTION_DIR, "node_modules", specifier)).href);

function modules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      loadFromWorkspace("@remotion/bundler/dist/index.js"),
      loadFromWorkspace("@remotion/renderer/dist/esm/index.mjs"),
    ]).then(([bundler, renderer]) => ({ bundle: bundler.bundle, renderer }));
  }
  return modulesPromise;
}

/**
 * One bundle directory per entry, reused across runs.
 *
 * Deliberately NOT deleted on exit: a recursive `rmSync` of a bundle is a bulk
 * delete that the local safe-delete shim counts, and these eight directories
 * were enough to trip it once per suite (`SAFE_DELETE_BULK_CONFIRM_REQUIRED`).
 * The directory is gitignored scratch space under `output/`; remotion rebuilds
 * into it, and CI throws the whole checkout away.
 */
const bundleDirFor = (entry) =>
  join(CACHE_ROOT, entry.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, ""));

async function bundleFor(entry) {
  const cached = serveUrls.get(entry);
  if (cached) return cached;

  const { bundle } = await modules();
  const outDir = bundleDirFor(entry);
  mkdirSync(outDir, { recursive: true });
  // Remotion symlinks `public/` into the bundle and fails with EEXIST when one
  // is already there, so drop that single link before rebuilding in place. One
  // delete, not a recursive sweep of the whole directory: a bulk removal is
  // what tripped the local safe-delete shim when this driver cleaned up after
  // itself (eight bundles x ~48 entries per run).
  rmSync(join(outDir, "public"), { recursive: true, force: true });
  const serveUrl = await bundle({ entryPoint: join(REMOTION_DIR, entry), outDir });
  serveUrls.set(entry, serveUrl);
  return serveUrl;
}

function browserFor() {
  if (!browserPromise) {
    browserPromise = modules().then(({ renderer }) => renderer.openBrowser("chrome"));
  }
  return browserPromise;
}

/**
 * Render one still of `composition` from `entry`, reusing this process's bundle
 * and headless browser.
 *
 * @param {object} options
 * @param {string} options.entry   fixture entry, relative to the remotion dir
 * @param {string} options.composition composition id
 * @param {string} options.output  absolute path of the PNG to write
 * @param {unknown} [options.props] input props
 * @param {number} [options.frame] frame number; omitted → frame 0
 * @param {number} [options.timeout] per-render ceiling in ms
 */
export async function renderStill({ entry, composition, output, props, frame, timeout }) {
  const inputProps = props ?? {};

  try {
    const { renderer } = await modules();
    // Bundling is inside the guard too: a compile error is a rejected render
    // from the suite's point of view, and the suites read `err.stderr`.
    const serveUrl = await bundleFor(entry);
    // `selectComposition` is inside the guard on purpose: the fixture validates
    // input while resolving the composition (`calculateMetadata`), so the
    // dispatch/field errors a suite asserts on surface HERE, not in renderStill.
    const selected = await renderer.selectComposition({ serveUrl, id: composition, inputProps });
    await renderer.renderStill({
      composition: selected,
      serveUrl,
      output,
      frame: frame ?? 0,
      inputProps,
      browserInstance: await browserFor(),
      timeoutInMilliseconds: timeout,
      // The CLI swallowed page console output; keep that contract so a passing
      // run stays quiet (the FAIL payload still arrives via the rejection).
      onBrowserLog: () => {},
    });
  } catch (err) {
    // Preserve the CLI's contract: the payload suites parse is the first line of
    // the message, and it stays reachable through `stderr` too.
    if (err && typeof err === "object" && !err.stderr) err.stderr = String(err.message ?? err);
    throw err;
  }
}
