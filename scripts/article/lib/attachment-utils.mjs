/**
 * Attachment Utils — File metadata, storage upload, and DB record creation.
 *
 * Extracted into a lib module for testability. The main upload-attachments.mjs
 * script imports these functions.
 *
 * Flow:
 *   1. resolveFilePaths() — validate file existence, collect metadata
 *   2. uploadFile() — upload to Supabase Storage
 *   3. createAttachmentRecord() — insert metadata row into post_attachments
 *   4. uploadAttachments() — orchestrates the above for all files
 */

import { readFileSync, existsSync, statSync } from "fs";
import { basename, extname } from "path";

// ─── Constants ───

const STORAGE_BUCKET = "post-attachments";

// MIME type lookup for common file extensions
const MIME_TYPES = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".zip": "application/zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// Max file size: 50 MB (matches DB constraint)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// ─── MIME type ───

/**
 * Guess MIME type from file extension.
 *
 * @param {string} fileName — File name or path
 * @returns {string} MIME type, defaults to "application/octet-stream"
 */
export function guessMimeType(fileName) {
  const ext = extname(fileName).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

// ─── File resolution ───

/**
 * Resolve and validate a list of file paths.
 *
 * Each returned object contains:
 *   - path: original file path
 *   - fileName: base name (for storage)
 *   - fileSize: in bytes
 *   - mimeType: guessed from extension
 *
 * @param {string[]} filePaths — Array of file paths to validate
 * @returns {Array<{ path: string, fileName: string, fileSize: number, mimeType: string }>}
 * @throws {Error} If any file doesn't exist, exceeds size limit, or MIME type not allowed
 */
export function resolveFilePaths(filePaths) {
  if (!filePaths || filePaths.length === 0) {
    throw new Error("No file paths provided");
  }

  const resolved = [];

  for (const fp of filePaths) {
    if (!fp || typeof fp !== "string" || !fp.trim()) {
      throw new Error(`Invalid file path: ${JSON.stringify(fp)}`);
    }

    if (!existsSync(fp)) {
      throw new Error(`File not found: ${fp}`);
    }

    const stats = statSync(fp);

    if (!stats.isFile()) {
      throw new Error(`Not a file: ${fp}`);
    }

    if (stats.size === 0) {
      throw new Error(`File is empty: ${fp}`);
    }

    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(
        `File too large: ${fp} (${(stats.size / (1024 * 1024)).toFixed(1)} MB). Max: ${MAX_FILE_SIZE / (1024 * 1024)} MB`,
      );
    }

    const fileName = basename(fp);
    const mimeType = guessMimeType(fp);

    if (mimeType === "application/octet-stream") {
      throw new Error(
        `Unsupported file type: ${fp} (extension ${extname(fp)} not in allowed list)`,
      );
    }

    resolved.push({
      path: fp,
      fileName,
      fileSize: stats.size,
      mimeType,
    });
  }

  // Check for duplicate file names
  const names = resolved.map((r) => r.fileName);
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate file names: ${[...new Set(duplicates)].join(", ")}. File names must be unique.`,
    );
  }

  return resolved;
}

// ─── Storage path builder ───

/**
 * Build a storage path for a file in the post-attachments bucket.
 *
 * Format: {postId}/{fileName}
 *
 * @param {string} postId — Post UUID
 * @param {string} fileName — File base name
 * @returns {string} Storage path
 */
export function buildStoragePath(postId, fileName) {
  return `${postId}/${fileName}`;
}

// ─── Headers builder ───

/**
 * Build Supabase REST API headers for authenticated requests.
 * Shared with publish-utils.mjs logic, but kept independent for attachment ops.
 *
 * @param {string} accessToken — Supabase auth access token
 * @param {string} supabaseKey — Supabase publishable/anon key
 * @returns {object} Headers object
 */
export function buildAttachmentHeaders(accessToken, supabaseKey) {
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${accessToken}`,
  };
  return headers;
}

// ─── Upload to Storage ───

/**
 * Upload a single file to Supabase Storage (post-attachments bucket).
 *
 * Uses the REST API directly (not @supabase/supabase-js, to match publish-article.mjs pattern).
 *
 * @param {{ path: string, fileName: string, fileSize: number, mimeType: string }} file — Resolved file
 * @param {string} postId — Post UUID (used as storage path prefix)
 * @param {string} accessToken — Admin access token
 * @param {string} supabaseUrl — Supabase project URL
 * @param {string} supabaseKey — Supabase publishable/anon key
 * @returns {Promise<{ storagePath: string, publicUrl: string }>}
 * @throws {Error} If upload fails
 */
export async function uploadFile(file, postId, accessToken, supabaseUrl, supabaseKey) {
  const storagePath = buildStoragePath(postId, file.fileName);
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`;
  const fileBuffer = readFileSync(file.path);

  const headers = buildAttachmentHeaders(accessToken, supabaseKey);
  headers["Content-Type"] = file.mimeType;
  headers["x-upsert"] = "true"; // overwrite if exists (for re-uploads)

  const resp = await fetch(uploadUrl, {
    method: "POST",
    headers,
    body: fileBuffer,
  });

  if (!resp.ok) {
    let msg;
    try {
      const data = await resp.json();
      msg = data?.message || data?.error || `HTTP ${resp.status}`;
    } catch {
      msg = `HTTP ${resp.status}`;
    }
    throw new Error(`Upload failed for ${file.fileName}: ${msg}`);
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;

  return { storagePath, publicUrl };
}

// ─── Create DB record ───

/**
 * Insert a metadata row into the post_attachments table.
 *
 * @param {{ fileName: string, fileSize: number, mimeType: string }} file — File metadata
 * @param {string} storagePath — Storage path returned by uploadFile
 * @param {string} postId — Post UUID
 * @param {string} accessToken — Admin access token
 * @param {string} supabaseUrl — Supabase project URL
 * @param {string} supabaseKey — Supabase publishable/anon key
 * @returns {Promise<{ id: string, post_id: string, file_name: string, storage_path: string }>}
 * @throws {Error} If DB insert fails
 */
export async function createAttachmentRecord(
  file,
  storagePath,
  postId,
  accessToken,
  supabaseUrl,
  supabaseKey,
) {
  const url = `${supabaseUrl}/rest/v1/post_attachments`;
  const body = {
    post_id: postId,
    file_name: file.fileName,
    storage_path: storagePath,
    file_size: file.fileSize,
    mime_type: file.mimeType,
  };

  const headers = buildAttachmentHeaders(accessToken, supabaseKey);
  headers["Content-Type"] = "application/json";
  headers["Prefer"] = "return=representation";

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await resp.json();

  if (!resp.ok) {
    const msg = data?.message || `HTTP ${resp.status}`;
    throw new Error(`DB insert failed for ${file.fileName}: ${msg}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row;
}

// ─── Orchestration ───

/**
 * Upload multiple files as attachments to a post.
 *
 * For each file:
 *   1. Upload to Supabase Storage
 *   2. Insert metadata row into post_attachments
 *
 * If a file fails, stops and returns results so far + the error.
 *
 * @param {string} postId — Post UUID (must exist in posts table)
 * @param {string[]} filePaths — Array of file paths to upload
 * @param {string} accessToken — Admin access token
 * @param {string} supabaseUrl — Supabase project URL
 * @param {string} supabaseKey — Supabase publishable/anon key
 * @returns {Promise<{ uploaded: Array<{ fileName: string, storagePath: string, publicUrl: string, attachmentId: string }>, errors: Array<{ fileName: string, error: string }> }>}
 */
export async function uploadAttachments(postId, filePaths, accessToken, supabaseUrl, supabaseKey) {
  const files = resolveFilePaths(filePaths);
  const uploaded = [];
  const errors = [];
  const skipped = [];

  // Dedup: check existing attachments and skip files with the same name
  let existingNames = new Set();
  try {
    const existing = await listAttachments(postId, accessToken, supabaseUrl, supabaseKey);
    existingNames = new Set(existing.map((a) => a.file_name));
  } catch {
    // If listing fails, proceed without dedup (upload all)
  }

  for (const file of files) {
    if (existingNames.has(file.fileName)) {
      skipped.push({ fileName: file.fileName, reason: "already exists" });
      continue;
    }

    try {
      // 1. Upload to storage
      const { storagePath, publicUrl } = await uploadFile(
        file,
        postId,
        accessToken,
        supabaseUrl,
        supabaseKey,
      );

      // 2. Insert DB record
      const record = await createAttachmentRecord(
        file,
        storagePath,
        postId,
        accessToken,
        supabaseUrl,
        supabaseKey,
      );

      uploaded.push({
        fileName: file.fileName,
        storagePath,
        publicUrl,
        attachmentId: record.id,
      });
    } catch (err) {
      errors.push({ fileName: file.fileName, error: err.message });
      // Stop on first error to avoid partial uploads for related files
      break;
    }
  }

  return { uploaded, errors, skipped };
}

// ─── List existing attachments ───

/**
 * Query existing attachments for a post.
 * Useful for checking what's already uploaded before adding more.
 *
 * @param {string} postId — Post UUID
 * @param {string} accessToken — Admin access token
 * @param {string} supabaseUrl — Supabase project URL
 * @param {string} supabaseKey — Supabase publishable/anon key
 * @returns {Promise<Array<{ id: string, file_name: string, storage_path: string, file_size: number, mime_type: string }>>}
 */
export async function listAttachments(postId, accessToken, supabaseUrl, supabaseKey) {
  const url = `${supabaseUrl}/rest/v1/post_attachments?post_id=eq.${postId}&select=id,file_name,storage_path,file_size,mime_type,created_at&order=created_at.asc`;
  const headers = buildAttachmentHeaders(accessToken, supabaseKey);

  const resp = await fetch(url, { headers });
  const data = await resp.json();

  if (!resp.ok) {
    const msg = data?.message || `HTTP ${resp.status}`;
    throw new Error(`Query attachments failed: ${msg}`);
  }

  return data ?? [];
}

export { MAX_FILE_SIZE, STORAGE_BUCKET };
