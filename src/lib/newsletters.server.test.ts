import { describe, expect, it } from "vitest";
import { stampLastSentAt } from "./newsletters.server";

describe("stampLastSentAt", () => {
  // #319 OCR lib scan: the loop issued one UPDATE per subscriber. The batch
  // call must still cover every recipient, in order, with no losses.
  it("stamps every recipient in a single call when the list fits one batch", async () => {
    const calls: string[][] = [];
    await stampLastSentAt(["a", "b", "c"], async (batch) => {
      calls.push(batch);
    });
    expect(calls).toEqual([["a", "b", "c"]]);
  });

  it("splits large recipient lists into bounded, order-preserving batches", async () => {
    const calls: string[][] = [];
    const ids = Array.from({ length: 5 }, (_, i) => `id-${i}`);
    await stampLastSentAt(
      ids,
      async (batch) => {
        calls.push(batch);
      },
      2,
    );
    expect(calls).toEqual([["id-0", "id-1"], ["id-2", "id-3"], ["id-4"]]);
  });

  it("does nothing for an empty recipient list", async () => {
    const calls: string[][] = [];
    await stampLastSentAt([], async (batch) => {
      calls.push(batch);
    });
    expect(calls).toEqual([]);
  });

  it("rejects a non-positive batch size instead of looping forever", async () => {
    await expect(stampLastSentAt(["a"], async () => {}, 0)).rejects.toThrow(/batchSize/);
  });
});
