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

describe("kernel pins are covered by the wheelhouse (#231)", () => {
  it("every pinned dependency the kernel installs is fetched by the build script", () => {
    const scriptPins = new Map(pins(BUILD_SRC).map((p) => [p.name.toLowerCase(), p.version]));
    const missing = pins(KERNEL_SRC).filter((p) => {
      const version = scriptPins.get(p.name.toLowerCase());
      return version === undefined || version !== p.version;
    });
    expect(missing.map((p) => `${p.name}==${p.version}`)).toEqual([]);
  });

  it("the unpinned installs (whisper/tiktoken/numba + build tooling) are fetched too", () => {
    for (const pkg of ["openai-whisper", "tiktoken", "numba", "Cython", "wheel", "setuptools"]) {
      expect(BUILD_SRC).toContain(pkg);
    }
  });

  it("torch trio pins are identical in both files", () => {
    const scriptPins = new Map(pins(BUILD_SRC).map((p) => [p.name.toLowerCase(), p.version]));
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
  it("offline installs use --no-build-isolation (3 deps are sdist-only)", () => {
    const offlineBranch = KERNEL_SRC.slice(
      KERNEL_SRC.indexOf("if _WHEELS_DIR:"),
      KERNEL_SRC.indexOf("else:", KERNEL_SRC.indexOf("if _WHEELS_DIR:")),
    );
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
  });

  it("the adapter attaches the wheelhouse dataset so the mount exists at run time", () => {
    expect(ADAPTER_SRC).toContain("xPabloLI/cosyvoice3-wheels");
  });
});
