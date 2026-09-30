import type { Reading } from "./movement";
import type { Session } from "./session";
export type Cue = "tick" | "start" | "target" | "count" | "pause";
export const tones: Record<Cue, readonly number[]> = {
  tick: [440],
  start: [440, 660, 880],
  target: [660],
  count: [660, 880],
  pause: [260, 220],
};
export class FeedbackCues {
  private returning = false;
  private lastPause = -Infinity;
  reset() {
    this.returning = false;
  }
  next(
    before: Session,
    after: Session,
    reading: Reading,
    now: number,
  ): Cue | null {
    const enteredTarget = reading.returning && !this.returning;
    this.returning = reading.returning;
    if (after.paused) {
      this.returning = false;
      if (
        !before.paused &&
        before.phase === "practice" &&
        now - this.lastPause >= 3000
      ) {
        this.lastPause = now;
        return "pause";
      }
      return null;
    }
    if (before.paused) {
      this.returning = false;
      return null;
    }
    if (after.phase === "practice" && before.phase !== "practice")
      return "start";
    if (
      before.phase === "practice" &&
      after.counts[before.exercise] > before.counts[before.exercise]
    )
      return "count";
    if (before.phase === "practice" && enteredTarget) return "target";
    if (
      after.phase === "ready" &&
      after.startHold > 0 &&
      (before.startHold === 0 ||
        Math.floor(before.startHold / 1000) !==
          Math.floor(after.startHold / 1000))
    )
      return "tick";
    return null;
  }
}

/** Audio failure must never interrupt camera processing. No recorded/network audio. */
export function playCue(context: AudioContext, cue: Cue): boolean {
  if (context.state !== "running") return false;
  try {
    tones[cue].forEach((frequency, i) => {
      const oscillator = context.createOscillator(),
        gain = context.createGain();
      const at = context.currentTime + i * 0.14;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.035, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.11);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(at);
      oscillator.stop(at + 0.12);
    });
    return true;
  } catch {
    return false;
  }
}
