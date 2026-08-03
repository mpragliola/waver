import { beforeEach, describe, expect, it } from "vitest";
import { TouchGestureController } from "./touch-gesture-controller";
import type { ZoomState } from "../core/types";

describe("TouchGestureController", () => {
  let zoom: ZoomState;
  let controller: TouchGestureController;
  const config = { totalSamples: 100000, pixelWidth: 1000 };

  beforeEach(() => {
    zoom = { samplesPerPixel: 10, offsetSample: 5000 }; // 1 px == 10 samples
    controller = new TouchGestureController({
      getZoom: () => zoom,
      getViewportConfig: () => config,
    });
  });

  it("returns null on touchmove when fewer than 2 touches are active", () => {
    controller.setActiveTouches([{ identifier: 0, pixel: 100 }]);
    expect(controller.handleTouchMove([{ identifier: 0, pixel: 110 }])).toBeNull();
  });

  it("pans when both touch points translate together by the same amount", () => {
    controller.setActiveTouches([
      { identifier: 0, pixel: 100 },
      { identifier: 1, pixel: 200 },
    ]);
    // Both fingers move left by 20px -> content should pan right (offset increases).
    const next = controller.handleTouchMove([
      { identifier: 0, pixel: 80 },
      { identifier: 1, pixel: 180 },
    ]);
    expect(next).not.toBeNull();
    expect(next!.samplesPerPixel).toBe(zoom.samplesPerPixel);
    expect(next!.offsetSample).toBeGreaterThan(zoom.offsetSample);
  });

  it("pans the other direction when both touch points move right", () => {
    controller.setActiveTouches([
      { identifier: 0, pixel: 100 },
      { identifier: 1, pixel: 200 },
    ]);
    const next = controller.handleTouchMove([
      { identifier: 0, pixel: 120 },
      { identifier: 1, pixel: 220 },
    ]);
    expect(next).not.toBeNull();
    expect(next!.samplesPerPixel).toBe(zoom.samplesPerPixel);
    expect(next!.offsetSample).toBeLessThan(zoom.offsetSample);
  });

  it("zooms in when the two touch points move apart (pinch out)", () => {
    controller.setActiveTouches([
      { identifier: 0, pixel: 140 },
      { identifier: 1, pixel: 160 },
    ]);
    const next = controller.handleTouchMove([
      { identifier: 0, pixel: 100 },
      { identifier: 1, pixel: 200 },
    ]);
    expect(next).not.toBeNull();
    expect(next!.samplesPerPixel).toBeLessThan(zoom.samplesPerPixel);
  });

  it("zooms out when the two touch points move together (pinch in)", () => {
    controller.setActiveTouches([
      { identifier: 0, pixel: 100 },
      { identifier: 1, pixel: 200 },
    ]);
    const next = controller.handleTouchMove([
      { identifier: 0, pixel: 140 },
      { identifier: 1, pixel: 160 },
    ]);
    expect(next).not.toBeNull();
    expect(next!.samplesPerPixel).toBeGreaterThan(zoom.samplesPerPixel);
  });

  it("keeps the sample under the pinch midpoint stationary while zooming", () => {
    controller.setActiveTouches([
      { identifier: 0, pixel: 140 },
      { identifier: 1, pixel: 160 },
    ]);
    // midpoint stays at 150 while fingers spread apart -> pivot sample should be stable.
    const pivotSampleBefore = zoom.offsetSample + 150 * zoom.samplesPerPixel;
    const next = controller.handleTouchMove([
      { identifier: 0, pixel: 100 },
      { identifier: 1, pixel: 200 },
    ]);
    expect(next).not.toBeNull();
    const pivotSampleAfter = next!.offsetSample + 150 * next!.samplesPerPixel;
    expect(pivotSampleAfter).toBeCloseTo(pivotSampleBefore, 5);
  });

  it("applies both pan and zoom together when the midpoint shifts while pinching", () => {
    controller.setActiveTouches([
      { identifier: 0, pixel: 100 },
      { identifier: 1, pixel: 200 },
    ]);
    // midpoint was 150, moves to 170 (pan), while distance grows 100 -> 140 (zoom in).
    const next = controller.handleTouchMove([
      { identifier: 0, pixel: 100 },
      { identifier: 1, pixel: 240 },
    ]);
    expect(next).not.toBeNull();
    expect(next!.samplesPerPixel).toBeLessThan(zoom.samplesPerPixel);
    expect(next!.offsetSample).not.toBe(zoom.offsetSample);
  });

  it("tracks incremental moves across multiple touchmove calls", () => {
    controller.setActiveTouches([
      { identifier: 0, pixel: 100 },
      { identifier: 1, pixel: 200 },
    ]);
    const mid = controller.handleTouchMove([
      { identifier: 0, pixel: 90 },
      { identifier: 1, pixel: 190 },
    ]);
    expect(mid).not.toBeNull();
    zoom = mid!;
    const next = controller.handleTouchMove([
      { identifier: 0, pixel: 80 },
      { identifier: 1, pixel: 180 },
    ]);
    expect(next).not.toBeNull();
    expect(next!.offsetSample).toBeGreaterThan(zoom.offsetSample);
  });

  it("resets gesture tracking when active touches drop below 2", () => {
    controller.setActiveTouches([
      { identifier: 0, pixel: 100 },
      { identifier: 1, pixel: 200 },
    ]);
    controller.setActiveTouches([{ identifier: 0, pixel: 100 }]);
    expect(controller.handleTouchMove([{ identifier: 0, pixel: 150 }])).toBeNull();
  });

  it("clamps offset at the start of the track when panning past the beginning", () => {
    zoom = { samplesPerPixel: 10, offsetSample: 0 };
    controller.setActiveTouches([
      { identifier: 0, pixel: 100 },
      { identifier: 1, pixel: 200 },
    ]);
    const next = controller.handleTouchMove([
      { identifier: 0, pixel: 500 },
      { identifier: 1, pixel: 600 },
    ]);
    expect(next).not.toBeNull();
    expect(next!.offsetSample).toBe(0);
  });
});
