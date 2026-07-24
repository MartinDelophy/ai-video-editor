import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 412, height: 915 },
];

for (const viewport of VIEWPORTS) {
  test(`${viewport.name} export settings stay simple`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("simple-export-test-initialized")) {
        localStorage.clear();
        sessionStorage.setItem("simple-export-test-initialized", "1");
      }
      localStorage.setItem("ai-voiceover-ui-language", "zh");
    });
    await page.goto("/");

    await page.getByRole("button", { name: "导出视频" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "请先添加画面素材" })).toBeVisible();

    await expect(dialog.getByRole("textbox", { name: "文件名" })).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "分辨率" })).toHaveValue("1080");
    await expect(dialog.getByRole("combobox", { name: "导出格式" })).toHaveValue("h264");
    await expect(dialog.getByRole("combobox", { name: "导出格式" }).locator("option")).toContainText([
      "MP4 · H.264",
      "MOV · H.264",
      "WebM · VP9",
      "WebM · VP8",
    ]);
    await expect(dialog.getByRole("combobox", { name: "视频码率" })).toHaveValue("auto");
    await expect(dialog.getByRole("combobox", { name: "音频码率" })).toHaveValue("192000");

    await expect(dialog.getByText("导出范围")).toHaveCount(0);
    await expect(dialog.getByText("帧率")).toHaveCount(0);
    await expect(dialog.getByText("画质")).toHaveCount(0);
    await expect(dialog.getByText("关键帧间隔")).toHaveCount(0);
    await expect(dialog.getByText("导出策略")).toHaveCount(0);
    await expect(dialog.getByText("导出预设")).toHaveCount(0);
    await expect(dialog.getByText("批量导出")).toHaveCount(0);
    await expect(dialog.getByText("最近导出")).toHaveCount(0);

    await dialog.getByRole("textbox", { name: "文件名" }).fill("Launch / Final.mp4");
    await dialog.getByRole("combobox", { name: "导出格式" }).selectOption("h264-mov");
    await dialog.getByRole("combobox", { name: "视频码率" }).selectOption("20");
    await dialog.getByRole("combobox", { name: "音频码率" }).selectOption("320000");
    await expect(dialog).toContainText("MOV");
    await expect(dialog).toContainText("H.264 + AAC");
    await expect(dialog).toContainText("20 Mbps");

    const layout = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const scrollableDescendants = Array.from(element.querySelectorAll("*")).filter((node) => {
        const style = getComputedStyle(node);
        return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
      });
      return {
        rect: rect.toJSON(),
        viewport: { width: innerWidth, height: innerHeight },
        scrollableDescendants: scrollableDescendants.length,
      };
    });
    expect(layout.rect.left).toBeGreaterThanOrEqual(0);
    expect(layout.rect.right).toBeLessThanOrEqual(layout.viewport.width);
    expect(layout.rect.top).toBeGreaterThanOrEqual(0);
    expect(layout.rect.bottom).toBeLessThanOrEqual(layout.viewport.height);
    expect(layout.scrollableDescendants).toBeLessThanOrEqual(1);

    if (viewport.name === "desktop") {
      await expect.poll(() => page.evaluate(() => localStorage.getItem("timeline-studio-export-settings-v1"))).toContain("20000000");
      await page.reload();
      await page.getByRole("button", { name: "导出视频" }).click();
      const restored = page.getByRole("dialog");
      await expect(restored.getByRole("textbox", { name: "文件名" })).toHaveValue("Launch - Final");
      await expect(restored.getByRole("combobox", { name: "导出格式" })).toHaveValue("h264-mov");
      await expect(restored.getByRole("combobox", { name: "视频码率" })).toHaveValue("20");
      await expect(restored.getByRole("combobox", { name: "音频码率" })).toHaveValue("320000");
    }
  });
}
