import { it, expect } from "vitest";
import { FrameHealth, freshFrame } from "./frame-health";
import { fixture } from "./fixtures";
import { MovementTracker, defaultSettings } from "./movement";
it("rejects stale and impossible capture timestamps", () => {
  for (const capturedAt of [0, NaN, Infinity, 1100]) {
    const result = freshFrame({ ...fixture("bend"), capturedAt }, 1000);
    expect(result.pose).toEqual([]);
    expect(result.hands).toEqual([]);
    expect(result.reason).toContain("запаздывает");
  }
  const fresh = { ...fixture("rest"), capturedAt: 900 };
  expect(freshFrame(fresh, 1000)).toBe(fresh);
});
it("delayed endpoint discards the cycle instead of yielding a repetition", () => {
  const tracker = new MovementTracker();
  let now = 0,
    count = 0;
  for (const kind of ["rest", "bend", "rest"] as const) {
    for (let n = 0; n < 20; n++) {
      now += 80;
      const raw = { ...fixture(kind), capturedAt: now };
      const f = freshFrame(raw, now + (kind === "bend" ? 600 : 25));
      if (tracker.update(f, "bend", defaultSettings, now).event) count++;
    }
  }
  expect(count).toBe(0);
});
it("measures bounded recent processing statistics and clears after a pause", () => {
  const health = new FrameHealth();
  let reading;
  for (let n = 0; n < 50; n++)
    reading = health.update(
      { ...fixture("rest"), capturedAt: n * 100, processingMs: 25 },
      n * 100 + 25,
    );
  expect(reading).toEqual({ fps: 10, ms: 25, delayed: false });
  expect(
    health.update(
      { ...fixture("rest"), capturedAt: 10000, processingMs: 600 },
      10600,
    ).fps,
  ).toBeNull();
  health.reset();
  expect(health.update(fixture("rest"), 0)).toEqual({
    fps: null,
    ms: null,
    delayed: false,
  });
});
