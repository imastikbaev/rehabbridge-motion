import type { Frame } from "./movement";

/** Never feed delayed geometry to the counter as if it were a fresh observation. */
export function freshFrame(frame: Frame, receivedAt: number): Frame {
  if (frame.capturedAt === undefined) return frame;
  const age = receivedAt - frame.capturedAt;
  if (!Number.isFinite(age) || age < 0 || age > 450) {
    return {
      ...frame,
      pose: [],
      hands: [],
      reason:
        "Обработка камеры запаздывает. Счёт на паузе. Закройте другие вкладки или попробуйте другое устройство.",
    };
  }
  return frame;
}

export class FrameHealth {
  private last: number | null = null;
  private intervals: number[] = [];
  private costs: number[] = [];
  reset() {
    this.last = null;
    this.intervals = [];
    this.costs = [];
  }
  update(frame: Frame, receivedAt: number) {
    const capture = frame.capturedAt ?? receivedAt;
    if (this.last !== null) {
      const gap = capture - this.last;
      if (gap > 0 && gap <= 1000)
        this.intervals = [...this.intervals.slice(-19), gap];
      else this.intervals = [];
    }
    this.last = capture;
    const cost = frame.processingMs;
    if (cost !== undefined && Number.isFinite(cost) && cost >= 0)
      this.costs = [...this.costs.slice(-19), cost];
    const average = (values: number[]) =>
      values.reduce((sum, n) => sum + n, 0) / values.length;
    return {
      fps:
        this.intervals.length >= 3
          ? Math.round(1000 / average(this.intervals))
          : null,
      ms: this.costs.length ? Math.round(average(this.costs)) : null,
      delayed:
        frame.capturedAt !== undefined && receivedAt - frame.capturedAt > 450,
    };
  }
}
