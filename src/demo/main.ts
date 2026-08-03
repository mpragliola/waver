import type { RecordViewMode } from "../core/types";
import { defineWaverElement, type WaverElement } from "../waver-element";

defineWaverElement();

const waver = document.getElementById("waver") as WaverElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const playButton = document.getElementById("play") as HTMLButtonElement;
const zoomFullButton = document.getElementById("zoomFull") as HTMLButtonElement;
const viewModeButton = document.getElementById("viewMode") as HTMLButtonElement;
const recordViewModeButton = document.getElementById("recordViewMode") as HTMLButtonElement;

waver.configure({ height: 260, showZeroLine: true, showMinimap: true });

const RECORD_VIEW_MODES: RecordViewMode[] = ["scroll", "zoom-out", "flat"];
let recordViewModeIndex = 0;
recordViewModeButton.addEventListener("click", () => {
  recordViewModeIndex = (recordViewModeIndex + 1) % RECORD_VIEW_MODES.length;
  const recordViewMode = RECORD_VIEW_MODES[recordViewModeIndex];
  waver.configure({ recordViewMode, recordWindowSeconds: 10 });
  recordViewModeButton.textContent = `Record mode: ${recordViewMode}`;
});

function setStatus(message: string, showSpinner = false): void {
  statusEl.innerHTML = "";
  if (showSpinner) {
    const spinner = document.createElement("div");
    spinner.className = "spinner";
    statusEl.append(spinner);
  }
  if (message) statusEl.append(document.createTextNode(message));
}

playButton.addEventListener("click", () => waver.togglePlayback());
zoomFullButton.addEventListener("click", () => waver.zoomToFull());
viewModeButton.addEventListener("click", () => {
  waver.setViewMode(waver.getViewMode() === "waveform" ? "spectrogram" : "waveform");
});

waver.addEventListener("waver:cursorchange", (e) => {
  const detail = (e as CustomEvent).detail;
  console.log("cursor", detail.positionSample);
});

waver.addEventListener("waver:recordstart", () => setStatus("Recording…"));
waver.addEventListener("waver:recordstop", () => setStatus(""));
waver.addEventListener("waver:recorderror", (e) => {
  const detail = (e as CustomEvent).detail;
  setStatus(`Mic access failed: ${(detail.error as Error).message}`);
});
waver.addEventListener("waver:loaderror", (e) => {
  const detail = (e as CustomEvent).detail;
  setStatus(`Failed to decode audio: ${(detail.error as Error).message}`);
});
