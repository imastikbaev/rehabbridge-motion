import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { recognitionStatus } from "./recognition-status";
import { FrameHealth, freshFrame } from "./frame-health";
import { FeedbackCues, playCue } from "./audio-feedback";
import { Camera } from "./camera";
import {
  MovementTracker,
  defaultSettings,
  emptyReading,
  exercises,
  titles,
  descriptions,
  type Frame,
  type Settings,
} from "./movement";
import {
  initialSession,
  currentExercise,
  startSession,
  confirmSetup,
  suspendSession,
  step,
  type Session,
} from "./session";
import { readHistory, saveResult, clearHistory } from "./history";
import { fixture, type Fixture } from "./fixtures";
import { ExerciseGuide } from "./ExerciseGuide";
import { Illustration } from "./Illustration";
import "./style.css";
const lab =
  import.meta.env.DEV && new URLSearchParams(location.search).has("lab");
function App() {
  const [settings, setSettings] = useState<Settings>(defaultSettings),
    settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [session, setSession] = useState(initialSession),
    state = useRef(session);
  const [reading, setReading] = useState(emptyReading);
  const [status, setStatus] = useState<"off" | "loading" | "on">("off"),
    [error, setError] = useState(""),
    [loadingStage, setLoadingStage] = useState("Подготавливаем камеру…"),
    [history, setHistory] = useState(readHistory),
    [note, setNote] = useState(""),
    [sound, setSound] = useState(false),
    [manualPause, setManualPause] = useState(false),
    [showExample, setShowExample] = useState(false);
  const health = useRef(new FrameHealth());
  const [performanceInfo, setPerformanceInfo] = useState<
    ReturnType<FrameHealth["update"]>
  >({ fps: null, ms: null, delayed: false });
  const cues = useRef(new FeedbackCues());
  const attempt = useRef(0);
  const errorNotice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorNotice.current?.focus();
  }, [error]);
  const paused = useRef(false),
    video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    camera = useRef(new Camera()),
    tracker = useRef(new MovementTracker()),
    fresh = useRef(0),
    confirmed = useRef({ until: 0, count: 0 }),
    synthetic = useRef<Fixture>("rest"),
    audio = useRef<AudioContext | null>(null),
    soundRef = useRef(false);
  const update = (s: Session) => {
    state.current = s;
    setSession(s);
  };
  const reset = () => {
    setShowExample(false);
    tracker.current.reset();
    cues.current.reset();
    health.current.reset();
    setPerformanceInfo({ fps: null, ms: null, delayed: false });
    confirmed.current = { until: 0, count: 0 };
    setReading(emptyReading());
  };
  function draw(f: Frame) {
    const c = canvas.current,
      v = video.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = lab ? 720 : v?.videoWidth || 720,
      h = lab ? 720 : v?.videoHeight || 540;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#7ff0bc";
    ctx.lineWidth = 4;
    const arm =
      settingsRef.current.side === "left" ? [11, 13, 15] : [12, 14, 16];
    for (const [a, b] of [
      [11, 12],
      [arm[0], arm[1]],
      [arm[1], arm[2]],
    ]) {
      const p = f.pose[a],
        q = f.pose[b];
      if (!p || !q || (p.visibility ?? 0) < 0.6 || (q.visibility ?? 0) < 0.6)
        continue;
      ctx.beginPath();
      ctx.moveTo(p.x * w, p.y * h);
      ctx.lineTo(q.x * w, q.y * h);
      ctx.stroke();
    }
    for (const hand of f.hands.filter(
      (h) =>
        h.length === 21 &&
        h.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    ))
      for (const base of [1, 5, 9, 13, 17]) {
        ctx.beginPath();
        ctx.moveTo(hand[0].x * w, hand[0].y * h);
        for (let i = base; i < base + 4; i++)
          ctx.lineTo(hand[i].x * w, hand[i].y * h);
        ctx.stroke();
      }
  }
  function frame(input: Frame) {
    const receivedAt = performance.now();
    const f = freshFrame(input, receivedAt);
    fresh.current =
      input.capturedAt !== undefined && Number.isFinite(input.capturedAt)
        ? Math.min(receivedAt, input.capturedAt)
        : receivedAt;
    setPerformanceInfo(health.current.update(input, receivedAt));
    draw(f);
    if (paused.current || document.hidden) return;
    const before = state.current,
      r = tracker.current.update(
        f,
        currentExercise(before),
        settingsRef.current,
        fresh.current,
      );
    setReading(r);
    const after = step(before, r, fresh.current);
    if (before.phase !== after.phase || (before.paused && !after.paused)) {
      const automaticStart =
        before.phase === "ready" &&
        after.phase === "practice" &&
        after.startHold >= 3000;
      // The countdown already confirmed this same exercise's starting pose.
      if (!automaticStart) tracker.current.reset();
      setShowExample(false);
    }
    update(after);
    if (
      before.phase === "practice" &&
      after.counts[before.exercise] > before.counts[before.exercise]
    ) {
      confirmed.current = {
        until: performance.now() + 1600,
        count: after.counts[before.exercise],
      };
    }
    const cue = cues.current.next(before, after, r, receivedAt);
    if (cue && soundRef.current && audio.current) {
      if (!playCue(audio.current, cue)) {
        soundRef.current = false;
        setSound(false);
        setNote(
          "Звук недоступен. Визуальные подсказки продолжают работать; звук можно включить снова.",
        );
      }
    }
    if (!before.completed && after.completed && !lab) {
      if (
        !saveResult({
          counts: after.counts,
          target: after.target,
          activeSeconds: Math.min(86400, Math.round(after.activeMs / 1000)),
        })
      )
        setNote("Хранилище недоступно. Результат останется на экране.");
      setHistory(readHistory());
    }
  }
  useEffect(() => {
    const visibility = () => {
      reset();
      draw({ pose: [], hands: [], aspect: 1 });
      if (state.current.phase !== "home")
        update({
          ...state.current,
          paused: true,
          recovery: 0,
          startHold: 0,
          last: null,
        });
    };
    document.addEventListener("visibilitychange", visibility);
    const id = setInterval(() => {
      if (
        status === "on" &&
        !paused.current &&
        (document.hidden || performance.now() - fresh.current > 450)
      ) {
        reset();
        draw({ pose: [], hands: [], aspect: 1 });
        setReading(emptyReading("Нет свежего кадра. Проверьте камеру."));
        update({
          ...state.current,
          paused: true,
          recovery: 0,
          startHold: 0,
          last: null,
        });
      }
    }, 200);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [status]);
  useEffect(
    () => () => {
      attempt.current++;
      camera.current.stop();
      void audio.current?.close();
    },
    [],
  );
  useEffect(() => {
    if (!lab || status !== "on") return;
    const id = setInterval(
      () => frame(fixture(synthetic.current, settingsRef.current.side)),
      80,
    );
    return () => clearInterval(id);
  }, [status]);
  function cameraFailed(text: string) {
    reset();
    draw({ pose: [], hands: [], aspect: 1 });
    paused.current = false;
    setManualPause(false);
    setError(text);
    setStatus("off");
    update(
      state.current.phase === "setup"
        ? initialSession(settingsRef.current.repetitions)
        : suspendSession(state.current),
    );
  }
  async function connect(resume: boolean) {
    const version = ++attempt.current;
    setError("");
    setStatus("loading");
    setLoadingStage("Подготавливаем камеру…");
    paused.current = false;
    setManualPause(false);
    reset();
    update(
      resume
        ? suspendSession(state.current)
        : { ...initialSession(settings.repetitions), phase: "setup" },
    );
    if (lab) {
      setStatus("on");
      return;
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    if (version !== attempt.current || !video.current) return;
    await camera.current.start(
      video.current!,
      frame,
      (text) => {
        if (version === attempt.current) cameraFailed(text);
      },
      () => {
        if (version !== attempt.current) return;
        fresh.current = performance.now();
        setStatus("on");
      },
      () => currentExercise(state.current) === "open",
      () => !paused.current,
      (text) => {
        if (version === attempt.current) setLoadingStage(text);
      },
    );
  }
  function start() {
    void connect(false);
  }
  function stop() {
    setError("");
    attempt.current++;
    camera.current.stop();
    setStatus("off");
    paused.current = false;
    setManualPause(false);
    reset();
    update(initialSession(settings.repetitions));
  }
  function finishSetup() {
    if (status !== "on" || paused.current || document.hidden) return;
    const next = confirmSetup(
      state.current,
      reading,
      performance.now(),
      fresh.current,
    );
    if (next === state.current) return;
    reset();
    update(next);
  }
  function proceed() {
    reset();
    const next = startSession(state.current);
    update(next);
    if (next.phase === "practice" && soundRef.current && audio.current)
      playCue(audio.current, "start");
  }
  function pause() {
    const p = !paused.current;
    paused.current = p;
    setManualPause(p);
    reset();
    update({
      ...state.current,
      paused: !p,
      recovery: 0,
      startHold: 0,
      last: null,
    });
  }
  async function toggleSound() {
    const enabled = !sound;
    setSound(enabled);
    soundRef.current = enabled;
    if (enabled)
      try {
        audio.current ??= new AudioContext();
        await audio.current.resume();
      } catch {
        setSound(false);
        soundRef.current = false;
      }
  }
  const home = session.phase === "home",
    exercise = currentExercise(session),
    practice = session.phase === "practice",
    total = session.counts.reduce((a, b) => a + b, 0);
  const heading =
    session.phase === "setup"
      ? "Настроим камеру"
      : session.phase === "ready"
        ? "Можно начинать"
        : session.phase === "rest"
          ? "Время для отдыха"
          : session.phase === "result"
            ? "Занятие завершено"
            : titles[exercise];
  const hint = manualPause
    ? "Вы на паузе. Продолжайте, когда будете готовы."
    : status === "loading"
      ? loadingStage
      : session.phase === "ready" &&
          status === "on" &&
          reading.valid &&
          !session.paused
        ? reading.zone === "rest"
          ? `Старт через ${Math.max(1, Math.ceil((3000 - session.startHold) / 1000))}… Оставайтесь в исходном положении.`
          : "Для старта верните руку к корпусу, кисть ниже плеч. Отсчёт начнётся автоматически."
        : (session.phase === "rest" || session.phase === "result") &&
            status === "on"
          ? `Для продолжения без кнопки согните выбранную руку и верните её. ${reading.hint}`
          : session.paused && reading.valid
            ? "Положение найдено. Восстанавливаем сигнал…"
            : session.phase === "setup" && reading.valid
              ? "Плечи и выбранная рука видны. Задержитесь на месте."
              : reading.hint;
  const progress =
    manualPause || status !== "on"
      ? 0
      : session.paused
        ? session.recovery / 800
        : session.phase === "setup"
          ? session.setup / 1500
          : session.phase === "ready"
            ? session.startHold / 3000
            : reading.hold;
  return (
    <div className={`shell ${home ? "" : "session-active"}`}>
      <aside className="sidebar">
        <a className="brand" href="./">
          <span className="brandmark">↗</span>
          <span>
            RehabBridge<small>MOTION</small>
          </span>
        </a>
        <div className="workspace-label">ДВИЖЕНИЕ ПОСЛЕ ИНСУЛЬТА</div>
        <nav aria-label="Разделы">
          <a className="nav-active" href="#practice" aria-label="Моя практика">
            ◫ <span>Моя практика</span>
          </a>
          <a href="#program" aria-label="Упражнения">
            ☷ <span>Упражнения</span>
          </a>
          <a href="#history" aria-label="История занятий">
            ◷ <span>История занятий</span>
          </a>
        </nav>
        <div className="sidebar-note">
          <span>◈</span>
          <strong>Ваши данные — у вас</strong>
          <p>
            Камера работает локально.
            <br />
            Видео не записывается.
          </p>
        </div>
        <div className="sidebar-footer">
          ADMIT MOTION 2026
          <br />
          <span>Демонстрационный прототип</span>
        </div>
      </aside>
      <div className="content">
        <header>
          <span>
            Моя практика{" "}
            <span className="crumb">/ Двигательная активность</span>
          </span>
          <button className="quiet" onClick={toggleSound} aria-pressed={sound}>
            {sound ? "♪ Звук включён" : "♪ Звук выключен"}
          </button>
        </header>
        {lab && (
          <div className="lab">
            <strong>
              Лаборатория: синтетические точки, не человек. История не
              сохраняется.
            </strong>
            <div>
              {(
                [
                  "rest",
                  "bend",
                  "reach",
                  "open",
                  "partial",
                  "cropped",
                  "lost",
                ] as Fixture[]
              ).map((f, i) => (
                <button key={f} onClick={() => (synthetic.current = f)}>
                  {
                    [
                      "Исходное",
                      "Сгибание",
                      "В сторону",
                      "Раскрыть",
                      "Неполное",
                      "Край кадра",
                      "Потеря",
                    ][i]
                  }
                </button>
              ))}
              <button
                disabled={status !== "on"}
                onClick={() =>
                  cameraFailed(
                    "Камера отключена (синтетическая проверка). Подключите её снова.",
                  )
                }
              >
                Отключить камеру (тест)
              </button>
            </div>
          </div>
        )}
        <main id="practice">
          {error && (
            <div className="error" role="alert" ref={errorNotice} tabIndex={-1}>
              {error}
              {!home && (
                <p>
                  Засчитанные повторы сохранены в этом занятии. Подключите
                  камеру снова и начните незавершённый повтор с исходного
                  положения.
                </p>
              )}
            </div>
          )}
          <section className="page-heading">
            <div className="eyebrow">
              <span /> В СВОЁМ ТЕМПЕ. ШАГ ЗА ШАГОМ.
            </div>
            <h1>
              {home ? "Движение начинается\nс небольшого шага." : heading}
            </h1>
            <p>
              {home
                ? "Понятное сопровождение домашних упражнений: показ движения, счёт повторений и спокойный темп."
                : session.phase === "rest"
                  ? "Отдохните столько, сколько нужно. Здесь нет таймера и спешки."
                  : session.phase === "result"
                    ? "Вы прошли последовательность. Ниже — наблюдаемые повторы, а не оценка восстановления."
                    : "Следуйте только согласованной программе и доступному вам диапазону."}
            </p>
          </section>
          {home ? (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <span className="pill">ПРАКТИКА ДЛЯ ОДНОЙ РУКИ</span>
                  <h2>
                    Маленькие движения.
                    <br />
                    <em>Понятный путь.</em>
                  </h2>
                  <p>
                    Камера помогает увидеть движение и считает завершённые
                    повторы. Без гонки, баллов и сравнения с другими.
                  </p>
                  <div className="hero-facts">
                    <span>
                      <b>3</b> вида движений
                    </span>
                    <span>
                      <b>Ваш</b> темп занятий
                    </span>
                    <span>
                      <b>0</b> видеозаписей
                    </span>
                  </div>
                  <a className="text-link" href="#settings">
                    Настроить практику <span>↗</span>
                  </a>
                </div>
                <div className="hero-visual">
                  <div className="halo" />
                  <Illustration exercise="bend" />
                  <div className="float-note">
                    <span>✓</span>
                    <div>
                      Каждый шаг заметен
                      <small>Сначала движение, затем возврат</small>
                    </div>
                  </div>
                </div>
              </section>
              <section className="settings-card" id="settings">
                <div>
                  <span className="eyebrow">ПЕРЕД НАЧАЛОМ</span>
                  <h2>Настройте демонстрацию</h2>
                  <p>
                    Эти значения — пример для показа, не назначение. Для занятий
                    после инсульта упражнения, диапазон и количество повторов
                    должен согласовать специалист.
                  </p>
                </div>
                <div className="settings-fields">
                  <fieldset>
                    <legend>Какую руку отслеживать?</legend>
                    <div className="segmented">
                      {(["left", "right"] as const).map((side) => (
                        <button
                          key={side}
                          aria-pressed={settings.side === side}
                          onClick={() => setSettings({ ...settings, side })}
                        >
                          {side === "left" ? "Левая" : "Правая"}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label>
                    Повторов на задание
                    <select
                      value={settings.repetitions}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          repetitions: Number(e.target.value),
                        })
                      }
                    >
                      {[1, 2, 3, 5, 10].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <details>
                    <summary>Параметры распознавания</summary>
                    <p>
                      Технические отметки камеры, не медицинские углы и не тест
                      максимальной амплитуды.
                    </p>
                    <label>
                      Порог сгибания в проекции камеры
                      <select
                        value={settings.bendAngle}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            bendAngle: Number(e.target.value),
                          })
                        }
                      >
                        <option value={80}>80°</option>
                        <option value={95}>95°</option>
                        <option value={110}>110°</option>
                      </select>
                    </label>
                    <label>
                      Боковая отметка (в ширинах плеч)
                      <select
                        value={settings.reachDistance}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            reachDistance: Number(e.target.value),
                          })
                        }
                      >
                        <option value={0.8}>0,8</option>
                        <option value={0.9}>0,9</option>
                        <option value={1.1}>1,1</option>
                      </select>
                    </label>
                  </details>
                  <button className="primary" onClick={start}>
                    Включить камеру <span>↗</span>
                  </button>
                  <small>
                    Устройтесь сидя, если это предусмотрено вашей программой.
                    Камера на уровне груди, плечи и рука в кадре.
                  </small>
                </div>
              </section>
            </>
          ) : (
            <section className="practice-layout">
              <div className="coach-card">
                <div className="coach-top">
                  <span className="pill">
                    {manualPause
                      ? "ОТДЫХ"
                      : session.phase === "ready"
                        ? "ГОТОВО К СТАРТУ"
                        : session.phase === "rest"
                          ? "ОТДЫХ МЕЖДУ ЗАДАНИЯМИ"
                          : session.paused
                            ? "ПАУЗА · СЧЁТ ОСТАНОВЛЕН"
                            : practice
                              ? `ЗАДАНИЕ ${session.exercise + 1} ИЗ 3`
                              : "ПОДГОТОВКА"}
                  </span>
                  <span>
                    {settings.side === "left" ? "Левая рука" : "Правая рука"}
                  </span>
                </div>
                <div
                  className={`feedback ${!manualPause && status === "on" && (session.paused || !reading.valid || reading.zone === "middle") ? "warning" : ""}`}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span aria-hidden="true">
                    {manualPause
                      ? "Ⅱ"
                      : session.paused || !reading.valid
                        ? "!"
                        : reading.zone === "middle"
                          ? "↗"
                          : "✓"}
                  </span>
                  <div>
                    <strong>
                      {manualPause
                        ? "Отдых"
                        : status === "loading"
                          ? "Подключение"
                          : session.paused || !reading.valid
                            ? "Счёт остановлен"
                            : reading.zone === "middle"
                              ? "Поправьте положение"
                              : "Следующий шаг"}
                    </strong>
                    <p>{hint}</p>
                  </div>
                </div>
                {session.phase === "setup" && (
                  <div className="setup-confirm">
                    <button
                      className="primary"
                      onClick={finishSetup}
                      disabled={
                        status !== "on" || manualPause || !reading.valid
                      }
                    >
                      Положение видно — продолжить
                    </button>
                    <p>
                      {reading.valid
                        ? "Плечи и рука найдены. Нажмите кнопку или дождитесь автоматического перехода."
                        : "Кнопка станет доступна, когда камера увидит оба плеча, локоть и кисть выбранной руки."}
                    </p>
                  </div>
                )}
                {["ready", "rest", "result"].includes(session.phase) && (
                  <button
                    className="primary"
                    onClick={proceed}
                    disabled={manualPause || status !== "on"}
                  >
                    {session.phase === "ready"
                      ? "Начать практику"
                      : session.phase === "rest"
                        ? "Продолжить после отдыха"
                        : "Повторить занятие"}{" "}
                    <span>→</span>
                  </button>
                )}
                {(session.phase === "ready" || session.phase === "rest") && (
                  <p className="start-explanation">
                    {session.phase === "ready"
                      ? "Старт без кнопки: оставьте выбранную руку у корпуса, кисть ниже плеч на 3 секунды. Поднятие руки отменяет отсчёт."
                      : "Отдыхайте сколько нужно. Когда будете готовы, согните выбранную руку и верните её — начнётся следующее задание. Пальцы распознавать не требуется."}
                  </p>
                )}
                {session.phase === "result" ? (
                  <>
                    <div className="result-total">
                      {total}
                      <span>завершённых повторов</span>
                    </div>
                    <div className="result-rows">
                      {exercises.map((e, i) => (
                        <div key={e}>
                          <span>{titles[e]}</span>
                          <b>
                            {session.counts[i]} / {session.target}
                          </b>
                        </div>
                      ))}
                    </div>
                    <p>
                      Время активной практики:{" "}
                      {Math.round(session.activeMs / 1000)} с. Больше времени не
                      означает хуже.
                    </p>
                  </>
                ) : (
                  <>
                    <Illustration
                      exercise={exercise}
                      side={settings.side}
                      animated={
                        showExample &&
                        practice &&
                        !session.paused &&
                        !manualPause
                      }
                    />
                    {practice && (
                      <div className="example-control">
                        <span>
                          {showExample
                            ? "Анимация примера — не ваша рука"
                            : "Схема упражнения — не ваша рука"}
                        </span>
                        <button
                          className="quiet"
                          onClick={() => setShowExample(!showExample)}
                          aria-pressed={showExample}
                          disabled={manualPause || session.paused}
                        >
                          {showExample
                            ? "Остановить пример"
                            : "Показать пример"}
                        </button>
                      </div>
                    )}
                    <h2>
                      {practice
                        ? titles[exercise]
                        : session.phase === "setup"
                          ? "Покажите плечи и руку"
                          : session.phase === "rest"
                            ? "Следующее задание — впереди"
                            : "Готовы к началу"}
                    </h2>
                    <p>
                      {practice
                        ? descriptions[exercise]
                        : session.phase === "setup"
                          ? "Одна выбранная рука. Вторую руку и таз показывать не обязательно."
                          : session.phase === "ready"
                            ? "После настройки старт произойдёт автоматически из исходного положения. Кнопка — запасной способ."
                            : "Для перехода без кнопки: исходное положение руки → согнуть локоть → вернуть. Либо используйте кнопку выше."}
                    </p>
                  </>
                )}
                {(session.phase === "ready" || session.phase === "rest") && (
                  <ExerciseGuide
                    exercise={
                      exercises[
                        session.phase === "ready" ? 0 : session.exercise + 1
                      ]
                    }
                    expanded
                  />
                )}
                {practice && (
                  <>
                    <p className="practice-started">
                      {manualPause || session.paused
                        ? "Практика на паузе"
                        : "Практика началась · выполните полный цикл движения"}
                    </p>
                    <div className="confirmation" aria-live="polite">
                      {confirmed.current.until > performance.now()
                        ? `✓ Повтор ${confirmed.current.count} засчитан`
                        : "Считаем только после полного возврата"}
                    </div>
                    <div className="rep-counter">
                      <strong>{session.counts[session.exercise]}</strong>
                      <span>из {session.target} повторов</span>
                    </div>
                    <ol className="cycle">
                      {["Исходное", "Движение", "Удержание", "Возврат"].map(
                        (x, i) => (
                          <li
                            key={x}
                            className={
                              ["rest", "move", "hold", "return"][i] ===
                              reading.cycle
                                ? "current"
                                : ""
                            }
                          >
                            {x}
                          </li>
                        ),
                      )}
                    </ol>
                  </>
                )}
                {practice && (
                  <div className="cycle-guide">
                    <strong>
                      {manualPause
                        ? "Отдых · счёт остановлен"
                        : session.paused
                          ? "Ожидаем устойчивый сигнал"
                          : reading.valid
                            ? {
                                rest: "1 · Найдите исходное положение",
                                move: "2 · Выполните движение",
                                hold: "3 · Удержите отметку",
                                return: "4 · Вернитесь в исходное положение",
                              }[reading.cycle]
                            : "Восстановите видимость руки"}
                    </strong>
                    <span>
                      {manualPause || session.paused
                        ? "Незавершённый повтор сброшен. После продолжения начните с исходного положения."
                        : reading.returning
                          ? "Счёт изменится после возврата и короткой задержки."
                          : reading.cycle === "hold"
                            ? "Удержание — 0,5 секунды. Двигаться быстрее не нужно."
                            : "Следуйте согласованному диапазону, без спешки."}
                    </span>
                  </div>
                )}
                <details className="recognition-details">
                  <summary>Почему повтор ещё не засчитан?</summary>
                  <p>{recognitionStatus(reading, exercise, settings)}</p>
                  <p>
                    Выбрана {settings.side === "left" ? "левая" : "правая"}{" "}
                    рука. Это технические условия камеры. Если они вне вашего
                    диапазона, остановите задание, не увеличивайте усилие ради
                    счётчика.
                  </p>
                </details>
                <div
                  className="progress"
                  role="progressbar"
                  aria-label="Прогресс текущего этапа"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(Math.min(1, progress) * 100)}
                >
                  <i style={{ width: `${Math.min(1, progress) * 100}%` }} />
                </div>
              </div>
              <div className="camera-column">
                <div className="camera-card">
                  <div className="camera-top">
                    <span>
                      <i />{" "}
                      {status === "loading"
                        ? "Подключаем камеру"
                        : status === "off"
                          ? "Камера отключена"
                          : reading.valid
                            ? "Рука в кадре"
                            : "Ожидаем движение"}
                    </span>
                    <span>ЛОКАЛЬНО</span>
                  </div>
                  <div className="camera-surface">
                    <video ref={video} muted playsInline autoPlay />
                    <canvas ref={canvas} />
                    {status === "loading" && (
                      <div className="camera-message">{loadingStage}</div>
                    )}
                  </div>
                  <div className="camera-bottom">
                    Зеркальное изображение ·{" "}
                    {settings.side === "left" ? "левая" : "правая"} рука
                  </div>
                </div>
                <div className="camera-diagnostics">
                  <strong>
                    {manualPause
                      ? "Распознавание приостановлено"
                      : status !== "on"
                        ? "Ожидаем камеру"
                        : performanceInfo.delayed
                          ? "Кадр слишком старый · счёт остановлен"
                          : "Диагностика камеры"}
                  </strong>
                  <span>
                    {performanceInfo.fps === null
                      ? "Частота: ждём кадры"
                      : `${performanceInfo.fps} обработанных кадров/с`}{" "}
                    ·{" "}
                    {performanceInfo.ms === null
                      ? "Задержка: измеряем"
                      : `обработка ${performanceInfo.ms} мс`}
                  </span>
                  {status === "on" &&
                    !manualPause &&
                    performanceInfo.fps !== null &&
                    performanceInfo.fps < 5 && (
                      <p>
                        Камера обрабатывается медленно. Закройте другие вкладки;
                        медленные кадры могут сбрасывать незавершённый повтор.
                      </p>
                    )}
                  <span>
                    Технические показатели, не оценка движения. На устройстве,
                    без сохранения.
                  </span>
                </div>
                <div
                  className="session-actions"
                  role="group"
                  aria-label="Управление занятием"
                >
                  <button
                    className="secondary"
                    onClick={
                      status === "off" ? () => void connect(true) : pause
                    }
                    disabled={status === "loading"}
                  >
                    {status === "off"
                      ? "Подключить камеру снова"
                      : status === "loading"
                        ? "Подключаем камеру…"
                        : manualPause
                          ? "Продолжить практику"
                          : "Пауза / отдых"}
                  </button>
                  <button className="stop" onClick={stop}>
                    Остановить и выключить камеру
                  </button>
                </div>
                <div className="care-note">
                  <b>Ваше самочувствие важнее счётчика</b>
                  <p>
                    При боли или ухудшении самочувствия остановитесь и
                    обратитесь к специалисту. Камера не определяет безопасность
                    движения.
                  </p>
                </div>
                <div className="session-path">
                  {exercises.map((e, i) => (
                    <div
                      className={i === session.exercise ? "active" : ""}
                      key={e}
                    >
                      <span>
                        {session.counts[i] >= session.target
                          ? "✓"
                          : `0${i + 1}`}
                      </span>
                      <p>
                        {titles[e]}
                        <small>
                          {session.counts[i]} / {session.target} повторов
                        </small>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
          {home && (
            <video
              ref={video}
              muted
              playsInline
              autoPlay
              className="hidden-video"
            />
          )}
          <details className="exercise-guide audio-guide">
            <summary>
              Звуковые подсказки: как заниматься, не глядя на экран
            </summary>
            <p>
              Включите звук перед тем, как отойти от устройства. Короткие
              сигналы — отсчёт; три восходящих — старт; один высокий — отметка
              достигнута, можно возвращаться; два восходящих — повтор засчитан;
              два низких — трекинг потерян, счёт на паузе.
            </p>
            <p>
              Сигналы означают события распознавания, а не оценку безопасности
              движения. Микрофон не используется.
            </p>
          </details>
          <section id="program" className="program">
            <div className="section-title">
              <div>
                <span className="eyebrow">ПОНЯТНОЕ ДВИЖЕНИЕ</span>
                <h2>Три задания. Один спокойный ритм.</h2>
              </div>
              <span>Демонстрационная последовательность</span>
            </div>
            <div className="exercise-grid">
              {exercises.map((e, i) => (
                <article key={e}>
                  <div className="exercise-number">
                    0{i + 1}
                    <span>
                      {i === 0 ? "ЛОКОТЬ" : i === 1 ? "РУКА" : "КИСТЬ"}
                    </span>
                  </div>
                  <Illustration exercise={e} side={settings.side} />
                  <h3>{titles[e]}</h3>
                  <p>{descriptions[e]}</p>
                  <ExerciseGuide exercise={e} />
                  <div className="card-footer">
                    <span>{settings.repetitions} повтора · без таймера</span>
                    <span>↗</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <section id="history" className="history">
            <div>
              <span className="eyebrow">ТОЛЬКО НА ЭТОМ УСТРОЙСТВЕ</span>
              <h2>Ваши небольшие шаги</h2>
              <p>
                {history.length
                  ? "Последние завершённые занятия. Это журнал выполнения, не медицинская оценка."
                  : "Здесь появятся завершённые занятия. Без имени, диагноза и видеозаписей."}
              </p>
            </div>
            {history.length > 0 && (
              <>
                <div className="history-list">
                  {history.map((r, i) => (
                    <div key={i}>
                      <span>
                        {i === 0
                          ? "Последнее занятие"
                          : `Занятие ${history.length - i}`}
                      </span>
                      <b>{r.counts.reduce((a, b) => a + b, 0)} повторов</b>
                      <small>{r.counts.join(" / ")} по заданиям</small>
                    </div>
                  ))}
                </div>
                <button
                  className="quiet"
                  onClick={() => {
                    if (clearHistory()) setHistory([]);
                    else setNote("Не удалось очистить историю.");
                  }}
                >
                  Очистить историю
                </button>
              </>
            )}
            {note && <p role="status">{note}</p>}
          </section>
          <section className="scope-note">
            <b>Помощник для практики, не замена реабилитологу.</b>
            <p>
              Прототип для сопровождения назначенных упражнений после инсульта.
              Не назначает лечение, не измеряет восстановление и не оценивает
              медицинскую правильность движений. Работа с пациентами ещё не
              проверена.
            </p>
          </section>
        </main>
        <footer>
          <span>RehabBridge Motion · Admit 2026 · версия 29.09.4</span>
          <span>
            Новая разработка хакатона. Происхождение раскрыто в README.
          </span>
        </footer>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
