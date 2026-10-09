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

  it("the sdist-only packages are fetched outside the wheel-only groups", () => {
    // The 2026-10-09 Kaggle build died at `pip download --only-binary=:all:
    // openai-whisper` ("from versions: none"): whisper publishes no wheel at
    // all, and pyworld's only wheels are Windows. Group 5 fetches them by URL
    // instead, so a name drifting back into a wheel group reintroduces the
    // failure — and `pip download --no-binary` is avoided there too, because
    // building pyworld's metadata stalled the same run for tens of minutes.
    const sdistGroup = BUILD_SRC.slice(
      BUILD_SRC.indexOf("group 5/5"),
      BUILD_SRC.indexOf("verifying completeness"),
    );
    for (const pkg of ["pyworld==", "wget==", "antlr4-python3-runtime==", "openai-whisper"]) {
      expect(sdistGroup).toContain(pkg);
    }
    const wheelGroups = BUILD_SRC.slice(BUILD_SRC.indexOf("group 1/5"), BUILD_SRC.indexOf("group 5/5"));
    for (const pkg of ["pyworld", "wget", "antlr4-python3-runtime", "openai-whisper"]) {
      expect(wheelGroups).not.toContain(pkg);
    }
  });

  it("the completeness check parses setuptools' bracketed requirements", () => {
    // setuptools writes `Requires-Dist: nvidia-cudnn-cu12 (==9.1.0.70)` into
    // wheel METADATA while PyPI's JSON reports the unbracketed form. Splitting
    // on the version operator alone leaves a trailing " (" on the bracketed
    // form, which matches no filename — the 2026-10-09 build reported all 14
    // Linux deps missing with the complete wheelhouse sitting right there.
    const check = BUILD_SRC.slice(BUILD_SRC.indexOf("verifying completeness"));
    expect(check).toContain("requirement_name");
    expect(check).not.toContain('re.split(r"[<>=!~]", d)[0]');
  });

  it("the completeness check covers the sdist-only packages by name", () => {
    // wget ships as a .zip and nothing else, so counting *.tar.gz would pass
    // on the wrong set while still missing a package the kernel installs.
    const check = BUILD_SRC.slice(BUILD_SRC.indexOf("verifying completeness"));
    expect(check).toContain("SDIST_ONLY");
    for (const pkg of ["pyworld", "wget", "antlr4-python3-runtime", "openai-whisper"]) {
      expect(check).toContain(pkg);
    }
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
  it("offline installs use --no-build-isolation (4 deps are sdist-only)", () => {
    const branchAt = KERNEL_SRC.indexOf("if _WHEELS_DIR:");
    const elseAt = KERNEL_SRC.indexOf("else:", branchAt);
    // A missing `else:` would make indexOf return -1 and the slice below
    // silently cover the whole file — assert the branch really exists.
    expect(branchAt).toBeGreaterThan(-1);
    expect(elseAt).toBeGreaterThan(branchAt);
    const offlineBranch = KERNEL_SRC.slice(branchAt, elseAt);
    expect(offlineBranch).toContain("--no-index");
    expect(offlineBranch).toContain("--no-build-isolation");
  });

  it("pyworld is installed after the core deps that provide Cython+numpy", () => {
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
