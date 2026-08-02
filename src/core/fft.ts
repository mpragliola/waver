export interface TwiddleTables {
  cos: Float32Array;
  sin: Float32Array;
}

/**
 * Precomputes the n/2 twiddle factors (cos/sin of -2*pi*k/n) an n-point FFT needs. Every smaller
 * butterfly stage's twiddle is a stride-sampled subset of this same table (twiddle(len, k) ===
 * twiddle(n, k * n/len)), so one table serves every stage — and, more importantly, every column
 * of an STFT run, since `fft()` is called thousands of times per analysis with the same size.
 * `Math.cos`/`Math.sin` are relatively expensive; computing them once per size instead of once
 * per butterfly (previously ~N/2*log2(N) trig calls *per FFT call*) is the dominant spectrogram
 * compute-time win.
 */
export function createTwiddleTables(n: number): TwiddleTables {
  const half = n >> 1;
  const cos = new Float32Array(Math.max(1, half));
  const sin = new Float32Array(Math.max(1, half));
  for (let k = 0; k < half; k++) {
    const angle = (-2 * Math.PI * k) / n;
    cos[k] = Math.cos(angle);
    sin[k] = Math.sin(angle);
  }
  return { cos, sin };
}

/**
 * In-place iterative radix-2 Cooley-Tukey FFT. `real`/`imag` length must be a power of two and
 * must match the size `twiddles` was built for (see `createTwiddleTables`). Operates directly on
 * the passed arrays (bit-reversal permutation + butterfly stages).
 */
export function fft(real: Float32Array, imag: Float32Array, twiddles: TwiddleTables): void {
  const n = real.length;
  if (n !== imag.length) throw new Error("fft: real and imag must have equal length");
  if (n === 0) return;
  if ((n & (n - 1)) !== 0) throw new Error("fft: length must be a power of two");

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;
      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
  }

  const { cos, sin } = twiddles;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const stride = n / len;
    for (let start = 0; start < n; start += len) {
      for (let k = 0; k < half; k++) {
        const twIdx = k * stride;
        const wr = cos[twIdx];
        const wi = sin[twIdx];
        const evenIdx = start + k;
        const oddIdx = start + k + half;
        const or_ = real[oddIdx] * wr - imag[oddIdx] * wi;
        const oi = real[oddIdx] * wi + imag[oddIdx] * wr;
        real[oddIdx] = real[evenIdx] - or_;
        imag[oddIdx] = imag[evenIdx] - oi;
        real[evenIdx] += or_;
        imag[evenIdx] += oi;
      }
    }
  }
}

/** Returns a Hann window of the given size (periodic form, suitable for STFT overlap-add). */
export function hannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  if (size <= 1) {
    window.fill(1);
    return window;
  }
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
}

/** Smallest power of two >= n. */
export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
