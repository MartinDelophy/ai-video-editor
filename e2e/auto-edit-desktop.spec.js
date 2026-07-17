import { expect, test } from "@playwright/test";

const videos = [process.env.AUTO_EDIT_VIDEO_A, process.env.AUTO_EDIT_VIDEO_B].filter(Boolean);

test.describe("Auto Edit desktop video smoke", () => {
  test.skip(videos.length !== 2, "Set AUTO_EDIT_VIDEO_A and AUTO_EDIT_VIDEO_B to run the local smoke test");

  for (const [index, videoPath] of videos.entries()) {
    test(`imports and samples desktop video ${index + 1}`, async ({ page }) => {
      if (process.env.AUTO_EDIT_FULL && index === 0) test.setTimeout(12 * 60 * 1000);
      if (process.env.AUTO_EDIT_MOCK_MODEL) await page.addInitScript(() => {
        window.LanguageModel = {
          availability: async () => "available",
          create: async () => ({
            prompt: async (messages) => {
              const prompt = messages?.[0]?.content?.find?.((item) => item.type === "text")?.value || "";
              const firstTime = Number(prompt.match(/timestamps?:\s*([\d.]+)/i)?.[1] || prompt.match(/at\s+([\d.]+)\s+seconds/i)?.[1] || 0);
              return JSON.stringify({ captions: [{ start: firstTime, end: firstTime + 2.8, text: `Visual description for clip at ${firstTime.toFixed(1)} seconds.` }] });
            },
            destroy() {},
          }),
        };
      });
      await page.goto("/");
      const languageIntro = page.locator(".language-intro");
      if (await languageIntro.isVisible()) {
        await languageIntro.locator(".language-grid button").filter({ hasText: "简体中文" }).click();
        await expect(languageIntro).toBeHidden();
      }
      const mediaInput = page.locator('input[type="file"][accept*="video/mp4"]');
      if (process.env.AUTO_EDIT_MULTI) {
        await mediaInput.setInputFiles(videos[0]);
        await expect(page.locator(".asset-row-button")).toHaveCount(1);
        await mediaInput.setInputFiles(videos[1]);
        await expect(page.locator(".asset-row-button")).toHaveCount(2);
      } else {
        await mediaInput.setInputFiles(videoPath);
      }
      const preview = page.locator(".preview-video");
      await expect(preview).toBeVisible();
      await expect.poll(async () => Number(await preview.evaluate((video) => video.duration))).toBeGreaterThan(0);
      const result = await preview.evaluate(async (video) => {
        const { extractAutoEditFrames, probeBuiltInAI } = await import("/src/lib/autoEdit.js");
        const duration = video.duration;
        const frames = await extractAutoEditFrames([{ id: "desktop-smoke", type: "video", src: video.src, duration, sourceDuration: duration }]);
        return { duration, frameCount: frames.length, times: frames.map((frame) => Number(frame.time.toFixed(2))), support: await probeBuiltInAI("zh") };
      });
      console.log(`AUTO_EDIT_RESULT_${index + 1}=${JSON.stringify(result)}`);
      expect(result.frameCount).toBeGreaterThanOrEqual(2);
      expect(result.times[0]).toBe(0);
      expect(result.times.at(-1)).toBeCloseTo(result.duration, 1);

      if (process.env.AUTO_EDIT_FULL && index === 0) {
        await page.getByRole("button", { name: "智能", exact: true }).click();
        await page.getByRole("button", { name: "检测浏览器支持", exact: true }).click();
        await expect(page.locator(".auto-edit-availability")).toHaveText(/可用|模型待下载|下载中/);
        await expect(page.locator(".toast")).toBeHidden({ timeout: 10_000 });
        await page.locator(".auto-edit-generate").click();
        await expect(page.getByRole("dialog", { name: "画面分析与字幕检查" })).toBeVisible();
        await page.waitForTimeout(3_000);
        console.log(`AUTO_EDIT_UI=${JSON.stringify(await page.locator(".auto-edit-panel").innerText())}`);
        if (await page.locator(".toast").isVisible()) console.log(`AUTO_EDIT_TOAST=${JSON.stringify(await page.locator(".toast").innerText())}`);
        await expect(page.getByText("字幕草稿已准备好", { exact: true })).toBeVisible({ timeout: 10 * 60 * 1000 });
        if (process.env.AUTO_EDIT_MULTI) expect(await page.locator(".auto-edit-clip-result").count()).toBe(2);
        if (process.env.AUTO_EDIT_MOCK_MODEL) await page.screenshot({ path: "test-results/auto-edit-review.png", fullPage: true });
        await page.getByRole("button", { name: "应用到字幕轨", exact: true }).click();
        await expect(page.getByText("画面字幕已写入时间轴", { exact: true })).toBeVisible();
        console.log(`AUTO_EDIT_CAPTIONS=${await page.locator(".caption-segment").count()}`);
      }
    });
  }
});
