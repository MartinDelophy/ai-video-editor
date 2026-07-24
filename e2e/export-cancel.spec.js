import { expect, test } from "@playwright/test";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);

for (const viewport of [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 412, height: 915 },
]) {
  test(`${viewport.name} can cancel an active compatibility export without downloading`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("ai-voiceover-ui-language", "zh");
      localStorage.setItem("timeline-studio-first-visual-guide-seen-v1", "1");
      // Exercise cancellation without depending on the removed pipeline selector.
      // Disabling WebCodecs makes automatic export use the cancellable
      // MediaRecorder compatibility path in every browser environment.
      Object.defineProperty(window, "VideoEncoder", {
        configurable: true,
        value: undefined,
      });
    });
    const downloads = [];
    page.on("download", (download) => downloads.push(download.suggestedFilename()));
    await page.goto("/");

    await page.locator('input[type="file"][multiple]').setInputFiles({
      name: "cancel-export.png",
      mimeType: "image/png",
      buffer: ONE_PIXEL_PNG,
    });
    await expect(page.locator(".image-clip")).toBeVisible();

    await page.getByRole("button", { name: "导出视频" }).click();
    const settings = page.getByRole("dialog");
    const start = settings.getByRole("button", { name: "开始导出" });
    await expect(start).toBeEnabled();
    await start.click();

    const progress = page.getByRole("dialog", { name: "导出中" });
    await expect(progress).toBeVisible();
    await progress.getByRole("button", { name: "取消导出" }).click({ force: true });
    await expect(progress).toBeHidden({ timeout: 5_000 });
    await expect(page.locator(".toast")).toHaveText("导出已取消");
    await page.waitForTimeout(500);
    expect(downloads).toEqual([]);
  });
}
