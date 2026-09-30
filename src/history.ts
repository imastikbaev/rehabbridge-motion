export type Result = {
  counts: number[];
  target: number;
  activeSeconds: number;
};
export const historyKey = "rehabbridge.motion.sessions.v1";
function valid(v: unknown): v is Result {
  if (!v || typeof v !== "object") return false;
  const r = v as Result;
  return (
    Array.isArray(r.counts) &&
    r.counts.length === 3 &&
    r.counts.every((n) => Number.isInteger(n) && n >= 0 && n <= 10) &&
    Number.isInteger(r.target) &&
    r.target >= 1 &&
    r.target <= 10 &&
    r.counts.every((n) => n <= r.target) &&
    Number.isInteger(r.activeSeconds) &&
    r.activeSeconds >= 0 &&
    r.activeSeconds <= 86400
  );
}
export function readHistory(): Result[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(historyKey) || "[]");
    return Array.isArray(data)
      ? data
          .filter(valid)
          .slice(0, 10)
          .map(({ counts, target, activeSeconds }) => ({
            counts: [...counts],
            target,
            activeSeconds,
          }))
      : [];
  } catch {
    return [];
  }
}
export function saveResult(result: Result) {
  if (!valid(result)) return false;
  try {
    const { counts, target, activeSeconds } = result;
    localStorage.setItem(
      historyKey,
      JSON.stringify(
        [
          { counts: [...counts], target, activeSeconds },
          ...readHistory(),
        ].slice(0, 10),
      ),
    );
    return true;
  } catch {
    return false;
  }
}
export function clearHistory() {
  try {
    localStorage.removeItem(historyKey);
    return true;
  } catch {
    return false;
  }
}
