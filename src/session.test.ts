import { it, expect } from "vitest";
import {
  initialSession,
  step,
  startSession,
  confirmSetup,
  suspendSession,
  currentExercise,
} from "./session";
import { emptyReading, MovementTracker, defaultSettings } from "./movement";
import { fixture } from "./fixtures";
const r = { ...emptyReading(), valid: true };
it("finishes three exercises with optional gesture transitions and no deadline", () => {
  let s = { ...initialSession(1), phase: "setup" as const };
  let state = step(s, r, 0),
    now = 0;
  for (let i = 0; i < 20; i++) state = step(state, r, (now += 80));
  expect(state.phase).toBe("ready");
  for (let i = 0; i < 38; i++)
    state = step(state, { ...r, zone: "rest" }, (now += 80));
  for (let e = 0; e < 3; e++) {
    expect(state.phase).toBe("practice");
    state = step(state, { ...r, event: true }, (now += 80));
    expect(state.phase).toBe(e === 2 ? "result" : "rest");
    if (e < 2) state = step(state, { ...r, event: true }, (now += 80));
  }
  expect(state.counts).toEqual([1, 1, 1]);
  expect(state.completed).toBe(true);
  expect(startSession(state).phase).toBe("ready");
});
it("tracking loss and hidden tab freeze counts and practice time", () => {
  for (const hidden of [false, true]) {
    let s = step(
      { ...initialSession(), phase: "practice", last: 0 },
      { ...r, valid: hidden, event: true },
      80,
      hidden,
    );
    expect(s.paused).toBe(true);
    expect(s.activeMs).toBe(0);
    expect(s.counts).toEqual([0, 0, 0]);
    for (let i = 2; i < 12; i++) s = step(s, { ...r, event: true }, i * 80);
    expect(s.counts).toEqual([0, 0, 0]);
  }
});
it("rest has no deadline", () => {
  let s = { ...initialSession(), phase: "rest" as const, last: 0 };
  let n = step(s, r, 80);
  for (let t = 160; t < 60000; t += 80) n = step(n, r, t);
  expect(n.phase).toBe("rest");
  expect(n.activeMs).toBe(0);
});
it("nonfinite timestamps cannot corrupt active time", () => {
  const n = step({ ...initialSession(), phase: "practice", last: 0 }, r, NaN);
  expect(n.paused).toBe(true);
  expect(n.activeMs).toBe(0);
  expect(n.last).toBeNull();
});

it.each(["practice", "rest", "result"] as const)(
  "reconnect preserves %s progress and ignores recovery events",
  (phase) => {
    const original = {
      ...initialSession(3),
      phase,
      exercise: 1,
      counts: [3, 1, 0],
      activeMs: 4200,
      last: 200,
      completed: phase === "result",
    };
    let resumed = suspendSession(original);
    expect(resumed.phase).toBe(phase);
    expect(resumed.counts).toEqual([3, 1, 0]);
    expect(resumed.activeMs).toBe(4200);
    expect(resumed.completed).toBe(original.completed);
    expect(resumed.last).toBeNull();
    for (let now = 10000; now <= 10800; now += 80)
      resumed = step(resumed, { ...r, event: true }, now);
    expect(resumed.paused).toBe(false);
    expect(resumed.counts).toEqual([3, 1, 0]);
    expect(resumed.phase).toBe(phase);
    expect(resumed.activeMs).toBe(4200);
  },
);

it("manual setup needs a fresh visible arm and still requires recovery", () => {
  const setup = { ...initialSession(), phase: "setup" as const, paused: true };
  expect(confirmSetup(setup, emptyReading(), 1000, 1000)).toBe(setup);
  expect(confirmSetup(setup, r, 1000, 0)).toBe(setup);
  expect(confirmSetup(setup, r, 1000, 1100)).toBe(setup);
  expect(confirmSetup(setup, r, NaN, 1000)).toBe(setup);
  const ready = confirmSetup(setup, r, 1000, 960);
  expect(ready.phase).toBe("ready");
  expect(ready.paused).toBe(true);
  const practice = startSession(ready);
  const after = step(practice, { ...r, event: true }, 1080);
  expect(after.phase).toBe("practice");
  expect(after.counts).toEqual([0, 0, 0]);
  expect(confirmSetup(after, r, 1100, 1080)).toBe(after);
});

it("hands-free countdown resets on loss, motion and hidden tab without counting", () => {
  const rest = { ...r, zone: "rest" as const };
  let s = { ...initialSession(), phase: "ready" as const, last: 0 };
  let state = step(s, rest, 80);
  for (let now = 160; now <= 2400; now += 80) state = step(state, rest, now);
  expect(state.startHold).toBe(2400);
  expect(step(state, { ...rest, zone: "middle" }, 2480).startHold).toBe(0);
  expect(step(state, emptyReading(), 2480).startHold).toBe(0);
  expect(step(state, rest, 2480, true).startHold).toBe(0);
  expect(suspendSession(state).startHold).toBe(0);
  for (let now = 2480; now <= 3040; now += 80) state = step(state, rest, now);
  expect(state.phase).toBe("practice");
  expect(state.counts).toEqual([0, 0, 0]);
});

it("starts automatically and leaves rest with pose only, without hand landmarks", () => {
  let s = { ...initialSession(1), phase: "setup" as const } as ReturnType<
    typeof initialSession
  >;
  const tracker = new MovementTracker();
  let now = 0;
  const feed = (kind: "rest" | "bend", frames: number) => {
    for (let i = 0; i < frames; i++) {
      const f = fixture(kind);
      f.hands = [];
      const before = s.phase;
      const r = tracker.update(
        f,
        currentExercise(s),
        defaultSettings,
        (now += 80),
      );
      s = step(s, r, now);
      if (s.phase !== before) tracker.reset();
    }
  };
  feed("rest", 65);
  expect(s.phase).toBe("practice");
  expect(s.counts).toEqual([0, 0, 0]);
  feed("rest", 15);
  feed("bend", 15);
  feed("rest", 15);
  expect(s.phase).toBe("rest");
  feed("rest", 80);
  expect(s.phase).toBe("rest");
  feed("bend", 15);
  feed("rest", 15);
  expect(s.phase).toBe("practice");
  expect(s.exercise).toBe(1);
  expect(s.counts).toEqual([1, 0, 0]);
});
