import type { RecordViewMode } from "../core/types";
import { defineWaverElement, type WaverElement } from "../waver-element";

defineWaverElement();

const waver = document.getElementById("waver") as WaverElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const playButton = document.getElementById("play") as HTMLButtonElement;
const zoomFullButton = document.getElementById("zoomFull") as HTMLButtonElement;
const viewModeButton = document.getElementById("viewMode") as HTMLButtonElement;
const resetButton = document.getElementById("reset") as HTMLButtonElement;
const recordViewModeSelect = document.getElementById("recordViewMode") as HTMLSelectElement;
const inputDeviceSelect = document.getElementById("inputDevice") as HTMLSelectElement;

waver.configure({ height: 260, showZeroLine: true, showMinimap: true });

recordViewModeSelect.addEventListener("change", () => {
  const recordViewMode = recordViewModeSelect.value as RecordViewMode;
  waver.configure({ recordViewMode, recordWindowSeconds: 2 });
});

// The demo owns picking + acquiring the input device; Waver only ever receives the resulting
// stream via setInputStream(). Waver never calls getUserMedia with a deviceId itself.
let activeInputStream: MediaStream | null = null;

async function selectInputDevice(deviceId: string): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  });
  activeInputStream?.getTracks().forEach((t) => t.stop());
  activeInputStream = stream;
  waver.setInputStream(stream);
}

async function populateInputDevices(): Promise<void> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter((d) => d.kind === "audioinput");
  inputDeviceSelect.innerHTML = "";
  mics.forEach((mic, i) => {
    const option = document.createElement("option");
    option.value = mic.deviceId;
    option.textContent = mic.label || `Microphone ${i + 1}`;
    inputDeviceSelect.append(option);
  });
}

inputDeviceSelect.addEventListener("change", () => {
  void selectInputDevice(inputDeviceSelect.value);
});

// Device labels are blank until permission is granted; request access once up front so the
// dropdown can show real labels, then use that same stream as the initial input.
navigator.mediaDevices
  .getUserMedia({ audio: true })
  .then(async (stream) => {
    activeInputStream = stream;
    waver.setInputStream(stream);
    await populateInputDevices();
    const activeTrack = stream.getAudioTracks()[0];
    const activeDeviceId = activeTrack?.getSettings().deviceId;
    if (activeDeviceId) inputDeviceSelect.value = activeDeviceId;
  })
  .catch(() => {
    setStatus("Mic access is needed to list input devices");
  });

navigator.mediaDevices.addEventListener("devicechange", () => {
  void populateInputDevices();
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
resetButton.addEventListener("click", () => waver.reset());

waver.addEventListener("waver:cursorchange", (e) => {
  const detail = (e as CustomEvent).detail;
  console.log("cursor", detail.positionSample);
});

waver.addEventListener("waver:recordstart", () => setStatus("Recording…"));
waver.addEventListener("waver:recordstop", () => setStatus(""));
waver.addEventListener("waver:reset", () => setStatus(""));
waver.addEventListener("waver:recorderror", (e) => {
  const detail = (e as CustomEvent).detail;
  setStatus(`Mic access failed: ${(detail.error as Error).message}`);
});
waver.addEventListener("waver:loaderror", (e) => {
  const detail = (e as CustomEvent).detail;
  setStatus(`Failed to decode audio: ${(detail.error as Error).message}`);
});
