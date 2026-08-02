import { normalizeColumns, totalSpectrogramColumns, type SpectrogramData } from "./spectrogram";
import type { SpectrogramWorkerRequest, SpectrogramWorkerResponse } from "../audio/spectrogram-worker";

/** Hard cap on total analyzed columns regardless of requested hop — protects very long files from
 * computing far more time resolution than any viewport could ever display (columns beyond a
 * viewport's pixel width are thrown away by `readVisibleSpectrogramColumns` anyway). */
const MAX_TOTAL_COLUMNS = 20000;

/** Below this many columns, splitting across workers costs more (spawn + postMessage overhead) than it saves. */
const MIN_COLUMNS_PER_CHUNK = 400;

const MAX_CHUNKS = 8;

/** Divides `total` columns into up to `count` contiguous, near-equal, non-empty ranges. */
export function chunkColumnBoundaries(total: number, count: number): Array<[number, number]> {
  if (total <= 0 || count <= 0) return [];
  const boundaries: Array<[number, number]> = [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  let start = 0;
  for (let i = 0; i < count; i++) {
    const size = base + (i < remainder ? 1 : 0);
    if (size <= 0) continue;
    boundaries.push([start, start + size]);
    start += size;
  }
  return boundaries;
}

function pickChunkCount(totalColumns: number): number {
  const maxByWork = Math.floor(totalColumns / MIN_COLUMNS_PER_CHUNK);
  if (maxByWork <= 1) return 1;
  const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  return Math.max(1, Math.min(MAX_CHUNKS, cores - 1 || cores, maxByWork));
}

/**
 * Caches a full-track spectrogram analysis (expensive: one FFT per hop across the whole
 * buffer) keyed on (samples reference, sampleRate, fftSize, hop, freqBins). The analysis is
 * split into several column ranges and computed across multiple Workers in parallel — each
 * worker only receives the (small, structured-clone-cheap) sample slice it actually needs, not
 * the full buffer — so switching into spectrogram view never blocks the main thread and scales
 * with available cores. `request()` returns `null` while a (re)compute for a new key is in
 * flight; `onReady` fires once it resolves so the caller can trigger a re-render.
 */
export class SpectrogramCache {
  private workers: Worker[] = [];
  private keySamples: Float32Array | null = null;
  private keySampleRate = NaN;
  private keyFftSize = NaN;
  private keyHop = NaN;
  private keyFreqBins = NaN;
  private data: SpectrogramData | null = null;

  request(
    samples: Float32Array,
    sampleRate: number,
    fftSize: number,
    hop: number,
    freqBins: number,
    onReady: () => void
  ): SpectrogramData | null {
    const sameKey =
      this.keySamples === samples &&
      this.keySampleRate === sampleRate &&
      this.keyFftSize === fftSize &&
      this.keyHop === hop &&
      this.keyFreqBins === freqBins;

    if (sameKey) return this.data;

    this.keySamples = samples;
    this.keySampleRate = sampleRate;
    this.keyFftSize = fftSize;
    this.keyHop = hop;
    this.keyFreqBins = freqBins;
    this.data = null;
    this.workers.forEach((w) => w.terminate());
    this.workers = [];

    // Very long files at a fine hop can produce far more time columns than any viewport will
    // ever display; cap it so a multi-hour recording doesn't analyze at absurd resolution.
    const effectiveHop = Math.max(hop, Math.ceil(samples.length / MAX_TOTAL_COLUMNS));
    const totalColumns = totalSpectrogramColumns(samples.length, fftSize, effectiveHop);
    if (totalColumns <= 0) {
      this.data = { columns: new Float32Array(0), numColumns: 0, freqBins, fftSize, hop: effectiveHop };
      return this.data;
    }

    const boundaries = chunkColumnBoundaries(totalColumns, pickChunkCount(totalColumns));
    const columns = new Float32Array(freqBins * totalColumns);
    let remaining = boundaries.length;

    for (const [colStart, colEnd] of boundaries) {
      const numColumns = colEnd - colStart;
      const sampleStart = colStart * effectiveHop;
      const sampleEnd = Math.min(samples.length, (colEnd - 1) * effectiveHop + fftSize);
      // A subarray view can't be transferred (it shares the original samples' buffer, which is
      // still needed for waveform rendering) — copy just the needed range into a fresh buffer so
      // it CAN be transferred, avoiding the double copy (serialize + deserialize) a structured
      // clone of an un-transferred TypedArray costs, which dominates on very long files.
      const slice = samples.slice(sampleStart, sampleEnd);

      const worker = new Worker(new URL("../audio/spectrogram-worker.ts", import.meta.url), {
        type: "module",
      });
      this.workers.push(worker);

      worker.onmessage = (event: MessageEvent<SpectrogramWorkerResponse>) => {
        if (!this.workers.includes(worker)) return; // superseded by a newer request
        columns.set(event.data.columns, colStart * freqBins);
        worker.terminate();
        remaining--;
        if (remaining === 0) {
          normalizeColumns(columns);
          this.data = { columns, numColumns: totalColumns, freqBins, fftSize, hop: effectiveHop };
          this.workers = [];
          onReady();
        }
      };

      const request: SpectrogramWorkerRequest = {
        samples: slice,
        sampleRate,
        fftSize,
        hop: effectiveHop,
        freqBins,
        numColumns,
      };
      worker.postMessage(request, [slice.buffer]);
    }

    return null;
  }

  dispose(): void {
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
  }
}

/**
 * Decimates a full-track spectrogram down to `outputWidthPx` columns for the visible sample
 * range, taking the max magnitude across skipped source columns per pixel (rather than an
 * average) so short transients stay visible when zoomed out — mirrors why `computePeaks` keeps
 * both min and max per bucket instead of averaging.
 */
export function readVisibleSpectrogramColumns(
  data: SpectrogramData,
  startSample: number,
  endSample: number,
  outputWidthPx: number
): Float32Array {
  const { columns, numColumns, freqBins, hop } = data;
  const result = new Float32Array(freqBins * Math.max(0, outputWidthPx));
  if (outputWidthPx <= 0 || numColumns === 0) return result;

  const startCol = Math.max(0, Math.min(numColumns - 1, Math.floor(startSample / hop)));
  const endCol = Math.max(startCol + 1, Math.min(numColumns, Math.ceil(endSample / hop)));
  const rangeCols = endCol - startCol;

  for (let px = 0; px < outputWidthPx; px++) {
    const colStart = startCol + Math.floor((px * rangeCols) / outputWidthPx);
    const colEnd = Math.min(endCol, Math.max(colStart + 1, startCol + Math.floor(((px + 1) * rangeCols) / outputWidthPx)));

    for (let r = 0; r < freqBins; r++) {
      let max = 0;
      for (let c = colStart; c < colEnd; c++) {
        const v = columns[c * freqBins + r];
        if (v > max) max = v;
      }
      result[px * freqBins + r] = max;
    }
  }

  return result;
}
