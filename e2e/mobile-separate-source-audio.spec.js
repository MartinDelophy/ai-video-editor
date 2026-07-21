import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test("mobile linked source audio follows video speed and can be separated again after deletion", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const videoPath = testInfo.outputPath("mobile-video-with-audio.webm");
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=#244b68:s=320x180:d=1.2",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=1.2",
    "-c:v", "libvpx-vp9", "-b:v", "300k", "-pix_fmt", "yuv420p", "-c:a", "libopus", "-shortest",
    videoPath,
  ]);

  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("ai-voiceover-ui-language", "zh");
  });
  await page.goto("/");
  await page.locator('input[type="file"][multiple]').setInputFiles(videoPath);
  await page.keyboard.press("Escape");

  const visualClip = page.locator(".image-clip").first();
  await expect(visualClip).toBeVisible();
  await expect(visualClip.locator(".image-clip-duration")).toHaveText("00:01");
  await visualClip.click();

  const actionBar = page.locator(".timeline-mobile-clip-actions");
  const separateAudio = actionBar.getByText("分离音频", { exact: true });
  await expect(actionBar).toBeVisible();
  await expect(separateAudio).toBeVisible();
  await separateAudio.click();

  await expect(page.locator(".source-track")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(".audio-clip.is-source").first()).toBeVisible({ timeout: 120_000 });
  await expect(actionBar.getByText("分离音频", { exact: true })).toHaveCount(0);
  await expect(visualClip).toBeVisible();

  await visualClip.click();
  await actionBar.getByText("编辑", { exact: true }).click();
  await page.getByRole("tab", { name: "变速", exact: true }).click();
  await page.locator(".visual-speed-presets").getByText("2×", { exact: true }).click();
  await expect(page.locator(".visual-speed-summary")).toContainText("0.60s");
  await expect(page.locator(".visual-speed-hint")).toHaveText("画面原声已同步");
  await expect(page.locator(".audio-clip.is-source .audio-clip-duration")).toHaveText("00:00.60");

  await page.locator(".mobile-sheet-close").click();
  const sourceClip = page.locator(".audio-clip.is-source");
  await sourceClip.click();
  await actionBar.locator("button.is-danger").click();
  await expect(sourceClip).toHaveCount(0);
  await expect(page.locator(".source-track")).toHaveCount(0);

  await visualClip.click();
  await expect(actionBar.getByText("分离音频", { exact: true })).toBeVisible();
});
