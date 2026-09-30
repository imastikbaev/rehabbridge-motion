/** Static assets only. Idle timeout resets on actual bytes; stop aborts the fetch. */
export class DownloadError extends Error {}
export async function downloadAsset(
  url: string,
  signal: AbortSignal,
  progress: (received: number, total: number | null) => void,
): Promise<Uint8Array> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const idle = () =>
    controller.abort(
      new DownloadError(
        "Загрузка не получает данные 30 секунд. Проверьте соединение и попробуйте снова.",
      ),
    );
  let timer = setTimeout(idle, 30000);
  const deadline = setTimeout(
    () =>
      controller.abort(
        new DownloadError(
          "Загрузка заняла больше 5 минут. Проверьте соединение и попробуйте снова.",
        ),
      ),
    300000,
  );
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || !response.body)
      throw new DownloadError(
        `Не удалось загрузить файл распознавания (HTTP ${response.status}). Попробуйте снова.`,
      );
    const length = Number(response.headers.get("content-length"));
    const total = length > 0 && Number.isFinite(length) ? length : null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    progress(0, total);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value.length) continue;
      received += value.length;
      if (received > 32000000) {
        await reader.cancel();
        throw new DownloadError(
          "Файл распознавания слишком большой. Обновите страницу.",
        );
      }
      chunks.push(value);
      clearTimeout(timer);
      timer = setTimeout(idle, 30000);
      progress(received, total);
    }
    if (!received)
      throw new DownloadError(
        "Получен пустой файл распознавания. Попробуйте снова.",
      );
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    clearTimeout(deadline);
    signal.removeEventListener("abort", abort);
  }
}
