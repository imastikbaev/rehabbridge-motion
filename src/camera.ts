import {
  FilesetResolver,
  PoseLandmarker,
  HandLandmarker,
} from "@mediapipe/tasks-vision";
import { downloadAsset, DownloadError } from "./download";
import { acquireWithin } from "./async-resource";
import type { Frame } from "./movement";
export function cameraError(e: unknown) {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError")
    return "Доступ к камере закрыт. Разрешите камеру в настройках сайта и нажмите «Включить камеру» снова.";
  if (name === "NotFoundError")
    return "Камера не найдена. Подключите её или откройте приложение на телефоне.";
  if (name === "NotReadableError")
    return "Камера занята другим приложением. Закройте его и попробуйте снова.";
  return "Не удалось запустить камеру или модель. Проверьте подключение, обновите страницу и попробуйте снова.";
}
export class Camera {
  private generation = 0;
  private download: AbortController | null = null;
  private stream: MediaStream | null = null;
  private pose: PoseLandmarker | null = null;
  private hand: HandLandmarker | null = null;
  private raf = 0;
  private video: HTMLVideoElement | null = null;
  stop() {
    this.generation++;
    this.download?.abort();
    this.download = null;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = null;
    this.pose?.close();
    this.pose = null;
    this.hand?.close();
    this.hand = null;
    if (this.video) this.video.srcObject = null;
  }
  async start(
    video: HTMLVideoElement,
    onFrame: (frame: Frame) => void,
    onError: (text: string) => void,
    onReady: () => void,
    needsHand: () => boolean = () => true,
    shouldProcess: () => boolean = () => true,
    onStage: (text: string) => void = () => {},
  ) {
    this.stop();
    this.video = video;
    const generation = this.generation;
    let acquired: MediaStream | null = null;
    const download = new AbortController();
    this.download = download;
    let wasmUrl: string | null = null;
    const asset = (url: string, label: string) =>
      downloadAsset(url, download.signal, (bytes, total) => {
        if (generation !== this.generation) return;
        const size = (bytes / 1000000).toFixed(1);
        onStage(
          `${label} · ${size}${total ? ` / ${(total / 1000000).toFixed(1)}` : ""} МБ. Первый запуск может занять несколько минут.`,
        );
      });
    try {
      if (!window.isSecureContext) throw new Error("HTTPS");
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("No camera API");
      // Resolve all local assets before acquiring a video stream.
      const base = import.meta.env.BASE_URL;
      onStage("1 из 5 · Загружаем среду распознавания…");
      const resolved = await acquireWithin(
        FilesetResolver.forVisionTasks(`${base}vision`),
        30000,
        () => {},
        "Загрузка WASM превысила 30 секунд.",
      );
      if (generation !== this.generation) return;
      const wasm = await asset(
        resolved.wasmBinaryPath,
        "1 из 5 · Среда распознавания",
      );
      if (generation !== this.generation) return;
      wasmUrl = URL.createObjectURL(
        new Blob([wasm as BlobPart], { type: "application/wasm" }),
      );
      const files = { ...resolved, wasmBinaryPath: wasmUrl };
      const poseBytes = await asset(
        `${base}models/pose_landmarker_lite.task`,
        "2 из 5 · Модель руки",
      );
      if (generation !== this.generation) return;
      onStage("2 из 5 · Подготавливаем модель руки…");
      const detector = await acquireWithin(
        PoseLandmarker.createFromOptions(files, {
          baseOptions: {
            modelAssetBuffer: poseBytes,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numPoses: 2,
          minPoseDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
          minPosePresenceConfidence: 0.6,
        }),
        30000,
        (value) => value.close(),
        "Загрузка модели позы превысила 30 секунд.",
      );
      if (generation !== this.generation) {
        detector.close();
        return;
      }
      this.pose = detector;
      const handBytes = await asset(
        `${base}models/hand_landmarker.task`,
        "3 из 5 · Модель пальцев",
      );
      if (generation !== this.generation) return;
      onStage("3 из 5 · Подготавливаем модель пальцев…");
      const hand = await acquireWithin(
        HandLandmarker.createFromOptions(files, {
          baseOptions: {
            modelAssetBuffer: handBytes,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        }),
        30000,
        (value) => value.close(),
        "Загрузка модели кисти превысила 30 секунд.",
      );
      if (generation !== this.generation) {
        hand.close();
        return;
      }
      this.hand = hand;
      onStage("4 из 5 · Разрешите доступ к камере в браузере.");
      acquired = await acquireWithin(
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 960 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
          },
        }),
        60000,
        (stream) => stream.getTracks().forEach((t) => t.stop()),
        "Разрешение камеры не получено за минуту. Нажмите включение ещё раз.",
      );
      if (generation !== this.generation) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = acquired;
      acquired.getTracks().forEach(
        (t) =>
          (t.onended = () => {
            this.stop();
            onError("Камера отключена. Подключите её и включите снова.");
          }),
      );
      video.srcObject = acquired;
      onStage("5 из 5 · Запускаем видео…");
      await acquireWithin(
        video.play(),
        15000,
        () => {},
        "Камера не начала воспроизведение за 15 секунд.",
      );
      if (generation !== this.generation) return;
      onReady();
      let lastDetection = -Infinity,
        nextDetection = -Infinity,
        lastVideo = -1,
        lastFresh = performance.now(),
        lastLoop = lastFresh;
      const loop = (now: number) => {
        if (generation !== this.generation) return;
        const processing = !document.hidden && shouldProcess();
        // A background tab or suspended page is not a broken camera. Give it
        // a fresh grace period when animation frames resume.
        if (!processing || now - lastLoop > 1000) lastFresh = now;
        lastLoop = now;
        if (processing && now - lastDetection >= 80 && now >= nextDetection) {
          lastDetection = now;
          if (video.readyState >= 2 && video.currentTime !== lastVideo) {
            lastVideo = video.currentTime;
            lastFresh = now;
            try {
              const capturedAt = performance.now();
              const result = detector.detectForVideo(video, capturedAt);
              const one = result.landmarks.length === 1;
              const hands =
                one && needsHand()
                  ? hand.detectForVideo(video, capturedAt).landmarks
                  : [];
              const processingMs = performance.now() - capturedAt;
              // Leave time for paint and controls even when inference is slow.
              nextDetection = performance.now() + 40;
              onFrame({
                capturedAt,
                processingMs,
                pose: one ? result.landmarks[0] : [],
                hands,
                aspect: video.videoWidth / video.videoHeight,
                reason:
                  result.landmarks.length > 1
                    ? "В кадре несколько людей. Перед камерой должен оставаться один участник."
                    : undefined,
              });
            } catch {
              this.stop();
              onError("Обработка камеры прервана. Включите камеру снова.");
              return;
            }
          } else if (now - lastFresh >= 5000) {
            this.stop();
            onError(
              "Камера не присылает новые кадры более 5 секунд. Подключите камеру снова.",
            );
            return;
          } else if (now - lastFresh > 300)
            onFrame({
              pose: [],
              hands: [],
              aspect: 1,
              reason: "Кадры с камеры не обновляются. Проверьте подключение.",
            });
        }
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    } catch (e) {
      acquired?.getTracks().forEach((t) => t.stop());
      if (generation === this.generation) {
        this.stop();
        onError(
          e instanceof DownloadError ||
            (e instanceof Error && /секунд|минуту/.test(e.message))
            ? e.message
            : !window.isSecureContext
              ? "Для камеры нужен HTTPS или localhost. Откройте защищённую ссылку."
              : cameraError(e),
        );
      }
    } finally {
      if (wasmUrl) URL.revokeObjectURL(wasmUrl);
    }
  }
}
