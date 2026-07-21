import { expect, test } from "@playwright/test";

test("mobile large-canvas close does not click through to the topbar", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => localStorage.setItem("ai-voiceover-ui-language", "zh"));
  await page.goto("/");

  await page.getByRole("button", { name: "大画布预览与编辑" }).click();
  const dialog = page.getByRole("dialog", { name: "大画布编辑" });
  await expect(dialog).toBeVisible();

  const closeButton = dialog.locator(".focus-preview-close");
  const closeBox = await closeButton.boundingBox();
  if (!closeBox) throw new Error("Large-canvas close button is unavailable");

  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const touchPoint = {
    id: 1,
    x: closeBox.x + closeBox.width / 2,
    y: closeBox.y + closeBox.height / 2,
    radiusX: 6,
    radiusY: 6,
    force: 1,
  };
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touchPoint] });
  await expect(dialog).toBeVisible();
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  await expect(dialog).toBeHidden();
  await expect(page.locator(".settings-panel")).toHaveCount(0);
});
