/**
 * Tests for the frozen dependency wheelhouse (#231).
 *
 * The Kaggle image moved to Python 3.13 (2026-10), where the old
 * torch==2.4.0/cu121 pin has no wheel at all and the kernel died in the
 * dependency install before inference. Two files have to agree for the
 * offline path to work, and nothing in the runtime would notice if they
 * drifted apart:
 *
 *  - `kaggle/cosyvoice3_cuda_kernel.py` — the pins the kernel installs;
 *  - `kaggle/build-wheels-dataset.sh` — the wheelhouse that must contain them.
 *
 * A pin in the kernel that the wheelhouse does not carry fails only on a real
 * Kaggle run (mid-install, minutes in), so it is asserted here instead.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { readFileSync } from "fs";
import { join } from "path";

const KAGGLE_DIR = join(import.meta.dirname, "..", "kaggle");
const KERNEL_SRC = readFileSync(join(KAGGLE_DIR, "cosyvoice3_cuda_kernel.py"), "utf-8");
const BUILD_SRC = readFileSync(join(KAGGLE_DIR, "build-wheels-dataset.sh"), "utf-8");
const ADAPTER_SRC = readFileSync(
  join(import.meta.dirname, "..", "lib", "tts", "cosyvoice3-kaggle-cuda.mjs"),
  "utf-8",
);

/** Drop full-line comments — the regression notes quote the old pins. */
function stripComments(src) {
  return src
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

/** Every `pkg==version` pair in a source file (quoted in Python, bare in sh). */
function pins(src) {
  return [...stripComments(src).matchAll(/["']?([A-Za-z0-9_.-]+)==([0-9][A-Za-z0-9_.+!-]*)/g)].map(
    (m) => ({ name: m[1], version: m[2] }),
  );
}

/** `pkg` → `version`, lowercased, for one source file. */
function pinIndex(src) {
  return new Map(pins(src).map((p) => [p.name.toLowerCase(), p.version]));
}

/**
 * The pins must actually parse, or every assertion below is vacuously true.
 * The regex is intentionally loose (quoted Python, bare sh), so a change in
 * quoting style would otherwise turn these tests green while checking nothing.
 */
function assertPinsParse(src, label) {
  const parsed = pins(src);
  if (parsed.length === 0) throw new Error(`no pins parsed from ${label} — the regex is stale`);
  return parsed;
}

/** The packages PyPI ships without a usable Linux wheel (#231). */
const SDIST_ONLY_PKGS = ["pyworld", "wget", "antlr4-python3-runtime", "openai-whisper"];

/** The build script's group n section, comments stripped. */
function buildGroup(n) {
  const src = stripComments(BUILD_SRC);
  const from = src.indexOf(`group ${n}/5`);
  const to = n === 5 ? src.indexOf("verifying completeness") : src.indexOf(`group ${n + 1}/5`);
  expect(from, `group ${n}/5 must exist`).toBeGreaterThan(-1);
  expect(to, `the end of group ${n}/5 must be findable`).toBeGreaterThan(from);
  return src.slice(from, to);
}

/**
 * Run the build script's completeness check against a synthetic wheelhouse.
 *
 * The check is a Python heredoc inside the shell script, so this extracts it
 * and executes it for real rather than grepping for call sites — a grep cannot
 * tell a working matcher from a broken one, which is exactly how the
 * setuptools-bracket bug and the name-only match both survived review.
 *
 * @param {string[]} wheelNames - filenames to place in the fake wheelhouse
 * @returns {{ok: boolean, output: string}}
 */
function runCompletenessCheck(wheelNames) {
  const check = BUILD_SRC.slice(BUILD_SRC.indexOf("verifying completeness"));
  const py = check.split("<<'PYEOF'\n")[1].split("PYEOF", 1)[0];
  const dir = mkdtempSync(join(tmpdir(), "wheelhouse-"));
  try {
    for (const name of wheelNames) {
      if (name.startsWith("torch-")) {
        // The check reads the real METADATA, so the torch wheel has to be one.
        writeFileSync(join(dir, name), TORCH_WHEEL_BYTES);
      } else {
        writeFileSync(join(dir, name), "not a real wheel");
      }
    }
    try {
      const output = execFileSync("python3", ["-c", py, dir], { encoding: "utf-8" });
      return { ok: true, output };
    } catch (e) {
      return { ok: false, output: `${e.stdout || ""}${e.stderr || ""}` };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A minimal zip holding the METADATA the check parses. */
function makeTorchWheel() {
  const meta =
    "Metadata-Version: 2.1\nName: torch\nVersion: 2.6.0+cu124\n" +
    'Requires-Dist: nvidia-cuda-runtime-cu12 (==12.4.127) ; platform_system == "Linux"\n' +
    'Requires-Dist: triton (==3.2.0) ; platform_system == "Linux"\n' +
    'Requires-Dist: filelock ; platform_system == "Darwin"\n';
  const dir = mkdtempSync(join(tmpdir(), "torch-wheel-"));
  const path = join(dir, "torch-2.6.0+cu124-cp313-cp313-linux_x86_64.whl");
  try {
    execFileSync("python3", [
      "-c",
      "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1],'w');" +
        "z.writestr('torch-2.6.0+cu124.dist-info/METADATA',sys.argv[2]);z.close()",
      path,
      meta,
    ]);
    return readFileSync(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const TORCH_WHEEL_BYTES = makeTorchWheel();

/** A complete wheelhouse for the synthetic METADATA above. */
const COMPLETE_WHEELS = [
  "torch-2.6.0+cu124-cp313-cp313-linux_x86_64.whl",
  "nvidia_cuda_runtime_cu12-12.4.127-py3-none-manylinux2014_x86_64.whl",
  "triton-3.2.0-cp313-cp313-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
  "pyworld-0.3.4-cp313-cp313-linux_x86_64.whl",
  "wget-3.2-py3-none-any.whl",
  "antlr4_python3_runtime-4.9.3-py3-none-any.whl",
  "openai_whisper-20250625-py3-none-any.whl",
];

describe("kernel pins are covered by the wheelhouse (#231)", () => {
  it("every pinned dependency the kernel installs is fetched by the build script", () => {
    const kernelPins = assertPinsParse(KERNEL_SRC, "the kernel");
    assertPinsParse(BUILD_SRC, "the build script");
    const scriptPins = pinIndex(BUILD_SRC);
    const missing = kernelPins.filter((p) => scriptPins.get(p.name.toLowerCase()) !== p.version);
    expect(missing.map((p) => `${p.name}==${p.version}`)).toEqual([]);
  });

  it("the unpinned installs (whisper/tiktoken/numba + build tooling) are fetched too", () => {
    for (const pkg of ["openai-whisper", "tiktoken", "numba", "Cython", "wheel", "setuptools"]) {
      expect(BUILD_SRC).toContain(pkg);
    }
  });

  it("the sdist-only packages are built into wheels, not shipped as sdists", () => {
    // Two failures shaped this. `pip download --only-binary=:all:
    // openai-whisper` finds nothing (whisper publishes no wheel; pyworld's are
    // Windows-only), and shipping the sdists does not survive the round trip
    // either: Kaggle unpacks archives inside a dataset, so a mounted sdist
    // arrives as a `<name>-<ver>/<name>-<ver>/` directory that
    // `pip --no-index --find-links` cannot see. Building them into wheels in
    // group 5 keeps the mounted set wheel-only.
    const group5 = buildGroup(5);
    expect(group5).toContain("pip wheel");
    for (const pkg of SDIST_ONLY_PKGS) {
      expect(group5).toContain(pkg);
    }
    // …and nowhere else: a name drifting back into a `pip download
    // --only-binary` group reintroduces the failure it was moved out of.
    const wheelGroups = [1, 2, 3, 4].map(buildGroup).join("\n");
    for (const pkg of SDIST_ONLY_PKGS) {
      expect(wheelGroups).not.toContain(pkg);
    }
  });

  it("group 5 refuses to run off Linux, where it would build host wheels", () => {
    // Unlike groups 1-4, group 5 carries no --platform flags: `pip wheel`
    // compiles for the host. On macOS it would emit arm64 wheels that the
    // completeness check accepts (it matches names and versions, not platform
    // tags) and that then fail on Kaggle.
    const group5 = buildGroup(5);
    expect(group5).toContain('uname -s');
    expect(group5).toContain("!= \"Linux\"");
  });

  it("a rerun clears the output directory before downloading", () => {
    // The completeness check is presence-only, so a wheel left by a failed
    // earlier build would satisfy it and be published as part of this set.
    const head = stripComments(BUILD_SRC).slice(0, BUILD_SRC.indexOf("group 1/5"));
    expect(head).toContain("rm -rf");
    expect(head.indexOf("rm -rf")).toBeLessThan(stripComments(BUILD_SRC).indexOf("group 1/5"));
  });

  it("the completeness check parses setuptools' bracketed requirements", () => {
    // setuptools writes `Requires-Dist: nvidia-cudnn-cu12 (==9.1.0.70)` into
    // wheel METADATA while PyPI's JSON reports the unbracketed form. Splitting
    // on the version operator alone leaves a trailing " (" on the bracketed
    // form, which matches no filename — the 2026-10-09 build reported all 14
    // Linux deps missing with the complete wheelhouse sitting right there.
    const check = BUILD_SRC.slice(BUILD_SRC.indexOf("verifying completeness"));
    expect(check).toContain("parse_requirement");
    expect(check).not.toContain('re.split(r"[<>=!~]", d)[0]');
  });

  it("the completeness check accepts a complete wheelhouse", () => {
    const { ok, output } = runCompletenessCheck(COMPLETE_WHEELS);
    expect(output).toContain("0 missing");
    expect(output).toContain("OK:");
    expect(ok).toBe(true);
  });

  it("the completeness check rejects a missing Linux-marker dep", () => {
    const without = COMPLETE_WHEELS.filter((w) => !w.startsWith("triton-"));
    const { ok, output } = runCompletenessCheck(without);
    expect(ok).toBe(false);
    expect(output).toContain("MISSING: triton (==3.2.0)");
    expect(output).toContain("wheelhouse is incomplete");
  });

  it("the completeness check rejects a wrong version of the right package", () => {
    // A name-only match accepts this and publishes a wheelhouse that fails the
    // kernel's exact-pin install minutes into a Kaggle run.
    const swapped = [
      ...COMPLETE_WHEELS.filter((w) => !w.startsWith("nvidia_cuda_runtime")),
      "nvidia_cuda_runtime_cu12-12.1.105-py3-none-manylinux2014_x86_64.whl",
    ];
    const { ok, output } = runCompletenessCheck(swapped);
    expect(ok).toBe(false);
    expect(output).toContain("MISSING: nvidia-cuda-runtime-cu12 (==12.4.127)");
    // The near-miss is named, so the operator does not have to hunt for it.
    expect(output).toContain("nvidia_cuda_runtime_cu12-12.1.105");
  });

  it("the completeness check rejects a missing built-from-sdist wheel", () => {
    const without = COMPLETE_WHEELS.filter((w) => !w.startsWith("pyworld-"));
    const { ok, output } = runCompletenessCheck(without);
    expect(ok).toBe(false);
    expect(output).toContain("MISSING: pyworld==0.3.4");
  });

  it("the completeness check ignores non-Linux markers", () => {
    // The synthetic METADATA carries a Darwin-only dep; requiring it on a
    // Linux wheelhouse would make every build fail.
    const { output } = runCompletenessCheck(COMPLETE_WHEELS);
    expect(output).toContain("2 Linux-marker deps");
  });

  it("the completeness check fails loudly when there is no torch wheel", () => {
    const { ok, output } = runCompletenessCheck(COMPLETE_WHEELS.filter((w) => !w.startsWith("torch-")));
    expect(ok).toBe(false);
    expect(output).toContain("no torch wheel");
  });

  it("the completeness check covers the sdist-only packages by name", () => {
    // wget ships as a .zip and nothing else, so counting *.tar.gz would pass
    // on the wrong set while still missing a package the kernel installs.
    const check = BUILD_SRC.slice(BUILD_SRC.indexOf("verifying completeness"));
    expect(check).toContain("SDIST_ONLY");
    for (const pkg of SDIST_ONLY_PKGS) {
      expect(check).toContain(pkg);
    }
  });

  it("the push step needs a positive success signal, not just a quiet CLI", () => {
    // `kaggle datasets create` exits 0 when the API rejects the request: a
    // probe got "Dataset creation error: The requested title … is already in
    // use by a notebook" with rc=0, and cloud-gpu-options.md records "Please
    // upload at least one file" behaving the same way. A denylist of error
    // words misses the failures nobody named.
    const push = BUILD_SRC.slice(BUILD_SRC.indexOf("pushing dataset"));
    expect(push).toContain("successfully");
    expect(push.indexOf("successfully")).toBeLessThan(push.indexOf("exit 1"));
  });

  it("the push check reads a file, not a pipe", () => {
    // `printf … | grep -q` under `set -o pipefail` reports failure even on a
    // match: grep exits at the first hit, printf dies of SIGPIPE (141), and
    // pipefail takes the non-zero. The v6 run turned a successful 114-file
    // upload into "no success signal" exactly this way.
    const push = BUILD_SRC.slice(BUILD_SRC.indexOf("pushing dataset"));
    expect(push).toContain('PUSH_LOG="$OUT_DIR/push.log"');
    expect(push).not.toMatch(/\|\s*grep -q/);
    expect(push).toContain('grep -qi "successfully');
  });

  it("torch trio pins are identical in both files", () => {
    const scriptPins = pinIndex(BUILD_SRC);
    for (const name of ["torch", "torchaudio", "torchvision"]) {
      const inKernel = pins(KERNEL_SRC).find((p) => p.name === name);
      expect(inKernel, `${name} must be pinned in the kernel`).toBeTruthy();
      expect(scriptPins.get(name)).toBe(inKernel.version);
    }
  });
});

describe("py3.13 regression guards (#231)", () => {
  it("the torch pin has cp313 wheels (2.4.0 has none on any index)", () => {
    const torch = pins(KERNEL_SRC).find((p) => p.name === "torch");
    const [major, minor] = torch.version.split("+")[0].split(".").map(Number);
    // 2.6.0 is the lowest version where the whole trio exists for cp313.
    expect(major * 100 + minor).toBeGreaterThanOrEqual(206);
  });

  it("the torch index serves the trio for cp313 (cu121 does not)", () => {
    const torchCall = KERNEL_SRC.slice(KERNEL_SRC.indexOf('"torch=='));
    const index = torchCall.match(/download\.pytorch\.org\/whl\/(cu\d+)/)?.[1];
    expect(index).toBeDefined();
    expect(Number(index.slice(2))).toBeGreaterThanOrEqual(124);
  });

  it("the build script targets Kaggle's runtime (cp313 linux x86_64), not the host", () => {
    expect(BUILD_SRC).toContain("--python-version 3.13");
    expect(BUILD_SRC).toContain("--abi cp313");
    expect(BUILD_SRC).toContain("--platform linux_x86_64");
    // pip does not expand manylinux_2_17 into the legacy manylinux2014 alias,
    // and the nvidia-* wheels are only tagged manylinux2014.
    expect(BUILD_SRC).toContain("--platform manylinux2014_x86_64");
  });
});

describe("offline install path (#231)", () => {
  it("the offline branch resolves only from the mount", () => {
    const branchAt = KERNEL_SRC.indexOf("if _WHEELS_DIR:");
    const elseAt = KERNEL_SRC.indexOf("else:", branchAt);
    // A missing `else:` would make indexOf return -1 and the slice below
    // silently cover the whole file — assert the branch really exists.
    expect(branchAt).toBeGreaterThan(-1);
    expect(elseAt).toBeGreaterThan(branchAt);
    const offlineBranch = KERNEL_SRC.slice(branchAt, elseAt);
    expect(offlineBranch).toContain("--no-index");
    expect(offlineBranch).toContain("--find-links");
    // No network index on the offline path: a stray --index-url or
    // --extra-index-url would reintroduce the PyPI traffic the dataset exists
    // to avoid, and would do it silently.
    expect(offlineBranch).not.toContain("--index-url");
    expect(offlineBranch).not.toContain("--extra-index-url");
  });

  it("the offline branch restores the local-version separator Kaggle strips", () => {
    // Kaggle serves a stored dataset back with `+` removed from wheel
    // filenames: `torch-2.6.0+cu124-...whl` arrives as `torch-2.6.0cu124-...`.
    // pip reads the version from the filename, sees `2.6.0cu124`, which is not
    // PEP 440, and drops the file — the first mounted run failed with
    // "Could not find a version that satisfies the requirement torch==2.6.0
    // (from versions: none)" while the mount itself was fine.
    expect(KERNEL_SRC).toContain("_restore_local_versions");
    expect(KERNEL_SRC).toContain("_WHEELS_DIR = _restore_local_versions(_WHEELS_MOUNT)");
    // The rewrite must be narrow: `nvidia_cuda_runtime_cu12-12.4.127` contains
    // "cu12" and must survive untouched.
    expect(KERNEL_SRC).toContain('re.sub(r"(\\d)cu(\\d+)-"');
  });

  it("pyworld is installed after the core deps", () => {
    // No longer a build-order requirement (the wheelhouse carries a built
    // wheel), but the order is kept so a missing wheel fails late, next to the
    // other optional-but-required deps, instead of in the middle of the core
    // install.
    const pyworldAt = KERNEL_SRC.indexOf('_pip_install(["pyworld==');
    const coreAt = KERNEL_SRC.indexOf('"conformer==0.3.2"');
    expect(pyworldAt).toBeGreaterThan(-1);
    expect(coreAt).toBeGreaterThan(-1);
    expect(pyworldAt).toBeGreaterThan(coreAt);
  });

  it("the build script asserts the wheelhouse is complete before pushing", () => {
    expect(BUILD_SRC).toContain("Linux-marker deps");
    expect(BUILD_SRC).toContain("wheelhouse is incomplete");
    // Ordering is the point: a completeness check after the push protects
    // nothing (the dataset is already public by then).
    const assertAt = BUILD_SRC.indexOf("wheelhouse is incomplete");
    const pushAt = BUILD_SRC.indexOf("kaggle datasets create");
    expect(pushAt).toBeGreaterThan(-1);
    expect(assertAt).toBeLessThan(pushAt);
  });

  it("the adapter attaches the wheelhouse dataset so the mount exists at run time", () => {
    expect(ADAPTER_SRC).toContain("xPabloLI/cosyvoice3-wheels");
  });
});
