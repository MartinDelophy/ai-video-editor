import { expect, test } from "@playwright/test";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);

function createSilentWav(durationSeconds = 2) {
  const sampleRate = 8_000;
  const sampleCount = Math.round(sampleRate * durationSeconds);
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(sampleCount * 2, 40);
  return buffer;
}

test("mobile Music action opens direct clip properties and exposes real speed control", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("ai-voiceover-ui-language", "zh");
  });
  await page.goto("/");

  const input = page.locator('input[type="file"][multiple]');
  await input.setInputFiles({ name: "visual.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG });
  await page.keyboard.press("Escape");
  await expect(page.locator(".image-clip")).toBeVisible();

  await page.getByText("媒体", { exact: true }).last().click();
  await input.setInputFiles({ name: "music-speed.wav", mimeType: "audio/wav", buffer: createSilentWav(2) });
  await page.getByRole("button", { name: "添加到音乐轨" }).click();

  const musicClip = page.locator(".audio-clip.is-music").first();
  await expect(musicClip).toBeVisible();
  await musicClip.click();
  const clipActions = page.locator(".timeline-mobile-clip-actions");
  await expect(clipActions).toBeVisible();
  await clipActions.getByRole("button", { name: "音频" }).click();

  const propertySheet = page.locator(".voice-panel.is-audio-clip-context");
  await expect(propertySheet).toBeVisible();
  await expect(page.locator(".mobile-sheet-nav strong")).toHaveText("音频片段属性");
  await expect(page.locator(".mobile-sheet-nav [role='tab']")).toHaveCount(0);
  await expect(propertySheet.getByText("播放速度", { exact: true })).toBeVisible();
  await expect(page.locator(".timeline-mobile-clip-actions")).toBeVisible();
  await expect(page.locator(".media-panel")).toBeHidden();

  const durationBefore = await musicClip.locator(".audio-clip-duration").getAttribute("data-compact-duration");
  await propertySheet.getByRole("button", { name: "2×", exact: true }).click();
  await expect(propertySheet.locator(".audio-property-slider em").filter({ hasText: "2×" })).toBeVisible();
  await expect(musicClip.locator(".audio-clip-duration")).toHaveAttribute("data-compact-duration", "1.0s");
  expect(durationBefore).not.toBe("1.0s");
  await expect(page.locator(".timeline-mobile-clip-actions")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mobile-music-direct-properties-2x.png") });

  await page.locator(".mobile-sheet-close").click();
  await expect(propertySheet).toBeHidden();
  await expect(page.locator(".timeline-mobile-clip-actions")).toBeVisible();
});
