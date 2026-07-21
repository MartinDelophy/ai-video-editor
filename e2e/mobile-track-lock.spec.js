import { expect, test } from "@playwright/test";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);

test("mobile Visuals lock blocks destructive clip actions until unlocked", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => localStorage.setItem("ai-voiceover-ui-language", "zh"));
  await page.goto("/");
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "locked-visual.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  await page.keyboard.press("Escape");

  const clip = page.locator(".image-clip");
  const lock = page.locator('.track-labels > div').first().locator('button[aria-pressed]');
  await expect(clip).toBeVisible();
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "true");

  await clip.click();
  await page.locator(".timeline-mobile-clip-actions .is-danger").click();
  await expect(clip).toBeVisible();

  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await clip.click();
  await page.locator(".timeline-mobile-clip-actions .is-danger").click();
  await expect(clip).toHaveCount(0);
});
