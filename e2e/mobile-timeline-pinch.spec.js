import { expect, test } from "@playwright/test";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);

function createSilentWav(durationSeconds = 1) {
  const sampleRate = 8_000;
  const sampleCount = Math.round(sampleRate * durationSeconds);
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(sampleCount * 2, 40);
  return buffer;
}

async function readTimelineState(page) {
  return page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll(".ruler-tick.is-major"))
      .map((tick) => tick.textContent?.trim() || "")
      .filter(Boolean)
      .map((label) => {
        const [minutes, seconds] = label.split(":");
        return Number(minutes) * 60 + Number(seconds);
      })
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const steps = labels.slice(1).map((value, index) => value - labels[index]).filter((value) => value > 0);
    return {
      currentTime: Number(document.querySelector(".scrubber")?.value || 0),
      labelStep: steps.length ? Math.min(...steps) : null,
      trackWidth: document.querySelector(".track-scroll")?.getBoundingClientRect().width || 0,
      scrollLeft: document.querySelector(".tracks")?.scrollLeft || 0,
      geometryTime: (() => {
        const track = document.querySelector(".track-scroll")?.getBoundingClientRect();
        const viewport = document.querySelector(".tracks")?.getBoundingClientRect();
        const duration = Number(document.querySelector(".scrubber")?.max || 0);
        if (!track || !viewport || !duration) return 0;
        return Math.max(0, Math.min(duration, ((viewport.left + viewport.width / 2 - track.left) / track.width) * duration));
      })(),
      zoomText: document.querySelector("[data-testid='timeline-zoom-readout']")?.textContent || "",
    };
  });
}

test("mobile ruler drag scrolls the shared timeline while desktop behavior stays separate", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => localStorage.setItem("ai-voiceover-ui-language", "zh"));
  await page.goto("/");
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "ruler-scroll-fixture.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator(".image-clip")).toBeVisible();

  const ruler = page.locator(".timeline-ruler-viewport");
  const rulerBox = await ruler.boundingBox();
  if (!rulerBox) throw new Error("Timeline ruler is not visible");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const y = rulerBox.y + rulerBox.height / 2;
  const startX = rulerBox.x + rulerBox.width * 0.72;
  const endX = rulerBox.x + rulerBox.width * 0.28;
  const touch = (x) => [{ id: 1, x, y, radiusX: 6, radiusY: 6, force: 1 }];

  const before = await readTimelineState(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touch(startX) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touch(endX) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(async () => (await readTimelineState(page)).scrollLeft).toBeGreaterThan(before.scrollLeft + 20);

  const after = await readTimelineState(page);
  expect(after.currentTime).toBeGreaterThan(before.currentTime);
  await expect(page.locator(".mobile-fixed-playhead")).toBeVisible();
});

test("mobile pinch zoom keeps the visible frame and ruler scale stable on release", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => localStorage.setItem("ai-voiceover-ui-language", "zh"));
  await page.goto("/");
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "pinch-fixture.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator(".image-clip")).toBeVisible();

  const tracks = page.locator(".tracks");
  await tracks.evaluate((element) => {
    element.scrollLeft = Math.min(120, element.scrollWidth - element.clientWidth);
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await page.waitForTimeout(80);

  const box = await tracks.boundingBox();
  if (!box) throw new Error("Timeline tracks are not visible");
  const centerX = box.x + box.width / 2;
  const centerY = box.y + Math.min(60, box.height / 2);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  const touchPoint = (id, x) => ({ id, x, y: centerY, radiusX: 6, radiusY: 6, force: 1 });

  const before = await readTimelineState(page);
  await page.screenshot({ path: testInfo.outputPath("01-before-pinch.png") });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchPoint(1, centerX - 45), touchPoint(2, centerX + 45)],
  });
  const frameStates = [];
  for (let distance = 55; distance <= 105; distance += 10) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [touchPoint(1, centerX - distance), touchPoint(2, centerX + distance)],
    });
    await page.waitForTimeout(20);
    frameStates.push({ distance: distance * 2, state: await readTimelineState(page) });
  }
  const visibleBeforeRelease = await readTimelineState(page);
  await page.screenshot({ path: testInfo.outputPath("02-visible-before-release.png") });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(100);
  const afterRelease = await readTimelineState(page);
  await page.screenshot({ path: testInfo.outputPath("03-after-release.png") });

  expect(visibleBeforeRelease.trackWidth).toBeGreaterThan(before.trackWidth);
  expect(visibleBeforeRelease.trackWidth / before.trackWidth).toBeCloseTo(210 / 90, 1);
  for (const frame of frameStates) {
    expect(frame.state.trackWidth / before.trackWidth).toBeCloseTo(frame.distance / 90, 1);
    expect(frame.state.geometryTime).toBeCloseTo(before.geometryTime, 2);
  }
  expect(afterRelease.trackWidth).toBeCloseTo(visibleBeforeRelease.trackWidth, 0);
  expect(afterRelease.currentTime).toBeCloseTo(visibleBeforeRelease.currentTime, 2);
  expect(afterRelease.labelStep).toBe(before.labelStep);
  expect(afterRelease.labelStep).toBe(visibleBeforeRelease.labelStep);
  expect(afterRelease.zoomText).toBe(visibleBeforeRelease.zoomText);
});

test("desktop timeline keeps its existing draggable playhead behavior", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.setItem("ai-voiceover-ui-language", "zh"));
  await page.goto("/");
  await expect(page.locator(".playhead")).toHaveCSS("cursor", "ew-resize");
  await expect(page.locator(".mobile-fixed-playhead")).toBeHidden();
});

test("desktop trackpad zoom keeps ruler and track geometry synchronized before commit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.setItem("ai-voiceover-ui-language", "zh"));
  await page.goto("/");
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "desktop-wheel-fixture.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  await page.keyboard.press("Escape");

  const clip = page.locator(".image-clip");
  await expect(clip).toBeVisible();
  const box = await clip.boundingBox();
  if (!box) throw new Error("Timeline clip is unavailable");

  const readGeometry = () => page.evaluate(() => {
    const track = document.querySelector(".track-scroll")?.getBoundingClientRect();
    const ruler = document.querySelector(".timeline-ruler-canvas")?.getBoundingClientRect();
    const trackPlayhead = document.querySelector(".playhead")?.getBoundingClientRect();
    const rulerPlayhead = document.querySelector(".playhead-ruler")?.getBoundingClientRect();
    return {
      trackWidth: track?.width || 0,
      rulerWidth: ruler?.width || 0,
      trackPlayheadX: trackPlayhead?.left || 0,
      rulerPlayheadX: rulerPlayhead?.left || 0,
    };
  });

  const before = await readGeometry();
  await clip.dispatchEvent("wheel", {
    deltaY: -120,
    deltaX: 0,
    deltaMode: 0,
    ctrlKey: true,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
    bubbles: true,
    cancelable: true,
  });
  await page.waitForTimeout(32);
  const during = await readGeometry();
  await page.waitForTimeout(260);
  const committed = await readGeometry();

  expect(during.trackWidth).toBeGreaterThan(before.trackWidth);
  expect(during.rulerWidth).toBeCloseTo(during.trackWidth, 0);
  expect(during.rulerPlayheadX).toBeCloseTo(during.trackPlayheadX, 0);
  expect(committed.rulerWidth).toBeCloseTo(committed.trackWidth, 0);
  expect(committed.rulerPlayheadX).toBeCloseTo(committed.trackPlayheadX, 0);
});

test("desktop horizontal scrolling keeps the ruler playhead aligned on every scroll event", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.setItem("ai-voiceover-ui-language", "zh"));
  await page.goto("/");
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "desktop-scroll-fixture.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator(".image-clip")).toBeVisible();

  await page.getByRole("button", { name: "放大时间线" }).click();
  await page.getByRole("button", { name: "放大时间线" }).click();
  await page.getByRole("button", { name: "放大时间线" }).click();
  await page.waitForTimeout(180);

  const offsets = await page.locator(".tracks").evaluate((element) => {
    const samples = [];
    for (const ratio of [0.2, 0.5, 0.8, 0.35]) {
      element.scrollLeft = (element.scrollWidth - element.clientWidth) * ratio;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
      const trackPlayhead = document.querySelector(".playhead")?.getBoundingClientRect();
      const rulerPlayhead = document.querySelector(".playhead-ruler")?.getBoundingClientRect();
      samples.push(Math.abs((trackPlayhead?.left || 0) - (rulerPlayhead?.left || 0)));
    }
    return samples;
  });

  for (const offset of offsets) expect(offset).toBeLessThanOrEqual(1);
});

test("desktop fast trackpad wheel scrolling advances ruler and tracks in the same frame", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.setItem("ai-voiceover-ui-language", "zh"));
  await page.goto("/");
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "desktop-fast-scroll-fixture.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  await page.keyboard.press("Escape");
  const clip = page.locator(".image-clip");
  await expect(clip).toBeVisible();
  await page.getByRole("button", { name: "放大时间线" }).click();
  await page.getByRole("button", { name: "放大时间线" }).click();
  await page.getByRole("button", { name: "放大时间线" }).click();
  await page.waitForTimeout(180);

  const box = await clip.boundingBox();
  if (!box) throw new Error("Timeline clip is unavailable");
  const offsets = [];
  for (const deltaX of [42, 88, 136, -54, 172, -96]) {
    await clip.dispatchEvent("wheel", {
      deltaX,
      deltaY: 2,
      deltaMode: 0,
      clientX: box.x + Math.min(40, box.width / 2),
      clientY: box.y + box.height / 2,
      bubbles: true,
      cancelable: true,
    });
    offsets.push(await page.evaluate(() => {
      const trackPlayhead = document.querySelector(".playhead")?.getBoundingClientRect();
      const rulerPlayhead = document.querySelector(".playhead-ruler")?.getBoundingClientRect();
      return Math.abs((trackPlayhead?.left || 0) - (rulerPlayhead?.left || 0));
    }));
  }

  for (const offset of offsets) expect(offset).toBeLessThanOrEqual(1);
});

test("mobile trackpad wheel zoom uses pixels and does not jump when committed", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => localStorage.setItem("ai-voiceover-ui-language", "zh"));
  await page.goto("/");
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "wheel-pinch-fixture.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  await page.keyboard.press("Escape");
  const clip = page.locator(".image-clip");
  await expect(clip).toBeVisible();
  const box = await clip.boundingBox();
  if (!box) throw new Error("Timeline clip is unavailable");
  const before = await readTimelineState(page);
  const deltaY = -40;
  await clip.dispatchEvent("wheel", {
    deltaY,
    deltaX: 0,
    deltaMode: 0,
    ctrlKey: true,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
    bubbles: true,
    cancelable: true,
  });
  await page.waitForTimeout(32);
  const during = await readTimelineState(page);
  await page.waitForTimeout(260);
  const committed = await readTimelineState(page);

  expect(during.trackWidth / before.trackWidth).toBeCloseTo(Math.exp(40 * 0.00056), 2);
  expect(committed.trackWidth).toBeCloseTo(during.trackWidth, 0);
  expect(committed.geometryTime).toBeCloseTo(before.geometryTime, 2);
  expect(committed.currentTime).toBeCloseTo(before.currentTime, 2);
});

test("mobile pinch beginning on a voiceover never moves the timed clip", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => localStorage.setItem("ai-voiceover-ui-language", "zh"));
  await page.goto("/");
  const input = page.locator('input[type="file"][multiple]');
  await input.setInputFiles({
    name: "pinch-fixture.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  await page.keyboard.press("Escape");
  await page.getByText("媒体", { exact: true }).last().click();
  await input.setInputFiles({
    name: "voice-pinch.wav",
    mimeType: "audio/wav",
    buffer: createSilentWav(),
  });
  await page.getByRole("button", { name: "添加到配音轨" }).click();

  const clip = page.locator(".audio-clip:not(.is-source):not(.is-music)").first();
  await expect(clip).toBeVisible();
  const tracks = page.locator(".tracks");
  await page.getByRole("button", { name: "放大" }).click();
  await page.getByRole("button", { name: "放大" }).click();
  await page.waitForTimeout(180);
  await tracks.evaluate((element) => {
    element.scrollLeft = Math.min(80, element.scrollWidth - element.clientWidth);
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await page.waitForTimeout(80);
  const clipBox = await clip.boundingBox();
  const tracksBox = await tracks.boundingBox();
  if (!clipBox || !tracksBox) throw new Error("Voiceover timeline geometry is unavailable");
  const startLeft = await clip.evaluate((element) => element.style.left);
  const startWidth = await clip.evaluate((element) => element.style.width);
  const startState = await readTimelineState(page);
  const y = tracksBox.y + Math.min(62, tracksBox.height / 3);
  const firstX = tracksBox.x + tracksBox.width / 2 - 45;
  const secondX = Math.min(tracksBox.x + tracksBox.width - 12, firstX + 90);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  const touchPoint = (id, x) => ({ id, x, y, radiusX: 6, radiusY: 6, force: 1 });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchPoint(1, firstX)],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [touchPoint(1, firstX + 8)],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchPoint(1, firstX + 8), touchPoint(2, secondX)],
  });
  const handoffState = await readTimelineState(page);
  const midpoint = (firstX + secondX) / 2;
  for (let progress = 0; progress <= 0.65; progress += 0.13) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        touchPoint(1, firstX + (midpoint - firstX) * progress),
        touchPoint(2, secondX + (midpoint - secondX) * progress),
      ],
    });
    await page.waitForTimeout(18);
  }
  await page.waitForTimeout(32);
  const visibleBeforeRelease = {
    timeline: await readTimelineState(page),
    clip: await clip.boundingBox(),
  };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(100);
  const afterRelease = {
    timeline: await readTimelineState(page),
    clip: await clip.boundingBox(),
  };
  await page.waitForTimeout(450);
  const afterMomentumWindow = {
    timeline: await readTimelineState(page),
    clip: await clip.boundingBox(),
  };

  expect(visibleBeforeRelease.timeline.trackWidth).toBeLessThan(startState.trackWidth);
  expect(afterRelease.timeline.trackWidth).toBeCloseTo(visibleBeforeRelease.timeline.trackWidth, 0);
  expect(afterRelease.timeline.currentTime).toBeCloseTo(handoffState.currentTime, 2);
  expect(afterRelease.timeline.currentTime).toBeCloseTo(visibleBeforeRelease.timeline.currentTime, 2);
  expect(afterRelease.clip?.x).toBeCloseTo(visibleBeforeRelease.clip?.x || 0, 0);
  expect(afterRelease.clip?.width).toBeCloseTo(visibleBeforeRelease.clip?.width || 0, 0);
  expect(afterMomentumWindow.timeline.currentTime).toBeCloseTo(afterRelease.timeline.currentTime, 2);
  expect(afterMomentumWindow.clip?.x).toBeCloseTo(afterRelease.clip?.x || 0, 0);
  expect(await clip.evaluate((element) => element.style.left)).toBe(startLeft);
  expect(await clip.evaluate((element) => element.style.width)).toBe(startWidth);
});
