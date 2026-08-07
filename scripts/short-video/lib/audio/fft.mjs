/**
 * Radix-2 FFT and cross-correlation for locating a known audio segment inside
 * a longer recording (`findOnset`).
 *
 * Used by the end-to-end audio sync check: each scene's voiceover audio is
 * cross-correlated against the final video's audio track to measure where the
 * scene actually starts, catching any container/transcode-time shrink of the
 * inter-scene gaps before a video ships.
 */

/**
 * In-place iterative radix-2 FFT. Forward transform: X[k] = Σ x[n] e^{-2πi nk / N}.
 * Calling it a second time yields the unscaled inverse.
 *
 * @param {Float64Array} re
 * @param {Float64Array} im
 */
export function fft(re, im) {
  const n = re.length;
  if (n === 0 || (n & (n - 1)) !== 0) {
    throw new Error(`FFT length must be a power of two, got ${n}`);
  }

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = re[i];
      re[i] = re[j];
      re[j] = tmp;
      tmp = im[i];
      im[i] = im[j];
      im[j] = tmp;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + half];
        const bIm = im[i + k + half];
        const tRe = bRe * curRe - bIm * curIm;
        const tIm = bRe * curIm + bIm * curRe;
        re[i + k] = aRe + tRe;
        im[i + k] = aIm + tIm;
        re[i + k + half] = aRe - tRe;
        im[i + k + half] = aIm - tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Find the offset at which `needle` starts inside `haystack`, by peak of the
 * cross-correlation. Both signals are normalised (DC removed) first.
 *
 * The correlation theorem gives c(τ) = Σ_t h(t) n(t-τ) = ifft(H · conj(N)),
 * whose peak sits at the needle's start position in the haystack.
 *
 * @param {Float32Array|Array<number>} haystack
 * @param {Float32Array|Array<number>} needle
 * @param {number} sampleRate
 * @returns {{sample: number, seconds: number}}
 */
export function findOnset(haystack, needle, sampleRate) {
  if (needle.length > haystack.length) {
    throw new Error("needle is longer than haystack — cannot locate its onset");
  }

  const fftLen = 1 << Math.ceil(Math.log2(haystack.length + needle.length - 1));

  const hRe = new Float64Array(fftLen);
  const hIm = new Float64Array(fftLen);
  const nRe = new Float64Array(fftLen);
  const nIm = new Float64Array(fftLen);

  let hMean = 0;
  for (let i = 0; i < haystack.length; i++) hMean += haystack[i];
  hMean /= haystack.length;
  let nMean = 0;
  for (let i = 0; i < needle.length; i++) nMean += needle[i];
  nMean /= needle.length;

  for (let i = 0; i < haystack.length; i++) hRe[i] = haystack[i] - hMean;
  for (let i = 0; i < needle.length; i++) nRe[i] = needle[i] - nMean;

  fft(hRe, hIm);
  fft(nRe, nIm);

  // H · conj(N)
  for (let i = 0; i < fftLen; i++) {
    const r = hRe[i] * nRe[i] + hIm[i] * nIm[i];
    const im = hIm[i] * nRe[i] - hRe[i] * nIm[i];
    hRe[i] = r;
    hIm[i] = im;
  }

  // Inverse via the forward transform: conj(fft(conj(X))) = N·x exactly —
  // a second plain forward FFT would yield N·x(−k), i.e. a time-reversed
  // result whose peak lands at N−onset, outside the scanned lag range.
  for (let i = 0; i < fftLen; i++) hIm[i] = -hIm[i];
  fft(hRe, hIm);
  for (let i = 0; i < fftLen; i++) hIm[i] = -hIm[i];
  // Result is N× the correlation; the scale is irrelevant for argmax.

  let best = 0;
  let bestValue = -Infinity;
  for (let lag = 0; lag < haystack.length; lag++) {
    if (hRe[lag] > bestValue) {
      bestValue = hRe[lag];
      best = lag;
    }
  }

  return { sample: best, seconds: best / sampleRate };
}
