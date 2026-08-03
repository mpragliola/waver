import { describe, expect, it } from "vitest";
import { GrowableFloat32Buffer } from "./growable-buffer";

describe("GrowableFloat32Buffer", () => {
  it("starts empty", () => {
    const buf = new GrowableFloat32Buffer(8);
    expect(buf.view()).toEqual(new Float32Array(0));
  });

  it("accumulates pushed chunks in order", () => {
    const buf = new GrowableFloat32Buffer(8);
    buf.push(new Float32Array([1, 2]));
    buf.push(new Float32Array([3, 4, 5]));
    expect(buf.view()).toEqual(new Float32Array([1, 2, 3, 4, 5]));
  });

  it("grows capacity beyond the initial size without losing data", () => {
    const buf = new GrowableFloat32Buffer(4);
    for (let i = 0; i < 10; i++) buf.push(new Float32Array([i]));
    expect(buf.view()).toEqual(Float32Array.from({ length: 10 }, (_, i) => i));
  });

  it("grows to fit a single chunk larger than double the current capacity", () => {
    const buf = new GrowableFloat32Buffer(2);
    const big = new Float32Array(100).fill(7);
    buf.push(big);
    expect(buf.view()).toEqual(big);
  });

  it("view() reflects only the written length, not the full backing capacity", () => {
    const buf = new GrowableFloat32Buffer(100);
    buf.push(new Float32Array([9, 9]));
    expect(buf.view().length).toBe(2);
  });

  it("reset() clears the logical length so subsequent pushes start fresh", () => {
    const buf = new GrowableFloat32Buffer(8);
    buf.push(new Float32Array([1, 2, 3]));
    buf.reset();
    expect(buf.view()).toEqual(new Float32Array(0));
    buf.push(new Float32Array([4, 5]));
    expect(buf.view()).toEqual(new Float32Array([4, 5]));
  });

  it("clamps a zero or negative initial capacity to at least 1", () => {
    expect(() => new GrowableFloat32Buffer(0)).not.toThrow();
    const buf = new GrowableFloat32Buffer(0);
    buf.push(new Float32Array([1]));
    expect(buf.view()).toEqual(new Float32Array([1]));
  });
});
