import { it, expect, vi, afterEach } from "vitest";
import { downloadAsset } from "./download";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function streamFetch() {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          stream = c;
        },
      });
      options.signal!.addEventListener("abort", () =>
        stream.error(options.signal!.reason),
      );
      return new Response(body);
    }),
  );
  return () => stream;
}
it("allows a slow progressing download beyond 30 seconds and reports actual bytes", async () => {
  vi.useFakeTimers();
  const stream = streamFetch(),
    progress = vi.fn();
  const pending = downloadAsset(
    "/model.task",
    new AbortController().signal,
    progress,
  );
  await vi.advanceTimersByTimeAsync(20000);
  stream().enqueue(new Uint8Array([1, 2]));
  await vi.advanceTimersByTimeAsync(20000);
  stream().enqueue(new Uint8Array([3]));
  stream().close();
  expect(await pending).toEqual(new Uint8Array([1, 2, 3]));
  expect(progress).toHaveBeenLastCalledWith(3, null);
  expect(vi.getTimerCount()).toBe(0);
});
it("aborts a stalled transfer and releases timers", async () => {
  vi.useFakeTimers();
  streamFetch();
  const pending = downloadAsset(
    "/model.task",
    new AbortController().signal,
    vi.fn(),
  );
  const check = expect(pending).rejects.toThrow("30 секунд");
  await vi.advanceTimersByTimeAsync(30000);
  await check;
  expect(vi.getTimerCount()).toBe(0);
});
it("stop aborts an in-flight transfer immediately", async () => {
  streamFetch();
  const stop = new AbortController();
  const pending = downloadAsset("/model.task", stop.signal, vi.fn());
  const check = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve();
  stop.abort();
  await check;
});
it("rejects HTTP errors instead of passing HTML to the model", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("not found", { status: 404 })),
  );
  await expect(
    downloadAsset("/missing", new AbortController().signal, vi.fn()),
  ).rejects.toThrow("404");
});
it("bounds a never-ending transfer even while bytes keep arriving", async () => {
  vi.useFakeTimers();
  const stream = streamFetch();
  const pending = downloadAsset(
    "/model.task",
    new AbortController().signal,
    vi.fn(),
  );
  const check = expect(pending).rejects.toThrow("5 минут");
  for (let i = 0; i < 14; i++) {
    await vi.advanceTimersByTimeAsync(20000);
    stream().enqueue(new Uint8Array([1]));
  }
  await vi.advanceTimersByTimeAsync(20000);
  await check;
});
