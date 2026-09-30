export type Point = { x: number; y: number; visibility?: number };
export type Frame = {
  pose: Point[];
  hands: Point[][];
  aspect: number;
  reason?: string;
  capturedAt?: number;
  processingMs?: number;
};
export type Side = "left" | "right";
export type Exercise = "bend" | "reach" | "open";
export const exercises: Exercise[] = ["bend", "reach", "open"];
export const titles: Record<Exercise, string> = {
  bend: "Сгибание локтя",
  reach: "Рука в сторону",
  open: "Раскрытие кисти",
};
export const descriptions: Record<Exercise, string> = {
  bend: "Согните локоть, затем вернитесь в исходное положение.",
  reach: "Отведите руку в сторону в заданном диапазоне, затем верните её.",
  open: "Раскройте пальцы, затем верните кисть в исходное положение.",
};
export type Settings = {
  side: Side;
  repetitions: number;
  bendAngle: number;
  reachDistance: number;
};
export const defaultSettings: Settings = {
  side: "right",
  repetitions: 3,
  bendAngle: 95,
  reachDistance: 0.9,
};
type Vec = { x: number; y: number };
export type Body = {
  shoulder: Vec;
  elbow: Vec;
  wrist: Vec;
  angle: number;
  hand: Point[] | null;
  aspect: number;
};
export type Observation = { body: Body | null; reason: string };
export function angle(a: Vec, b: Vec, c: Vec) {
  const u = { x: a.x - b.x, y: a.y - b.y },
    v = { x: c.x - b.x, y: c.y - b.y };
  const length = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
  return length < 1e-6
    ? NaN
    : (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / length))) *
        180) /
        Math.PI;
}
export function observe(frame: Frame, side: Side): Observation {
  const { pose: p, aspect } = frame;
  const arm = side === "left" ? [11, 13, 15] : [12, 14, 16];
  if (frame.reason) return { body: null, reason: frame.reason };
  if (p.length !== 33 || !Number.isFinite(aspect) || aspect <= 0)
    return { body: null, reason: "Покажите плечи и выбранную руку целиком." };
  const required = [11, 12, arm[1], arm[2]];
  const labels: Record<number, string> = {
    11: "левое плечо",
    12: "правое плечо",
    [arm[1]]: "локоть выбранной руки",
    [arm[2]]: "кисть выбранной руки",
  };
  const missing = required.filter(
    (i) =>
      !p[i] ||
      !Number.isFinite(p[i].x) ||
      !Number.isFinite(p[i].y) ||
      !Number.isFinite(p[i].visibility) ||
      (p[i].visibility ?? 0) < 0.6,
  );
  if (missing.length)
    return {
      body: null,
      reason: `Не различаю: ${missing.map((i) => labels[i]).join(", ")}. Покажите эти части в кадре, проверьте свет и перекрытия.`,
    };
  const cropped = required.filter(
    (i) => p[i].x < 0.02 || p[i].x > 0.98 || p[i].y < 0.02 || p[i].y > 0.98,
  );
  if (cropped.length)
    return {
      body: null,
      reason: `У края кадра: ${cropped.map((i) => labels[i]).join(", ")}. Отодвиньте или перенаправьте камеру.`,
    };
  const dx = (p[11].x - p[12].x) * aspect,
    dy = p[11].y - p[12].y,
    scale = Math.hypot(dx, dy);
  if (scale < 0.1 * aspect || scale > 0.65 * aspect)
    return {
      body: null,
      reason: "Сядьте лицом к камере так, чтобы оба плеча были видны.",
    };
  const ux = dx / scale,
    uy = dy / scale;
  let vx = -uy,
    vy = ux;
  if (vy < 0) {
    vx = -vx;
    vy = -vy;
  }
  const center = { x: (p[11].x + p[12].x) / 2, y: (p[11].y + p[12].y) / 2 };
  const local = (q: Point) => ({
    x:
      (((q.x - center.x) * aspect * ux + (q.y - center.y) * uy) / scale) *
      (side === "left" ? 1 : -1),
    y: ((q.x - center.x) * aspect * vx + (q.y - center.y) * vy) / scale,
  });
  const [shoulder, elbow, wrist] = arm.map((i) => local(p[i]));
  const elbowAngle = angle(shoulder, elbow, wrist);
  if (!Number.isFinite(elbowAngle))
    return {
      body: null,
      reason:
        "Не удаётся различить плечо, локоть и кисть. Измените положение камеры.",
    };
  // Match by wrist geometry in the original image; do not trust mirrored handedness labels.
  const candidates = frame.hands
    .filter(
      (h) =>
        h.length === 21 &&
        h.every(
          (q) =>
            Number.isFinite(q.x) &&
            Number.isFinite(q.y) &&
            q.x >= 0.01 &&
            q.x <= 0.99 &&
            q.y >= 0.01 &&
            q.y <= 0.99,
        ),
    )
    .map((hand) => ({
      hand,
      d:
        Math.hypot(
          (hand[0].x - p[arm[2]].x) * aspect,
          hand[0].y - p[arm[2]].y,
        ) / scale,
    }))
    .sort((a, b) => a.d - b.d);
  const nearest = candidates[0];
  const hand =
    nearest &&
    nearest.d < 0.4 &&
    (!candidates[1] || candidates[1].d - nearest.d > 0.1)
      ? nearest.hand
      : null;
  return {
    body: { shoulder, elbow, wrist, angle: elbowAngle, hand, aspect },
    reason: "",
  };
}
export function fingers(hand: Point[], aspect: number): number | null {
  if (
    hand.length !== 21 ||
    !Number.isFinite(aspect) ||
    aspect <= 0 ||
    hand.some((q) => !q || !Number.isFinite(q.x) || !Number.isFinite(q.y))
  )
    return null;
  const p = hand.map((q) => ({ x: q.x * aspect, y: q.y }));
  const size = Math.hypot(p[0].x - p[9].x, p[0].y - p[9].y);
  if (size < 0.015) return null;
  let count = 0;
  for (const base of [5, 9, 13, 17]) {
    const a = angle(p[base], p[base + 1], p[base + 2]),
      b = angle(p[base + 1], p[base + 2], p[base + 3]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const tip = Math.hypot(p[base + 3].x - p[0].x, p[base + 3].y - p[0].y),
      knuckle = Math.hypot(p[base].x - p[0].x, p[base].y - p[0].y);
    if (a > 150 && b > 145 && tip > knuckle * 1.3) count++;
  }
  return count;
}
export type Zone = "rest" | "middle" | "active" | "unknown";
export type Reading = {
  valid: boolean;
  zone: Zone;
  hint: string;
  hold: number;
  event: boolean;
  returning: boolean;
  cycle: "rest" | "move" | "hold" | "return";
  body: Body | null;
};
export const emptyReading = (
  hint = "Включите камеру, чтобы настроить положение.",
): Reading => ({
  valid: false,
  zone: "unknown",
  hint,
  hold: 0,
  event: false,
  returning: false,
  cycle: "rest",
  body: null,
});
export function classify(
  body: Body,
  exercise: Exercise,
  settings: Settings,
  latched = false,
): { zone: Zone; hint: string } {
  const { wrist: w, elbow: e } = body;
  if (exercise === "open") {
    if (!body.hand)
      return {
        zone: "unknown",
        hint: "Кисть не различима. Поверните ладонь к камере и держите пальцы в кадре.",
      };
    const count = fingers(body.hand, body.aspect);
    if (count === null)
      return {
        zone: "unknown",
        hint: "Кисть слишком мала в кадре или перекрыта. Приблизьте камеру к кисти.",
      };
    return count >= (latched ? 3 : 4)
      ? { zone: "active", hint: "Пальцы раскрыты." }
      : count <= 1
        ? { zone: "rest", hint: "Исходное положение кисти найдено." }
        : {
            zone: "middle",
            hint: `Вижу ${count} раскрытых пальца из 4. Продолжайте только в назначенном диапазоне.`,
          };
  }
  if (w.y < -0.15)
    return {
      zone: "middle",
      hint: "Кисть выше зоны этого задания. Вернитесь в согласованное исходное положение.",
    };
  if (exercise === "bend") {
    if (e.x > 0.95)
      return {
        zone: "middle",
        hint: "Локоть ушёл в сторону. Верните его ближе к корпусу для этого задания.",
      };
    if (body.angle < settings.bendAngle + (latched ? 12 : 0))
      return { zone: "active", hint: "Заданное сгибание достигнуто." };
    if (body.angle > 145 && w.y > 0.65)
      return { zone: "rest", hint: "Исходное положение найдено." };
    return {
      zone: "middle",
      hint: "Сгибание пока не достигло заданной отметки. Не выходите за назначенный диапазон.",
    };
  }
  // Returning to rest wins over the relaxed active exit threshold.
  // At reachDistance=.8 the hysteresis boundary (.68) overlaps rest (<.75).
  if (w.x < 0.75 && w.y > 0.7)
    return { zone: "rest", hint: "Рука в исходном положении." };
  if (
    w.x > settings.reachDistance + (latched ? -0.12 : 0) &&
    e.x > 0.65 &&
    body.angle > 125 &&
    w.y >= -0.15
  )
    return { zone: "active", hint: "Боковая отметка достигнута." };

  if (body.angle <= 125)
    return {
      zone: "middle",
      hint: "Для боковой цели локоть сейчас согнут. Следуйте заданному движению, не увеличивая усилие.",
    };
  if (e.x <= 0.65)
    return {
      zone: "middle",
      hint: "Кисть сместилась, но локоть остаётся у корпуса. Для этого задания камера ожидает отведение всей руки в согласованном диапазоне.",
    };
  return {
    zone: "middle",
    hint: "Кисть ещё не достигла боковой отметки. Если она вне вашего диапазона, остановите задание и измените настройку со специалистом.",
  };
}
// A repetition is rest -> sustained endpoint -> sustained return. Missing tracking discards it.
export class MovementTracker {
  private last = -Infinity;
  private key = "";
  private smooth: Body | null = null;
  private armed = false;
  private reached = false;
  private restAt: number | null = null;
  private activeAt: number | null = null;
  private cooldown = 0;
  private restSamples = 0;
  private activeSamples = 0;
  reset() {
    this.last = -Infinity;
    this.smooth = null;
    this.armed = false;
    this.reached = false;
    this.restAt = null;
    this.activeAt = null;
    this.cooldown = 0;
    this.restSamples = 0;
    this.activeSamples = 0;
  }
  update(
    frame: Frame,
    exercise: Exercise,
    settings: Settings,
    now: number,
  ): Reading {
    if (!Number.isFinite(now)) {
      this.reset();
      return emptyReading(
        "Нет корректного времени кадра. Повторите движение после восстановления камеры.",
      );
    }
    const key = JSON.stringify([exercise, settings]);
    if (key !== this.key) {
      this.reset();
      this.key = key;
    }
    const gap = now - this.last;
    if (gap > 450 || gap < 0) this.reset();
    this.last = now;
    const o = observe(frame, settings.side);
    if (!o.body) {
      this.reset();
      return emptyReading(o.reason);
    }
    const raw = o.body,
      alpha = 1 - Math.exp(-Math.min(gap, 250) / 100);
    const blend = (a: Vec, b: Vec) => ({
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
    });
    let b = raw;
    if (this.smooth) {
      const shoulder = blend(this.smooth.shoulder, raw.shoulder),
        elbow = blend(this.smooth.elbow, raw.elbow),
        wrist = blend(this.smooth.wrist, raw.wrist);
      b = {
        ...raw,
        shoulder,
        elbow,
        wrist,
        angle: angle(shoulder, elbow, wrist),
      };
    }
    if (!Number.isFinite(b.angle)) {
      this.reset();
      return emptyReading(
        "Положение руки резко изменилось. Начните повтор заново после восстановления сигнала.",
      );
    }
    this.smooth = b;
    const c = classify(
      b,
      exercise,
      settings,
      this.activeAt !== null || this.reached,
    );
    if (c.zone === "unknown") {
      this.reset();
      return { ...emptyReading(c.hint), body: b };
    }
    let event = false,
      hold = 0;
    if (c.zone === "rest") {
      this.activeAt = null;
      this.activeSamples = 0;
      this.restSamples++;
      this.restAt ??= now;
      hold = Math.min(1, (now - this.restAt) / 350, this.restSamples / 3);
      if (hold === 1 && this.restSamples >= 3) {
        if (this.reached && now >= this.cooldown) {
          event = true;
          this.reached = false;
          this.armed = true;
          this.cooldown = now + 600;
        } else if (now >= this.cooldown) this.armed = true;
      }
    } else {
      this.restAt = null;
      this.restSamples = 0;
      if (c.zone === "active" && this.armed) {
        this.activeAt ??= now;
        this.activeSamples++;
        hold = Math.min(1, (now - this.activeAt) / 500, this.activeSamples / 3);
        if (hold === 1 && this.activeSamples >= 3) this.reached = true;
      } else if (!this.reached) {
        this.activeAt = null;
        this.activeSamples = 0;
      }
    }
    const cycle = this.reached
      ? "return"
      : !this.armed
        ? "rest"
        : c.zone === "active"
          ? "hold"
          : "move";
    const hint = event
      ? "Повтор завершён. Можно отдохнуть."
      : this.reached && c.zone === "rest"
        ? "Возврат найден. Задержитесь на 0,35 секунды для зачёта."
        : this.reached
          ? exercise === "open"
            ? "Раскрытие достигнуто. Верните пальцы в исходное согнутое положение, не убирая кисть из кадра."
            : exercise === "bend"
              ? "Сгибание достигнуто. Вернитесь к исходному положению локтя; задержитесь на 0,35 секунды."
              : "Боковая отметка достигнута. Верните кисть ближе к корпусу и ниже плеч; задержитесь на 0,35 секунды."
          : !this.armed
            ? exercise === "open"
              ? "Сначала покажите согнутые пальцы в кадре и задержитесь на 0,35 секунды. Не прячьте кисть."
              : exercise === "bend"
                ? "Сначала покажите исходную руку: локоть более разогнут, кисть ниже плеч. Задержитесь на 0,35 секунды."
                : "Сначала верните кисть к корпусу, ниже плеч, и задержитесь на 0,35 секунды."
            : c.zone === "active"
              ? "Задержитесь у отметки на полсекунды."
              : c.hint;
    return {
      valid: true,
      zone: c.zone,
      hint,
      hold,
      event,
      returning: this.reached,
      cycle,
      body: b,
    };
  }
}
