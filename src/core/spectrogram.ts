import { createTwiddleTables, fft, hannWindow } from "./fft";

export interface SpectrogramData {
  /** freqBins * numColumns, row-major by column: column c's bins are columns[c*freqBins .. c*freqBins+freqBins). Row 0 = lowest frequency. Values normalized to [0, 1]. */
  columns: Float32Array;
  numColumns: number;
  freqBins: number;
  fftSize: number;
  hop: number;
}

const EPSILON = 1e-20;

/** Number of STFT columns a buffer of `numSamples` produces at the given window/hop. */
export function totalSpectrogramColumns(numSamples: number, fftSize: number, hop: number): number {
  if (numSamples <= 0 || fftSize <= 0 || hop <= 0) return 0;
  return numSamples <= fftSize ? 1 : Math.floor((numSamples - fftSize) / hop) + 1;
}

/**
 * Runs a windowed STFT over `numColumns` columns starting at local sample offset 0 of
 * `samplesSlice` (column c reads `samplesSlice[c*hop .. c*hop+fftSize)`, zero-padded past the
 * slice's end), then log-scale buckets each FFT's power spectrum down to `freqBins` rows.
 * Returns **raw, un-normalized** dB values — callers computing multiple slices in parallel (see
 * `SpectrogramCache`) must call `normalizeColumns` once over the full merged result so contrast
 * stays consistent across chunk boundaries.
 */
export function computeColumnRange(
  samplesSlice: Float32Array,
  sampleRate: number,
  fftSize: number,
  hop: number,
  freqBins: number,
  numColumns: number
): Float32Array {
  const columns = new Float32Array(freqBins * Math.max(0, numColumns));
  if (numColumns <= 0 || fftSize <= 0 || freqBins <= 0) return columns;

  const window = hannWindow(fftSize);
  const half = fftSize / 2;
  const nyquist = sampleRate / 2;
  const freqMin = sampleRate / fftSize;
  const logMin = Math.log2(freqMin);
  const logMax = Math.log2(nyquist);

  const bucketStarts = new Int32Array(freqBins);
  const bucketEnds = new Int32Array(freqBins);
  for (let r = 0; r < freqBins; r++) {
    const f0 = 2 ** (logMin + (r / freqBins) * (logMax - logMin));
    const f1 = 2 ** (logMin + ((r + 1) / freqBins) * (logMax - logMin));
    const binStart = Math.max(1, Math.round((f0 * fftSize) / sampleRate));
    const binEnd = Math.min(half, Math.max(binStart + 1, Math.round((f1 * fftSize) / sampleRate)));
    bucketStarts[r] = binStart;
    bucketEnds[r] = binEnd;
  }

  const twiddles = createTwiddleTables(fftSize);
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  const power = new Float32Array(half + 1);
  const sliceLength = samplesSlice.length;

  for (let c = 0; c < numColumns; c++) {
    const start = c * hop;
    imag.fill(0);
    for (let i = 0; i < fftSize; i++) {
      const sampleIdx = start + i;
      real[i] = (sampleIdx < sliceLength ? samplesSlice[sampleIdx] : 0) * window[i];
    }

    fft(real, imag, twiddles);

    // Power (magnitude squared) avoids a sqrt per bin; dB works out the same via 10*log10(power)
    // instead of 20*log10(magnitude), and bucket-averaging power is the standard spectrogram approach.
    for (let b = 0; b <= half; b++) {
      power[b] = real[b] * real[b] + imag[b] * imag[b];
    }

    for (let r = 0; r < freqBins; r++) {
      let sum = 0;
      const bStart = bucketStarts[r];
      const bEnd = bucketEnds[r];
      for (let b = bStart; b < bEnd; b++) sum += power[b];
      const avgPower = sum / (bEnd - bStart);
      columns[c * freqBins + r] = 10 * Math.log10(avgPower + EPSILON);
    }
  }

  return columns;
}

/** Normalizes raw dB values in-place to [0, 1] across the whole array. */
export function normalizeColumns(columns: Float32Array): void {
  if (columns.length === 0) return;

  let globalMin = Infinity;
  let globalMax = -Infinity;
  for (let i = 0; i < columns.length; i++) {
    const v = columns[i];
    if (v < globalMin) globalMin = v;
    if (v > globalMax) globalMax = v;
  }

  const range = globalMax - globalMin || 1;
  for (let i = 0; i < columns.length; i++) {
    columns[i] = Math.min(1, Math.max(0, (columns[i] - globalMin) / range));
  }
}

/**
 * Single-shot (non-parallel) full-track spectrogram analysis. Runtime rendering goes through
 * `SpectrogramCache` (which splits this work across several workers instead) — this wrapper
 * exists for tests and any caller that just wants the whole thing computed synchronously.
 */
export function computeSpectrogramColumns(
  samples: Float32Array,
  sampleRate: number,
  fftSize: number,
  hop: number,
  freqBins: number
): SpectrogramData {
  const numColumns = totalSpectrogramColumns(samples.length, fftSize, hop);
  const columns = computeColumnRange(samples, sampleRate, fftSize, hop, freqBins, numColumns);
  normalizeColumns(columns);
  return { columns, numColumns, freqBins, fftSize, hop };
}
