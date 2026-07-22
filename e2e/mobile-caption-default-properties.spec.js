import { expect, test } from "@playwright/test";

test("mobile Captions opens Properties by default", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("ai-voiceover-ui-language", "zh");
  });
  await page.goto("/");

  await page.locator(".tool-rail").getByRole("button", { name: "字幕" }).click();

  const drawerTabs = page.getByRole("tablist", { name: "抽屉视图" });
  await expect(drawerTabs.getByRole("tab", { name: "属性" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".voice-panel.is-caption-context")).toBeVisible();
  await expect(page.locator(".media-panel")).toBeHidden();

  await page.locator(".voice-panel.is-caption-context").getByRole("button", { name: "添加字幕" }).click();
  const listHeading = page.locator(".caption-context-heading");
  const listTitle = listHeading.locator("span");
  const addCaption = listHeading.getByRole("button", { name: "添加字幕" });
  const importSrt = listHeading.getByRole("button", { name: "导入 SRT" });
  const layout = await listHeading.evaluate((element) => {
    const title = element.querySelector("span")?.getBoundingClientRect();
    const buttons = Array.from(element.querySelectorAll("button"), (button) => ({
      ...button.getBoundingClientRect().toJSON(),
      whiteSpace: getComputedStyle(button).whiteSpace,
    }));
    return { title: title?.toJSON(), buttons };
  });
  expect(layout.buttons).toHaveLength(2);
  expect(layout.buttons[0].top).toBeGreaterThan(layout.title.bottom);
  expect(layout.buttons[0].top).toBeCloseTo(layout.buttons[1].top, 0);
  expect(layout.buttons.every((button) => button.whiteSpace === "nowrap")).toBe(true);
  await expect(listTitle).toContainText("字幕列表");
  await expect(addCaption).toBeVisible();
  await expect(importSrt).toBeVisible();

  await drawerTabs.getByRole("tab", { name: "工具" }).click();
  await expect(page.locator(".media-panel")).toBeVisible();
});
