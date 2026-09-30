import { it, expect } from "vitest";
import { FeedbackCues, playCue } from "./audio-feedback";
import { initialSession } from "./session";
import { emptyReading } from "./movement";
const reading = { ...emptyReading(), valid: true };
const practice = { ...initialSession(), phase: "practice" as const };
it("signals target once and only signals a count accepted by the session", () => {
  const cues = new FeedbackCues();
  expect(
    cues.next(practice, practice, { ...reading, returning: true }, 0),
  ).toBe("target");
  expect(
    cues.next(practice, practice, { ...reading, returning: true }, 80),
  ).toBeNull();
  expect(
    cues.next(practice, practice, { ...reading, event: true }, 160),
  ).toBeNull();
  expect(
    cues.next(practice, { ...practice, counts: [1, 0, 0] }, reading, 240),
  ).toBe("count");
});
it("does not repeat a pause alarm on each missing frame or brief recovery", () => {
  const cues = new FeedbackCues(),
    paused = { ...practice, paused: true };
  expect(cues.next(practice, paused, emptyReading(), 0)).toBe("pause");
  expect(cues.next(paused, paused, emptyReading(), 80)).toBeNull();
  cues.reset();
  expect(cues.next(practice, paused, emptyReading(), 1000)).toBeNull();
  expect(cues.next(practice, paused, emptyReading(), 4000)).toBe("pause");
});
it("ticks only on countdown boundaries and distinguishes start", () => {
  const cues = new FeedbackCues(),
    ready = { ...initialSession(), phase: "ready" as const };
  expect(cues.next(ready, { ...ready, startHold: 80 }, reading, 80)).toBe(
    "tick",
  );
  expect(
    cues.next(
      { ...ready, startHold: 80 },
      { ...ready, startHold: 160 },
      reading,
      160,
    ),
  ).toBeNull();
  expect(
    cues.next(
      { ...ready, startHold: 960 },
      { ...ready, startHold: 1040 },
      reading,
      1040,
    ),
  ).toBe("tick");
  expect(cues.next(ready, practice, reading, 3000)).toBe("start");
});
it("never throws an audio error into camera processing", () => {
  expect(playCue({ state: "suspended" } as AudioContext, "count")).toBe(false);
  expect(
    playCue(
      {
        state: "running",
        createOscillator() {
          throw Error("no audio");
        },
      } as unknown as AudioContext,
      "count",
    ),
  ).toBe(false);
});
