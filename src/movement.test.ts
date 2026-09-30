import { it, expect } from "vitest";
import { fixture } from "./fixtures";
import {
  observe,
  classify,
  defaultSettings,
  MovementTracker,
  fingers,
  type Exercise,
} from "./movement";
it.each(["left", "right"] as const)(
  "normalizes selected %s arm without requiring the other hand",
  (side) => {
    const f = fixture("bend", side);
    f.pose[side === "left" ? 16 : 15].visibility = 0;
    expect(observe(f, side).body).not.toBeNull();
  },
);
it.each(["bend", "reach", "open"] as Exercise[])(
  "%s has a distinct endpoint",
  (exercise) => {
    const b = observe(fixture(exercise), "right").body!;
    expect(classify(b, exercise, defaultSettings).zone).toBe("active");
    for (const other of ["bend", "reach", "open"] as Exercise[])
      if (other !== exercise)
        expect(classify(b, other, defaultSettings).zone).not.toBe("active");
  },
);
it("is invariant to reflection and scaled translation", () => {
  const f = fixture("reach");
  f.pose = f.pose.map((p) => ({
    ...p,
    x: 1 - (p.x * 0.8 + 0.1),
    y: p.y * 0.8 + 0.1,
  }));
  f.hands = [];
  expect(
    classify(observe(f, "right").body!, "reach", defaultSettings).zone,
  ).toBe("active");
});
it("rejects missing landmarks and offscreen wrists", () => {
  expect(observe(fixture("lost"), "right").body).toBeNull();
  expect(observe(fixture("cropped"), "right").body).toBeNull();
  const f = fixture("rest");
  f.pose[16].x = NaN;
  expect(observe(f, "right").body).toBeNull();
});
it("finger counting uses four fingers and geometric wrist matching", () => {
  const f = fixture("open");
  expect(fingers(f.hands[0], 1)).toBe(4);
  f.hands = f.hands.map((h) => h.map((p) => ({ ...p, x: p.x + 0.4 })));
  expect(observe(f, "right").body!.hand).toBeNull();
});
it.each(["bend", "reach", "open"] as Exercise[])(
  "counts %s only after sustained endpoint and return",
  (exercise) => {
    const t = new MovementTracker();
    let now = 0,
      events = 0;
    const feed = (kind: Parameters<typeof fixture>[0], ms: number) => {
      for (let i = 0; i < ms; i += 80) {
        now += 80;
        if (t.update(fixture(kind), exercise, defaultSettings, now).event)
          events++;
      }
    };
    feed(exercise, 1200);
    expect(events).toBe(0);
    feed("rest", 1000);
    feed(exercise, 1500);
    expect(events).toBe(0);
    feed("rest", 1000);
    expect(events).toBe(1);
    feed("rest", 1200);
    expect(events).toBe(1);
  },
);
it("losing tracking discards pending repetition", () => {
  const t = new MovementTracker();
  let n = 0;
  for (const [kind, frames] of [
    ["rest", 15],
    ["bend", 15],
    ["lost", 1],
    ["rest", 15],
  ] as const)
    for (let i = 0; i < frames; i++)
      expect(
        t.update(fixture(kind), "bend", defaultSettings, (n += 80)).event,
      ).toBe(false);
});
it("partial endpoint gives a concrete hint after rest", () => {
  const t = new MovementTracker();
  let n = 0;
  for (let i = 0; i < 15; i++)
    t.update(fixture("rest"), "bend", defaultSettings, (n += 80));
  let r;
  for (let i = 0; i < 15; i++)
    r = t.update(fixture("partial"), "bend", defaultSettings, (n += 80));
  expect(r!.hint).toContain("отметки");
});
it("rejects nonfinite visibility and timestamps without completing a repetition", () => {
  const f = fixture("bend");
  f.pose[16].visibility = NaN;
  expect(observe(f, "right").body).toBeNull();
  const t = new MovementTracker();
  expect(t.update(fixture("rest"), "bend", defaultSettings, NaN).valid).toBe(
    false,
  );
});
it("a long frame gap cannot finish a pending repetition", () => {
  const t = new MovementTracker();
  let now = 0;
  for (const kind of ["rest", "bend"] as const)
    for (let i = 0; i < 20; i++)
      t.update(fixture(kind), "bend", defaultSettings, (now += 80));
  now += 2000;
  for (let i = 0; i < 20; i++)
    expect(
      t.update(fixture("rest"), "bend", defaultSettings, (now += 80)).event,
    ).toBe(false);
});
it("accepts a side reach at shoulder height rather than excluding y=0", () => {
  const b = observe(fixture("reach"), "right").body!;
  b.wrist.y = 0;
  b.elbow.y = 0;
  b.angle = 175;
  expect(classify(b, "reach", defaultSettings).zone).toBe("active");
});
it("counts consecutive cycles without an extra hidden rest delay", () => {
  const tracker = new MovementTracker();
  let now = 0,
    count = 0;
  const feed = (kind: "rest" | "bend", frames: number) => {
    for (let i = 0; i < frames; i++) {
      const r = tracker.update(
        fixture(kind),
        "bend",
        defaultSettings,
        (now += 80),
      );
      if (r.event) count++;
    }
  };
  feed("rest", 15);
  feed("bend", 16);
  feed("rest", 8);
  expect(count).toBe(1);
  feed("bend", 16);
  feed("rest", 8);
  expect(count).toBe(2);
});
it("still cannot double count a held endpoint or held return", () => {
  const tracker = new MovementTracker();
  let now = 0,
    count = 0;
  for (const kind of ["rest", "bend", "rest"] as const)
    for (let i = 0; i < 60; i++)
      if (
        tracker.update(fixture(kind), "bend", defaultSettings, (now += 80))
          .event
      )
        count++;
  expect(count).toBe(1);
});
it("return zone wins over the relaxed side target threshold", () => {
  const b = observe(fixture("reach"), "right").body!;
  b.wrist = { x: 0.72, y: 0.8 };
  b.elbow = { x: 0.68, y: 0.4 };
  b.angle = 155;
  expect(
    classify(b, "reach", { ...defaultSettings, reachDistance: 0.8 }, true).zone,
  ).toBe("rest");
});
it.each(["left", "right"] as const)(
  "counts a repeated noisy cycle for the %s arm",
  (side) => {
    const t = new MovementTracker();
    let now = 0,
      events = 0,
      index = 0;
    for (const kind of ["rest", "bend", "rest", "bend", "rest"] as const) {
      for (let i = 0; i < 22; i++) {
        const f = fixture(kind, side);
        f.pose = f.pose.map((p, j) => ({
          ...p,
          x: p.x + Math.sin(index + j) * 0.0015,
          y: p.y + Math.cos(index + j) * 0.0015,
        }));
        index++;
        if (
          t.update(f, "bend", { ...defaultSettings, side }, (now += 100)).event
        )
          events++;
      }
    }
    expect(events).toBe(2);
  },
);
it("a single lost hand frame discards the open-hand cycle", () => {
  const t = new MovementTracker();
  let now = 0;
  for (const kind of ["rest", "open"] as const)
    for (let i = 0; i < 20; i++)
      t.update(fixture(kind), "open", defaultSettings, (now += 80));
  const missing = fixture("rest");
  missing.hands = [];
  expect(t.update(missing, "open", defaultSettings, (now += 80)).valid).toBe(
    false,
  );
  for (let i = 0; i < 20; i++)
    expect(
      t.update(fixture("rest"), "open", defaultSettings, (now += 80)).event,
    ).toBe(false);
});

it.each(["bend", "reach", "open"] as Exercise[])(
  "%s confirms return detection before the count changes",
  (exercise) => {
    const tracker = new MovementTracker();
    let now = 0;
    for (const kind of ["rest", exercise] as const) {
      for (let n = 0; n < 20; n++) {
        tracker.update(fixture(kind), exercise, defaultSettings, (now += 80));
      }
    }
    let sawReturn = false;
    let counted = false;
    for (let n = 0; n < 20; n++) {
      const reading = tracker.update(
        fixture("rest"),
        exercise,
        defaultSettings,
        (now += 80),
      );
      if (reading.returning && reading.zone === "rest") {
        expect(reading.hint).toContain("Возврат найден");
        expect(reading.event).toBe(false);
        sawReturn = true;
      }
      if (reading.event) {
        expect(sawReturn).toBe(true);
        counted = true;
        break;
      }
    }
    expect(counted).toBe(true);
  },
);
it("malformed hands cannot be interpreted as closed fingers", () => {
  expect(fingers([], 1)).toBeNull();
  expect(fingers(fixture("open").hands[0], NaN)).toBeNull();
  const hand = fixture("open").hands[0];
  hand[8].x = NaN;
  expect(fingers(hand, 1)).toBeNull();
});
it("two widely separated rest frames cannot arm a repetition", () => {
  const tracker = new MovementTracker();
  tracker.update(fixture("rest"), "bend", defaultSettings, 0);
  const r = tracker.update(fixture("rest"), "bend", defaultSettings, 400);
  expect(r.cycle).toBe("rest");
  expect(r.hold).toBeLessThan(1);
  let event = false;
  for (const [kind, start] of [
    ["bend", 480],
    ["rest", 2000],
  ] as const) {
    for (let i = 0; i < 15; i++)
      event ||= tracker.update(
        fixture(kind),
        "bend",
        defaultSettings,
        start + i * 80,
      ).event;
  }
  expect(event).toBe(false);
});
it("side movement explains the actual blocking condition", () => {
  const body = observe(fixture("reach"), "right").body!;
  body.wrist.y = 1.2;
  expect(classify(body, "reach", defaultSettings).zone).toBe("active");
  body.wrist.y = 0.6;
  body.elbow.x = 0.5;
  expect(classify(body, "reach", defaultSettings).hint).toContain(
    "локоть остаётся",
  );
});
it.each(["left", "right"] as const)(
  "accepts a low outward %s arm once the configured side target is reached",
  (side) => {
    const f = fixture("rest", side);
    const direction = side === "left" ? 1 : -1;
    const a = (20 * Math.PI) / 180;
    for (const [index, length] of [
      [side === "left" ? 13 : 14, 0.8],
      [side === "left" ? 15 : 16, 1.6],
    ]) {
      f.pose[index] = {
        x: 0.5 + direction * (0.5 + length * Math.sin(a)) * 0.2,
        y: 0.35 + length * Math.cos(a) * 0.2,
        visibility: 0.99,
      };
    }
    const body = observe(f, side).body!;
    expect(body.wrist.x).toBeGreaterThan(defaultSettings.reachDistance);
    expect(body.angle).toBeGreaterThan(170);
    expect(classify(body, "reach", { ...defaultSettings, side }).zone).toBe(
      "active",
    );
    const tracker = new MovementTracker();
    let now = 0,
      events = 0;
    for (const frame of [fixture("rest", side), f, fixture("rest", side)]) {
      for (let i = 0; i < 20; i++) {
        if (
          tracker.update(
            frame,
            "reach",
            { ...defaultSettings, side },
            (now += 80),
          ).event
        )
          events++;
      }
    }
    expect(events).toBe(1);
  },
);
it.each(["left", "right"] as const)(
  "names exactly which %s arm landmark is missing",
  (side) => {
    const f = fixture("rest", side);
    f.pose[side === "left" ? 13 : 14].visibility = 0.2;
    const o = observe(f, side);
    expect(o.body).toBeNull();
    expect(o.reason).toContain("локоть выбранной руки");
    expect(o.reason).not.toContain("кисть выбранной руки");
  },
);
