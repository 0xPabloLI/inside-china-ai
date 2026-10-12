#!/usr/bin/env python3
"""Drop the documented test-fixture false-positive class from a Semgrep SARIF.

`javascript.lang.security.audit.path-traversal.path-join-resolve-traversal` is
a taint-mode rule: its sources are function parameters and its sinks are
`path.join` / `path.resolve`. Test fixtures build paths from `mkdtempSync`
directories, so every fixture join is reported; the rule's `// nosemgrep`
suppression does not apply in taint mode (verified with semgrep 1.179.0 and
1.180.0 — the comment on the sink line, on the source line, and with an
explicit rule id all still report).

This filter removes exactly that class — the rule id AND a test path — so test
files keep being scanned for every other rule, and a production-code finding
of the same rule is still uploaded. Dropping a result from the report means the
security tab never sees it, so the pre-filter backlog was dismissed as
"used in tests" by hand (docs/conventions/test-env-baseline.md).

Usage: filter-semgrep-fps.py <sarif> [<sarif>...]
Exit: 0 when each file was filtered, 1 when one could not be read, parsed, or
holds no scan run (a broken report must fail the job rather than upload
nothing), 2 on bad usage.
"""

from __future__ import annotations

import json
import re
import sys

RULE = (
    "javascript.lang.security.audit.path-traversal."
    "path-join-resolve-traversal.path-join-resolve-traversal"
)
# `__tests__/` anywhere, or a `.test.` / `.spec.` file name.
TEST_PATH = re.compile(r"(^|/)__tests__/|(^|/)[^/]*\.(test|spec)\.[cm]?[jt]sx?$")


def filter_file(path: str) -> int:
    with open(path, encoding="utf-8") as handle:
        report = json.load(handle)
    runs = report.get("runs") if isinstance(report, dict) else None
    if not isinstance(runs, list) or not runs:
        raise ValueError("no scan run in the report")
    dropped = 0
    for run in runs:
        results = run.get("results", [])
        if not isinstance(results, list):
            raise ValueError("malformed run: results is not a list")
        kept = []
        for result in results:
            uri = ""
            locations = result.get("locations") or []
            if locations:
                artifact = (locations[0].get("physicalLocation") or {}).get(
                    "artifactLocation"
                ) or {}
                uri = artifact.get("uri", "")
            if result.get("ruleId") == RULE and TEST_PATH.search(uri):
                dropped += 1
            else:
                kept.append(result)
        run["results"] = kept
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(report, handle)
    return dropped


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(f"usage: {argv[0]} <sarif> [<sarif>...]", file=sys.stderr)
        return 2
    for path in argv[1:]:
        try:
            dropped = filter_file(path)
        except (
            OSError,
            ValueError,
            json.JSONDecodeError,
            UnicodeDecodeError,
        ) as exc:
            print(f"filter-semgrep-fps: {path}: {exc}", file=sys.stderr)
            return 1
        print(
            f"filter-semgrep-fps: {path}: dropped {dropped} known test-fixture "
            "false positive(s)"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
