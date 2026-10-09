/**
 * Shared WAV fixtures for the TTS/Kaggle artifact tests (#420).
 *
 * The Kaggle adapter's completeness gate walks RIFF chunks, so tests need
 * structurally valid wav bytes — not just the "RIFF" magic. One builder keeps
 * the two Kaggle test files from growing divergent private copies.
 */

/**
 * Build a structurally complete mono 16-bit PCM WAV whose data chunk carries
 * `marker` (used to fingerprint which run's bytes were promoted).
 *
 * @param {string} marker
 * @returns {Buffer}
 */
export function wavBytes(marker) {
  const data = Buffer.from(marker, "utf8");
  const buf = Buffer.alloc(44 + data.length);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + data.length, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(24000, 24);
  buf.writeUInt32LE(24000 * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(data.length, 40);
  data.copy(buf, 44);
  return buf;
}

/**
 * Build a truncated wav: the header still declares `declaredBytes` of audio
 * while only `keptBytes` actually arrived — the partial-download shape (#394
 * class) the adapter's completeness gate must reject.
 *
 * @param {number} declaredBytes
 * @param {number} keptBytes
 * @returns {Buffer}
 */
export function truncatedWavBytes(declaredBytes, keptBytes) {
  const buf = Buffer.alloc(44 + keptBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + declaredBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(24000, 24);
  buf.writeUInt32LE(24000 * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(declaredBytes, 40);
  return buf;
}
