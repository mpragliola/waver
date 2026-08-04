import { vi } from "vitest";

/** Minimal spy-recording stand-in for CanvasRenderingContext2D, shared by every canvas in the element. */
export function makeFakeCtx() {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineJoin: "",
    lineCap: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "",
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createImageData: vi.fn((w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

class FakeResizeObserver {
  constructor(_cb: ResizeObserverCallback) {}
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return { putImageData: vi.fn() };
  }
}

/**
 * A manually-driven requestAnimationFrame queue. `render()` schedules one frame per call and
 * playback/zoom-animation self-chain further frames from inside their own callback — running
 * those synchronously (as a naive "call immediately" stub would) recurses forever. Tests instead
 * call `flush()` to run whatever's currently queued, one pass at a time.
 */
export function makeFrameQueue() {
  let queue: FrameRequestCallback[] = [];
  let nextHandle = 1;
  const request = vi.fn((cb: FrameRequestCallback) => {
    queue.push(cb);
    return nextHandle++;
  });
  const cancel = vi.fn();
  /** Runs exactly the callbacks queued as of now (not ones they themselves schedule). Returns how many ran. */
  function flush(): number {
    const batch = queue;
    queue = [];
    const now = performance.now();
    batch.forEach((cb) => cb(now));
    return batch.length;
  }
  /** Flushes repeatedly until nothing reschedules or `maxPasses` is hit (guards against runaway animation loops in tests). */
  function flushUntilIdle(maxPasses = 50): void {
    for (let i = 0; i < maxPasses && queue.length > 0; i++) flush();
  }
  return { request, cancel, flush, flushUntilIdle };
}

/**
 * Installs the browser API stand-ins WaverElement needs beyond plain jsdom: canvas 2D contexts
 * (jsdom has no real canvas backend), a manual rAF queue (see `makeFrameQueue`), ResizeObserver,
 * layout rects, and OffscreenCanvas for spectrogram mode.
 * Call from a `beforeEach`; pairs with `vi.unstubAllGlobals()` / restoring the prototype spy in `afterEach`.
 */
export function installDomStubs(width = 300, height = 100) {
  const ctxByCanvas = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
  const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    let ctx = ctxByCanvas.get(this);
    if (!ctx) {
      ctx = makeFakeCtx();
      ctxByCanvas.set(this, ctx);
    }
    return ctx;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);

  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  const frameQueue = makeFrameQueue();
  vi.stubGlobal("requestAnimationFrame", frameQueue.request);
  vi.stubGlobal("cancelAnimationFrame", frameQueue.cancel);

  const clientWidthSpy = vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(width);
  const clientHeightSpy = vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(height);
  const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect);

  if (!("setPointerCapture" in Element.prototype)) {
    (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = vi.fn();
    (Element.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = vi.fn();
    (Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = vi.fn(() => false);
  }

  return {
    ctxByCanvas,
    flush: frameQueue.flush,
    flushUntilIdle: frameQueue.flushUntilIdle,
    restore: () => {
      getContextSpy.mockRestore();
      clientWidthSpy.mockRestore();
      clientHeightSpy.mockRestore();
      rectSpy.mockRestore();
      vi.unstubAllGlobals();
    },
  };
}

export function makeAudioBuffer(samples: Float32Array | Float32Array[], sampleRate = 44100): AudioBuffer {
  const channels = Array.isArray(samples) ? samples : [samples];
  return {
    sampleRate,
    duration: channels[0].length / sampleRate,
    numberOfChannels: channels.length,
    length: channels[0].length,
    getChannelData: (i: number) => channels[i],
    copyToChannel: vi.fn((source: Float32Array, i: number) => {
      channels[i] = source;
    }),
  } as unknown as AudioBuffer;
}

export function makeFakeAudioContext(sampleRate = 44100) {
  const created: Array<{ buffer: AudioBuffer; sampleRate: number }> = [];
  return {
    currentTime: 0,
    destination: {},
    state: "running",
    sampleRate,
    createBufferSource: vi.fn(() => ({
      buffer: null,
      onended: null as (() => void) | null,
      playbackRate: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createBuffer: vi.fn((channelCount: number, length: number, sampleRate: number) => {
      const channels = Array.from({ length: channelCount }, () => new Float32Array(length));
      const buf = makeAudioBuffer(channels, sampleRate);
      created.push({ buffer: buf, sampleRate });
      return buf;
    }),
    decodeAudioData: vi.fn(async (arrayBuffer: ArrayBuffer) => makeAudioBuffer(new Float32Array(arrayBuffer.byteLength / 4))),
    close: vi.fn(async () => {}),
    // Recording path (RecorderEngine.start()):
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createScriptProcessor: vi.fn(() => ({
      onaudioprocess: null as ((e: unknown) => void) | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createChannelSplitter: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createGain: vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() })),
  };
}

export function dispatchPointerEvent(
  target: EventTarget,
  type: string,
  init: { clientX?: number; clientY?: number; pointerId?: number } = {}
): void {
  const event = new Event(type, { bubbles: true }) as PointerEvent & {
    clientX: number;
    clientY: number;
    pointerId: number;
  };
  Object.defineProperty(event, "clientX", { value: init.clientX ?? 0 });
  Object.defineProperty(event, "clientY", { value: init.clientY ?? 0 });
  Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
  target.dispatchEvent(event);
}
