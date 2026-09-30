import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const origin = new URL(process.env.CHECK_BASE_URL || "http://127.0.0.1:4179")
  .origin;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const context = await browser.newContext({
  permissions: ["camera"],
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
const errors = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => requests.push({ url: r.url(), method: r.method() }));
await page.addInitScript(() => {
  window.__cspBlocks = [];
  document.addEventListener("securitypolicyviolation", (e) =>
    window.__cspBlocks.push({
      uri: e.blockedURI,
      directive: e.effectiveDirective,
    }),
  );
});
await page.goto(`${origin}/?lab`);
if (await page.locator(".lab").count())
  throw Error("Dev lab leaked into production");
await mkdir("docs", { recursive: true });
await page.screenshot({ path: "docs/desktop.png", fullPage: true });
await page.getByRole("button", { name: "Включить камеру" }).click();
try {
  await Promise.race([
    page.getByText("ПАУЗА · СЧЁТ ОСТАНОВЛЕН").waitFor({ timeout: 900000 }),
    page.getByRole("alert").waitFor({ timeout: 900000 }).then(async () => {
      throw Error(await page.getByRole("alert").innerText());
    }),
  ]);
} catch (error) {
  await page.screenshot({
    path: "docs/production-failure.png",
    fullPage: true,
  });
  console.error(
    "Camera startup diagnostics:",
    await page.locator("main").innerText(),
  );
  console.error("JavaScript errors:", errors);
  await browser.close();
  throw error;
}
if (await page.getByRole("alert").count()) throw Error("Camera startup failed");
await page.screenshot({ path: "docs/production-camera.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "docs/mobile-session.png", fullPage: true });
if ((await page.evaluate(() => document.documentElement.scrollWidth)) > 390)
  throw Error("Mobile overflow");
await page
  .getByRole("button", { name: "Остановить и выключить камеру" })
  .click();
if (errors.length) throw Error(errors.join("\n"));
if (
  requests.some((r) => r.method !== "GET" || new URL(r.url).origin !== origin)
)
  throw Error(
    "Unexpected network traffic: " +
      JSON.stringify(
        requests
          .filter((r) => r.method !== "GET" || new URL(r.url).origin !== origin)
          .map((r) => ({
            method: r.method,
            scheme: new URL(r.url).protocol,
            origin: new URL(r.url).origin,
            path: new URL(r.url).pathname.slice(0, 120),
          })),
      ),
  );
if (
  !requests.some((r) => r.url.endsWith(".task")) ||
  !requests.some((r) => r.url.endsWith(".wasm"))
)
  throw Error("Real assets not loaded");
const cspBlocks = await page.evaluate(() => window.__cspBlocks);
await writeFile(
  "docs/production-check.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      browser: browser.version(),
      pageErrors: errors,
      requests,
      cspBlocks,
      physicalCamera: false,
    },
    null,
    2,
  ),
);
await context.close();
await browser.close();
console.log(
  "Production: real model + WASM loaded, fake camera paused, no errors, only same-origin GET, no dev lab, desktop/mobile screenshots saved.",
);
