import { describe, expect, it } from "vitest";
import { isDuplicateEmailError } from "./subscribers.functions";

describe("isDuplicateEmailError", () => {
  // #319 OCR lib scan: the public subscribe path decided "already subscribed"
  // by string-matching the Postgres error message, so a wording change would
  // turn a re-subscribe into a 500.
  it("recognises the Postgres unique-violation code", () => {
    expect(
      isDuplicateEmailError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "subscribers_email_key"',
      }),
    ).toBe(true);
  });

  it("does not swallow unrelated database errors", () => {
    expect(isDuplicateEmailError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(
      isDuplicateEmailError({ code: "42P01", message: 'relation "subscribers" does not exist' }),
    ).toBe(false);
  });

  it("still matches the legacy duplicate message", () => {
    expect(isDuplicateEmailError({ code: "", message: "Duplicate email" })).toBe(true);
  });

  it("treats a missing error as success", () => {
    expect(isDuplicateEmailError(null)).toBe(false);
    expect(isDuplicateEmailError(undefined)).toBe(false);
  });
});
