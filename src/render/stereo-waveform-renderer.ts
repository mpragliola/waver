import type { PeakPair, WaverTheme } from "../core/types";

/**
 * Compute peaks for each channel independently.
 * Returns an array of peak arrays (one per channel), where each peak array represents
 * the min/max for each pixel in that channel's lane.
 */
export function getStereoLanePeaks(
  channels: Float32Array[],
  length: number,
  samplesPerPixel: number
): PeakPair[][] {
  const peaksByChannel: PeakPair[][] = [];

  for (const channel of channels) {
    const peaks: PeakPair[] = [];
    for (let pixelIndex = 0; pixelIndex < length; pixelIndex++) {
      const startSample = pixelIndex * samplesPerPixel;
      const endSample = Math.min(startSample + samplesPerPixel, channel.length);

      let min = 0;
      let max = 0;
      for (let i = startSample; i < endSample; i++) {
        const sample = channel[i];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      peaks.push({ min, max });
    }
    peaksByChannel.push(peaks);
  }

  return peaksByChannel;
}

/**
 * Render a stereo waveform with stacked lanes.
 * Each channel is drawn in its own horizontal lane.
 */
export function renderStereoWaveform(
  ctx: CanvasRenderingContext2D,
  peaksByChannel: PeakPair[][],
  canvasWidth: number,
  laneHeights: number[],
  _offsetSample: number,
  _samplesPerPixel: number,
  theme: WaverTheme
): void {
  ctx.fillStyle = theme.backgroundColor;
  ctx.fillRect(0, 0, canvasWidth, laneHeights.reduce((a, b) => a + b, 0));

  ctx.strokeStyle = theme.waveformColor;
  ctx.lineWidth = 1;

  let laneYOffset = 0;
  for (let laneIndex = 0; laneIndex < peaksByChannel.length; laneIndex++) {
    const peaks = peaksByChannel[laneIndex];
    const laneHeight = laneHeights[laneIndex];
    const centerY = laneYOffset + laneHeight / 2;

    ctx.beginPath();
    for (let pixelIndex = 0; pixelIndex < peaks.length; pixelIndex++) {
      const { max } = peaks[pixelIndex];
      const x = pixelIndex;

      // Map waveform amplitude to canvas height (center at midpoint)
      const maxPixels = laneHeight / 2;
      const topY = centerY - max * maxPixels;

      if (pixelIndex === 0) {
        ctx.moveTo(x, topY);
      } else {
        ctx.lineTo(x, topY);
      }
    }
    ctx.stroke();

    // Draw the bottom half (mirror)
    ctx.beginPath();
    for (let pixelIndex = 0; pixelIndex < peaks.length; pixelIndex++) {
      const { min } = peaks[pixelIndex];
      const x = pixelIndex;
      const maxPixels = laneHeight / 2;
      const bottomY = centerY - min * maxPixels;

      if (pixelIndex === 0) {
        ctx.moveTo(x, bottomY);
      } else {
        ctx.lineTo(x, bottomY);
      }
    }
    ctx.stroke();

    laneYOffset += laneHeight;
  }
}
