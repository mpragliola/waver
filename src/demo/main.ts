import { defineWaverElement, type WaverElement } from "../waver-element";

defineWaverElement();

const waver = document.getElementById("waver") as WaverElement;
const fileInput = document.getElementById("file") as HTMLInputElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const playButton = document.getElementById("play") as HTMLButtonElement;
const zoomFullButton = document.getElementById("zoomFull") as HTMLButtonElement;

waver.configure({ height: 260, showZeroLine: true, showMinimap: true });

const audioContext = new AudioContext();

const MAX_FILE_SIZE_BYTES = 80 * 1024 * 1024;

function setStatus(message: string, showSpinner = false): void {
  statusEl.innerHTML = "";
  if (showSpinner) {
    const spinner = document.createElement("div");
    spinner.className = "spinner";
    statusEl.append(spinner);
  }
  if (message) statusEl.append(document.createTextNode(message));
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  if (file.size > MAX_FILE_SIZE_BYTES) {
    setStatus(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB) — demo limit is 80 MB.`);
    fileInput.value = "";
    return;
  }

  setStatus("Loading…", true);
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    waver.loadAudioBuffer(audioBuffer, audioContext);
    setStatus("");
  } catch (err) {
    setStatus(`Failed to decode audio: ${(err as Error).message}`);
  }
});

playButton.addEventListener("click", () => waver.togglePlayback());
zoomFullButton.addEventListener("click", () => waver.zoomToFull());

waver.addEventListener("waver:cursorchange", (e) => {
  const detail = (e as CustomEvent).detail;
  console.log("cursor", detail.positionSample);
});
