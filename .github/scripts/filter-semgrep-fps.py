#!/usr/bin/env python3
"""Drop the documented test-fixture false-positive classes from a Semgrep SARIF.

The table of classes — each rule, the fixture shape behind it, and the evidence
— lives in docs/conventions/test-env-baseline.md ("CI 扫描器已知误报类"). Adding
a class means updating all three of the rule set here, the test suite
(scripts/__tests__/semgrep-fp-filter.test.mjs), and that table.

One mechanism worth knowing while reading the tests: `path-join-resolve-
traversal` is taint-mode, where `// nosemgrep` does not suppress (verified on
1.179.0 and 1.180.0 — the comment on the sink line, on the source line, and
with an explicit rule id all still report).

The filter removes a finding only when the rule id AND the path both match, so
test files keep being scanned for every other rule, and a production-code
finding of a listed rule is still uploaded. Dropping a result from the report
means the security tab never sees it, so the pre-filter backlog was dismissed
as "used in tests" by hand.

A rule id that no longer appears in the scan's own rule catalog means the rule
was renamed or removed upstream; the job then fails with the id to update,
instead of the filter silently matching nothing.

Usage: filter-semgrep-fps.py <sarif> [<sarif>...]
Exit: 0 when each file was filtered, 1 when one could not be read, parsed, or
does not look like a semgrep scan (a broken report must fail the job rather
than upload nothing), 2 on bad usage.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter

RULE_IDS = frozenset(
    {
        "javascript.lang.security.audit.path-traversal."
        "path-join-resolve-traversal.path-join-resolve-traversal",
        "javascript.lang.security.detect-child-process.detect-child-process",
        "javascript.lang.security.insecure-object-assign.insecure-object-assign",
        "javascript.lang.security.audit.detect-non-literal-regexp."
        "detect-non-literal-regexp",
        "javascript.lang.security.audit.prototype-pollution."
        "prototype-pollution-loop.prototype-pollution-loop",
    }
)
# `__tests__/` anywhere, or a `.test.` / `.spec.` file name.
TEST_PATH = re.compile(r"(^|/)__tests__/|(^|/)[^/]*\.(test|spec)\.[cm]?[jt]sx?$")


def scan_catalog(runs: list) -> set[str]:
    """The rule ids the scan itself declares (tool.driver.rules)."""
    catalog: set[str] = set()
    for run in runs:
        driver = (run.get("tool") or {}).get("driver") or {}
        for rule in driver.get("rules") or []:
            rule_id = rule.get("id")
            if rule_id:
                catalog.add(rule_id)
    return catalog


def filter_file(path: str) -> Counter:
    with open(path, encoding="utf-8") as handle:
        report = json.load(handle)
    runs = report.get("runs") if isinstance(report, dict) else None
    if not isinstance(runs, list) or not runs:
        raise ValueError("no scan run in the report")
    catalog = scan_catalog(runs)
    if not catalog:
        raise ValueError("no rule catalog in the report (tool.driver.rules missing)")
    gone = sorted(RULE_IDS - catalog)
    if gone:
        raise ValueError(
            "rule id(s) missing from the scan catalog — renamed or removed "
            "upstream? update the rule set here, "
            "scripts/__tests__/semgrep-fp-filter.test.mjs and "
            "docs/conventions/test-env-baseline.md: " + ", ".join(gone)
        )
    dropped: Counter = Counter()
    for run in runs:
        results = run.get("results")
        if results is None:
            # semgrep writes `results: []` for a clean scan, so a missing key
            # is a shape change, not a clean scan.
            raise ValueError("malformed run: no results key")
        if not isinstance(results, list):
            raise ValueError("malformed run: results is not a list")
        kept = []
        for result in results:
            if not isinstance(result, dict):
                raise ValueError("malformed run: a result is not an object")
            uri = ""
            locations = result.get("locations") or []
            if locations:
                if not isinstance(locations[0], dict):
                    raise ValueError("malformed result: a location is not an object")
                artifact = (locations[0].get("physicalLocation") or {}).get(
                    "artifactLocation"
                ) or {}
                uri = artifact.get("uri", "")
            if result.get("ruleId") in RULE_IDS and TEST_PATH.search(uri):
                dropped[result.get("ruleId")] += 1
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
            AttributeError,
            TypeError,
        ) as exc:
            print(f"filter-semgrep-fps: {path}: {exc}", file=sys.stderr)
            return 1
        per_rule = ", ".join(
            f"{rule_id.split('.')[-1]} {dropped[rule_id]}" for rule_id in sorted(RULE_IDS)
        )
        print(
            f"filter-semgrep-fps: {path}: dropped {sum(dropped.values())} known "
            f"test-fixture false positive(s) [{per_rule}]"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
