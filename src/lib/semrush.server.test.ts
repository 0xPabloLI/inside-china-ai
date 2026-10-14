import { describe, expect, it } from "vitest";
import { normalizeRows } from "./semrush.server";

describe("normalizeRows", () => {
  it("maps array rows onto the response's column names", () => {
    expect(normalizeRows({ data: { columnNames: ["A", "B"], rows: [["1", "2"]] } })).toEqual([
      { A: "1", B: "2" },
    ]);
  });

  it("maps object rows to string values", () => {
    expect(normalizeRows({ data: { rows: [{ Ph: "x", Nq: 3 }] } })).toEqual([{ Ph: "x", Nq: "3" }]);
  });

  it("fills missing array cells with an empty string", () => {
    expect(normalizeRows({ data: { columnNames: ["A", "B", "C"], rows: [["1", null]] } })).toEqual([
      { A: "1", B: "", C: "" },
    ]);
  });

  // #319 OCR lib scan: `rows.map` threw when the gateway returned a
  // non-array, and a null row made Object.entries throw mid-request.
  it("returns an empty list when rows is not an array", () => {
    expect(normalizeRows({ data: { rows: "oops" } })).toEqual([]);
    expect(normalizeRows({ data: {} })).toEqual([]);
    expect(normalizeRows({})).toEqual([]);
    expect(normalizeRows(null)).toEqual([]);
  });

  it("skips null rows instead of throwing", () => {
    expect(
      normalizeRows({ data: { columnNames: ["A"], rows: [null, undefined, ["1"], 7] } }),
    ).toEqual([{ A: "1" }, {}]);
  });
});
