import { test, expect, type Page } from "@playwright/test";
async function cycle(p: Page, label: string) {
  await p.getByRole("button", { name: "Исходное", exact: true }).click();
  await p.waitForTimeout(1100);
  await p.getByRole("button", { name: label, exact: true }).click();
  await p.waitForTimeout(1200);
  await p.getByRole("button", { name: "Исходное", exact: true }).click();
  await p.waitForTimeout(1100);
}
test("full single-arm session, corrections, pause, rest, result and gesture replay", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?lab");
  await page.getByLabel("Повторов на задание").selectOption("1");
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await expect(
    page.getByRole("heading", { name: "Можно начинать", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Подготовка: Сгибание локтя" }),
  ).toBeVisible();
  await expect(page.getByText("ЗАДАНИЕ 1 ИЗ 3")).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Неполное", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("отметки");
  await cycle(page, "Сгибание");
  await expect(
    page.getByRole("heading", { name: "Время для отдыха" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Подготовка: Рука в сторону" }),
  ).toBeVisible();
  await cycle(page, "Сгибание");
  await expect(page.getByText("ЗАДАНИЕ 2 ИЗ 3")).toBeVisible();
  await page.getByRole("button", { name: "Потеря", exact: true }).click();
  await expect(page.getByText("ПАУЗА · СЧЁТ ОСТАНОВЛЕН")).toBeVisible();
  await page.getByRole("button", { name: "Исходное", exact: true }).click();
  await expect(page.getByText("ПАУЗА · СЧЁТ ОСТАНОВЛЕН")).not.toBeVisible();
  await page.getByRole("button", { name: "Пауза / отдых" }).click();
  await expect(page.getByRole("status")).toContainText("Вы на паузе");
  await expect(page.locator(".cycle-guide")).toContainText(
    "Отдых · счёт остановлен",
  );
  await page
    .getByRole("button", { name: "Продолжить практику", exact: true })
    .click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "docs/practice-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: "docs/practice-mobile.png", fullPage: true });
  await cycle(page, "В сторону");
  await expect(
    page.getByRole("heading", { name: "Время для отдыха" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Подготовка: Раскрытие кисти" }),
  ).toBeVisible();
  await cycle(page, "Сгибание");
  await expect(page.getByText("ЗАДАНИЕ 3 ИЗ 3")).toBeVisible();
  await cycle(page, "Раскрыть");
  await expect(
    page.getByRole("heading", { name: "Занятие завершено", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".result-total")).toContainText("3");
  await cycle(page, "Сгибание");
  await expect(
    page.getByRole("heading", { name: "Можно начинать", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("rehabbridge.motion.sessions.v1"),
    ),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Остановить и выключить камеру" })
    .click();
  await expect(
    page.getByRole("button", { name: "Включить камеру" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile home, settings, navigation and sound", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Движение начинается с небольшого шага.",
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("button", { name: "Левая", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Левая", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Звук выключен" }).click();
  await expect(
    page.getByRole("button", { name: "Звук включён" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByText("Как засчитывается: Раскрытие кисти", { exact: true })
    .click();
  await expect(
    page.getByText("Исчезновение кисти не считается возвратом.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: "docs/mobile-guide.png", fullPage: true });
  await page
    .getByText("Как засчитывается: Раскрытие кисти", { exact: true })
    .click();
  await page.screenshot({ path: "docs/mobile.png", fullPage: true });
});
test("real pose and hand models load; fake camera pauses and releases", async ({
  browser,
}) => {
  const context = await browser.newContext({ permissions: ["camera"] });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const get = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    Object.assign(window, { __streams: [] });
    navigator.mediaDevices.getUserMedia = async (c) => {
      const s = await get(c);
      (window as unknown as { __streams: MediaStream[] }).__streams.push(s);
      return s;
    };
  });
  const models: string[] = [];
  page.on("response", (r) => {
    if (r.url().endsWith(".task")) models.push(r.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await expect(page.getByText("ПАУЗА · СЧЁТ ОСТАНОВЛЕН")).toBeVisible({
    timeout: 30000,
  });
  expect(models).toHaveLength(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Остановить и выключить камеру" })
    .click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { __streams: MediaStream[] }).__streams.every((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ),
  ).toBe(true);
  await context.close();
});
test("two repetitions show confirmation and advance only at the configured count", async ({
  page,
}) => {
  await page.goto("/?lab");
  await page.getByLabel("Повторов на задание").selectOption("2");
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await expect(
    page.getByRole("button", { name: "Начать практику →", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Начать практику →", exact: true })
    .click();
  await cycle(page, "Сгибание");
  await expect(page.locator(".rep-counter strong")).toHaveText("1");
  await expect(page.locator(".confirmation")).toHaveText("✓ Повтор 1 засчитан");
  await expect(page.locator(".cycle-guide")).toBeVisible();
  await cycle(page, "Сгибание");
  await expect(
    page.getByRole("heading", { name: "Время для отдыха" }),
  ).toBeVisible();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
])
  test(`mobile stop remains reachable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?lab");
    await page.getByRole("button", { name: "Включить камеру" }).click();
    const controls = page.getByRole("group", { name: "Управление занятием" });
    const stop = page.getByRole("button", {
      name: "Остановить и выключить камеру",
    });
    for (const bottom of [false, true]) {
      await page.evaluate(
        (bottom) =>
          window.scrollTo({
            top: bottom ? document.body.scrollHeight : 0,
            behavior: "instant",
          }),
        bottom,
      );
      await expect(controls).toBeInViewport({ ratio: 1 });
      await expect(stop).toBeInViewport({ ratio: 1 });
      const reachable = await stop.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        );
      });
      expect(reachable).toBe(true);
    }
    await page.screenshot({
      path: "docs/mobile-controls.png",
      fullPage: false,
    });
    await stop.click();
    await expect(controls).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Включить камеру" }),
    ).toBeVisible();
  });

test("camera rejection focuses a visible explanation and allows retry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const get = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    let calls = 0;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (calls++ === 0) throw new DOMException("denied", "NotAllowedError");
      return get(constraints);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Включить камеру" }).click();
  const error = page.getByRole("alert");
  await expect(error).toContainText("Разрешите камеру", { timeout: 30000 });
  await expect(error).toBeFocused();
  await expect(error).toBeInViewport();
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await expect(error).toHaveCount(0);
  await expect(page.getByText("ПАУЗА · СЧЁТ ОСТАНОВЛЕН")).toBeVisible({
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: "Остановить и выключить камеру" })
    .click();
});

test("camera reconnect retains counted work and discards the unfinished movement", async ({
  page,
}) => {
  await page.goto("/?lab");
  await page.getByLabel("Повторов на задание").selectOption("2");
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await page
    .getByRole("button", { name: "Начать практику →", exact: true })
    .click();
  await cycle(page, "Сгибание");
  await expect(page.locator(".rep-counter strong")).toHaveText("1");
  await page.getByRole("button", { name: "Сгибание", exact: true }).click();
  await page.waitForTimeout(1000);
  await page
    .getByRole("button", { name: "Отключить камеру (тест)", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Засчитанные повторы сохранены",
  );
  await expect(page.locator(".rep-counter strong")).toHaveText("1");
  await page
    .getByRole("button", { name: "Подключить камеру снова", exact: true })
    .click();
  await page.getByRole("button", { name: "Исходное", exact: true }).click();
  await page.waitForTimeout(1800);
  await expect(page.locator(".rep-counter strong")).toHaveText("1");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await cycle(page, "Сгибание");
  await expect(
    page.getByRole("heading", { name: "Время для отдыха" }),
  ).toBeVisible();
});

test("frozen camera frames offer recovery instead of an endless pause", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await expect(page.getByText("ПАУЗА · СЧЁТ ОСТАНОВЛЕН")).toBeVisible({
    timeout: 30000,
  });
  await page
    .locator(".camera-surface video")
    .evaluate((element) => (element as HTMLVideoElement).pause());
  await expect(page.getByRole("alert")).toContainText("более 5 секунд", {
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await expect(page.getByText("ПАУЗА · СЧЁТ ОСТАНОВЛЕН")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Остановить и выключить камеру" })
    .click();
});

test("starts and continues without a hand gesture, illustration is static by default", async ({
  page,
}) => {
  await page.goto("/?lab");
  await page.getByLabel("Повторов на задание").selectOption("1");
  await page.getByRole("button", { name: "Включить камеру" }).click();
  const start = page.getByRole("button", {
    name: "Начать практику →",
    exact: true,
  });
  await expect(start).toBeVisible();
  await page.getByRole("button", { name: "Потеря", exact: true }).click();

  await expect(page.getByRole("status")).toContainText("Покажите плечи");
  await start.click();
  await page.getByRole("button", { name: "Исходное", exact: true }).click();
  await expect(
    page.getByText("Практика началась · выполните полный цикл движения"),
  ).toBeVisible();
  await expect(
    page.locator(".coach-card .exercise-illustration"),
  ).not.toHaveClass(/animated/);
  await page
    .getByRole("button", { name: "Показать пример", exact: true })
    .click();
  await expect(page.locator(".coach-card .exercise-illustration")).toHaveClass(
    /animated/,
  );
  await expect(page.getByText("Анимация примера — не ваша рука")).toBeVisible();
  await cycle(page, "Сгибание");
  await page
    .getByRole("button", { name: "Продолжить после отдыха →", exact: true })
    .click();
  await expect(page.getByText("ЗАДАНИЕ 2 ИЗ 3")).toBeVisible();
  await expect(
    page.locator(".coach-card .exercise-illustration"),
  ).not.toHaveClass(/animated/);
  await cycle(page, "В сторону");
  await expect(
    page.getByRole("heading", { name: "Время для отдыха" }),
  ).toBeVisible();
});

test("setup can be confirmed from a visible arm but never from missing tracking", async ({
  page,
}) => {
  await page.goto("/?lab");
  await page.getByRole("button", { name: "Потеря", exact: true }).click();
  await page.getByRole("button", { name: "Включить камеру" }).click();
  const confirm = page.getByRole("button", {
    name: "Положение видно — продолжить",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await page.getByRole("button", { name: "Исходное", exact: true }).click();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(
    page.getByRole("heading", { name: "Можно начинать", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Начать практику →", exact: true })
    .click();
  await expect(
    page.getByText("Практика началась · выполните полный цикл движения"),
  ).toBeVisible();
  await expect(page.locator(".rep-counter strong")).toHaveText("0");
  await cycle(page, "Сгибание");
  await expect(page.locator(".rep-counter strong")).toHaveText("1");
});

test("audio feedback is opt-in and a target tone never increments the counter", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createOscillator;
    (window as unknown as { toneCount: number }).toneCount = 0;
    AudioContext.prototype.createOscillator = function () {
      (window as unknown as { toneCount: number }).toneCount++;
      return original.call(this);
    };
  });
  await page.goto("/?lab");
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await page
    .getByRole("button", { name: "Начать практику →", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { toneCount: number }).toneCount,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Звук выключен" }).click();
  await page.getByRole("button", { name: "Исходное", exact: true }).click();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Сгибание", exact: true }).click();
  await page.waitForTimeout(1200);
  expect(
    await page.evaluate(
      () => (window as unknown as { toneCount: number }).toneCount,
    ),
  ).toBe(1);
  await expect(page.locator(".rep-counter strong")).toHaveText("0");
  await page.getByRole("button", { name: "Исходное", exact: true }).click();
  await expect(page.locator(".rep-counter strong")).toHaveText("1");
  expect(
    await page.evaluate(
      () => (window as unknown as { toneCount: number }).toneCount,
    ),
  ).toBe(3);
  await page.getByRole("button", { name: "Звук включён" }).click();
  await cycle(page, "Сгибание");
  expect(
    await page.evaluate(
      () => (window as unknown as { toneCount: number }).toneCount,
    ),
  ).toBe(3);
});

test("asset download failure shows a retryable error and retry starts real models", async ({
  page,
}) => {
  await page.route(
    "**/vision/*.wasm",
    async (route) => {
      await route.fulfill({ status: 503, body: "temporarily unavailable" });
    },
    { times: 1 },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await expect(page.getByRole("alert")).toContainText("HTTP 503");
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await expect(page.getByText("ПАУЗА · СЧЁТ ОСТАНОВЛЕН")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Остановить и выключить камеру" })
    .click();
});

test("stop during download prevents late data from starting the camera", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted!: () => void;
  const entered = new Promise<void>((resolve) => {
    intercepted = resolve;
  });
  await page.route(
    "**/vision/*.wasm",
    async (route) => {
      intercepted();
      await held;
      await route.abort().catch(() => {});
    },
    { times: 1 },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await entered;
  await page
    .getByRole("button", { name: "Остановить и выключить камеру" })
    .click();
  release();
  await expect(
    page.getByRole("button", { name: "Включить камеру" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await expect(page.getByText("ПАУЗА · СЧЁТ ОСТАНОВЛЕН")).toBeVisible({
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: "Остановить и выключить камеру" })
    .click();
});

test("mobile correction is large, above illustration and controls remain reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?lab");
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await expect(page.getByText("ЗАДАНИЕ 1 ИЗ 3")).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Неполное", exact: true }).click();
  await expect(page.locator(".feedback")).toHaveClass(/warning/);
  await expect(page.getByRole("status")).toContainText("Поправьте положение");
  await page.locator(".coach-top").scrollIntoViewIfNeeded();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(viewport.width);
    expect(
      await page
        .locator(".feedback p")
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(22);
    const feedback = await page.locator(".feedback").boundingBox();
    const illustration = await page
      .locator(".coach-card > .exercise-illustration")
      .boundingBox();
    expect(feedback!.y).toBeLessThan(illustration!.y);
    const stop = await page
      .getByRole("button", { name: "Остановить и выключить камеру" })
      .boundingBox();
    expect(stop!.y).toBeGreaterThanOrEqual(0);
    expect(stop!.y + stop!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({
      path: `docs/mobile-feedback-${viewport.width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Потеря", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Счёт остановлен");
});
