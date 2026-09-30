// Synthetic geometry for tests. No patient data or recorded video.
import type { Frame, Side, Point } from "./movement";
export type Fixture =
  | "rest"
  | "bend"
  | "reach"
  | "open"
  | "partial"
  | "cropped"
  | "lost";
export function fixture(kind: Fixture, side: Side = "right"): Frame {
  if (kind === "lost") return { pose: [], hands: [], aspect: 1 };
  const pose: Point[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0.99,
  }));
  pose[11] = { x: 0.6, y: 0.35, visibility: 0.99 };
  pose[12] = { x: 0.4, y: 0.35, visibility: 0.99 };
  pose[13] = { x: 0.6, y: 0.51, visibility: 0.99 };
  pose[14] = { x: 0.4, y: 0.51, visibility: 0.99 };
  pose[15] = { x: 0.62, y: 0.67, visibility: 0.99 };
  pose[16] = { x: 0.38, y: 0.67, visibility: 0.99 };
  const local = (x: number, y: number): Point => ({
    x: 0.5 + (side === "left" ? 1 : -1) * x * 0.2,
    y: 0.35 + y * 0.2,
    visibility: 0.99,
  });
  const [elbow, wrist] = side === "left" ? [13, 15] : [14, 16];
  const coords: Record<Exclude<Fixture, "lost">, number[]> = {
    rest: [0.5, 0.8, 0.6, 1.6],
    bend: [0.5, 0.95, 0.65, 0.5],
    reach: [1.1, 0.4, 1.6, 0.8],
    open: [0.5, 0.8, 0.6, 1.6],
    partial: [0.5, 0.8, 0.9, 1.1],
    cropped: [0.5, 0.8, 3, 0.8],
  };
  const [ex, ey, wx, wy] = coords[kind];
  pose[elbow] = local(ex, ey);
  pose[wrist] = local(wx, wy);
  const w = pose[wrist],
    hand: Point[] = Array.from({ length: 21 }, () => ({
      x: w.x,
      y: w.y - 0.01,
    }));
  hand[0] = { ...w };
  hand[1] = { x: w.x + 0.025, y: w.y - 0.025 };
  hand[2] = { x: w.x + 0.04, y: w.y - 0.04 };
  hand[3] = { x: w.x + 0.06, y: w.y - 0.05 };
  hand[4] = { x: w.x + 0.075, y: w.y - 0.06 };
  [5, 9, 13, 17].forEach((base, i) => {
    const x = w.x + (i - 1.5) * 0.025;
    hand[base] = { x, y: w.y - 0.07 };
    hand[base + 1] = { x, y: w.y - 0.105 };
    hand[base + 2] = {
      x: x + (kind === "open" ? 0 : 0.012),
      y: w.y - (kind === "open" ? 0.135 : 0.085),
    };
    hand[base + 3] = {
      x: x + (kind === "open" ? 0 : 0.008),
      y: w.y - (kind === "open" ? 0.165 : 0.055),
    };
  });
  return { pose, hands: [hand], aspect: 1 };
}
