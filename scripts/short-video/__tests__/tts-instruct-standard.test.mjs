/**
 * Tests for the #270 single source of TTS instruct text.
 *
 * Behaviour under test (issue #270 + triage verdict 2026-09-14):
 *  - ONE table (`lib/tts/instruct.mjs` → INSTRUCT_STANDARD) produces the
 *    instruct for every engine, so a new call site inherits the #234 standard
 *    instead of re-deriving it (which is how #257 reproduced the accent
 *    regression two days after #234 landed);
 *  - the production Kaggle-CUDA strings are byte-identical to the #244
 *    user-validated baseline — this refactor must not change the approved
 *    sound, only its provenance;
 *  - engine families differ only in the terminator: PyTorch/CUDA + NPU need
 *    `<|endofprompt|>`, MLX auto-appends it;
 *  - an unknown style throws at manifest-build time (before any GPU push)
 *    instead of silently degrading to "no instruct" (#273 P1.3);
 *  - a hand-written `scene.instruct` override that fails the 4D standard is
 *    refused — including the pre-#234 wording that #257 fell back to;
 *  - `validateInstructSignature` names the missing dimensions.
 *
 * No engines are instantiated and no GPU/Kaggle is touched — these are pure
 * resolvers.
 */
import { describe, expect, it } from "vitest";
import {
  INSTRUCT_FORMAT,
  INSTRUCT_STANDARD,
  PYTORCH_SUFFIX,
  SUPPORTED_INSTRUCT_STYLES,
  applyInstructFormat,
  buildInstruct,
  createInstructResolver,
  hasInstructStyle,
  resolveInstructForScene,
  stripInstructSuffix,
  validateInstructSignature,
} from "../lib/tts/instruct.mjs";

// The #244 user-validated Kaggle-CUDA strings, frozen here as the acceptance
// baseline: the refactor must reproduce them byte-for-byte.
const VALIDATED = {
  hook: "You are a helpful assistant. Speak in standard American English with a confident, dynamic, and clear tone, as if breaking major tech news.<|endofprompt|>",
  narrative:
    "You are a helpful assistant. You are a tech documentary narrator. Speak in standard American English with a calm, engaging, and professional tone at a steady pace.<|endofprompt|>",
  data: "You are a helpful assistant. You are a tech analyst. Speak in standard American English with an authoritative, precise, and clear tone, emphasizing key metrics.<|endofprompt|>",
  cta: "You are a helpful assistant. You are a warm and engaging host. Speak in standard American English with an enthusiastic, persuasive, and welcoming tone.<|endofprompt|>",
  contrast:
    "You are a helpful assistant. You are a tech commentator. Speak in standard American English with a pointed, thought-provoking tone that highlights tension between two sides.<|endofprompt|>",
  "info-card":
    "You are a helpful assistant. You are a tech educator. Speak in standard American English with a clear, structured, and explanatory tone, breaking down concepts step by step.<|endofprompt|>",
  "stat-reveal":
    "You are a helpful assistant. You are a tech analyst. Speak in standard American English with an authoritative, precise, and clear tone, emphasizing key metrics.<|endofprompt|>",
  quote:
    "You are a helpful assistant. You are a tech documentary narrator. Speak in standard American English with a calm, engaging, and professional tone at a steady pace.<|endofprompt|>",
  context:
    "You are a helpful assistant. You are a tech documentary narrator. Speak in standard American English with a calm, engaging, and professional tone at a steady pace.<|endofprompt|>",
};

const STYLES = Object.keys(VALIDATED);

/** The pre-#234 wording that #257 hand-wrote into its reference manifest. */
const LEGACY_INSTRUCT = "Speak with a calm and measured tone, like a narrator.";

describe("#270 the standard table covers every dispatched visualType", () => {
  it("exposes exactly the styles the renderer dispatches on", () => {
    // Mirrors REMOTION_VISUAL_TYPES in lib/scene-rules.mjs — an entry added
    // there without one here fails the pre-render gate (#273 P1.3).
    expect([...SUPPORTED_INSTRUCT_STYLES].sort()).toEqual(
      [
        "context",
        "contrast",
        "cta",
        "data",
        "hook",
        "info-card",
        "narrative",
        "quote",
        "stat-reveal",
      ].sort(),
    );
    for (const style of STYLES) expect(hasInstructStyle(style)).toBe(true);
    expect(hasInstructStyle("benchmark")).toBe(false);
  });

  it("keeps the mandatory system prefix and positive accent guidance on every entry", () => {
    for (const style of STYLES) {
      const text = buildInstruct(style);
      expect(text.startsWith(INSTRUCT_STANDARD.systemPrefix)).toBe(true);
      expect(text).toContain(INSTRUCT_STANDARD.accent);
      expect(text.endsWith(PYTORCH_SUFFIX)).toBe(true);
    }
  });
});

describe("#270 the refactor reproduces the #244 user-validated strings byte-for-byte", () => {
  it.each(STYLES)("PyTorch format — %s", (style) => {
    expect(buildInstruct(style, { format: INSTRUCT_FORMAT.PYTORCH })).toBe(VALIDATED[style]);
  });

  it("MLX format is the same text without the terminator MLX appends itself", () => {
    for (const style of STYLES) {
      const mlx = buildInstruct(style, { format: INSTRUCT_FORMAT.MLX });
      expect(mlx).toBe(stripInstructSuffix(VALIDATED[style]));
      expect(mlx).not.toContain("<|endofprompt|>");
    }
  });

  it("formatting is idempotent and rejects unknown formats", () => {
    expect(applyInstructFormat(VALIDATED.hook, INSTRUCT_FORMAT.PYTORCH)).toBe(VALIDATED.hook);
    expect(applyInstructFormat(`${VALIDATED.hook}${PYTORCH_SUFFIX}`, INSTRUCT_FORMAT.PYTORCH)).toBe(
      `${VALIDATED.hook}${PYTORCH_SUFFIX}`,
    );
    expect(() => applyInstructFormat("x", "onnx")).toThrow(/Unknown instruct format/);
  });

  it("every standard entry passes its own signature validation", () => {
    for (const style of STYLES) {
      const report = validateInstructSignature(buildInstruct(style));
      expect(report.hardIssues).toEqual([]);
      expect(report.ok).toBe(true);
    }
  });
});

describe("#270 every TTS engine inherits the single source (anti-regression)", () => {
  /**
   * The four CosyVoice3 adapters used to carry four private, drifting
   * INSTRUCT_MAPs: the modal/NPU copies still had the pre-#234 wording, and
   * neither had the contrast / info-card / stat-reveal / quote / context
   * entries at all (5/9 styles resolved to `undefined` → the kernel fell into
   * a method that does not exist, #273 P1.3).
   */
  it("kaggle-cuda / modal-cuda / npu resolve the PyTorch standard, mlx the MLX one", async () => {
    const engines = {
      "cosyvoice3-kaggle-cuda": [
        (await import("../lib/tts/cosyvoice3-kaggle-cuda.mjs")).resolveInstructForScene,
        INSTRUCT_FORMAT.PYTORCH,
      ],
      "cosyvoice3-modal-cuda": [
        (await import("../lib/tts/cosyvoice3-modal-cuda.mjs")).resolveInstructForScene,
        INSTRUCT_FORMAT.PYTORCH,
      ],
      "cosyvoice3-npu": [
        (await import("../lib/tts/cosyvoice3-npu.mjs")).resolveInstructForScene,
        INSTRUCT_FORMAT.PYTORCH,
      ],
      "cosyvoice3-mlx": [
        (await import("../lib/tts/cosyvoice3-mlx.mjs")).resolveInstructForScene,
        INSTRUCT_FORMAT.MLX,
      ],
    };

    for (const [name, [resolver, format]] of Object.entries(engines)) {
      expect(typeof resolver, `${name} must export resolveInstructForScene`).toBe("function");
      for (const style of STYLES) {
        const resolved = resolver({ id: 1, visualType: style });
        expect(resolved, `${name}/${style} must resolve, not fall through to no-instruct`).toBe(
          buildInstruct(style, { format }),
        );
      }
    }
  });

  it("no engine still resolves the pre-#234 wording", async () => {
    const resolvers = await Promise.all(
      ["cosyvoice3-kaggle-cuda", "cosyvoice3-modal-cuda", "cosyvoice3-npu", "cosyvoice3-mlx"].map(
        async (name) => (await import(`../lib/tts/${name}.mjs`)).resolveInstructForScene,
      ),
    );
    for (const resolver of resolvers) {
      for (const style of STYLES) {
        expect(resolver({ visualType: style })).not.toBe(LEGACY_INSTRUCT);
        expect(resolver({ visualType: style })).not.toBe(`${LEGACY_INSTRUCT}${PYTORCH_SUFFIX}`);
      }
    }
  });
});

describe("#270 hand-written instruct cannot reach a manifest", () => {
  it("rejects the pre-#234 wording the #257 experiment hand-wrote", () => {
    const scene = { id: 1, visualType: "narrative", instruct: LEGACY_INSTRUCT };
    expect(() => resolveInstructForScene(scene)).toThrow(/instruct override rejected/i);
    expect(() => resolveInstructForScene(scene)).toThrow(/missing_system_prefix/);
    expect(() => resolveInstructForScene(scene)).toThrow(/missing_accent_guidance/);
    expect(() => resolveInstructForScene(scene)).toThrow(/instruct\.mjs/);
  });

  it("rejects negative accent prompting", () => {
    const scene = {
      id: 1,
      visualType: "narrative",
      instruct:
        "You are a helpful assistant. You are a narrator. Speak in English and avoid any Indian accent with a calm tone.",
    };
    expect(() => resolveInstructForScene(scene)).toThrow(/negative_accent_prompting/);
  });

  it("accepts a compliant override and terminates it for the target engine", () => {
    const overridden =
      "You are a helpful assistant. You are a tech anchor. Speak in standard American English with a crisp and urgent tone.";
    expect(resolveInstructForScene({ id: 1, visualType: "hook", instruct: overridden })).toBe(
      `${overridden}${PYTORCH_SUFFIX}`,
    );
    expect(
      resolveInstructForScene(
        { id: 1, visualType: "hook", instruct: `${overridden}${PYTORCH_SUFFIX}` },
        { format: INSTRUCT_FORMAT.MLX },
      ),
    ).toBe(overridden);
  });
});

describe("#270 unknown styles fail before the GPU, not silently", () => {
  it("throws for a style with no standard entry", () => {
    expect(() => buildInstruct("benchmark")).toThrow(/No TTS instruct for style "benchmark"/);
    expect(() => resolveInstructForScene({ id: 1, visualType: "benchmark" })).toThrow(
      /No TTS instruct for style/,
    );
  });

  it("returns undefined only when the scene carries no style at all", () => {
    expect(resolveInstructForScene({ id: 1 })).toBeUndefined();
    expect(resolveInstructForScene(undefined)).toBeUndefined();
    expect(resolveInstructForScene({ id: 1, visualType: "" })).toBeUndefined();
  });

  it("prefers refStyle over visualType, matching the F5 ref-audio namespace", () => {
    expect(resolveInstructForScene({ id: 1, visualType: "narrative", refStyle: "data" })).toBe(
      VALIDATED.data,
    );
  });

  it("createInstructResolver binds one engine family's format", () => {
    const mlx = createInstructResolver({ format: INSTRUCT_FORMAT.MLX });
    expect(mlx({ visualType: "hook" })).toBe(stripInstructSuffix(VALIDATED.hook));
  });
});

describe("#270 validateInstructSignature names the missing dimensions", () => {
  it("reports the four dimensions on the canonical text", () => {
    const report = validateInstructSignature(VALIDATED.narrative);
    expect(report.ok).toBe(true);
    expect(report.dimensions).toMatchObject({
      systemPrefix: true,
      accent: true,
      persona: true,
      emotion: true,
      pacing: true,
    });
  });

  it("flags the legacy wording's missing dimensions as hard issues", () => {
    const report = validateInstructSignature(LEGACY_INSTRUCT);
    expect(report.ok).toBe(false);
    // "Speak with a calm and measured tone" does carry an emotion clause, so the
    // legacy string's actual defects are the dropped system prefix and the
    // missing positive accent guidance — the two clauses #234 added.
    expect(report.hardIssues.map((i) => i.code).sort()).toEqual([
      "missing_accent_guidance",
      "missing_system_prefix",
    ]);
    expect(report.softIssues.map((i) => i.code)).toEqual(["missing_persona"]);
    expect(report.dimensions.emotion).toBe(true);
    expect(report.dimensions.systemPrefix).toBe(false);
    expect(report.dimensions.accent).toBe(false);
  });

  it("flags a missing emotion intensity as a hard issue", () => {
    const flat = "You are a helpful assistant. Speak in standard American English.";
    const report = validateInstructSignature(flat);
    expect(report.ok).toBe(false);
    expect(report.hardIssues.map((i) => i.code)).toEqual(["missing_emotion_intensity"]);
  });

  it("treats a missing persona as advisory only (legitimately absent for hook/cta)", () => {
    const report = validateInstructSignature(VALIDATED.cta);
    expect(report.dimensions.persona).toBe(true);
    const bare =
      "You are a helpful assistant. Speak in standard American English with a confident tone.";
    expect(validateInstructSignature(bare).ok).toBe(true);
    expect(validateInstructSignature(bare).softIssues.map((i) => i.code)).toEqual([
      "missing_persona",
    ]);
  });

  it("ignores the engine terminator when validating", () => {
    expect(validateInstructSignature(VALIDATED.hook).ok).toBe(true);
    expect(validateInstructSignature(stripInstructSuffix(VALIDATED.hook)).ok).toBe(true);
    expect(validateInstructSignature("").ok).toBe(false);
    expect(validateInstructSignature(null).ok).toBe(false);
  });
});
