import { expect, test } from "@playwright/test";

const firstSrt = `1
00:00:01,250 --> 00:00:03,500
Imported first line

2
00:00:05,000 --> 00:00:06,750
Imported second line`;

test("imports SRT captions with exact timing and supports replace and append", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ai-voiceover-ui-language", "en"));
  await page.goto("/");
  await page.getByRole("button", { name: "Captions", exact: true }).click();

  const input = page.getByTestId("srt-file-input");
  await input.setInputFiles({ name: "captions.srt", mimeType: "application/x-subrip", buffer: Buffer.from(firstSrt) });
  await expect(page.locator(".caption-segment")).toHaveCount(2);
  await expect(page.locator(".caption-context-list")).toContainText("Imported first line");
  await expect(page.locator(".caption-context-list")).toContainText("Imported second line");
  const styles = await page.locator(".caption-segment").evaluateAll((clips) => clips.map((clip) => ({ left: clip.style.getPropertyValue("--caption-left"), width: clip.style.getPropertyValue("--caption-width") })));
  expect(parseFloat(styles[0].left)).toBeGreaterThan(0);
  expect(parseFloat(styles[1].left)).toBeGreaterThan(parseFloat(styles[0].left));
  expect(parseFloat(styles[0].width)).toBeGreaterThan(parseFloat(styles[1].width));

  await input.setInputFiles({ name: "more.srt", mimeType: "application/x-subrip", buffer: Buffer.from("1\n00:00:08,000 --> 00:00:09,000\nAppended line") });
  await page.getByRole("dialog", { name: "How should these captions be imported?" }).getByRole("button", { name: "Append to track", exact: true }).click();
  await expect(page.locator(".caption-segment")).toHaveCount(3);
  await expect(page.locator(".caption-context-list")).toContainText("Appended line");
  await expect(page.locator(".toast")).toContainText("Imported 1 captions; skipped 0");

  await input.setInputFiles({ name: "replacement.srt", mimeType: "application/x-subrip", buffer: Buffer.from("1\n00:00:02,000 --> 00:00:04,000\nReplacement line") });
  await page.getByRole("dialog", { name: "How should these captions be imported?" }).getByRole("button", { name: "Replace captions", exact: true }).click();
  await expect(page.locator(".caption-segment")).toHaveCount(1);
  await expect(page.locator(".caption-context-list")).toContainText("Replacement line");
  await expect(page.locator(".caption-context-list")).not.toContainText("Imported first line");
});
