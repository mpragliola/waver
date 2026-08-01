export { WaverElement, defineWaverElement } from "./waver-element";
export { darkTheme, lightTheme, resolveTheme, deriveSelectionColor } from "./core/theme";
export { computePeaks, fullZoomSamplesPerPixel, MIN_SAMPLES_PER_PIXEL } from "./core/peaks";
export { pixelToSample, sampleToPixel } from "./core/viewport";
export * from "./core/types";

declare global {
  interface HTMLElementTagNameMap {
    "wave-r": import("./waver-element").WaverElement;
  }
}
