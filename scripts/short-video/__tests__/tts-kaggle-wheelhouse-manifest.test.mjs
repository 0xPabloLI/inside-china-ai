/**
 * The wheelhouse mount must be the set this repo froze (#521).
 *
 * `dataset_sources` cannot pin a version: the CLI accepts `owner/slug/3` but
 * Kaggle stores it back as `owner/slug` and mounts the LATEST version — probed
 * on 2026-10-09 with a two-version dataset, where a kernel asking for `/1`
 * mounted version 2's content. So a re-upload silently changes what every TTS
 * run installs, and nothing in git records it.
 *
 * The fix is a comparison the mount cannot win by accident: the expected set
 * lives in `kaggle/wheelhouse-manifest.json` (committed), is injected into the
 * kernel at push time, and is checked against the mount before the first
 * `pip install`. These tests execute that check against synthetic mounts —
 * a grep cannot tell a working comparison from a broken one, which is how the
 * #231 bracket bug and a name-only match both survived review.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

const KAGGLE_DIR = join(import.meta.dirname, "..", "kaggle");
const KERNEL_SRC = readFileSync(join(KAGGLE_DIR, "cosyvoice3_cuda_kernel.py"), "utf-8");
const BUILD_SRC = readFileSync(join(KAGGLE_DIR, "build-wheels-dataset.sh"), "utf-8");
const ADAPTER_SRC = readFileSync(
  join(import.meta.dirname, "..", "lib", "tts", "cosyvoice3-kaggle-cuda.mjs"),
  "utf-8",
);
const MANIFEST = JSON.parse(readFileSync(join(KAGGLE_DIR, "wheelhouse-manifest.json"), "utf-8"));

// Markers include the comment marker: the extracted text has to be valid
// Python on its own, and a bare `--- BEGIN …` line is not.
const BEGIN = "# --- BEGIN wheelhouse verification ---";
const END = "# --- END wheelhouse verification ---";

/** The kernel's verification logic, as source — the same text that ships. */
function verificationSource() {
  const from = KERNEL_SRC.indexOf(BEGIN);
  const to = KERNEL_SRC.indexOf(END);
  expect(from, "the kernel must carry a wheelhouse verification block").toBeGreaterThan(-1);
  expect(to, "the block must be closed").toBeGreaterThan(from);
  return KERNEL_SRC.slice(from, to);
}

/**
 * Write a file of exactly `size` bytes without allocating them.
 *
 * The check compares sizes, and the real torch wheel is 768MB — materializing
 * that per case would make this suite unusable. A sparse file reports the size
 * the check reads and costs nothing on disk.
 */
function writeSizedFile(path, size) {
  writeFileSync(path, "");
  truncateSync(path, size);
}

/**
 * Execute the kernel's check against a synthetic mount.
 *
 * `actual` defaults to the interpreter and platform the frozen set was built
 * for, i.e. what a Kaggle GPU image is supposed to be. The local test host is
 * neither (macOS on Python 3.14), so leaving the defaults to the host would
 * make every case below report an interpreter mismatch and the real
 * assertions would never be reached.
 *
 * Files named in `mountSizes` get that size; anything else gets a size no
 * manifest entry claims, which is what an unexpected file looks like. Pass
 * `mountSizes` explicitly when the mount and the manifest must disagree.
 *
 * @param {string[]} mountNames - filenames served by the mount (Kaggle's form)
 * @param {object} expected - the manifest the kernel was pushed with
 * @param {{python?: string, platform?: string}} [actual] - what this image is
 * @param {Record<string, number>} [mountSizes] - sizes the mount serves
 * @returns {{ok: boolean, output: string}}
 */
function runCheck(mountNames, expected, actual = {}, mountSizes = expected.wheels ?? {}) {
  const dir = mkdtempSync(join(tmpdir(), "wheelhouse-mount-"));
  const manifestPath = join(dir, "expected.json");
  const mountPath = join(dir, "mount");
  const python = actual.python ?? MANIFEST.python;
  const platform = actual.platform ?? MANIFEST.platform;
  try {
    writeFileSync(manifestPath, JSON.stringify(expected));
    execFileSync("mkdir", ["-p", mountPath]);
    for (const name of mountNames) {
      // Sizes may be keyed by either spelling — the mount serves
      // `torch-2.6.0cu124-…` while the manifest records `torch-2.6.0+cu124-…`.
      const built = name.replace(/(\d)cu(\d+)-/, "$1+cu$2-");
      writeSizedFile(join(mountPath, name), mountSizes[name] ?? mountSizes[built] ?? 15);
    }

    const driver = [
      "import json, os, platform, re, sys",
      verificationSource(),
      "mount, expected_path, py, plat = sys.argv[1:5]",
      "expected = json.load(open(expected_path))",
      "problems = _wheelhouse_problems(mount, expected, py or None, plat or None)",
      "for p in problems: print('FAIL: ' + p)",
      "print(f'problems: {len(problems)}')",
      "sys.exit(1 if problems else 0)",
    ].join("\n");

    try {
      const output = execFileSync(
        "python3",
        ["-c", driver, mountPath, manifestPath, python, platform],
        { encoding: "utf-8" },
      );
      return { ok: true, output };
    } catch (e) {
      return { ok: false, output: `${e.stdout || ""}${e.stderr || ""}` };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Kaggle strips the local-version separator when it stores a dataset:
 * `torch-2.6.0+cu124-…whl` is listed and mounted as `torch-2.6.0cu124-…whl`.
 */
function asServed(name) {
  return name.replace(/(\d)\+cu(\d+)-/, "$1cu$2-");
}

/** The frozen set: names in built form, each mapped to the size git records. */
const FROZEN = Object.keys(MANIFEST.wheels).sort();
const FROZEN_SIZES = MANIFEST.wheels;

describe("the frozen manifest itself (#521)", () => {
  it("parses, is non-empty, and names the interpreter it was built for", () => {
    // Without this every comparison below is vacuously satisfied by an empty
    // expected set, which is the failure mode this whole file guards against.
    expect(FROZEN.length).toBeGreaterThan(100);
    expect(MANIFEST.python).toMatch(/^\d+\.\d+$/);
    expect(MANIFEST.platform).toBe("linux_x86_64");
    expect(MANIFEST.dataset).toBe("xpabloli/cosyvoice3-wheels");
  });

  it("records a positive size for every wheel", () => {
    // A zero would make the size comparison pass for any empty file.
    const bogus = FROZEN.filter((w) => !Number.isInteger(FROZEN_SIZES[w]) || FROZEN_SIZES[w] <= 0);
    expect(bogus).toEqual([]);
    expect(Object.values(FROZEN_SIZES).reduce((a, b) => a + b, 0)).toBeGreaterThan(1e9);
  });

  it("carries the torch trio at the versions the kernel pins", () => {
    for (const want of [
      "torch-2.6.0+cu124-",
      "torchaudio-2.6.0+cu124-",
      "torchvision-0.21.0+cu124-",
    ]) {
      expect(FROZEN.filter((w) => w.startsWith(want))).toHaveLength(1);
    }
  });
});

describe("the kernel rejects a mount that is not the frozen set (#521)", () => {
  it("accepts the mount when it matches", () => {
    const { ok, output } = runCheck(FROZEN.map(asServed), MANIFEST);
    expect(output).toContain("problems: 0");
    expect(ok).toBe(true);
  });

  it("accepts the `+`-stripped names Kaggle actually serves", () => {
    // The comparison must run in built form on both sides: the manifest holds
    // `torch-2.6.0+cu124-…` while the mount serves `torch-2.6.0cu124-…`.
    const served = FROZEN.map(asServed);
    expect(served.some((n) => n.includes("+"))).toBe(false);
    expect(runCheck(served, MANIFEST).ok).toBe(true);
  });

  it("rejects the same filename carrying different bytes", () => {
    // The common rebuild keeps all 114 names and changes what is inside them —
    // a rebuild against a slightly different index, or a re-upload of a set
    // built from another pin. A name-only comparison waves it through.
    //
    // The mount serves the true sizes; the manifest claims one byte more for
    // the victim, which is all a rebuilt wheel has to differ by to be a
    // different artifact.
    const victim = FROZEN.find((w) => w.startsWith("torch-"));
    const servedSizes = Object.fromEntries(FROZEN.map((w) => [asServed(w), FROZEN_SIZES[w]]));
    const claimed = {
      ...MANIFEST,
      wheels: { ...FROZEN_SIZES, [victim]: FROZEN_SIZES[victim] + 1 },
    };
    const { ok, output } = runCheck(FROZEN.map(asServed), claimed, {}, servedSizes);
    expect(ok).toBe(false);
    expect(output).toContain(`different bytes on the mount: ${victim}`);
  });

  it("rejects a missing wheel and names it", () => {
    const drop = FROZEN.find((w) => w.startsWith("torch-"));
    const { ok, output } = runCheck(FROZEN.filter((w) => w !== drop).map(asServed), MANIFEST);
    expect(ok).toBe(false);
    expect(output).toContain(`missing from the mount: ${drop}`);
  });

  it("rejects an extra wheel that the frozen set does not list", () => {
    // A rebuild that adds a package is drift too: the next run installs
    // something no reviewer saw.
    const extra = "surprise_package-1.2.3-py3-none-any.whl";
    const { ok, output } = runCheck([...FROZEN.map(asServed), extra], MANIFEST);
    expect(ok).toBe(false);
    expect(output).toContain(`not in the frozen set: ${extra}`);
  });

  it("rejects the right package at a different local version", () => {
    // A cu121 build of the same torch version satisfies any name-only check.
    const wrong = FROZEN.map((w) => w.replace("+cu124-", "+cu121-")).map(asServed);
    const { ok, output } = runCheck(wrong, MANIFEST);
    expect(ok).toBe(false);
    expect(output).toContain("missing from the mount: torch-2.6.0+cu124-");
  });

  it("rejects an empty mount", () => {
    // The dataset exists but nothing is in it yet — a fresh publish before the
    // upload finishes looks exactly like this.
    const { ok, output } = runCheck([], MANIFEST);
    expect(ok).toBe(false);
    expect(output).toContain("missing from the mount");
    expect(output).toContain("mount 0 wheels, frozen set");
  });

  it("rejects an image whose interpreter does not match the frozen set", () => {
    // This is the #231 incident made readable: the image moved to 3.13 and the
    // only symptom was pip's "from versions: none".
    const { ok, output } = runCheck(FROZEN.map(asServed), MANIFEST, { python: "3.12" });
    expect(ok).toBe(false);
    expect(output).toContain("Python 3.12");
    expect(output).toContain("cp313");
  });

  it("rejects an image whose platform does not match the frozen set", () => {
    const { ok, output } = runCheck(FROZEN.map(asServed), MANIFEST, {
      platform: "darwin_arm64",
    });
    expect(ok).toBe(false);
    expect(output).toContain("darwin_arm64");
  });

  it("falls back to this image's own interpreter when none is injected", () => {
    // The production call site passes no interpreter — the check reads `sys`.
    // Only the python dimension falls back here; the platform is pinned so the
    // assertion stays deterministic on a macOS test host.
    const host = execFileSync(
      "python3",
      ["-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"],
      { encoding: "utf-8" },
    ).trim();
    const { ok, output } = runCheck(FROZEN.map(asServed), MANIFEST, {
      python: "",
      platform: MANIFEST.platform,
    });
    if (host === MANIFEST.python) {
      expect(ok).toBe(true);
    } else {
      expect(ok).toBe(false);
      expect(output).toContain(`Python ${host}`);
    }
  });

  it("caps the diff so a wrong dataset does not flood the log", () => {
    const { output } = runCheck([], MANIFEST);
    expect((output.match(/missing from the mount:/g) || []).length).toBeLessThanOrEqual(5);
    expect(output).toContain("…and more");
  });
});

describe("the kernel runs the check before it installs anything (#521)", () => {
  it("calls the check, and exits non-zero on problems", () => {
    const block = verificationSource();
    expect(block).toContain("_wheelhouse_problems");
    expect(KERNEL_SRC).toContain("_wheelhouse_problems(_WHEELS_MOUNT");
  });

  it("exits non-zero on a bad mount when the call site actually runs", () => {
    // Behavioural, not textual: a mutation that replaced the call site's
    // `sys.exit(1)` with `pass` survived a `toContain("sys.exit(1)")` check,
    // because the rest of the kernel has plenty of its own exits. So run it.
    //
    // The expected set is re-tagged with this host's interpreter and platform:
    // the call site reads `sys` directly (that is the production path, covered
    // by the fallback test above), and a real mismatch would mask whether the
    // wheel-set half of the check fired.
    const onThisHost = { ...MANIFEST, ...HOST };

    const { ok, output } = runCallSite([], onThisHost);
    expect(ok).toBe(false);
    expect(output).toContain("FAIL: the mounted wheelhouse is not the set this repo froze");
    expect(output).toContain("missing from the mount");

    const good = runCallSite(FROZEN.map(asServed), onThisHost);
    expect(good.ok).toBe(true);
    expect(good.output).toContain(`matches the frozen set (${FROZEN.length} wheels)`);
  });

  it("checks before the first pip install, so a bad mount costs seconds", () => {
    const callAt = KERNEL_SRC.indexOf("_wheelhouse_problems(_WHEELS_MOUNT");
    const firstInstall = KERNEL_SRC.indexOf("_pip_install(");
    expect(callAt).toBeGreaterThan(-1);
    expect(firstInstall).toBeGreaterThan(-1);
    expect(callAt).toBeLessThan(firstInstall);
  });

  it("names the rebuild command in the failure text", () => {
    const callSite = KERNEL_SRC.slice(KERNEL_SRC.indexOf(END) + END.length);
    expect(callSite).toContain("build-wheels-dataset.sh");
    expect(callSite).toContain("wheelhouse-manifest.json");
  });
});

describe("the expected set is injected from git, not hand-copied (#521)", () => {
  it("the kernel declares the placeholder the adapter replaces", () => {
    expect(KERNEL_SRC).toContain("__EXPECTED_WHEELHOUSE__");
    expect(KERNEL_SRC).toContain("EXPECTED_WHEELHOUSE");
  });

  it("the adapter injects the committed manifest", () => {
    expect(ADAPTER_SRC).toContain("__EXPECTED_WHEELHOUSE__");
    expect(ADAPTER_SRC).toContain("wheelhouse-manifest.json");
  });

  it("the injected text is valid JSON that the check accepts", () => {
    // The adapter serializes the file straight into a Python raw string, so a
    // stray `'''` or a JSON-shape change would break the kernel at import.
    const injected = JSON.stringify(MANIFEST);
    expect(injected).not.toContain("'''");
    const { ok } = runCheck(FROZEN.map(asServed), JSON.parse(injected));
    expect(ok).toBe(true);
  });
});

/**
 * Run the build script's manifest check against a synthetic wheelhouse.
 *
 * Same reasoning as the completeness check: it is a Python heredoc, so it is
 * extracted and executed rather than grepped. The check is the only thing
 * standing between a rebuilt wheelhouse and a dataset that no longer matches
 * the record in git.
 *
 * Files the manifest names get the size it records, so a matching case really
 * matches; anything else gets a size no entry claims.
 *
 * @param {string[]} wheelNames - what the build produced
 * @param {object} manifest - the committed manifest
 * @param {{omitManifest?: boolean, sizes?: Record<string, number>}} [opts]
 * @returns {{ok: boolean, output: string, written: object|null}}
 */
function runManifestCheck(wheelNames, manifest, opts = {}) {
  const block = BUILD_SRC.slice(
    BUILD_SRC.indexOf("verifying the set against the committed manifest"),
  );
  expect(block, "the build script must check its output against the manifest").not.toBe("");
  const py = block.split("<<'PYEOF'\n")[1].split("PYEOF", 1)[0];
  const dir = mkdtempSync(join(tmpdir(), "wheelhouse-"));
  const sizes = opts.sizes ?? manifest.wheels ?? {};
  try {
    for (const name of wheelNames) writeSizedFile(join(dir, name), sizes[name] ?? 15);
    const manifestPath = join(dir, "wheelhouse-manifest.json");
    if (!opts.omitManifest) writeFileSync(manifestPath, JSON.stringify(manifest));
    const written = join(dir, "manifest.json");
    try {
      const output = execFileSync("python3", ["-c", py, dir, manifestPath], { encoding: "utf-8" });
      return {
        ok: true,
        output,
        written: existsSync(written) ? JSON.parse(readFileSync(written, "utf-8")) : null,
      };
    } catch (e) {
      return { ok: false, output: `${e.stdout || ""}${e.stderr || ""}`, written: null };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the build refuses to publish a set git does not describe (#521)", () => {
  it("accepts a build that matches the committed manifest, and records it", () => {
    const { ok, output, written } = runManifestCheck(FROZEN, MANIFEST);
    expect(output).toContain(`matches the committed manifest (${FROZEN.length} wheels)`);
    expect(ok).toBe(true);
    // The dataset stays self-describing: a human opening its page sees what
    // interpreter the wheels are for without reading the build script.
    expect(written.wheels).toEqual(FROZEN_SIZES);
    expect(written.python).toBe(MANIFEST.python);
  });

  it("refuses to publish when the bytes changed under the same name", () => {
    // The rebuild that keeps every filename and changes the contents is the
    // one a name-only gate cannot see, and it is the common case: same pins,
    // rebuilt from a different index.
    const victim = FROZEN.find((w) => w.startsWith("torch-"));
    const { ok, output } = runManifestCheck(FROZEN, MANIFEST, {
      sizes: { ...FROZEN_SIZES, [victim]: FROZEN_SIZES[victim] + 1 },
    });
    expect(ok).toBe(false);
    expect(output).toContain(`DIFFERENT BYTES: ${victim}`);
  });

  it("rejects a rebuilt set and prints the manifest to commit", () => {
    // The point of the check: a dep bump that lands in the dataset but not in
    // git is exactly the silent drift this issue exists to stop.
    const bumped = [
      ...FROZEN.filter((w) => !w.startsWith("torch-")),
      "torch-2.7.0+cu124-cp313-cp313-linux_x86_64.whl",
    ];
    const { ok, output } = runManifestCheck(bumped, MANIFEST);
    expect(ok).toBe(false);
    expect(output).toContain("NEW: torch-2.7.0+cu124-cp313-cp313-linux_x86_64.whl");
    expect(output).toContain("NO LONGER BUILT: torch-2.6.0+cu124-cp313-cp313-linux_x86_64.whl");
    // Paste-ready, so accepting a rebuild is one copy and one re-run.
    expect(output).toContain('"torch-2.7.0+cu124-cp313-cp313-linux_x86_64.whl"');
    expect(output).toContain("does not match the committed manifest");
  });

  it("refuses to publish when no committed manifest is present", () => {
    // Comparing against nothing is how a check becomes decorative.
    const { ok, output } = runManifestCheck(FROZEN, MANIFEST, { omitManifest: true });
    expect(ok).toBe(false);
    expect(output).toContain("no committed manifest");
  });

  it("refuses to compare against an empty wheel list", () => {
    const { ok, output } = runManifestCheck(FROZEN, { ...MANIFEST, wheels: [] });
    expect(ok).toBe(false);
    expect(output).toContain("refusing to compare against nothing");
  });

  it("records the built names, undoing nothing — the manifest is built-form", () => {
    // The check compares built form on both sides, and the file it writes has
    // to be in the same form the kernel's manifest uses, or the next run
    // reports every `+` wheel as drift.
    const { written } = runManifestCheck(FROZEN, MANIFEST);
    expect(Object.keys(written.wheels).filter((w) => w.includes("+cu124-"))).toHaveLength(3);
  });
});

/**
 * Execute the kernel's call site — the `if _WHEELS_MOUNT:` block that logs the
 * problems and exits — against a synthetic mount.
 *
 * The block is sliced from the end marker to the next top-level `def`, which
 * is what makes this a real run of the production text: the surrounding
 * harness only supplies what the kernel already has by that point (`log`,
 * `EXPECTED_WHEELHOUSE`, the mount path).
 *
 * @param {string[]} mountNames
 * @param {object} expected
 * @returns {{ok: boolean, output: string}}
 */
function runCallSite(mountNames, expected) {
  const dir = mkdtempSync(join(tmpdir(), "wheelhouse-callsite-"));
  const mountPath = join(dir, "mount");
  const expectedPath = join(dir, "expected.json");
  try {
    execFileSync("mkdir", ["-p", mountPath]);
    const sizes = expected.wheels ?? {};
    for (const name of mountNames) {
      // Real sizes: the call site compares them, so a 15-byte stub would make
      // the "accepts a good mount" case fail for the wrong reason. The lookup
      // accepts either spelling, as the mount serves `…0cu124-…`.
      const built = name.replace(/(\d)cu(\d+)-/, "$1+cu$2-");
      writeSizedFile(join(mountPath, name), sizes[name] ?? sizes[built] ?? 15);
    }
    writeFileSync(expectedPath, JSON.stringify(expected));

    const after = KERNEL_SRC.slice(KERNEL_SRC.indexOf(END) + END.length);
    const stop = after.indexOf("\ndef ");
    const callSite = stop === -1 ? after : after.slice(0, stop);
    expect(callSite, "the call site must follow the verification block").toContain(
      "_wheelhouse_problems(_WHEELS_MOUNT",
    );

    const harness = [
      "import json, os, platform, re, sys",
      "def log(msg): print(msg, flush=True)",
      "EXPECTED_WHEELHOUSE = json.load(open(sys.argv[2]))",
      verificationSource(),
      "_WHEELS_MOUNT = sys.argv[1]",
      callSite,
    ].join("\n");

    try {
      const output = execFileSync("python3", ["-c", harness, mountPath, expectedPath], {
        encoding: "utf-8",
      });
      return { ok: true, output };
    } catch (e) {
      return { ok: false, output: `${e.stdout || ""}${e.stderr || ""}` };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** What this test host is, in the form the kernel's check builds. */
const HOST = (() => {
  const [python, platform] = execFileSync(
    "python3",
    [
      "-c",
      "import sys, platform; print(f'{sys.version_info.major}.{sys.version_info.minor}'); " +
        "print(f'{sys.platform}_{platform.machine()}')",
    ],
    { encoding: "utf-8" },
  )
    .trim()
    .split("\n");
  return { python, platform };
})();

const PUSH_HELPER = join(KAGGLE_DIR, "push-build-kernel.sh");

/**
 * Run the delivery script with `kaggle` stubbed out.
 *
 * The stub copies the folder it was pointed at, so the test can assert on what
 * would have been uploaded. The carrier and its metadata are read back here
 * and the whole temp tree is removed in `finally` — returning the folder path
 * instead would leak one directory per case.
 *
 * @param {{withManifest?: boolean}} [opts]
 * @returns {{ok: boolean, output: string, carrier: string|null, metadata: object|null}}
 */
function runPushHelper(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), "push-helper-"));
  const home = join(dir, "home");
  const capture = join(dir, "captured");
  const bin = join(dir, "bin");
  try {
    execFileSync("mkdir", ["-p", home, bin]);
    copyFileSync(PUSH_HELPER, join(home, "push-build-kernel.sh"));
    copyFileSync(
      join(KAGGLE_DIR, "build-wheels-dataset.sh"),
      join(home, "build-wheels-dataset.sh"),
    );
    if (opts.withManifest !== false) {
      copyFileSync(
        join(KAGGLE_DIR, "wheelhouse-manifest.json"),
        join(home, "wheelhouse-manifest.json"),
      );
    }
    const stub = join(bin, "kaggle");
    writeFileSync(
      stub,
      [
        "#!/usr/bin/env bash",
        'args=("$@")',
        'for i in "${!args[@]}"; do',
        '  if [ "${args[$i]}" = "-p" ]; then cp -R "${args[$((i+1))]}" "$CAPTURE_DIR"; fi',
        "done",
        "exit 0",
      ].join("\n"),
      { mode: 0o755 },
    );
    let output;
    try {
      output = execFileSync("bash", [join(home, "push-build-kernel.sh")], {
        encoding: "utf-8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CAPTURE_DIR: capture },
      });
    } catch (e) {
      return {
        ok: false,
        output: `${e.stdout || ""}${e.stderr || ""}`,
        carrier: null,
        metadata: null,
      };
    }
    const carrierPath = join(capture, "build.py");
    const metadataPath = join(capture, "kernel-metadata.json");
    return {
      ok: true,
      output,
      carrier: existsSync(carrierPath) ? readFileSync(carrierPath, "utf-8") : null,
      metadata: existsSync(metadataPath) ? JSON.parse(readFileSync(metadataPath, "utf-8")) : null,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the build delivery is reproducible from the repo (#521)", () => {
  it("embeds the repo's script and manifest byte-for-byte", () => {
    // Before this, the wrapper existed only as a base64 blob in an issue
    // comment: nobody could tell which revision a run had actually built.
    const { ok, output, carrier } = runPushHelper();
    expect(ok, output).toBe(true);
    expect(carrier).toBeTruthy();
    const embedded = [...carrier.matchAll(/"(\/kaggle\/working\/[^"]+)": "([A-Za-z0-9+/=]+)"/g)];
    expect(embedded).toHaveLength(2);

    const decoded = Object.fromEntries(
      embedded.map(([, path, b64]) => [path, Buffer.from(b64, "base64").toString("utf-8")]),
    );
    expect(decoded["/kaggle/working/build-wheels-dataset.sh"]).toBe(
      readFileSync(join(KAGGLE_DIR, "build-wheels-dataset.sh"), "utf-8"),
    );
    expect(JSON.parse(decoded["/kaggle/working/wheelhouse-manifest.json"])).toEqual(MANIFEST);
  });

  it("pushes under the kernel id the TTS metadata names", () => {
    const { metadata } = runPushHelper();
    expect(metadata).toBeTruthy();
    expect(metadata.id).toBe("xPabloLI/231-build-wheels-dataset");
    expect(metadata.kernel_type).toBe("script");
    // No GPU: this only downloads and compiles, and a GPU session would spend
    // the 30h/week quota that the TTS runs need.
    expect(metadata.enable_gpu).toBe(false);
  });

  it("refuses to deliver without the committed manifest", () => {
    // The manifest is what makes the build refuse a set git does not describe;
    // shipping a carrier without it would publish an unrecorded wheelhouse.
    const { ok, output } = runPushHelper({ withManifest: false });
    expect(ok).toBe(false);
    expect(output).toContain("missing");
    expect(output).toContain("wheelhouse-manifest.json");
  });
});
