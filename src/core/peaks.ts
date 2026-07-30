/**
 * Computes decimated min/max peak pairs for a visible sample range, one pair per output pixel.
 * Returns a Float32Array of length outputWidth * 2, interleaved as [min0, max0, min1, max1, ...].
 *
 * When the visible range has fewer samples than output pixels (deep zoom), each pixel maps to
 * at most one sample and min === max, so callers can render true per-sample resolution.
 */
export function computePeaks(
  samples: Float32Array,
  startSample: number,
  endSample: number,
  outputWidth: number
): Float32Array {
  const result = new Float32Array(Math.max(0, outputWidth) * 2);
  if (outputWidth <= 0 || samples.length === 0) return result;

  const clampedStart = Math.max(0, Math.floor(startSample));
  const clampedEnd = Math.min(samples.length, Math.ceil(endSample));
  if (clampedEnd <= clampedStart) return result;

  const rangeLength = clampedEnd - clampedStart;
  const samplesPerPixel = rangeLength / outputWidth;

  for (let px = 0; px < outputWidth; px++) {
    const bucketStart = clampedStart + Math.floor(px * samplesPerPixel);
    const bucketEnd = Math.min(clampedEnd, clampedStart + Math.floor((px + 1) * samplesPerPixel));
    const from = bucketEnd > bucketStart ? bucketStart : Math.min(bucketStart, samples.length - 1);
    const to = bucketEnd > bucketStart ? bucketEnd : from + 1;

    let min = Infinity;
    let max = -Infinity;
    for (let i = from; i < to && i < samples.length; i++) {
      const v = samples[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === Infinity) {
      min = 0;
      max = 0;
    }
    result[px * 2] = min;
    result[px * 2 + 1] = max;
  }

  return result;
}

/** Samples-per-pixel at 100% zoom (whole waveform fit to the given pixel width). */
export function fullZoomSamplesPerPixel(totalSamples: number, pixelWidth: number): number {
  if (pixelWidth <= 0) return totalSamples;
  return totalSamples / pixelWidth;
}

/** Minimum samplesPerPixel representing single-sample resolution (deepest zoom level). */
export const MIN_SAMPLES_PER_PIXEL = 1;
