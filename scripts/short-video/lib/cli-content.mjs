/**
 * Shared `--content` resolution for the short-video re-render tools
 * (rerender / rerender-full / realign-render). They used to hardcode
 * `CONTENT_DIR = "deepseek-v41-flash"`, so targeting any other video meant
 * editing source. Resolution now mirrors the main pipeline: explicit
 * `--content <dir>` wins, otherwise the tool's historical default keeps the
 * bare invocation working; an unknown directory fails fast with the list of
 * available content dirs instead of a raw import stack trace.
 */
import { existsSync, readdirSync } from "fs";
import { join } from "path";

/**
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{kind: "absent"} | {kind: "value", value: string} | {kind: "missing-value"}}
 */
export function parseContentArg(argv) {
  const i = argv.indexOf("--content");
  if (i === -1) return { kind: "absent" };
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("--")) return { kind: "missing-value" };
  return { kind: "value", value };
}

/**
 * Sorted names of the content dirs under `<baseDir>/content` (for the
 * "available content" hint).
 *
 * @param {string} baseDir - scripts/short-video
 * @returns {string[]}
 */
export function listContentDirs(baseDir) {
  const dir = join(baseDir, "content");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort();
}

/**
 * @param {object} options
 * @param {string[]} options.argv
 * @param {string} options.baseDir
 * @param {string} options.defaultContent - kept so bare runs behave as before
 * @returns {{ok: true, contentDir: string} | {ok: false, message: string, available: string[]}}
 */
export function resolveContentDir({ argv, baseDir, defaultContent }) {
  const parsed = parseContentArg(argv);
  if (parsed.kind === "missing-value") {
    return {
      ok: false,
      message: "--content requires a directory name (e.g. --content deepseek-v41-flash)",
      available: listContentDirs(baseDir),
    };
  }
  const contentDir = parsed.kind === "value" ? parsed.value : defaultContent;
  if (!existsSync(join(baseDir, "content", contentDir))) {
    return {
      ok: false,
      message: `content directory not found: content/${contentDir}`,
      available: listContentDirs(baseDir),
    };
  }
  return { ok: true, contentDir };
}
