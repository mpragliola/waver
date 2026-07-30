import { describe, expect, it } from "vitest";
import {
  clampSample,
  hitTestSelection,
  normalizeSelection,
  resizeSelection,
  translateSelection,
} from "./selection";

describe("normalizeSelection", () => {
  it("leaves an already-ordered selection unchanged", () => {
    expect(normalizeSelection({ startSample: 10, endSample: 20 })).toEqual({ startSample: 10, endSample: 20 });
  });
  it("swaps start/end when reversed", () => {
    expect(normalizeSelection({ startSample: 20, endSample: 10 })).toEqual({ startSample: 10, endSample: 20 });
  });
});

describe("hitTestSelection", () => {
  const selection = { startSample: 100, endSample: 500 };
  const sampleToPixel = (s: number) => s / 10; // 10 samples/pixel -> start px=10, end px=50

  it("returns null when there is no selection", () => {
    expect(hitTestSelection(15, null, sampleToPixel)).toBeNull();
  });
  it("detects the start edge within tolerance", () => {
    expect(hitTestSelection(10, selection, sampleToPixel)).toBe("start");
  });
  it("detects the end edge within tolerance", () => {
    expect(hitTestSelection(50, selection, sampleToPixel)).toBe("end");
  });
  it("detects the body between edges", () => {
    expect(hitTestSelection(30, selection, sampleToPixel)).toBe("body");
  });
  it("returns null outside the selection", () => {
    expect(hitTestSelection(80, selection, sampleToPixel)).toBeNull();
  });
});

describe("resizeSelection", () => {
  it("moves the start edge and keeps end fixed", () => {
    const result = resizeSelection({ startSample: 100, endSample: 200 }, "start", 50, 1000);
    expect(result).toEqual({ startSample: 50, endSample: 200 });
  });
  it("normalizes when dragging start past end", () => {
    const result = resizeSelection({ startSample: 100, endSample: 200 }, "start", 250, 1000);
    expect(result).toEqual({ startSample: 200, endSample: 250 });
  });
  it("clamps to total sample bounds", () => {
    const result = resizeSelection({ startSample: 100, endSample: 200 }, "end", 5000, 1000);
    expect(result.endSample).toBe(1000);
  });
});

describe("translateSelection", () => {
  it("moves both edges by delta, preserving width", () => {
    const result = translateSelection({ startSample: 100, endSample: 200 }, 50, 1000);
    expect(result).toEqual({ startSample: 150, endSample: 250 });
  });
  it("clamps at the left bound without changing width", () => {
    const result = translateSelection({ startSample: 100, endSample: 200 }, -150, 1000);
    expect(result).toEqual({ startSample: 0, endSample: 100 });
  });
  it("clamps at the right bound without changing width", () => {
    const result = translateSelection({ startSample: 900, endSample: 950 }, 100, 1000);
    expect(result).toEqual({ startSample: 950, endSample: 1000 });
  });
});

describe("clampSample", () => {
  it("clamps below zero", () => {
    expect(clampSample(-10, 1000)).toBe(0);
  });
  it("clamps above total", () => {
    expect(clampSample(2000, 1000)).toBe(1000);
  });
  it("passes through in-range values", () => {
    expect(clampSample(500, 1000)).toBe(500);
  });
});
