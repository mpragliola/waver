import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpectrogramWorkerRequest, SpectrogramWorkerResponse } from "./spectrogram-worker";

describe("spectrogram-worker onmessage handler", () => {
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    postMessage = vi.fn();
    (self as unknown as { postMessage: typeof postMessage }).postMessage = postMessage;
    await import("./spectrogram-worker");
  });

  it("registers an onmessage handler on self", () => {
    expect(typeof self.onmessage).toBe("function");
  });

  it("computes columns for the request and posts back a response with matching shape", () => {
    const freqBins = 4;
    const numColumns = 2;
    const request: SpectrogramWorkerRequest = {
      samples: new Float32Array(2048).fill(0.1),
      sampleRate: 44100,
      fftSize: 512,
      hop: 256,
      freqBins,
      numColumns,
    };

    self.onmessage?.({ data: request } as MessageEvent<SpectrogramWorkerRequest>);

    expect(postMessage).toHaveBeenCalledTimes(1);
    const [response, transferList] = postMessage.mock.calls[0] as [SpectrogramWorkerResponse, ArrayBuffer[]];
    expect(response.numColumns).toBe(numColumns);
    expect(response.freqBins).toBe(freqBins);
    expect(response.columns).toBeInstanceOf(Float32Array);
    expect(response.columns.length).toBe(freqBins * numColumns);
    expect(transferList).toEqual([response.columns.buffer]);
  });

  it("returns raw (non-normalized) values, not clamped to [0, 1]", () => {
    const request: SpectrogramWorkerRequest = {
      samples: new Float32Array(1024).fill(1),
      sampleRate: 44100,
      fftSize: 256,
      hop: 128,
      freqBins: 2,
      numColumns: 1,
    };

    self.onmessage?.({ data: request } as MessageEvent<SpectrogramWorkerRequest>);

    const [response] = postMessage.mock.calls[0] as [SpectrogramWorkerResponse];
    // Raw dB values from computeColumnRange are not bounded to [0,1] (that's normalizeColumns' job,
    // which runs later in SpectrogramCache after merging chunks) — at least one value should differ
    // from a normalized-looking output.
    expect(Array.from(response.columns).some((v) => v < 0 || v > 1)).toBe(true);
  });

  it("produces an empty columns array for a zero-column request", () => {
    const request: SpectrogramWorkerRequest = {
      samples: new Float32Array(0),
      sampleRate: 44100,
      fftSize: 256,
      hop: 128,
      freqBins: 4,
      numColumns: 0,
    };

    self.onmessage?.({ data: request } as MessageEvent<SpectrogramWorkerRequest>);

    const [response] = postMessage.mock.calls[0] as [SpectrogramWorkerResponse];
    expect(response.columns.length).toBe(0);
  });
});
