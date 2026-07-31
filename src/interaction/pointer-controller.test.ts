import { beforeEach, describe, expect, it, vi } from "vitest";
import { PointerController } from "./pointer-controller";
import type { SelectionRange, ZoomState } from "../core/types";

describe("PointerController", () => {
  let zoom: ZoomState;
  let selection: SelectionRange | null;
  let cursor: number;
  let controller: PointerController;

  beforeEach(() => {
    zoom = { samplesPerPixel: 10, offsetSample: 0 }; // 1 px == 10 samples
    selection = null;
    cursor = 0;
    controller = new PointerController({
      getZoom: () => zoom,
      getSelection: () => selection,
      getTotalSamples: () => 10000,
      setSelection: (s) => {
        selection = s;
      },
      setCursor: (s) => {
        cursor = s;
      },
    });
  });

  it("sets the cursor on a plain click without drag", () => {
    controller.handlePointerDown(50);
    controller.handlePointerUp(50);
    expect(cursor).toBe(500);
  });

  it("creates a selection when dragging on empty waveform", () => {
    controller.handlePointerDown(50);
    controller.handlePointerMove(80);
    controller.handlePointerUp(80);
    expect(selection).toEqual({ startSample: 500, endSample: 800 });
  });

  it("normalizes a selection dragged backwards", () => {
    controller.handlePointerDown(80);
    controller.handlePointerMove(50);
    expect(selection).toEqual({ startSample: 500, endSample: 800 });
  });

  it("resizes the selection when dragging its start edge", () => {
    selection = { startSample: 500, endSample: 800 };
    controller.handlePointerDown(50); // exactly on start edge (pixel 50 == sample 500)
    controller.handlePointerMove(30);
    expect(selection).toEqual({ startSample: 300, endSample: 800 });
  });

  it("resizes the selection when dragging its end edge", () => {
    selection = { startSample: 500, endSample: 800 };
    controller.handlePointerDown(80);
    controller.handlePointerMove(90);
    expect(selection).toEqual({ startSample: 500, endSample: 900 });
  });

  it("translates the selection when dragging its body", () => {
    selection = { startSample: 500, endSample: 800 };
    controller.handlePointerDown(65); // middle of the selection body
    controller.handlePointerMove(75); // +10px = +100 samples
    expect(selection).toEqual({ startSample: 600, endSample: 900 });
  });

  it("reports crosshair cursor over empty waveform", () => {
    expect(controller.getHoverCursor(50)).toBe("crosshair");
  });

  it("reports ew-resize cursor over a selection edge", () => {
    selection = { startSample: 500, endSample: 800 };
    expect(controller.getHoverCursor(50)).toBe("ew-resize");
  });

  it("reports grab cursor over a selection body, grabbing while moving it", () => {
    selection = { startSample: 500, endSample: 800 };
    expect(controller.getHoverCursor(65)).toBe("grab");
    controller.handlePointerDown(65);
    controller.handlePointerMove(70);
    expect(controller.getHoverCursor(70)).toBe("grabbing");
  });

  it("clears the selection on double-click within it", () => {
    selection = { startSample: 500, endSample: 800 };
    const now = Date.now;
    let t = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => t);
    controller.handlePointerDown(65);
    controller.handlePointerUp(65);
    t += 100;
    controller.handlePointerDown(65);
    expect(selection).toBeNull();
    Date.now = now;
  });
});
