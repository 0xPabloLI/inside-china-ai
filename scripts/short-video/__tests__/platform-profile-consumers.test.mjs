/**
 * Declarations must have consumers (#951).
 *
 * The shape this file exists to catch: a platform profile declares something
 * (`aiDisclosure.required: true`, `enabledPublishMethods: ["manual-guide"]`)
 * that is validated and rendered into human-readable copy, but that no code
 * ever reads. On 2026-10-25 exactly that shipped an unlabeled post — the
 * profile had said "AIGC label required" since 2025-09-01 and the CDP driver
 * never looked at it.
 *
 * So this is not a test of one field. It enumerates EVERY `required: true`
 * leaf in every registered profile — array elements included, since a flag
 * hidden inside `manualGuide.steps` is exactly the kind that goes unseen —
 * plus the two publish-gate declarations, and fails when:
 *   1. a declaration has no registered consumer, or
 *   2. a registered consumer's file does not contain the code-shaped read of
 *      that declaration (a comment or an error message cannot satisfy it), or
 *   3. the ledger names a declaration that no longer exists (no stale claims).
 *
 * What it does NOT prove: that the gate cannot be bypassed by editing the
 * ledger. Registering a consumer plus one matching line is enough to go green.
 * The weight is carried by the behaviour tests at the bottom — they exercise
 * the branches — and this file's job is to make "nobody wired it at all" red.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { listPlatformProfiles } from "../lib/platforms/index.mjs";
import { CDP_PUBLISH_METHOD, resolveAigcPolicy } from "../lib/platforms/upload-prep-policy.mjs";
import { PUBLISH_METHODS } from "../lib/platforms/profile-model.mjs";
import { resolvePublishMethod } from "../lib/publish-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(__dirname, "..", rel), "utf8");

/** Every leaf declared as `required: true`, as a dotted path from the profile root. */
function collectRequiredFlags(value, path = "", out = []) {
  if (!value || typeof value !== "object") return out;
  for (const [key, child] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (key === "required" && child === true) {
      out.push(here);
      continue;
    }
    collectRequiredFlags(child, here, out);
  }
  return out;
}

/**
 * The ledger. Each declaration → the file(s) that read it, and a code-shaped
 * string that must appear in that file (so a consumer cannot be claimed and
 * then deleted, and a comment describing the field cannot stand in for the read).
 */
const CONSUMERS = {
  "aiDisclosure.required": {
    why: "the CDP driver must refuse --publish with --no-aigc unless it is explicitly overridden",
    consumers: [
      {
        file: "lib/platforms/upload-prep-policy.mjs",
        evidence: "profile?.aiDisclosure?.required === true",
      },
      { file: "tiktok-upload-prep.mjs", evidence: "resolveAigcPolicy(" },
    ],
  },
  enabledPublishMethods: {
    why: "the driver publishes through CDP, so the profile must be the thing that allows CDP",
    consumers: [
      { file: "lib/publish-utils.mjs", evidence: "profile.enabledPublishMethods.includes(" },
      {
        file: "tiktok-upload-prep.mjs",
        evidence: "resolvePublishMethod(tiktokProfile, { method: CDP_PUBLISH_METHOD })",
      },
    ],
  },
  publishMethod: {
    why: "the resolved method drives the whole run (manual tier vs automation path)",
    consumers: [{ file: "lib/publish-utils.mjs", evidence: "return profile.publishMethod" }],
  },
};

const profiles = listPlatformProfiles();
const declaredRequiredPaths = profiles.flatMap((p) => collectRequiredFlags(p));

// ─── Declarations ↔ consumers ───

describe("profile declarations have consumers", () => {
  it("finds the required:true declarations (the enumerator is not silently empty)", () => {
    expect(declaredRequiredPaths).toContain("aiDisclosure.required");
  });

  it("sees flags nested inside arrays, not only plain objects", () => {
    // Without array recursion this returns [] and the gate silently covers
    // nothing for that shape — the profile's manualGuide.steps is an array.
    const nested = { steps: [{ required: true, id: "s1" }] };
    expect(collectRequiredFlags(nested)).toEqual(["steps.0.required"]);
  });

  it("every required:true declaration is registered with a consumer", () => {
    const missing = declaredRequiredPaths.filter((declaration) => !CONSUMERS[declaration]);
    expect(missing, `unwired declarations: ${missing.join(", ")}`).toEqual([]);
  });

  it("every registered consumer file actually reads its declaration", () => {
    for (const [declaration, { consumers }] of Object.entries(CONSUMERS)) {
      for (const { file, evidence } of consumers) {
        expect(read(file), `${file} is listed as a consumer of ${declaration}`).toContain(evidence);
      }
    }
  });

  it("the ledger has no entries for declarations that no longer exist", () => {
    const live = new Set([
      ...declaredRequiredPaths,
      ...profiles.flatMap((p) => Object.keys(p).filter((k) => k in CONSUMERS)),
    ]);
    for (const declaration of Object.keys(CONSUMERS)) {
      expect(live.has(declaration), `${declaration} is claimed but declared nowhere`).toBe(true);
    }
  });
});

// ─── The driver consumes the gate ───

describe("the CDP driver consults the profile", () => {
  const driver = read("tiktok-upload-prep.mjs");

  it("resolves the publish method through the profile instead of assuming CDP is allowed", () => {
    expect(driver).toContain('getPlatformProfile("tiktok")');
    expect(driver).toContain("resolvePublishMethod(tiktokProfile, { method: CDP_PUBLISH_METHOD })");
  });

  it("derives the AIGC decision from the policy result, not from the raw flag", () => {
    expect(driver).toContain("resolveAigcPolicy(");
    expect(driver).toContain("aigcPolicy.enabled");
    // The old shape — deciding on `hasFlag("no-aigc")` alone — is the defect.
    expect(driver).not.toContain('if (hasFlag("no-aigc"))');
  });
});

// ─── Policy behaviour ───

describe("the profile gate resolves the CDP method", () => {
  const profile = { platform: "tiktok", enabledPublishMethods: ["manual-guide", "cdp"] };

  it("asks for a method the enum actually defines", () => {
    expect(PUBLISH_METHODS).toContain(CDP_PUBLISH_METHOD);
  });

  it("resolves cdp when the profile enables it", () => {
    expect(resolvePublishMethod(profile, { method: CDP_PUBLISH_METHOD })).toBe("cdp");
  });

  it("fails closed when the profile does not enable cdp", () => {
    const closed = { platform: "tiktok", enabledPublishMethods: ["manual-guide"] };
    expect(() => resolvePublishMethod(closed, { method: CDP_PUBLISH_METHOD })).toThrow(
      /cdp.*not enabled.*tiktok/i,
    );
  });
});

describe("resolveAigcPolicy", () => {
  const required = { platform: "tiktok", aiDisclosure: { required: true, note: "must label" } };
  const optional = { platform: "tiktok", aiDisclosure: { required: false } };

  it("labels by default when the profile requires it", () => {
    expect(resolveAigcPolicy(required, {})).toMatchObject({ enabled: true, required: true });
  });

  it("warns but proceeds on a prep-only --no-aigc run", () => {
    const policy = resolveAigcPolicy(required, { noAigc: true });
    expect(policy.enabled).toBe(false);
    expect(policy.warning).toContain("must label");
  });

  it("refuses --publish + --no-aigc while the label is required", () => {
    expect(() => resolveAigcPolicy(required, { noAigc: true, publish: true })).toThrow(
      /required.*tiktok|tiktok.*required/i,
    );
  });

  it("allows the explicit override and keeps the warning attached", () => {
    const policy = resolveAigcPolicy(required, {
      noAigc: true,
      publish: true,
      confirmUnlabeled: true,
    });
    expect(policy).toMatchObject({ enabled: false, required: true, overridden: true });
    expect(policy.warning).toContain("must label");
  });

  it("does not gate a profile that does not require the label", () => {
    const policy = resolveAigcPolicy(optional, { noAigc: true, publish: true });
    expect(policy).toMatchObject({ enabled: false, required: false, warning: null });
  });
});
