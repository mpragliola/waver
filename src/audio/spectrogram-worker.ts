import { computeColumnRange } from "../core/spectrogram";

/** `samples` is a slice starting at local offset 0 for column 0 of this chunk (see `SpectrogramCache`). */
export interface SpectrogramWorkerRequest {
  samples: Float32Array;
  sampleRate: number;
  fftSize: number;
  hop: number;
  freqBins: number;
  numColumns: number;
}

/** Raw (un-normalized) dB columns for this chunk — the caller merges chunks and normalizes once. */
export interface SpectrogramWorkerResponse {
  columns: Float32Array;
  numColumns: number;
  freqBins: number;
}

self.onmessage = (event: MessageEvent<SpectrogramWorkerRequest>) => {
  const { samples, sampleRate, fftSize, hop, freqBins, numColumns } = event.data;
  const columns = computeColumnRange(samples, sampleRate, fftSize, hop, freqBins, numColumns);
  const response: SpectrogramWorkerResponse = { columns, numColumns, freqBins };
  (self as unknown as Worker).postMessage(response, [response.columns.buffer]);
};
