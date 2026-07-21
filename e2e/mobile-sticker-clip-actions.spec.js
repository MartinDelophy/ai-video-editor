import { expect, test } from "@playwright/test";

test("mobile sticker clip exposes direct properties, copy, and delete actions", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("ai-voiceover-ui-language", "zh");
  });
  await page.goto("/");

  await page.locator(".tool-rail").getByRole("button", { name: "贴纸" }).click();
  await page.getByRole("button", { name: "热度火焰" }).click();
  await page.getByRole("button", { name: "添加贴纸" }).click();

  const stickerClip = page.locator(".sticker-segment");
  await expect(stickerClip).toBeVisible();
  await stickerClip.click();

  const actions = page.locator(".timeline-mobile-clip-actions");
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("button")).toHaveCount(4);
  await expect(actions.getByRole("button", { name: "返回" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "属性" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "复制" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "删除" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "分割" })).toHaveCount(0);

  await actions.getByRole("button", { name: "属性" }).click();
  const properties = page.locator(".voice-panel.is-sticker-context");
  await expect(properties).toBeVisible();
  await expect(page.locator(".mobile-sheet-nav strong")).toHaveText("贴纸属性");
  await expect(page.locator(".mobile-sheet-nav [role='tab']")).toHaveCount(0);
  await expect(properties.getByText("不透明度", { exact: true })).toBeVisible();
  await expect(actions).toBeVisible();

  await page.locator(".mobile-sheet-close").click();
  await expect(properties).toBeHidden();
  await expect(actions).toBeVisible();

  await actions.getByRole("button", { name: "删除" }).click();
  await expect(stickerClip).toHaveCount(0);
  await expect(page.locator(".sticker-track")).toHaveCount(0);
});

test("desktop sticker selection keeps the mobile action bar hidden", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.setItem("ai-voiceover-ui-language", "zh"));
  await page.goto("/");
  await expect(page.locator(".timeline-mobile-clip-actions")).toHaveCount(0);
});
