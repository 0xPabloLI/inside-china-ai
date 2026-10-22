/**
 * Join a trusted absolute root with validated relative segments (#758).
 *
 * Semgrep's `path-join-resolve-traversal` rule is taint-mode, and the repo's
 * own filter documents that `// nosemgrep` does not suppress it
 * (`.github/scripts/filter-semgrep-fps.py`). The evidence-capture paths are
 * containment-checked already, but the scanner cannot see that through
 * `path.join`/`path.resolve`; this helper removes the sink instead of hiding
 * the finding.
 *
 * The trade-off is explicit: every relative segment is validated here (no
 * empty, `.`, `..`, backslash or NUL components), and the joined path is
 * checked against its root. Operators who need an arbitrary destination use
 * the one-off CLI's `--output`, which does not go through this helper.
 *
 * @module path-safety
 */
import { isAbsolute, sep } from "path";

const invalidSegment = (segment) => {
  if (typeof segment !== "string" || segment === "" || segment.includes("\0")) return true;
  if (segment.includes("\\")) return true;
  return segment.split("/").some((part) => part === "" || part === "." || part === "..");
};

/**
 * @param {string} root - absolute directory the result must stay inside
 * @param {...string} segments - relative path pieces; `/` is allowed inside one
 * @returns {string} absolute path
 */
export function containedPath(root, ...segments) {
  if (!isAbsolute(root)) {
    throw new Error(`containedPath root must be absolute, got ${JSON.stringify(root)}`);
  }
  if (segments.length === 0) {
    throw new Error("containedPath needs at least one relative segment");
  }
  const base = root.length > 1 && root.endsWith(sep) ? root.slice(0, -1) : root;
  const parts = [];
  for (const segment of segments) {
    if (invalidSegment(segment)) {
      throw new Error(
        `path segment must be a relative path without empty, ".", "..", "\\" or NUL components, got ${JSON.stringify(segment)}`,
      );
    }
    parts.push(...segment.split("/"));
  }
  const abs = [base, ...parts].join(sep);
  const inside = base === sep ? abs.startsWith(sep) : abs.startsWith(base + sep);
  if (!inside) {
    throw new Error(`path escapes its root ${JSON.stringify(root)}: ${JSON.stringify(abs)}`);
  }
  return abs;
}
