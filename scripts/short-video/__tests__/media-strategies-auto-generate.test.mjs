/**
 * Auto-generation default (#1296).
 *
 * `approveAuto` gates the chain's GPU rung. Until now it defaulted to false, so
 * a run without an explicit `--approve-auto` left every chain scene at
 * "approval-required" and shipped text-only — which is exactly what happened to
 * baidu-token-exchange and zhipu-valuation on 2026-11-13. The user's decision
 * was "news content: on by default"; spending stays bounded by the per-content
 * budgets, and `--no-auto-generate` is the deliberate way out.
 */
import { describe, it, expect } from "vitest";
import { resolveApproveAuto } from "../lib/media-strategies.mjs";

describe("resolveApproveAuto", () => {
  it("defaults to true when no flag is given", () => {
    expect(resolveApproveAuto([])).toBe(true);
  });

  it("defaults to true for unrelated flags", () => {
    expect(resolveApproveAuto(["--content", "baidu-token-market", "--bgm"])).toBe(true);
  });

  it("stays true when --approve-auto is passed explicitly", () => {
    expect(resolveApproveAuto(["--approve-auto"])).toBe(true);
  });

  it("turns off with --no-auto-generate", () => {
    expect(resolveApproveAuto(["--no-auto-generate"])).toBe(false);
  });

  it("lets the explicit opt-out win over a leftover --approve-auto", () => {
    expect(resolveApproveAuto(["--approve-auto", "--no-auto-generate"])).toBe(false);
  });
});
