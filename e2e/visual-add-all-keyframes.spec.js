import { expect, test } from "@playwright/test";

const visualFile = process.env.E2E_VISUAL_FILE;
test.use({ channel: "chrome" });
test.skip(!visualFile, "Set E2E_VISUAL_FILE to an image or video file");

test("Add all keyframes animates a real uploaded visual clip", async ({ page }) => {
  await page.goto("/");
  const languageDialog = page.getByRole("dialog");
  if (await languageDialog.isVisible()) {
    await languageDialog.getByRole("button", { name: /中文.*简体中文/ }).click();
    await expect(languageDialog).toBeHidden();
  }
  await page.locator('input[type="file"][multiple]').setInputFiles(visualFile);

  const asset = page.getByRole("button", { name: new RegExp(visualFile.split("/").at(-1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  await expect(asset).toContainText("1280 x 720");
  await asset.dblclick();

  await expect(page.locator("video.preview-video")).toBeVisible();
  await expect(page.getByText("/ 00:10.02", { exact: false })).toBeVisible();
  await expect(page.locator(".audio-clip.is-source")).toBeVisible({ timeout: 30_000 });
  const sourceAudio = page.locator('audio[data-track="source-audio"]');
  const unlinkSourceAudio = page.getByRole("button", { name: "解除画面与视频原声同步", exact: true });
  await expect(unlinkSourceAudio).toBeEnabled();
  const scrubber = page.locator(".preview-stage .scrubber");
  await scrubber.fill("2.5");
  await page.locator(".image-clip").click();
  await expect(page.getByRole("heading", { name: "画面", exact: true })).toBeVisible();
  await expect(scrubber).toHaveValue("2.5");
  await scrubber.fill("1");

  const fields = {
    scale: page.getByRole("spinbutton", { name: "缩放 · 关键帧" }),
    x: page.getByRole("spinbutton", { name: "水平位置 · 关键帧" }),
    y: page.getByRole("spinbutton", { name: "垂直位置 · 关键帧" }),
    rotation: page.getByRole("spinbutton", { name: "旋转 · 关键帧" }),
    opacity: page.getByRole("spinbutton", { name: "不透明度 · 关键帧" }),
  };
  const addAll = page.getByRole("button", { name: "添加全部关键帧", exact: true });
  await fields.scale.fill("120");
  await fields.x.fill("20");
  await fields.y.fill("-10");
  await fields.rotation.fill("5");
  await fields.opacity.fill("80");
  await addAll.click();

  await scrubber.fill("3");
  await fields.scale.fill("160");
  await fields.x.fill("60");
  await fields.y.fill("30");
  await fields.rotation.fill("25");
  await fields.opacity.fill("40");
  await addAll.click();
  await expect(page.getByText(/2 帧/).first()).toBeVisible();
  await page.getByRole("button", { name: "1.00s · 关键帧", exact: true }).click();
  await expect(scrubber).toHaveValue("1");

  await scrubber.fill("0");
  await expect(fields.scale).toHaveValue("100");
  await expect(fields.x).toHaveValue("0");
  await expect(fields.y).toHaveValue("0");
  await expect(fields.rotation).toHaveValue("0");
  await expect(fields.opacity).toHaveValue("100");

  await scrubber.fill("2");
  await expect.poll(async () => Number(await fields.scale.inputValue())).toBeGreaterThan(135);
  await expect.poll(async () => Number(await fields.scale.inputValue())).toBeLessThan(145);
  await expect.poll(async () => Number(await fields.x.inputValue())).toBeGreaterThan(35);
  await expect.poll(async () => Number(await fields.x.inputValue())).toBeLessThan(45);
  await expect.poll(async () => Number(await fields.y.inputValue())).toBeGreaterThan(5);
  await expect.poll(async () => Number(await fields.y.inputValue())).toBeLessThan(15);
  await expect.poll(async () => Number(await fields.rotation.inputValue())).toBeGreaterThan(10);
  await expect.poll(async () => Number(await fields.rotation.inputValue())).toBeLessThan(20);
  await expect.poll(async () => Number(await fields.opacity.inputValue())).toBeGreaterThan(55);
  await expect.poll(async () => Number(await fields.opacity.inputValue())).toBeLessThan(70);

  const mediaStyle = await page.locator("video.preview-video").getAttribute("style");
  expect(mediaStyle).toContain("translate(");
  expect(mediaStyle).toContain("scale(");
  expect(mediaStyle).toContain("rotate(");

  await page.getByRole("tab", { name: "变速", exact: true }).click();
  await page.getByRole("button", { name: "2×", exact: true }).click();
  await expect(page.getByText("素材时长").locator("..")).toContainText("10.02s");
  await expect(page.getByText("时间轴时长").locator("..")).toContainText("5.01s");
  await expect(page.locator(".image-clip")).toContainText("00:05");
  await expect(page.locator(".audio-clip.is-source.is-linked")).toBeVisible();
  await expect(page.locator(".audio-clip.is-source.is-linked")).toContainText("00:04");

  await scrubber.fill("2");
  await expect.poll(async () => page.locator("video.preview-video").evaluate((video) => video.currentTime))
    .toBeGreaterThan(3.8);
  await expect.poll(async () => page.locator("video.preview-video").evaluate((video) => video.currentTime))
    .toBeLessThan(4.2);
  await expect(page.locator("video.preview-video")).toHaveJSProperty("playbackRate", 2);
  await expect.poll(async () => sourceAudio.evaluate((audio) => audio.currentTime)).toBeGreaterThan(3.8);
  await expect.poll(async () => sourceAudio.evaluate((audio) => audio.currentTime)).toBeLessThan(4.2);
  await expect(sourceAudio).toHaveJSProperty("playbackRate", 2);

  await unlinkSourceAudio.click();
  await expect(page.getByRole("button", { name: "同步画面与视频原声", exact: true })).toBeVisible();
  await expect(page.locator(".audio-clip.is-source:not(.is-linked)")).toContainText("00:09.98");
  await scrubber.fill("2.5");
  await expect.poll(async () => sourceAudio.evaluate((audio) => audio.currentTime)).toBeGreaterThan(2.3);
  await expect.poll(async () => sourceAudio.evaluate((audio) => audio.currentTime)).toBeLessThan(2.7);
  await expect(sourceAudio).toHaveJSProperty("playbackRate", 1);
  await expect.poll(async () => page.locator("video.preview-video").evaluate((video) => video.currentTime))
    .toBeGreaterThan(4.8);
  await expect.poll(async () => page.locator("video.preview-video").evaluate((video) => video.currentTime))
    .toBeLessThan(5.2);
});
