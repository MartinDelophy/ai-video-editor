import { expect, test } from "@playwright/test";

test("same-asset sticker instances remain independent during cross-subtrack drag", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("ai-voiceover-ui-language", "zh");
  });
  await page.goto("/");

  const project = {
    format: "timeline-studio-project",
    project: {
      script: "",
      captionSegments: [],
      selectedStickerId: "trend-spark",
      stickerSegments: [
        { id: "spark-a", stickerId: "trend-spark", name: "闪光爆点", src: "/assets/stickers/trend-spark.png", start: 5, duration: 3, lane: 0 },
        { id: "spark-b", stickerId: "trend-spark", name: "闪光爆点", src: "/assets/stickers/trend-spark.png", start: 5, duration: 3, lane: 1 },
        { id: "flame", stickerId: "trend-flame", name: "热度火焰", src: "/assets/stickers/trend-flame.png", start: 0, duration: 4, lane: 2 },
      ],
    },
  };
  await page.locator(".project-file-input").setInputFiles({
    name: "sticker-lanes.timeline",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });

  await expect(page.locator(".sticker-track")).toHaveCount(3);
  const moving = page.locator('[data-timeline-segment-id="spark-b"]');
  const untouched = page.locator('[data-timeline-segment-id="spark-a"]');
  const thirdLane = page.locator('[data-sticker-lane-index="2"]');
  await expect(moving).toBeVisible();
  const movingBox = await moving.boundingBox();
  const thirdLaneBox = await thirdLane.boundingBox();
  if (!movingBox || !thirdLaneBox) throw new Error("Sticker subtracks are unavailable");

  await page.mouse.move(movingBox.x + movingBox.width / 2, movingBox.y + movingBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(movingBox.x + movingBox.width / 2 + 8, thirdLaneBox.y + thirdLaneBox.height / 2, { steps: 6 });

  await expect(thirdLane.getByTestId("sticker-drop-preview")).toBeVisible();
  await expect(moving).toHaveClass(/is-timeline-dragging/);
  await expect(page.locator('[data-sticker-lane-index="1"] [data-timeline-segment-id="spark-b"]')).toHaveCount(1);
  await page.mouse.up();

  await expect(page.getByTestId("sticker-drop-preview")).toHaveCount(0);
  await expect(thirdLane.locator('[data-timeline-segment-id="spark-b"]')).toHaveCount(1);
  await expect(page.locator('[data-timeline-segment-id="spark-b"]')).toHaveCount(1);
  await expect(page.locator('[data-timeline-segment-id="spark-a"]')).toHaveCount(1);
  await expect(untouched).toHaveAttribute("data-timeline-segment-id", "spark-a");
});
