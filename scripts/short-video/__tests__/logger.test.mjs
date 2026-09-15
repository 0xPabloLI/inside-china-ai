import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createLogger, redact, redactString } from "../lib/logger.mjs";

function capture() {
  const lines = [];
  return {
    lines,
    stream: {
      write(chunk) {
        lines.push(chunk);
        return true;
      },
    },
    last() {
      return JSON.parse(lines[lines.length - 1]);
    },
  };
}

describe("redactString", () => {
  it("masks bearer tokens but keeps the scheme", () => {
    expect(redactString("auth used Bearer sb_publish_key_123")).toBe("auth used Bearer [REDACTED]");
  });

  it("masks emails but keeps the domain for triage", () => {
    expect(redactString("sent to reader@example.com at 10:00")).toBe(
      "sent to r***@example.com at 10:00",
    );
  });

  it("leaves strings without secrets alone", () => {
    expect(redactString("uploaded contentId=abc")).toBe("uploaded contentId=abc");
  });
});

describe("redact", () => {
  it("drops sensitive keys at any depth, case-insensitively", () => {
    expect(redact({ APIKEY: "k", nested: { Token: "t", ok: 1 } })).toEqual({
      nested: { ok: 1 },
    });
  });

  it("masks emails and bearer tokens inside nested strings", () => {
    const out = redact({ note: "admin@chinaai.news", list: ["Bearer xyz"] });
    expect(out.note).toBe("a***@chinaai.news");
    expect(out.list[0]).toBe("Bearer [REDACTED]");
  });

  it("keeps plain primitives and null untouched", () => {
    expect(redact({ n: 3, ok: true, nil: null, when: "2026-09-15" })).toEqual({
      n: 3,
      ok: true,
      nil: null,
      when: "2026-09-15",
    });
  });
});

describe("createLogger", () => {
  let origLevel, origFormat;
  beforeEach(() => {
    origLevel = process.env.LOG_LEVEL;
    origFormat = process.env.LOG_FORMAT;
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_FORMAT;
  });
  afterEach(() => {
    if (origLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = origLevel;
    if (origFormat === undefined) delete process.env.LOG_FORMAT;
    else process.env.LOG_FORMAT = origFormat;
  });

  it("emits JSON lines to stderr with ts/level/name/message", () => {
    const cap = capture();
    const log = createLogger("test-logger");
    log.setStream(cap.stream);
    log.info("hello", { contentId: "c1" });
    const rec = cap.last();
    expect(rec.level).toBe("info");
    expect(rec.name).toBe("test-logger");
    expect(rec.message).toBe("hello");
    expect(rec.contentId).toBe("c1");
    expect(rec.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("respects LOG_LEVEL threshold", () => {
    const cap = capture();
    process.env.LOG_LEVEL = "warn";
    const log = createLogger("test-logger");
    log.setStream(cap.stream);
    log.info("dropped");
    log.warn("kept");
    expect(cap.lines).toHaveLength(1);
    expect(cap.last().message).toBe("kept");
  });

  it("scrubs sensitive fields and secrets in messages in json format", () => {
    const cap = capture();
    const log = createLogger("test-logger");
    log.setStream(cap.stream);
    log.info("call failed for user@example.com", { apikey: "sk-123", n: 1 });
    const rec = cap.last();
    expect(rec.apikey).toBeUndefined();
    expect(rec.message).toBe("call failed for u***@example.com");
    expect(rec.n).toBe(1);
  });

  it("text format stays one scrubbed line", () => {
    const cap = capture();
    process.env.LOG_FORMAT = "text";
    const log = createLogger("test-logger");
    log.setStream(cap.stream);
    log.warn("oops Bearer abc.def", { email: "a@b.co" });
    expect(cap.lines).toHaveLength(1);
    expect(cap.lines[0]).toContain("WARN ");
    expect(cap.lines[0]).toContain("Bearer [REDACTED]");
    expect(cap.lines[0]).not.toContain("a@b.co");
    expect(cap.lines[0]).not.toContain('"message"');
  });

  it("child inherits name and merges bindings, still scrubbed", () => {
    const cap = capture();
    const log = createLogger("pipeline");
    log.setStream(cap.stream);
    const child = log.child({ stage: "tts" });
    child.info("done", { stage: "render", apikey: "k" });
    const rec = cap.last();
    expect(rec.name).toBe("pipeline");
    expect(rec.stage).toBe("render");
    expect(rec.apikey).toBeUndefined();
  });
});
