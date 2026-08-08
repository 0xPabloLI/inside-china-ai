import { describe, it, expect } from "vitest";
import { formatFileSize } from "../lib/format";

describe("formatFileSize", () => {
  // Scenario: null bytes → em dash
  it("returns em dash for null", () => {
    expect(formatFileSize(null)).toBe("—");
  });

  // Scenario: 0 bytes → em dash
  it("returns em dash for zero", () => {
    expect(formatFileSize(0)).toBe("—");
  });

  // Bytes < 1024 → "X B"
  it("formats bytes below 1024 as B", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1)).toBe("1 B");
    expect(formatFileSize(1023)).toBe("1023 B");
  });

  // Bytes < 1MB → "X.X KB"
  it("formats bytes between 1024 and 1MB as KB", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1024 * 1024 - 1)).toBe("1024.0 KB");
  });

  // Bytes >= 1MB → "X.X MB"
  it("formats bytes at or above 1MB as MB", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(formatFileSize(50 * 1024 * 1024)).toBe("50.0 MB");
  });
});
