import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { Camera, cameraError } from "./camera";
vi.mock("./download", () => ({
  downloadAsset: vi.fn(async () => new Uint8Array([1, 2, 3])),
  DownloadError: class extends Error {},
}));
const mock = vi.hoisted(() => ({
  create: vi.fn(),
  files: vi.fn(),
  close: vi.fn(),
  handClose: vi.fn(),
  handCreate: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: mock.files },
  PoseLandmarker: { createFromOptions: mock.create },
  HandLandmarker: { createFromOptions: mock.handCreate },
}));
beforeEach(() => {
  vi.resetAllMocks();
  mock.files.mockResolvedValue({});
  mock.create.mockResolvedValue({ close: mock.close });
  mock.handCreate.mockResolvedValue({ close: mock.handClose });
  vi.stubGlobal("window", { isSecureContext: true });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: mock.get } });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("requestAnimationFrame", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
const video = () =>
  ({
    srcObject: null,
    play: vi.fn().mockResolvedValue(undefined),
  }) as unknown as HTMLVideoElement;
it("requests video only and releases tracks and detector on stop", async () => {
  const stop = vi.fn(),
    track = { stop, onended: null };
  mock.get.mockResolvedValue({ getTracks: () => [track] });
  const c = new Camera(),
    v = video(),
    ready = vi.fn();
  await c.start(v, vi.fn(), vi.fn(), ready);
  expect(mock.get.mock.calls[0][0].audio).toBe(false);
  expect(ready).toHaveBeenCalledOnce();
  c.stop();
  expect(stop).toHaveBeenCalledOnce();
  expect(mock.close).toHaveBeenCalledOnce();
  expect(v.srcObject).toBeNull();
});
it("late camera permission after stop cannot resurrect the stream", async () => {
  let resolve!: (s: unknown) => void;
  mock.get.mockReturnValue(new Promise((r) => (resolve = r)));
  const c = new Camera(),
    ready = vi.fn();
  const promise = c.start(video(), vi.fn(), vi.fn(), ready);
  await vi.waitFor(() => expect(mock.get).toHaveBeenCalled());
  c.stop();
  const stop = vi.fn();
  resolve({ getTracks: () => [{ stop }] });
  await promise;
  expect(stop).toHaveBeenCalledOnce();
  expect(ready).not.toHaveBeenCalled();
});
it("late model is closed and does not request the camera", async () => {
  let resolve!: (s: unknown) => void;
  mock.create.mockReturnValue(new Promise((r) => (resolve = r)));
  const c = new Camera();
  const promise = c.start(video(), vi.fn(), vi.fn(), vi.fn());
  await vi.waitFor(() => expect(mock.create).toHaveBeenCalled());
  c.stop();
  resolve({ close: mock.close });
  await promise;
  expect(mock.close).toHaveBeenCalledOnce();
  expect(mock.get).not.toHaveBeenCalled();
});
it("permission rejection yields actionable feedback and closes model", async () => {
  mock.get.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
  const c = new Camera(),
    error = vi.fn();
  await c.start(video(), vi.fn(), error, vi.fn());
  expect(error.mock.calls[0][0]).toContain("Разрешите камеру");
  expect(mock.close).toHaveBeenCalledOnce();
});
it("labels busy and missing devices", () => {
  expect(cameraError(new DOMException("", "NotReadableError"))).toContain(
    "занята",
  );
  expect(cameraError(new DOMException("", "NotFoundError"))).toContain(
    "не найдена",
  );
});
it("does not run inference during manual rest or a hidden tab", async () => {
  const detect = vi.fn().mockReturnValue({ landmarks: [] });
  mock.create.mockResolvedValue({ close: mock.close, detectForVideo: detect });
  mock.get.mockResolvedValue({
    getTracks: () => [{ stop: vi.fn(), onended: null }],
  });
  const doc = { hidden: false };
  vi.stubGlobal("document", doc);
  let callback!: FrameRequestCallback;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: FrameRequestCallback) => {
      callback = cb;
      return 1;
    }),
  );
  let process = false;
  const v = Object.assign(video(), {
    readyState: 2,
    currentTime: 1,
    videoWidth: 640,
    videoHeight: 480,
  });
  const c = new Camera();
  await c.start(
    v,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    () => false,
    () => process,
  );
  callback(100);
  expect(detect).not.toHaveBeenCalled();
  process = true;
  doc.hidden = true;
  callback(200);
  expect(detect).not.toHaveBeenCalled();
  doc.hidden = false;
  callback(300);
  expect(detect).toHaveBeenCalledOnce();
  c.stop();
});
it("closes a hand model arriving after cancellation", async () => {
  let resolve!: (v: unknown) => void;
  mock.handCreate.mockReturnValue(new Promise((r) => (resolve = r)));
  const c = new Camera();
  const result = c.start(video(), vi.fn(), vi.fn(), vi.fn());
  await vi.waitFor(() => expect(mock.handCreate).toHaveBeenCalled());
  c.stop();
  resolve({ close: mock.handClose });
  await result;
  expect(mock.handClose).toHaveBeenCalledOnce();
  expect(mock.get).not.toHaveBeenCalled();
});
it("cleans both models if camera playback rejects", async () => {
  const stop = vi.fn();
  mock.get.mockResolvedValue({ getTracks: () => [{ stop, onended: null }] });
  const v = video();
  v.play = vi.fn().mockRejectedValue(Error("playback"));
  const error = vi.fn();
  await new Camera().start(v, vi.fn(), error, vi.fn());
  expect(stop).toHaveBeenCalled();
  expect(mock.close).toHaveBeenCalledOnce();
  expect(mock.handClose).toHaveBeenCalledOnce();
  expect(error).toHaveBeenCalledOnce();
  expect(v.srcObject).toBeNull();
});
it("device disconnection closes resources and cancels further frames", async () => {
  const track: {
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  } = { stop: vi.fn(), onended: null };
  mock.get.mockResolvedValue({ getTracks: () => [track] });
  const v = video(),
    error = vi.fn(),
    camera = new Camera();
  await camera.start(v, vi.fn(), error, vi.fn());
  expect(track.onended).not.toBeNull();
  track.onended!();
  expect(error).toHaveBeenCalledExactlyOnceWith(
    "Камера отключена. Подключите её и включите снова.",
  );
  expect(v.srcObject).toBeNull();
  expect(track.onended).toBeNull();
  expect(mock.close).toHaveBeenCalledOnce();
  expect(mock.handClose).toHaveBeenCalledOnce();
  expect(cancelAnimationFrame).toHaveBeenCalled();
});
it("reports each startup stage in order", async () => {
  mock.get.mockResolvedValue({
    getTracks: () => [{ stop: vi.fn(), onended: null }],
  });
  const stage = vi.fn(),
    c = new Camera();
  await c.start(
    video(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    () => true,
    () => true,
    stage,
  );
  expect(stage.mock.calls.map(([text]) => text.split(" · ")[0])).toEqual([
    "1 из 5",
    "2 из 5",
    "3 из 5",
    "4 из 5",
    "5 из 5",
  ]);
  c.stop();
});
it("stalled video first invalidates tracking, then releases the camera for retry", async () => {
  const detect = vi.fn().mockReturnValue({ landmarks: [] });
  mock.create.mockResolvedValue({ close: mock.close, detectForVideo: detect });
  const stop = vi.fn();
  mock.get.mockResolvedValue({ getTracks: () => [{ stop, onended: null }] });
  vi.stubGlobal("document", { hidden: false });
  let tick!: FrameRequestCallback;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb) => {
      tick = cb;
      return 1;
    }),
  );
  const v = Object.assign(video(), {
    readyState: 2,
    currentTime: 1,
    videoWidth: 640,
    videoHeight: 480,
  });
  const frame = vi.fn(),
    error = vi.fn(),
    c = new Camera();
  await c.start(v, frame, error, vi.fn());
  const base = performance.now();
  tick(base);
  tick(base + 400);
  expect(frame.mock.lastCall?.[0].reason).toContain("не обновляются");
  expect(error).not.toHaveBeenCalled();
  for (let ms = 800; ms <= 5200; ms += 400) tick(base + ms);
  expect(error).toHaveBeenCalledExactlyOnceWith(
    "Камера не присылает новые кадры более 5 секунд. Подключите камеру снова.",
  );
  expect(stop).toHaveBeenCalledOnce();
  expect(mock.close).toHaveBeenCalledOnce();
  expect(mock.handClose).toHaveBeenCalledOnce();
  expect(v.srcObject).toBeNull();
});
it.each(["hidden", "manual", "suspended"])(
  "does not treat a %s pause as a camera failure",
  async (mode) => {
    const detect = vi.fn().mockReturnValue({ landmarks: [] });
    mock.create.mockResolvedValue({
      close: mock.close,
      detectForVideo: detect,
    });
    mock.get.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn(), onended: null }],
    });
    const doc = { hidden: false };
    vi.stubGlobal("document", doc);
    let tick!: FrameRequestCallback,
      process = true;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb) => {
        tick = cb;
        return 1;
      }),
    );
    const v = Object.assign(video(), {
      readyState: 2,
      currentTime: 1,
      videoWidth: 640,
      videoHeight: 480,
    });
    const error = vi.fn(),
      c = new Camera();
    await c.start(
      v,
      vi.fn(),
      error,
      vi.fn(),
      () => false,
      () => process,
    );
    const base = performance.now();
    tick(base);
    if (mode !== "suspended") {
      doc.hidden = mode === "hidden";
      process = mode !== "manual";
      for (let ms = 400; ms <= 8000; ms += 400) tick(base + ms);
    }
    doc.hidden = false;
    process = true;
    tick(base + 8400);
    expect(error).not.toHaveBeenCalled();
    v.currentTime = 2;
    tick(base + 8500);
    expect(detect).toHaveBeenCalledTimes(2);
    c.stop();
  },
);
it("timestamps before inference and leaves a paint interval after expensive processing", async () => {
  let clock = 1000;
  const time = vi.spyOn(performance, "now").mockImplementation(() => clock);
  try {
    const detect = vi.fn(() => {
      clock += 200;
      return { landmarks: [] };
    });
    mock.create.mockResolvedValue({
      close: mock.close,
      detectForVideo: detect,
    });
    mock.get.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn(), onended: null }],
    });
    vi.stubGlobal("document", { hidden: false });
    let tick!: FrameRequestCallback;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb) => {
        tick = cb;
        return 1;
      }),
    );
    const v = Object.assign(video(), {
      readyState: 2,
      currentTime: 1,
      videoWidth: 640,
      videoHeight: 480,
    });
    const frame = vi.fn(),
      c = new Camera();
    await c.start(v, frame, vi.fn(), vi.fn());
    tick(1000);
    expect(frame.mock.lastCall?.[0]).toMatchObject({
      capturedAt: 1000,
      processingMs: 200,
    });
    v.currentTime = 2;
    tick(1216);
    expect(detect).toHaveBeenCalledOnce();
    clock = 1248;
    tick(1248);
    expect(detect).toHaveBeenCalledTimes(2);
    c.stop();
  } finally {
    time.mockRestore();
  }
});
