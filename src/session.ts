import { exercises, type Exercise, type Reading } from "./movement";
export type Phase = "home" | "setup" | "ready" | "practice" | "rest" | "result";
export type Session = {
  phase: Phase;
  exercise: number;
  counts: number[];
  target: number;
  paused: boolean;
  recovery: number;
  setup: number;
  startHold: number;
  last: number | null;
  activeMs: number;
  message: string;
  completed: boolean;
};
export const initialSession = (target = 3): Session => ({
  phase: "home",
  exercise: 0,
  counts: [0, 0, 0],
  target,
  paused: false,
  recovery: 0,
  setup: 0,
  startHold: 0,
  last: null,
  activeMs: 0,
  message: "",
  completed: false,
});
export const currentExercise = (s: Session): Exercise =>
  s.phase === "ready" || s.phase === "rest" || s.phase === "result"
    ? "bend"
    : exercises[s.exercise];
// Preserve completed work in memory while requiring fresh tracking on reconnect.
export function suspendSession(s: Session): Session {
  return {
    ...s,
    paused: true,
    recovery: 0,
    setup: 0,
    startHold: 0,
    last: null,
  };
}
export function confirmSetup(
  s: Session,
  r: Reading,
  now: number,
  frameAt: number,
): Session {
  if (
    s.phase !== "setup" ||
    !r.valid ||
    !Number.isFinite(now) ||
    !Number.isFinite(frameAt) ||
    now < frameAt ||
    now - frameAt > 450
  )
    return s;
  return {
    ...suspendSession(s),
    phase: "ready",
    message: "Положение подтверждено. Можно начать кнопкой или жестом.",
  };
}
export function startSession(s: Session): Session {
  if (s.phase === "ready")
    return {
      ...s,
      phase: "practice",
      last: null,
      message: "Начните с исходного положения.",
    };
  if (s.phase === "rest")
    return {
      ...s,
      phase: "practice",
      exercise: s.exercise + 1,
      last: null,
      message: "Следующее задание. Начните с исходного положения.",
    };
  if (s.phase === "result")
    return { ...initialSession(s.target), phase: "ready" };
  return s;
}
export function step(
  s: Session,
  r: Reading,
  now: number,
  hidden = false,
): Session {
  if (s.phase === "home") return s;
  if (!Number.isFinite(now))
    return { ...s, paused: true, recovery: 0, startHold: 0, last: null };
  const delta = s.last === null ? 0 : now - s.last;
  let n = { ...s, last: now };
  if (!r.valid || hidden || delta > 450 || delta < 0)
    return { ...n, paused: true, recovery: 0, setup: 0, startHold: 0 };
  if (s.paused) {
    n.recovery += delta;
    if (n.recovery >= 800)
      n = {
        ...n,
        paused: false,
        recovery: 0,
        message: "Сигнал восстановлен. Начните движение заново.",
      };
    return n;
  }
  if (s.phase === "setup") {
    n.setup += delta;
    if (n.setup >= 1500)
      n = { ...n, phase: "ready", message: "Положение настроено." };
    return n;
  }
  if (s.phase === "ready") {
    n.startHold = r.zone === "rest" ? s.startHold + delta : 0;
    return n.startHold >= 3000 ? startSession(n) : n;
  }
  if (["rest", "result"].includes(s.phase) && r.event) return startSession(n);
  if (s.phase === "practice") {
    n.activeMs += delta;
    if (r.event) {
      n.counts = [...s.counts];
      n.counts[s.exercise]++;
      n.message = "Повтор завершён.";
      if (n.counts[s.exercise] >= s.target) {
        n.phase = s.exercise === 2 ? "result" : "rest";
        n.completed = s.exercise === 2;
        n.message =
          s.exercise === 2
            ? "Занятие завершено."
            : "Задание завершено. Отдохните столько, сколько нужно.";
      }
    }
  }
  return n;
}
