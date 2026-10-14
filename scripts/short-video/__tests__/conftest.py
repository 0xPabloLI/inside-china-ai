"""pytest wiring for the short-video Python suite (#555).

Why this file exists
--------------------
Before #555 these 15 ``test_*.py`` files had no single runner, and the three
styles they were written in failed silently in two of them:

* script-style files (module-level ``check()`` calls + ``sys.exit``) do run
  real assertions, but pytest collected **0 tests** from them — a green run
  proved nothing about those files;
* seven files are plain ``def test_*`` modules with no ``__main__``, so
  ``python3 <file>`` exited 0 having executed no test at all;
* ``test_broll_warmup.py`` called ``unittest.main(module=...)`` on classes
  that never inherit ``unittest.TestCase`` → "NO TESTS RAN", exit 5.

pytest is now the single entry point (``npm run test:python``). This conftest
adds the two things pytest alone does not provide:

1. **Zero-test guard** — every ``test_*.py`` file the invocation asks pytest
   to collect must contribute at least one test. A file that collects
   nothing fails the gate instead of passing as a no-op: that silent-green
   shape is exactly what #555 removes.
2. **Per-file count table** — the run prints which files ran and how many
   tests each produced, so "the step ran" can never stand in for "the tests
   ran" in CI logs.

The guard is scoped to the files the invocation actually requested, so
``pytest path/to/test_x.py`` (or a node-id selection) stays a single-file
affair instead of failing on the untouched rest of the suite.
"""

from __future__ import annotations

from pathlib import Path

SUITE_DIR = Path(__file__).resolve().parent
FILE_GLOB = "test_*.py"

_collected: dict[str, int] = {}
_requested: list[str] = []


def _suite_files() -> list[Path]:
    return sorted(SUITE_DIR.glob(FILE_GLOB))


def _resolve_requested(config) -> list[str]:
    """Suite file names this invocation asked pytest to collect."""
    names: list[str] = []
    for raw in config.args:
        candidate = str(raw).split("::", 1)[0]
        path = Path(candidate)
        if not path.is_absolute():
            path = Path(config.invocation_params.dir) / path
        try:
            resolved = path.resolve()
        except OSError:
            continue
        if resolved.is_dir():
            names.extend(p.name for p in sorted(resolved.glob(FILE_GLOB)))
        elif resolved.parent == SUITE_DIR and resolved.name.startswith("test_"):
            names.append(resolved.name)
    deduped: list[str] = []
    for name in names:
        if name not in deduped:
            deduped.append(name)
    return deduped


def _zero_test_files() -> list[str]:
    return [name for name in _requested if _collected.get(name, 0) == 0]


def pytest_collection_modifyitems(session, config, items):  # noqa: ARG001
    global _requested
    _requested = _resolve_requested(config)
    for item in items:
        name = Path(str(item.path)).name
        _collected[name] = _collected.get(name, 0) + 1


def pytest_report_collectionfinish(config, start_path, items):  # noqa: ARG001
    lines = ["", "python suite — collected tests per file:"]
    for path in _suite_files():
        lines.append(f"  {path.name}: {_collected.get(path.name, 0)}")
    lines.append(
        f"  TOTAL: {sum(_collected.values())} test(s) in {len(_collected)} file(s)"
    )
    zero = _zero_test_files()
    if zero:
        lines.append(f"  ZERO-TEST (fails the gate): {', '.join(zero)}")
    return lines


def pytest_sessionfinish(session, exitstatus):  # noqa: ARG001
    zero = _zero_test_files()
    if not zero:
        return
    reporter = session.config.pluginmanager.get_plugin("terminalreporter")
    if reporter is not None:
        reporter.write_line("")
        reporter.write_line(
            "zero-test file(s) in the python suite: "
            + ", ".join(zero)
            + " — every test_*.py the run collects must contribute at least one "
            "test (see scripts/short-video/__tests__/conftest.py)",
            red=True,
        )
    if session.exitstatus == 0:
        session.exitstatus = 1
