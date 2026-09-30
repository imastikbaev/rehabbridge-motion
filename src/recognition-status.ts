import {
  fingers,
  type Reading,
  type Exercise,
  type Settings,
} from "./movement";
export function recognitionStatus(
  reading: Reading,
  exercise: Exercise,
  settings: Settings,
): string {
  const b = reading.body;
  if (!b) return "Измерение недоступно — сначала восстановите видимость руки.";
  if (exercise === "open") {
    const count = b.hand ? fingers(b.hand, b.aspect) : null;
    return count === null
      ? "Пальцы не различимы. Исчезновение кисти не считается возвратом."
      : `Видно раскрытых пальцев: ${count} из 4. Начало и возврат: 0–1; цель: 4.`;
  }
  if (exercise === "bend")
    return `Угол в изображении: ${Math.round(b.angle)}°. Цель сгибания: меньше ${settings.bendAngle}°. Начало и возврат: больше 145°, кисть ниже плеч (больше 0,65 ширины плеч). Локоть: ${b.elbow.x.toFixed(2)} при допустимом значении до 0,95; кисть не выше −0,15.`;
  return `Боковое положение кисти: ${b.wrist.x.toFixed(2)}. Цель: больше ${settings.reachDistance.toFixed(2)}; возврат: меньше 0,75 и ниже плеч. Локоть: ${b.elbow.x.toFixed(2)} (цель > 0,65), угол: ${Math.round(b.angle)}° (цель > 125°), высота кисти вниз от плеч: ${b.wrist.y.toFixed(2)} (не выше −0,15; возврат > 0,70). Единица — ширина плеч.`;
}
