import { describe, expect, it } from "vitest";
import { buildColormapLUT } from "./colormap";

describe("buildColormapLUT", () => {
  it("returns a 256-entry RGBA table", () => {
    const lut = buildColormapLUT(["#000000", "#ffffff"]);
    expect(lut).toHaveLength(256 * 4);
  });

  it("starts at the first stop and ends at the last stop", () => {
    const lut = buildColormapLUT(["#000000", "#ff8000"]);
    expect([lut[0], lut[1], lut[2], lut[3]]).toEqual([0, 0, 0, 255]);
    const lastOffset = 255 * 4;
    expect([lut[lastOffset], lut[lastOffset + 1], lut[lastOffset + 2], lut[lastOffset + 3]]).toEqual([255, 128, 0, 255]);
  });

  it("interpolates through a middle stop", () => {
    const lut = buildColormapLUT(["#000000", "#ffffff", "#000000"]);
    const midOffset = 128 * 4;
    expect(lut[midOffset]).toBeGreaterThan(200);
  });

  it("falls back to black/white for fewer than two stops", () => {
    const lut = buildColormapLUT(["#123456"]);
    expect([lut[0], lut[1], lut[2], lut[3]]).toEqual([0, 0, 0, 255]);
    const lastOffset = 255 * 4;
    expect([lut[lastOffset], lut[lastOffset + 1], lut[lastOffset + 2]]).toEqual([255, 255, 255]);
  });

  it("falls back to opaque black for an unparseable stop", () => {
    const lut = buildColormapLUT(["not-a-color", "#ffffff"]);
    expect([lut[0], lut[1], lut[2], lut[3]]).toEqual([0, 0, 0, 255]);
  });
});
