import { it, expect, vi, afterEach } from "vitest";
import { acquireWithin } from "./async-resource";
afterEach(() => vi.useRealTimers());
it("releases a model arriving after timeout", async () => {
  vi.useFakeTimers();
  let resolve!: (v: { close: () => void }) => void;
  const pending = new Promise<{ close: () => void }>((r) => (resolve = r)),
    close = vi.fn();
  const result = acquireWithin(pending, 30, (v) => v.close(), "timeout");
  const check = expect(result).rejects.toThrow("timeout");
  await vi.advanceTimersByTimeAsync(30);
  await check;
  resolve({ close });
  await Promise.resolve();
  expect(close).toHaveBeenCalledOnce();
});
it("returns timely resources without releasing them", async () => {
  const release = vi.fn();
  expect(
    await acquireWithin(Promise.resolve(42), 100, release, "timeout"),
  ).toBe(42);
  expect(release).not.toHaveBeenCalled();
});
it("handles a late rejection without an unhandled promise", async () => {
  vi.useFakeTimers();
  let reject!: (e: Error) => void;
  const result = acquireWithin(
    new Promise((_, r) => (reject = r)),
    10,
    () => {},
    "timeout",
  );
  const check = expect(result).rejects.toThrow("timeout");
  await vi.advanceTimersByTimeAsync(10);
  await check;
  reject(Error("late"));
  await Promise.resolve();
});
