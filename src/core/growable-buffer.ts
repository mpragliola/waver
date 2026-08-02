/**
 * Append-only Float32 buffer with amortized O(1) push (capacity doubling), used to accumulate
 * live microphone chunks without the O(n^2) cost of re-concatenating on every chunk.
 */
export class GrowableFloat32Buffer {
  private data: Float32Array;
  private len = 0;

  constructor(initialCapacity = 44100 * 5) {
    this.data = new Float32Array(Math.max(1, initialCapacity));
  }

  push(chunk: Float32Array): void {
    if (this.len + chunk.length > this.data.length) {
      const next = new Float32Array(Math.max(this.data.length * 2, this.len + chunk.length));
      next.set(this.data.subarray(0, this.len));
      this.data = next;
    }
    this.data.set(chunk, this.len);
    this.len += chunk.length;
  }

  /** Zero-copy view of the data written so far. */
  view(): Float32Array {
    return this.data.subarray(0, this.len);
  }

  reset(): void {
    this.len = 0;
  }
}
