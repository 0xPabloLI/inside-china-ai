/**
 * Media file integrity and provenance validation (#759).
 *
 * `existsSync` answers "is something at this path", not "did a usable asset
 * land there". A zero-byte download, a truncated render, a placeholder and a
 * video bound as `type:"image"` all satisfy existence and then fail — or, worse,
 * render — downstream. This module opens the file and judges its bytes.
 *
 * Format is decided by **magic bytes, never by extension**: the real corpus
 * contains a WebP named `.jpg`
 * (`content/deepseek-embodied-ai/assets/baidu_search-宇树-01.jpg`).
 *
 * `media.provenance` is the geometry a capture claims to have produced. It is
 * validated whenever it is declared, and demanded whenever the scene marks
 * itself evidence (`media.evidence: true`, or an object `assetNeed` with
 * `kind: "evidence-shot"`). Non-marked media keeps today's behaviour — #758 is
 * the producer that will start emitting provenance; this module is the gate
 * that refuses to let a violating declaration through.
 *
 * Deliberately NOT checked: per-pixel content (the matte band, ink at the
 * edges). The ticket records a 4-edge ink heuristic as tested-and-rejected (a
 * card's own white background reads as ink), and a composed banner carries no
 * matte/element separation to verify against.
 */
import { readFileSync, statSync } from "fs";
import { probeMedia } from "./media-probe.mjs";

/** Smallest accepted edge, in pixels. Guards against placeholders. */
export const MIN_MEDIA_SIDE = 64;

/** Float slack for the clip ⊇ rect comparison, in page CSS px. */
const PROVENANCE_TOLERANCE_PX = 0.01;

const fail = (reason, detail) => ({ ok: false, reason, detail });

// ─── Image headers ───

/**
 * PNG: signature, IHDR (length 13), then every chunk walked with bounds checks
 * until IEND. A file that ends mid-IDAT has a valid IHDR and is still broken.
 */
function readPng(buf) {
  if (
    buf.length < 8 ||
    buf[0] !== 0x89 ||
    buf.toString("latin1", 1, 4) !== "PNG" ||
    buf[5] !== 0x0a ||
    buf[6] !== 0x1a ||
    buf[7] !== 0x0a
  ) {
    return null;
  }
  if (buf.length < 33 || buf.readUInt32BE(8) !== 13 || buf.toString("latin1", 12, 16) !== "IHDR") {
    return { ok: false, why: "PNG has no valid IHDR chunk" };
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return { ok: false, why: "PNG IHDR reports zero size" };

  let i = 8;
  let sawIend = false;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    const end = i + 12 + len;
    if (!/^[\x20-\x7e]{4}$/.test(type) || end > buf.length) {
      return { ok: false, why: "PNG chunks are malformed before end of file" };
    }
    if (type === "IEND") {
      sawIend = true;
      break;
    }
    i = end;
  }
  if (!sawIend) return { ok: false, why: "PNG is truncated: no IEND chunk" };
  return { ok: true, kind: "png", width, height };
}

/** JPEG: SOI, a start-of-frame marker for dimensions, and the EOI marker. */
function readJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const isSof = (m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
  const isStandalone = (m) => m === 0x01 || m === 0xd8 || (m >= 0xd0 && m <= 0xd7);

  let dims = null;
  let inScan = false;
  let i = 2;
  while (i + 2 <= buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0x00) {
      i += 2; // stuffed byte inside entropy-coded data
      continue;
    }
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker === 0xd9) {
      return dims
        ? { ok: true, kind: "jpeg", width: dims[0], height: dims[1] }
        : { ok: false, why: "JPEG ends before any start-of-frame marker" };
    }
    if (isStandalone(marker)) {
      i += 2;
      continue;
    }
    if (i + 4 > buf.length) break;
    const segmentLength = buf.readUInt16BE(i + 2);
    if (segmentLength < 2) return { ok: false, why: "JPEG segment length is invalid" };
    if (isSof(marker) && !dims) {
      if (i + 9 > buf.length) return { ok: false, why: "JPEG start-of-frame marker is truncated" };
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      if (width && height) dims = [width, height];
    }
    if (marker === 0xda) inScan = true;
    if (inScan) {
      // Past start-of-scan only marker bytes are meaningful; skip the payload.
      i += 2;
      continue;
    }
    i += 2 + segmentLength;
  }
  return dims
    ? { ok: false, why: "JPEG is truncated: no end-of-image marker" }
    : { ok: false, why: "JPEG has no start-of-frame marker" };
}

/** WebP: RIFF/WEBP plus VP8 (lossy), VP8L (lossless) or VP8X (extended). */
function readWebp(buf) {
  if (buf.length < 30 || buf.toString("latin1", 0, 4) !== "RIFF") return null;
  if (buf.toString("latin1", 8, 12) !== "WEBP") return null;
  // RIFF declares its own payload length, so a cut file is decidable from the
  // header alone (chunks are padded to an even byte count).
  const declared = buf.readUInt32LE(4) + 8;
  if (buf.length < declared && buf.length + 1 !== declared) {
    return {
      ok: false,
      why: `WebP is truncated: RIFF declares ${declared} B, the file holds ${buf.length} B`,
    };
  }
  const fourcc = buf.toString("latin1", 12, 16);
  if (fourcc === "VP8X") {
    const width = 1 + buf.readUIntLE(24, 3);
    const height = 1 + buf.readUIntLE(27, 3);
    return { ok: true, kind: "webp", width, height };
  }
  if (fourcc === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return {
      ok: true,
      kind: "webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (fourcc === "VP8 ") {
    for (let i = 23; i + 10 < buf.length; i++) {
      if (buf[i] === 0x9d && buf[i + 1] === 0x01 && buf[i + 2] === 0x2a) {
        return {
          ok: true,
          kind: "webp",
          width: buf.readUInt16LE(i + 6) & 0x3fff,
          height: buf.readUInt16LE(i + 8) & 0x3fff,
        };
      }
    }
    return { ok: false, why: "WebP lossy frame header is missing" };
  }
  return { ok: false, why: `WebP chunk "${fourcc}" is not a known image format` };
}

/** GIF: header, logical screen descriptor, trailer. */
function readGif(buf) {
  const header = buf.subarray(0, 6).toString("latin1");
  if (!/^GIF8[79]a$/.test(header)) return null;
  if (buf.length < 13) return { ok: false, why: "GIF header is truncated" };
  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);
  if (!width || !height) return { ok: false, why: "GIF logical screen reports zero size" };
  // Trailer, ignoring the NUL/newline padding some encoders append — searching
  // the tail for 0x3B would match a literal byte inside LZW data instead.
  let end = buf.length - 1;
  while (end > 0 && (buf[end] === 0x00 || buf[end] === 0x0a || buf[end] === 0x0d)) end--;
  if (buf[end] !== 0x3b) return { ok: false, why: "GIF is truncated: no trailer" };
  return { ok: true, kind: "gif", width, height };
}

function readImage(buf) {
  for (const read of [readPng, readJpeg, readWebp, readGif]) {
    const verdict = read(buf);
    if (verdict) return verdict;
  }
  return null;
}

// ─── Video detection ───

function videoContainer(buf) {
  const fourcc = buf.toString("latin1", 4, 8);
  if (fourcc === "ftyp") return "mp4";
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 11) === "AVI")
    return "avi";
  return null;
}

// ─── Public: file integrity ───

/**
 * Open one media file and decide whether a usable asset landed there.
 *
 * @param {string} absPath - absolute path to the media file
 * @param {{declaredType?: string, probeVideo?: (p: string) => {width: number, height: number}|null}} [options]
 *        `probeVideo` is injectable so unit tests do not need ffprobe; the
 *        default is the real ffprobe seam used across the pipeline.
 * @returns {{ok: true, kind: "image"|"video", format: string, width: number, height: number}
 *          | {ok: false, reason: string, detail: string}}
 */
export function inspectMediaFile(absPath, { declaredType, probeVideo = probeMedia } = {}) {
  let stat;
  try {
    stat = statSync(absPath);
  } catch {
    return fail("unreadable-media", "unreadable-media (the path cannot be opened)");
  }
  if (!stat.isFile()) {
    return fail("not-a-file", "not-a-file (the media path is a directory, not a file)");
  }
  if (stat.size === 0) {
    return fail("zero-byte", "zero-byte (0 B on disk — the download or composition never landed)");
  }

  let buf;
  try {
    buf = readFileSync(absPath);
  } catch {
    return fail("unreadable-media", "unreadable-media (the file could not be read)");
  }

  const image = readImage(buf);
  const container = videoContainer(buf);

  if (declaredType === "video") {
    if (image?.ok) {
      return fail(
        "media-type-mismatch",
        `media-type-mismatch (scene declares "video", the bytes are a ${image.kind.toUpperCase()} image)`,
      );
    }
    return probeVideoFile(absPath, container, probeVideo);
  }

  if (container) {
    if (declaredType === "image") {
      return fail(
        "media-type-mismatch",
        `media-type-mismatch (scene declares "image", the bytes are a ${container.toUpperCase()} video)`,
      );
    }
    return probeVideoFile(absPath, container, probeVideo);
  }

  if (!image) {
    return fail(
      "unreadable-media",
      "unreadable-media (no PNG/JPEG/WebP/GIF signature and no known video container)",
    );
  }
  if (!image.ok) {
    return fail("unreadable-media", `unreadable-media (${image.why})`);
  }
  return sized("image", image.kind, image.width, image.height);
}

function probeVideoFile(absPath, container, probeVideo) {
  const probe = probeVideo(absPath);
  if (!probe || !probe.width || !probe.height) {
    return fail(
      "unreadable-media",
      container
        ? `unreadable-media (ffprobe could not decode the ${container.toUpperCase()} stream)`
        : "unreadable-media (unrecognised bytes: no image signature and ffprobe found no video stream)",
    );
  }
  return sized("video", container ?? "video", probe.width, probe.height);
}

function sized(kind, format, width, height) {
  if (Math.min(width, height) < MIN_MEDIA_SIDE) {
    return fail(
      "too-small",
      `too-small (${width}×${height} — every media edge must be at least ${MIN_MEDIA_SIDE}px)`,
    );
  }
  return { ok: true, kind, format, width, height };
}

// ─── Public: provenance ───

const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

function boxErrors(box, name) {
  if (!box || typeof box !== "object" || Array.isArray(box)) {
    return [`provenance.${name} must be an object { x, y, w, h }`];
  }
  const errors = [];
  for (const key of ["x", "y", "w", "h"]) {
    if (!isFiniteNumber(box[key])) {
      errors.push(
        `provenance.${name}.${key} must be a finite number, got ${JSON.stringify(box[key])}`,
      );
    }
  }
  if (errors.length) return errors;
  if (box.x < 0) errors.push(`provenance.${name}.x must be >= 0, got ${box.x}`);
  if (box.y < 0) errors.push(`provenance.${name}.y must be >= 0, got ${box.y}`);
  if (box.w <= 0) errors.push(`provenance.${name}.w must be > 0, got ${box.w}`);
  if (box.h <= 0) errors.push(`provenance.${name}.h must be > 0, got ${box.h}`);
  return errors;
}

const edges = (box) => ({
  left: box.x,
  top: box.y,
  right: box.x + box.w,
  bottom: box.y + box.h,
});

/**
 * Validate a declared `media.provenance`.
 *
 * @param {unknown} provenance
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateProvenance(provenance) {
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    return { ok: false, errors: ["provenance must be an object"] };
  }
  const errors = [];
  const { sourceUrl, selector, rect, clip, scale } = provenance;

  if (typeof sourceUrl !== "string" || sourceUrl.trim() === "") {
    errors.push("provenance.sourceUrl must be a non-empty URL");
  } else {
    let url;
    try {
      url = new URL(sourceUrl);
    } catch {
      errors.push(`provenance.sourceUrl is not a valid URL: ${JSON.stringify(sourceUrl)}`);
    }
    if (url && url.protocol !== "http:" && url.protocol !== "https:") {
      errors.push(
        `provenance.sourceUrl must be http(s), got "${url.protocol}" (${JSON.stringify(sourceUrl)})`,
      );
    }
  }

  if (typeof selector !== "string" || selector.trim() === "") {
    errors.push("provenance.selector must be a non-empty element selector");
  }

  const rectErrors = boxErrors(rect, "rect");
  const clipErrors = boxErrors(clip, "clip");
  errors.push(...rectErrors, ...clipErrors);

  if (!isFiniteNumber(scale) || scale <= 0) {
    errors.push(`provenance.scale must be a finite number > 0, got ${JSON.stringify(scale)}`);
  }

  // Containment is only judgeable once both boxes are well-formed.
  if (rectErrors.length === 0 && clipErrors.length === 0) {
    const r = edges(rect);
    const c = edges(clip);
    const T = PROVENANCE_TOLERANCE_PX;
    if (c.left > r.left + T) {
      errors.push(
        `provenance.clip does not contain provenance.rect on the left edge: clip left ${c.left} > rect left ${r.left}`,
      );
    }
    if (c.top > r.top + T) {
      errors.push(
        `provenance.clip does not contain provenance.rect on the top edge: clip top ${c.top} > rect top ${r.top}`,
      );
    }
    if (c.right < r.right - T) {
      errors.push(
        `provenance.clip does not contain provenance.rect on the right edge: clip right ${c.right} < rect right ${r.right}`,
      );
    }
    if (c.bottom < r.bottom - T) {
      errors.push(
        `provenance.clip does not contain provenance.rect on the bottom edge: clip bottom ${c.bottom} < rect bottom ${r.bottom}`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

/** True when the scene declares the bound media to be an evidence capture. */
export function isEvidenceMedia(scene, media) {
  if (media?.evidence === true) return true;
  const need = scene?.assetNeed;
  return Boolean(need && typeof need === "object" && need.kind === "evidence-shot");
}

/** The marker that made this media evidence, for the failure detail. */
export function evidenceMarker(media, scene) {
  if (media?.evidence === true) return "media.evidence:true";
  if (scene?.assetNeed?.kind === "evidence-shot") return 'assetNeed.kind:"evidence-shot"';
  return null;
}
