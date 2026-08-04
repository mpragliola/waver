/** Configuration for rendering multi-channel waveforms with stacked lanes. */
export interface StereoRenderConfig {
  /** Total height available for the entire waveform view (including minimap). */
  totalHeight: number;
  /** Number of channels to render (e.g., 2 for stereo, 6 for 5.1). */
  numChannels: number;
  /** Vertical gap between each lane, in pixels. */
  gapBetweenLanes: number;
  /** Ratio of total height reserved for minimap (e.g., 0.2 = 20%). */
  minimapHeightRatio: number;
}

/** Result of computing how much vertical space each lane and the minimap get. */
export interface StereoLaneHeights {
  /** Height available for the main waveform lanes (excluding minimap). */
  waveformHeight: number;
  /** Height of the minimap strip at the bottom. */
  minimapHeight: number;
  /** Height of each individual lane (same for all lanes, in stacked mode). */
  laneHeights: number[];
}

/**
 * Compute the vertical space allocation for a multi-channel waveform display.
 * Divides the waveform area equally among all channels, accounting for gaps
 * and minimap space.
 */
export function computeStereoLaneHeights(config: StereoRenderConfig): StereoLaneHeights {
  const minimapHeight = Math.floor(config.totalHeight * config.minimapHeightRatio);
  const waveformHeight = config.totalHeight - minimapHeight;

  // Total vertical space consumed by gaps between lanes
  const totalGapHeight = Math.max(0, (config.numChannels - 1) * config.gapBetweenLanes);
  const availableForLanes = Math.max(1, waveformHeight - totalGapHeight);
  const laneHeight = availableForLanes / config.numChannels;

  const laneHeights = Array(config.numChannels).fill(laneHeight);

  return {
    waveformHeight,
    minimapHeight,
    laneHeights,
  };
}

/**
 * Compute the top Y coordinate for a given lane in the waveform area.
 * Accounts for gaps between lanes.
 */
export function computeLaneYOffset(
  laneIndex: number,
  laneHeight: number,
  gapBetweenLanes: number
): number {
  return laneIndex * (laneHeight + gapBetweenLanes);
}
