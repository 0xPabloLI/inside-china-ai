import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  guessMimeType,
  resolveFilePaths,
  buildStoragePath,
  buildAttachmentHeaders,
  uploadFile,
  createAttachmentRecord,
  uploadAttachments,
  listAttachments,
  MAX_FILE_SIZE,
} from "../lib/attachment-utils.mjs";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ─── guessMimeType ───

describe("guessMimeType", () => {
  it("returns correct MIME for .pdf", () => {
    expect(guessMimeType("report.pdf")).toBe("application/pdf");
  });

  it("returns correct MIME for .docx", () => {
    expect(guessMimeType("doc.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("returns correct MIME for .csv", () => {
    expect(guessMimeType("data.csv")).toBe("text/csv");
  });

  it("returns correct MIME for .png", () => {
    expect(guessMimeType("image.png")).toBe("image/png");
  });

  it("returns correct MIME for .jpg (case insensitive)", () => {
    expect(guessMimeType("photo.JPG")).toBe("image/jpeg");
  });

  it("returns octet-stream for unknown extension", () => {
    expect(guessMimeType("file.xyz")).toBe("application/octet-stream");
  });

  it("handles paths, not just file names", () => {
    expect(guessMimeType("/path/to/report.pdf")).toBe("application/pdf");
  });
});

// ─── resolveFilePaths ───

describe("resolveFilePaths", () => {
  const tmpDir = join(tmpdir(), "attachment-test-" + Date.now());

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("resolves a valid PDF file (scenario: normal single file)", () => {
    const filePath = join(tmpDir, "report.pdf");
    writeFileSync(filePath, "fake pdf content");

    const result = resolveFilePaths([filePath]);
    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe("report.pdf");
    expect(result[0].mimeType).toBe("application/pdf");
    expect(result[0].fileSize).toBe(16); // "fake pdf content"
  });

  it("resolves multiple files (scenario: multi-file upload)", () => {
    const f1 = join(tmpDir, "report.pdf");
    const f2 = join(tmpDir, "data.csv");
    writeFileSync(f1, "pdf");
    writeFileSync(f2, "csv");

    const result = resolveFilePaths([f1, f2]);
    expect(result).toHaveLength(2);
    expect(result[0].fileName).toBe("report.pdf");
    expect(result[1].fileName).toBe("data.csv");
  });

  it("throws on non-existent file (scenario: missing file)", () => {
    expect(() => resolveFilePaths(["/nonexistent/file.pdf"])).toThrow(/not found/i);
  });

  it("throws on empty array (scenario: no files)", () => {
    expect(() => resolveFilePaths([])).toThrow(/No file paths provided/);
  });

  it("throws on null/undefined input", () => {
    expect(() => resolveFilePaths(null)).toThrow();
    expect(() => resolveFilePaths(undefined)).toThrow();
  });

  it("throws on empty file (scenario: zero-byte file)", () => {
    const filePath = join(tmpDir, "empty.pdf");
    writeFileSync(filePath, "");

    expect(() => resolveFilePaths([filePath])).toThrow(/empty/i);
  });

  it("throws on unsupported file type (scenario: .exe)", () => {
    const filePath = join(tmpDir, "malware.exe");
    writeFileSync(filePath, "fake exe");

    expect(() => resolveFilePaths([filePath])).toThrow(/Unsupported file type/);
  });

  it("throws on duplicate file names (scenario: same name, different dirs)", () => {
    const dir1 = join(tmpDir, "dir1");
    const dir2 = join(tmpDir, "dir2");
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });

    const f1 = join(dir1, "report.pdf");
    const f2 = join(dir2, "report.pdf");
    writeFileSync(f1, "pdf1");
    writeFileSync(f2, "pdf2");

    expect(() => resolveFilePaths([f1, f2])).toThrow(/Duplicate file names/);
  });

  it("throws on directory path instead of file (scenario: directory passed)", () => {
    expect(() => resolveFilePaths([tmpDir])).toThrow(/Not a file/);
  });
});

// ─── buildStoragePath ───

describe("buildStoragePath", () => {
  it("builds path with postId prefix and fileName", () => {
    expect(buildStoragePath("post-uuid-123", "report.pdf")).toBe("post-uuid-123/report.pdf");
  });

  it("handles file names with spaces", () => {
    expect(buildStoragePath("abc", "my report.pdf")).toBe("abc/my report.pdf");
  });
});

// ─── buildAttachmentHeaders ───

describe("buildAttachmentHeaders", () => {
  it("includes apikey and Authorization", () => {
    const headers = buildAttachmentHeaders("tok-123", "sb_key");
    expect(headers.apikey).toBe("sb_key");
    expect(headers.Authorization).toBe("Bearer tok-123");
  });
});

// ─── uploadFile ───

describe("uploadFile", () => {
  const tmpDir = join(tmpdir(), "attachment-upload-test-" + Date.now());
  const mockAuth = "tok-123";
  const supabaseUrl = "https://example.supabase.co";
  const supabaseKey = "sb_publishable_test";

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("uploads file successfully (scenario: normal upload)", async () => {
    const filePath = join(tmpDir, "report.pdf");
    writeFileSync(filePath, "fake pdf content");

    const file = resolveFilePaths([filePath])[0];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ Key: "post-attachments/post-id/report.pdf" }),
    });

    const result = await uploadFile(file, "post-id", mockAuth, supabaseUrl, supabaseKey);
    expect(result.storagePath).toBe("post-id/report.pdf");
    expect(result.publicUrl).toContain("post-attachments/post-id/report.pdf");

    // Verify fetch was called with correct URL
    const call = global.fetch.mock.calls[0];
    expect(call[0]).toContain("/storage/v1/object/post-attachments/post-id/report.pdf");
    expect(call[1].method).toBe("POST");
  });

  it("throws on upload failure (scenario: storage error)", async () => {
    const filePath = join(tmpDir, "report.pdf");
    writeFileSync(filePath, "fake pdf content");
    const file = resolveFilePaths([filePath])[0];

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: "Forbidden" }),
    });

    await expect(uploadFile(file, "post-id", mockAuth, supabaseUrl, supabaseKey)).rejects.toThrow(
      /Upload failed.*Forbidden/,
    );
  });

  it("throws on network error", async () => {
    const filePath = join(tmpDir, "report.pdf");
    writeFileSync(filePath, "fake pdf content");
    const file = resolveFilePaths([filePath])[0];

    global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

    await expect(uploadFile(file, "post-id", mockAuth, supabaseUrl, supabaseKey)).rejects.toThrow();
  });
});

// ─── createAttachmentRecord ───

describe("createAttachmentRecord", () => {
  const mockAuth = "tok-123";
  const supabaseUrl = "https://example.supabase.co";
  const supabaseKey = "sb_publishable_test";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts record successfully (scenario: normal insert)", async () => {
    const file = { fileName: "report.pdf", fileSize: 1024, mimeType: "application/pdf" };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "att-uuid", post_id: "post-id", file_name: "report.pdf" }],
    });

    const result = await createAttachmentRecord(
      file,
      "post-id/report.pdf",
      "post-id",
      mockAuth,
      supabaseUrl,
      supabaseKey,
    );

    expect(result.id).toBe("att-uuid");

    // Verify the request body
    const call = global.fetch.mock.calls[0];
    expect(call[0]).toContain("/rest/v1/post_attachments");
    expect(call[1].method).toBe("POST");
    const body = JSON.parse(call[1].body);
    expect(body.post_id).toBe("post-id");
    expect(body.file_name).toBe("report.pdf");
    expect(body.storage_path).toBe("post-id/report.pdf");
    expect(body.file_size).toBe(1024);
    expect(body.mime_type).toBe("application/pdf");
  });

  it("throws on DB error (scenario: FK constraint violation)", async () => {
    const file = { fileName: "report.pdf", fileSize: 1024, mimeType: "application/pdf" };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: "violates foreign key constraint" }),
    });

    await expect(
      createAttachmentRecord(
        file,
        "post-id/report.pdf",
        "post-id",
        mockAuth,
        supabaseUrl,
        supabaseKey,
      ),
    ).rejects.toThrow(/DB insert failed.*foreign key/);
  });
});

// ─── uploadAttachments ───

describe("uploadAttachments", () => {
  const tmpDir = join(tmpdir(), "attachment-multi-test-" + Date.now());
  const mockAuth = "tok-123";
  const supabaseUrl = "https://example.supabase.co";
  const supabaseKey = "sb_publishable_test";

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("uploads multiple files successfully (scenario: multi-file upload)", async () => {
    const f1 = join(tmpDir, "report.pdf");
    const f2 = join(tmpDir, "data.csv");
    writeFileSync(f1, "pdf content here");
    writeFileSync(f2, "csv content here");

    // listAttachments (dedup check) + 2 files × 2 calls each = 5 fetch calls
    global.fetch = vi
      .fn()
      // Dedup check: listAttachments returns empty (no existing)
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      // File 1: storage upload
      .mockResolvedValueOnce({ ok: true, json: async () => ({ Key: "f1" }) })
      // File 1: DB insert
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: "att-1" }] })
      // File 2: storage upload
      .mockResolvedValueOnce({ ok: true, json: async () => ({ Key: "f2" }) })
      // File 2: DB insert
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: "att-2" }] });

    const result = await uploadAttachments("post-id", [f1, f2], mockAuth, supabaseUrl, supabaseKey);

    expect(result.uploaded).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.uploaded[0].attachmentId).toBe("att-1");
    expect(result.uploaded[1].attachmentId).toBe("att-2");
  });

  it("stops on first error (scenario: partial upload failure)", async () => {
    const f1 = join(tmpDir, "good.pdf");
    const f2 = join(tmpDir, "bad.pdf");
    writeFileSync(f1, "good pdf");
    writeFileSync(f2, "bad pdf");

    global.fetch = vi
      .fn()
      // Dedup check: listAttachments returns empty (no existing)
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      // File 1: storage upload — success
      .mockResolvedValueOnce({ ok: true, json: async () => ({ Key: "good" }) })
      // File 1: DB insert — success
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: "att-1" }] })
      // File 2: storage upload — fail
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: "Server error" }),
      });

    const result = await uploadAttachments("post-id", [f1, f2], mockAuth, supabaseUrl, supabaseKey);

    expect(result.uploaded).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].fileName).toBe("bad.pdf");
  });

  it("throws on invalid file paths before any upload", async () => {
    await expect(
      uploadAttachments("post-id", ["/nonexistent/file.pdf"], mockAuth, supabaseUrl, supabaseKey),
    ).rejects.toThrow(/not found/i);
  });

  it("skips files that already exist (scenario: dedup)", async () => {
    const f1 = join(tmpDir, "existing.pdf");
    const f2 = join(tmpDir, "new.pdf");
    writeFileSync(f1, "existing content");
    writeFileSync(f2, "new content");

    global.fetch = vi
      .fn()
      // Dedup check: listAttachments returns existing file
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "att-old", file_name: "existing.pdf", storage_path: "post-id/existing.pdf" },
        ],
      })
      // File 2: storage upload (only new.pdf is uploaded)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ Key: "new" }) })
      // File 2: DB insert
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: "att-2" }] });

    const result = await uploadAttachments("post-id", [f1, f2], mockAuth, supabaseUrl, supabaseKey);

    expect(result.uploaded).toHaveLength(1);
    expect(result.uploaded[0].fileName).toBe("new.pdf");
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].fileName).toBe("existing.pdf");
    expect(result.errors).toHaveLength(0);
  });
});

// ─── listAttachments ───

describe("listAttachments", () => {
  const mockAuth = "tok-123";
  const supabaseUrl = "https://example.supabase.co";
  const supabaseKey = "sb_publishable_test";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns existing attachments (scenario: post with attachments)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "att-1",
          file_name: "report.pdf",
          storage_path: "post-id/report.pdf",
          file_size: 1024,
          mime_type: "application/pdf",
        },
      ],
    });

    const result = await listAttachments("post-id", mockAuth, supabaseUrl, supabaseKey);
    expect(result).toHaveLength(1);
    expect(result[0].file_name).toBe("report.pdf");
  });

  it("returns empty array for post with no attachments (scenario: no attachments)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const result = await listAttachments("post-id", mockAuth, supabaseUrl, supabaseKey);
    expect(result).toEqual([]);
  });

  it("throws on query error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "Bad request" }),
    });

    await expect(listAttachments("post-id", mockAuth, supabaseUrl, supabaseKey)).rejects.toThrow(
      /Query attachments failed/,
    );
  });
});
