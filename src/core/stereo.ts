/** Get the number of channels in an AudioBuffer. */
export function getChannelCount(buffer: AudioBuffer): number {
  return buffer.numberOfChannels;
}

/** Extract a specific channel's data, or fall back to channel 0 if out of range. */
export function extractChannelData(buffer: AudioBuffer, channelIndex: number): Float32Array {
  const clampedIndex = Math.min(Math.max(channelIndex, 0), buffer.numberOfChannels - 1);
  return buffer.getChannelData(clampedIndex);
}

/** Mix all channels to mono by averaging them. Returns a new Float32Array. */
export function mixChannelsToMono(buffer: AudioBuffer): Float32Array {
  const numChannels = buffer.numberOfChannels;

  if (numChannels === 1) {
    // Mono: return a copy of the single channel
    return new Float32Array(buffer.getChannelData(0));
  }

  const result = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    let sum = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      sum += buffer.getChannelData(ch)[i];
    }
    result[i] = sum / numChannels;
  }
  return result;
}
