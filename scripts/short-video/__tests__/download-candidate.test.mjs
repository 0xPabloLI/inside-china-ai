/**
 * Download Candidate Helper Tests
 *
 * TDD: Tests written first (red), implementation second (green).
 *
 * Covers scenario matrix rows #5-#13 from spec.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
  statSync,
  mkdirSync,
} from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";

import { downloadCandidate } from "../lib/download-candidate.mjs";

// ─── Test helpers ───

/** Create a temp content directory for file write tests */
function makeTempContentDir() {
  const contentDir = mkdtempSync(join(tmpdir(), "dc-test-"));
  const assetsDir = join(contentDir, "assets");
  mkdirSync(assetsDir, { recursive: true });
  return { contentDir, assetsDir };
}

/** Clean up temp dir */
function cleanupDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}

/** Valid buffer (>1KB) */
const validBuffer = Buffer.alloc(2048, 0x00);
validBuffer.writeUInt32BE(0x20, 0);
validBuffer.write("ftyp", 4, "ascii");

/** Create a mock DownloadResult */
function mockDownloadResult(overrides = {}) {
  return {
    status: "downloaded",
    strategy: "direct-http",
    source: "direct",
    sourceUrl: "https://cdn.example.com/video.mp4",
    byteLength: validBuffer.length,
    durationMs: 0,
    provenance: { adapterVersion: "1.0.0", authenticated: false },
    ...overrides,
  };
}

// ─── T2.2: File existence check → skipped (scenario #6) ───

describe("downloadCandidate — file existence", () => {
  it("returns success + skipped=true when file already exists (scenario #6)", async () => {
    const { contentDir, assetsDir } = makeTempContentDir();
    try {
      const destPath = join(assetsDir, "existing.jpg");
      writeFileSync(destPath, validBuffer); // pre-create

      const result = await downloadCandidate(
        { url: "https://cdn.example.com/photo.jpg", type: "image", source: "test" },
        {
          destPath,
          contentDir,
          downloadFn: async () => mockDownloadResult({ buffer: validBuffer }),
        },
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.path).toBe("assets/existing.jpg");
    } finally {
      cleanupDir(contentDir);
    }
  });
});

// ─── T2.4: VDL downloaded + buffer → write file (scenario #7, #12) ───

describe("downloadCandidate — VDL downloaded", () => {
  it("writes buffer to file and returns success (scenario #7)", async () => {
    const { contentDir, assetsDir } = makeTempContentDir();
    try {
      const destPath = join(assetsDir, "new.jpg");
      const result = await downloadCandidate(
        { url: "https://cdn.example.com/photo.jpg", type: "image", source: "test" },
        {
          destPath,
          contentDir,
          downloadFn: async () =>
            mockDownloadResult({ buffer: validBuffer, mimeType: "image/jpeg" }),
        },
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.path).toBe("assets/new.jpg");
      expect(existsSync(destPath)).toBe(true);
      const written = readFileSync(destPath);
      expect(written.length).toBe(validBuffer.length);
    } finally {
      cleanupDir(contentDir);
    }
  });

  it("creates parent directory if not exists (scenario #12)", async () => {
    const { contentDir, assetsDir } = makeTempContentDir();
    try {
      const destPath = join(assetsDir, "subdir", "deep", "file.jpg");
      const result = await downloadCandidate(
        { url: "https://cdn.example.com/photo.jpg", type: "image", source: "test" },
        {
          destPath,
          contentDir,
          downloadFn: async () => mockDownloadResult({ buffer: validBuffer }),
        },
      );

      expect(result.success).toBe(true);
      expect(existsSync(destPath)).toBe(true);
    } finally {
      cleanupDir(contentDir);
    }
  });
});

// ─── T2.5: VDL downloaded but no buffer (scenario #21) ───

describe("downloadCandidate — VDL downloaded without buffer", () => {
  it("returns failure when status=downloaded but no buffer (scenario #21)", async () => {
    const { contentDir, assetsDir } = makeTempContentDir();
    try {
      const destPath = join(assetsDir, "no-buffer.jpg");
      const result = await downloadCandidate(
        { url: "https://cdn.example.com/photo.jpg", type: "image", source: "test" },
        {
          destPath,
          contentDir,
          downloadFn: async () => mockDownloadResult({ buffer: undefined }),
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("no-buffer");
    } finally {
      cleanupDir(contentDir);
    }
  });
});

// ─── T2.6: VDL skipped (scenario #5) ───

describe("downloadCandidate — VDL skipped", () => {
  it("returns failure + skipped when VDL status=skipped (scenario #5)", async () => {
    const { contentDir, assetsDir } = makeTempContentDir();
    try {
      const destPath = join(assetsDir, "skip.jpg");
      const result = await downloadCandidate(
        { url: "https://www.douyin.com/video/123", type: "video", source: "douyin" },
        {
          destPath,
          contentDir,
          downloadFn: async () =>
            mockDownloadResult({ status: "skipped", reason: "cobalt-unavailable" }),
        },
      );

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.error).toBe("cobalt-unavailable");
    } finally {
      cleanupDir(contentDir);
    }
  });
});

// ─── T2.7: VDL unsupported (scenario #10) ───

describe("downloadCandidate — VDL unsupported", () => {
  it("returns failure + skipped when VDL status=unsupported (scenario #10)", async () => {
    const { contentDir, assetsDir } = makeTempContentDir();
    try {
      const destPath = join(assetsDir, "unsupported.jpg");
      const result = await downloadCandidate(
        { url: "https://www.douyin.com/video/123", type: "video", source: "douyin" },
        {
          destPath,
          contentDir,
          downloadFn: async () =>
            mockDownloadResult({ status: "unsupported", reason: "local-processing-not-supported" }),
        },
      );

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.error).toBe("local-processing-not-supported");
    } finally {
      cleanupDir(contentDir);
    }
  });
});

// ─── T2.8: VDL needs-selection (scenario #9) ───

describe("downloadCandidate — VDL needs-selection", () => {
  it("returns failure when VDL status=needs-selection (scenario #9)", async () => {
    const { contentDir, assetsDir } = makeTempContentDir();
    try {
      const destPath = join(assetsDir, "picker.jpg");
      const result = await downloadCandidate(
        { url: "https://www.tiktok.com/@user/video/123", type: "video", source: "tiktok" },
        {
          destPath,
          contentDir,
          downloadFn: async () =>
            mockDownloadResult({ status: "needs-selection", reason: "picker-response" }),
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("needs-selection");
    } finally {
      cleanupDir(contentDir);
    }
  });
});

// ─── T2.9: VDL failed (scenario #8) ───

describe("downloadCandidate — VDL failed", () => {
  it("returns failure when VDL status=failed (scenario #8)", async () => {
    const { contentDir, assetsDir } = makeTempContentDir();
    try {
      const destPath = join(assetsDir, "fail.jpg");
      const result = await downloadCandidate(
        { url: "https://cdn.example.com/broken.jpg", type: "image", source: "test" },
        {
          destPath,
          contentDir,
          downloadFn: async () => mockDownloadResult({ status: "failed", reason: "http-404" }),
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("http-404");
    } finally {
      cleanupDir(contentDir);
    }
  });
});

// ─── T2.10: VDL null/undefined URL (scenario #11) ───

describe("downloadCandidate — null/undefined URL", () => {
  it("returns skipped when candidate URL is null (scenario #11)", async () => {
    const { contentDir, assetsDir } = makeTempContentDir();
    try {
      const destPath = join(assetsDir, "null.jpg");
      const result = await downloadCandidate(
        { url: null, type: "image", source: "test" },
        {
          destPath,
          contentDir,
          downloadFn: async () =>
            mockDownloadResult({ status: "skipped", reason: "empty-url", sourceUrl: "" }),
        },
      );

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.error).toBe("empty-url");
    } finally {
      cleanupDir(contentDir);
    }
  });
});

// ─── T2.11: writeFileSync failure (scenario #13) ───

describe("downloadCandidate — write failure", () => {
  it("returns failure when writeFileSync throws (scenario #13)", async () => {
    const { contentDir, assetsDir } = makeTempContentDir();
    try {
      // Use a path that can't be written to (e.g., under a file, not a dir)
      const blockerPath = join(assetsDir, "blocker");
      writeFileSync(blockerPath, "block"); // creates a file where a dir should be
      const destPath = join(blockerPath, "nested.jpg"); // can't create dir under a file

      const result = await downloadCandidate(
        { url: "https://cdn.example.com/photo.jpg", type: "image", source: "test" },
        {
          destPath,
          contentDir,
          downloadFn: async () => mockDownloadResult({ buffer: validBuffer }),
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    } finally {
      cleanupDir(contentDir);
    }
  });
});

// ─── T2.12: Path conversion (cross-step contract) ───

describe("downloadCandidate — path conversion", () => {
  it("returns relative path (destPath with contentDir prefix stripped)", async () => {
    const { contentDir, assetsDir } = makeTempContentDir();
    try {
      const destPath = join(assetsDir, "test.jpg");
      const result = await downloadCandidate(
        { url: "https://cdn.example.com/photo.jpg", type: "image", source: "test" },
        {
          destPath,
          contentDir,
          downloadFn: async () => mockDownloadResult({ buffer: validBuffer }),
        },
      );

      expect(result.path).toBe("assets/test.jpg");
      expect(result.path).not.toContain(contentDir);
    } finally {
      cleanupDir(contentDir);
    }
  });
});

// ─── T2: Headers passthrough ───

describe("downloadCandidate — headers passthrough", () => {
  it("passes headers to downloadFn", async () => {
    const { contentDir, assetsDir } = makeTempContentDir();
    try {
      let receivedHeaders = null;
      const downloadFn = async (url, opts) => {
        receivedHeaders = opts?.headers;
        return mockDownloadResult({ buffer: validBuffer });
      };

      const customHeaders = { "User-Agent": "ChinaAINews/1.0" };
      await downloadCandidate(
        {
          url: "https://commons.wikimedia.org/wiki/File:Test.jpg",
          type: "image",
          source: "wikimedia",
        },
        { destPath: join(assetsDir, "wiki.jpg"), contentDir, headers: customHeaders, downloadFn },
      );

      expect(receivedHeaders).toEqual(customHeaders);
    } finally {
      cleanupDir(contentDir);
    }
  });

  it("works without headers (no headers passed to downloadFn)", async () => {
    const { contentDir, assetsDir } = makeTempContentDir();
    try {
      let receivedOpts = "not-called";
      const downloadFn = async (url, opts) => {
        receivedOpts = opts;
        return mockDownloadResult({ buffer: validBuffer });
      };

      await downloadCandidate(
        { url: "https://cdn.example.com/photo.jpg", type: "image", source: "test" },
        { destPath: join(assetsDir, "nohdr.jpg"), contentDir, downloadFn },
      );

      // downloadFn called, headers should be undefined in opts
      expect(receivedOpts).toBeDefined();
      expect(receivedOpts.headers).toBeUndefined();
    } finally {
      cleanupDir(contentDir);
    }
  });
});
