import { describe, expect, it } from "vitest";
import { chunkColumnBoundaries, readVisibleSpectrogramColumns } from "./spectrogram-cache";
import type { SpectrogramData } from "./spectrogram";

function makeData(freqBins: number, numColumns: number, hop: number, fill: (col: number, row: number) => number): SpectrogramData {
  const columns = new Float32Array(freqBins * numColumns);
  for (let c = 0; c < numColumns; c++) {
    for (let r = 0; r < freqBins; r++) columns[c * freqBins + r] = fill(c, r);
  }
  return { columns, numColumns, freqBins, fftSize: freqBins * 2, hop };
}

describe("readVisibleSpectrogramColumns", () => {
  it("returns an empty array for zero output width", () => {
    const data = makeData(4, 4, 8, () => 1);
    expect(readVisibleSpectrogramColumns(data, 0, 32, 0)).toHaveLength(0);
  });

  it("returns an empty array when there are no analyzed columns", () => {
    const data = makeData(4, 0, 8, () => 1);
    expect(readVisibleSpectrogramColumns(data, 0, 32, 4)).toHaveLength(4 * 4);
    expect(Array.from(readVisibleSpectrogramColumns(data, 0, 32, 4))).toEqual(new Array(16).fill(0));
  });

  it("shapes output as freqBins * outputWidthPx", () => {
    const data = makeData(3, 10, 4, (c, r) => c + r);
    const result = readVisibleSpectrogramColumns(data, 0, 40, 5);
    expect(result).toHaveLength(3 * 5);
  });

  it("takes the max across skipped source columns per output pixel", () => {
    // 4 source columns, decimated to 1 output pixel -> max across all 4 per row
    const data = makeData(2, 4, 1, (c, r) => (r === 0 ? c : 0));
    const result = readVisibleSpectrogramColumns(data, 0, 4, 1);
    expect(result[0]).toBe(3); // row 0: max(0,1,2,3)
    expect(result[1]).toBe(0); // row 1: all zero
  });

  it("clamps the visible range to the available columns", () => {
    const data = makeData(1, 4, 1, (c) => c);
    const result = readVisibleSpectrogramColumns(data, -100, 1000, 1);
    expect(result[0]).toBe(3); // max across all 4 columns despite out-of-range start/end
  });
});

describe("chunkColumnBoundaries", () => {
  it("returns nothing for zero total or count", () => {
    expect(chunkColumnBoundaries(0, 4)).toEqual([]);
    expect(chunkColumnBoundaries(10, 0)).toEqual([]);
  });

  it("splits evenly when total divides count", () => {
    expect(chunkColumnBoundaries(10, 5)).toEqual([
      [0, 2],
      [2, 4],
      [4, 6],
      [6, 8],
      [8, 10],
    ]);
  });

  it("distributes the remainder across the first chunks, one extra each", () => {
    const boundaries = chunkColumnBoundaries(10, 3);
    expect(boundaries).toEqual([
      [0, 4],
      [4, 7],
      [7, 10],
    ]);
  });

  it("covers every column exactly once with no gaps or overlaps", () => {
    const boundaries = chunkColumnBoundaries(37, 6);
    let expectedStart = 0;
    for (const [start, end] of boundaries) {
      expect(start).toBe(expectedStart);
      expect(end).toBeGreaterThan(start);
      expectedStart = end;
    }
    expect(expectedStart).toBe(37);
  });

  it("never produces an empty range, even when count exceeds total", () => {
    const boundaries = chunkColumnBoundaries(2, 8);
    expect(boundaries).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });
});
