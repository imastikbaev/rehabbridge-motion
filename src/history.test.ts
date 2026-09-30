import { it, expect, vi, afterEach } from "vitest";
import { readHistory, saveResult } from "./history";
afterEach(() => vi.unstubAllGlobals());
it("strips personal fields and rejects invalid result shapes", () => {
  vi.stubGlobal("localStorage", {
    getItem: () =>
      JSON.stringify([
        { counts: [1, 1, 1], target: 1, activeSeconds: 30, name: "omit" },
        null,
        { counts: [9], target: 1, activeSeconds: 0 },
      ]),
  });
  expect(readHistory()).toEqual([
    { counts: [1, 1, 1], target: 1, activeSeconds: 30 },
  ]);
});
it("handles unavailable storage", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw Error();
    },
    setItem: () => {
      throw Error();
    },
  });
  expect(readHistory()).toEqual([]);
  expect(saveResult({ counts: [1, 1, 1], target: 1, activeSeconds: 10 })).toBe(
    false,
  );
});
it("keeps only ten anonymous aggregates", () => {
  let value = "[]";
  vi.stubGlobal("localStorage", {
    getItem: () => value,
    setItem: (_: string, v: string) => (value = v),
  });
  for (let i = 0; i < 15; i++)
    saveResult({ counts: [1, 1, 1], target: 1, activeSeconds: i });
  expect(readHistory()).toHaveLength(10);
});
it("whitelists fields before writing a result", () => {
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { getItem: () => "[]", setItem });
  const result = {
    counts: [1, 1, 1],
    target: 1,
    activeSeconds: 15,
    name: "must not persist",
    landmarks: [1, 2, 3],
  };
  expect(saveResult(result)).toBe(true);
  expect(JSON.parse(setItem.mock.calls[0][1])).toEqual([
    { counts: [1, 1, 1], target: 1, activeSeconds: 15 },
  ]);
});
