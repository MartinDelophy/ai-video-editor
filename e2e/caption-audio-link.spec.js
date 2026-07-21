import { expect, test } from "@playwright/test";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);

function createSilentWav(durationSeconds = 2) {
  const sampleRate = 8_000;
  const sampleCount = Math.round(sampleRate * durationSeconds);
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36);
  buffer.writeUInt32LE(sampleCount * 2, 40);
  return buffer;
}

async function dragHorizontally(page, locator, deltaX) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Timeline clip geometry is unavailable");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y, { steps: 8 });
  await page.mouse.up();
}

test("caption voiceover link can align, unlink, and relink without deleting either clip", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("ai-voiceover-ui-language", "en");
  });
  await page.goto("/");

  const input = page.locator('input[type="file"][multiple]');
  await input.setInputFiles({ name: "visual.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG });
  await page.keyboard.press("Escape");
  await page.getByText("Media", { exact: true }).last().click();
  await input.setInputFiles({ name: "linked-voice.wav", mimeType: "audio/wav", buffer: createSilentWav(2) });
  await page.getByRole("button", { name: "Add to voiceover" }).click();
  await expect(page.locator(".audio-clip:not(.is-source):not(.is-music)")).toHaveCount(1);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Captions", exact: true }).click();
  await page.getByRole("button", { name: "Add caption", exact: true }).click();
  const caption = page.locator(".caption-segment");
  const voice = page.locator(".audio-clip:not(.is-source):not(.is-music)");
  await expect(caption).toHaveCount(1);

  const linkPanel = page.getByTestId("caption-audio-link");
  await expect(linkPanel).toContainText("No linked voiceover");
  await linkPanel.getByRole("button", { name: "Link audio", exact: true }).click();
  await expect(linkPanel).toContainText("Linked voiceover");

  await caption.click({ button: "right" });
  const contextMenu = page.getByRole("menu", { name: "Timeline context menu" });
  await expect(contextMenu.getByRole("menuitem", { name: "Unlink", exact: true })).toBeVisible();
  await expect(contextMenu.getByRole("menuitem", { name: "Align to audio", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await voice.click({ button: "right" });
  await expect(contextMenu.getByRole("menuitem", { name: "Unlink", exact: true })).toBeVisible();
  await expect(contextMenu.getByRole("menuitem", { name: "Align to audio", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  const captionLeftBeforeLinkedMove = await caption.evaluate((element) => element.style.getPropertyValue("--caption-left"));
  await dragHorizontally(page, voice, 90);
  const captionLeftAfterLinkedMove = await caption.evaluate((element) => element.style.getPropertyValue("--caption-left"));
  expect(captionLeftAfterLinkedMove).not.toBe(captionLeftBeforeLinkedMove);

  await caption.click();
  await expect(linkPanel).toContainText("Linked voiceover");
  await linkPanel.getByRole("button", { name: "Unlink", exact: true }).click();
  await expect(linkPanel).toContainText("No linked voiceover");
  await expect(voice).toHaveCount(1);
  await expect(caption).toHaveCount(1);

  const captionLeftBeforeUnlinkedMove = await caption.evaluate((element) => element.style.getPropertyValue("--caption-left"));
  await dragHorizontally(page, voice, 70);
  const captionLeftAfterUnlinkedMove = await caption.evaluate((element) => element.style.getPropertyValue("--caption-left"));
  expect(captionLeftAfterUnlinkedMove).toBe(captionLeftBeforeUnlinkedMove);

  await caption.click();
  await linkPanel.getByRole("button", { name: "Link audio", exact: true }).click();
  await linkPanel.getByRole("button", { name: "Align to audio", exact: true }).click();
  const [captionBox, voiceBox] = await Promise.all([caption.boundingBox(), voice.boundingBox()]);
  expect(Math.abs(captionBox.x - voiceBox.x)).toBeLessThan(2);
  expect(Math.abs(captionBox.width - voiceBox.width)).toBeLessThan(2);

  await page.setViewportSize({ width: 412, height: 915 });
  await caption.click();
  const mobileActions = page.locator(".timeline-mobile-clip-actions");
  await expect(mobileActions.locator("button")).toHaveText([
    "Back", "Edit", "Split", "Copy", "Unlink", "Align to audio", "Delete",
  ]);
  const back = mobileActions.getByRole("button", { name: "Back", exact: true });
  const backLeftBeforeScroll = (await back.boundingBox()).x;
  const actionScroller = mobileActions.locator(".timeline-mobile-clip-action-scroller");
  const actionsBox = await actionScroller.boundingBox();
  await page.mouse.move(actionsBox.x + actionsBox.width - 20, actionsBox.y + actionsBox.height / 2);
  await page.mouse.wheel(500, 0);
  await expect.poll(() => actionScroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(Math.abs((await back.boundingBox()).x - backLeftBeforeScroll)).toBeLessThan(1);
  await expect(mobileActions.getByRole("button", { name: "Unlink", exact: true })).toBeVisible();
  await expect(mobileActions.getByRole("button", { name: "Align to audio", exact: true })).toBeVisible();
  await expect(mobileActions.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await page.mouse.wheel(-500, 0);
  await expect.poll(() => actionScroller.evaluate((element) => element.scrollLeft)).toBe(0);
  await mobileActions.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByTestId("caption-audio-link")).toBeVisible();
  await expect(page.getByTestId("caption-audio-link").getByRole("button", { name: "Align to audio", exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
