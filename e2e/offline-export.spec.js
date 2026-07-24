import { expect, test } from "@playwright/test";

test("MOV export writes an H.264/AAC QuickTime file without re-encoding fallback", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { exportOfflineVideo } = await import("/src/lib/offlineVideoExport.js");
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d");
    context.fillStyle = "#184f72";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const source = canvas.toDataURL("image/png");

    const sampleRate = 8_000;
    const sampleCount = sampleRate;
    const wav = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(wav);
    const write = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
    write(0, "RIFF"); view.setUint32(4, 36 + sampleCount * 2, true); write(8, "WAVEfmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data");
    view.setUint32(40, sampleCount * 2, true);
    for (let index = 0; index < sampleCount; index += 1) {
      view.setInt16(44 + index * 2, Math.sin(index / sampleRate * Math.PI * 2 * 440) * 8_000, true);
    }
    const voice = new Blob([wav], { type: "audio/wav" });
    const exported = await exportOfflineVideo({
      imageSrc: source,
      visualType: "image",
      visualSegments: [{ id: "visual", src: source, type: "image", duration: 1 }],
      voiceAudioSegments: [{ id: "voice", blob: voice, start: 0, duration: 1, volume: 1 }],
      sourceAudioBlob: null,
      sourceAudioSegments: [],
      musicBlob: null,
      text: "",
      captionSegments: [],
      duration: 1,
      ratio: { width: 16, height: 9 },
      fitMode: "cover",
      filter: "none",
      captionsEnabled: false,
      captionSize: 12,
      captionStyle: {},
      captionReferenceSize: { width: 320, height: 180 },
      sticker: null,
      stickerSegments: [],
      exportSettings: {
        codec: "h264-mov",
        width: 320,
        height: 180,
        frameRate: 30,
        videoBitsPerSecond: 1_000_000,
        audioBitsPerSecond: 128_000,
      },
    });
    const bytes = new Uint8Array(await exported.blob.arrayBuffer());
    const header = new TextDecoder("latin1").decode(bytes.slice(0, 64));
    const audioContext = new AudioContext();
    const decodedAudio = await audioContext.decodeAudioData(bytes.buffer.slice(0));
    await audioContext.close();
    const url = URL.createObjectURL(exported.blob);
    const video = document.createElement("video");
    video.muted = true;
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });
    const metadata = {
      type: exported.blob.type,
      extension: exported.extension,
      label: exported.label,
      header,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      audioDuration: decodedAudio.duration,
      audioBitrate: exported.diagnostics.audioBitrate,
      frameCount: exported.diagnostics.frameCount,
      size: exported.blob.size,
    };
    URL.revokeObjectURL(url);
    return metadata;
  });
  expect(result).toMatchObject({
    type: "video/quicktime",
    extension: "mov",
    label: "MOV",
    width: 320,
    height: 180,
    audioBitrate: 128_000,
    frameCount: 30,
  });
  expect(result.header).toContain("ftyp");
  expect(result.duration).toBeGreaterThanOrEqual(0.95);
  expect(result.duration).toBeLessThanOrEqual(1.05);
  expect(result.audioDuration).toBeGreaterThanOrEqual(0.95);
  expect(result.size).toBeGreaterThan(10_000);
});

test("five-second timeline exports exactly 150 frames at 30 fps", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { exportOfflineVideo } = await import("/src/lib/offlineVideoExport.js");
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext("2d");
    context.fillStyle = "#13978c";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const source = canvas.toDataURL("image/png");
    const exported = await exportOfflineVideo({
      imageSrc: source,
      visualType: "image",
      visualSegments: [{ id: "visual", src: source, type: "image", duration: 5 }],
      voiceAudioSegments: [],
      sourceAudioBlob: null,
      sourceAudioSegments: [],
      musicBlob: null,
      text: "A deliberately long script must not extend this five-second visual.",
      captionSegments: [],
      duration: 5,
      ratio: { width: 16, height: 9 },
      fitMode: "cover",
      filter: "none",
      captionsEnabled: false,
      captionSize: 12,
      captionStyle: {},
      captionReferenceSize: { width: 160, height: 90 },
      sticker: null,
      stickerSegments: [],
      exportSettings: {
        codec: "vp9",
        width: 160,
        height: 90,
        frameRate: 30,
        videoBitsPerSecond: 1_000_000,
      },
    });
    const url = URL.createObjectURL(exported.blob);
    const video = document.createElement("video");
    video.muted = true;
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });
    const result = {
      duration: video.duration,
      frameCount: exported.diagnostics.frameCount,
      size: exported.blob.size,
    };
    URL.revokeObjectURL(url);
    return result;
  });
  expect(result.frameCount).toBe(150);
  expect(result.duration).toBeGreaterThanOrEqual(4.95);
  expect(result.duration).toBeLessThanOrEqual(5.05);
  expect(result.size).toBeGreaterThan(1_000);
});

test("active deterministic export stops at the next frame boundary when canceled", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { exportOfflineVideo } = await import("/src/lib/offlineVideoExport.js");
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d");
    context.fillStyle = "#13978c";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const source = canvas.toDataURL("image/png");
    const controller = new AbortController();
    let renderedFrames = 0;
    const startedAt = performance.now();
    try {
      await exportOfflineVideo({
        imageSrc: source,
        visualType: "image",
        visualSegments: [{ id: "image", src: source, type: "image", duration: 60 }],
        voiceAudioSegments: [],
        sourceAudioBlob: null,
        sourceAudioSegments: [],
        musicBlob: null,
        text: "",
        captionSegments: [],
        duration: 60,
        ratio: { width: 16, height: 9 },
        fitMode: "cover",
        filter: "none",
        captionsEnabled: false,
        captionSize: 12,
        captionStyle: {},
        captionReferenceSize: { width: 320, height: 180 },
        sticker: null,
        stickerSegments: [],
        signal: controller.signal,
        onProgress: ({ phaseKey }) => {
          if (phaseKey === "exportOfflineRendering") {
            renderedFrames += 1;
            controller.abort();
          }
        },
        exportSettings: {
          codec: "vp9",
          width: 320,
          height: 180,
          frameRate: 30,
          videoBitsPerSecond: 1_000_000,
        },
      });
      return { completed: true };
    } catch (error) {
      return {
        completed: false,
        name: error?.name,
        renderedFrames,
        elapsed: performance.now() - startedAt,
      };
    }
  });
  expect(result).toMatchObject({ completed: false, name: "AbortError", renderedFrames: 1 });
  expect(result.elapsed).toBeLessThan(5_000);
});

test("offline export preserves stickers, captions, voice audio, dimensions and duration", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { exportOfflineVideo } = await import("/src/lib/offlineVideoExport.js");
    const makeImage = (draw) => {
      const canvas = document.createElement("canvas");
      canvas.width = 320; canvas.height = 180;
      draw(canvas.getContext("2d"), canvas);
      return canvas.toDataURL("image/png");
    };
    const background = makeImage((context, canvas) => {
      context.fillStyle = "#c20d18"; context.fillRect(0, 0, canvas.width, canvas.height);
    });
    const sticker = makeImage((context) => {
      context.clearRect(0, 0, 320, 180);
      context.fillStyle = "#00ffff"; context.fillRect(120, 50, 80, 80);
    });
    const overlay = makeImage((context, canvas) => {
      context.fillStyle = "#246bff"; context.fillRect(0, 0, canvas.width, canvas.height);
    });
    const sampleRate = 48_000;
    const frames = sampleRate;
    const wav = new ArrayBuffer(44 + frames * 2);
    const view = new DataView(wav);
    const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    text(0, "RIFF"); view.setUint32(4, 36 + frames * 2, true); text(8, "WAVEfmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, frames * 2, true);
    for (let index = 0; index < frames; index += 1) view.setInt16(44 + index * 2, Math.sin(index / sampleRate * Math.PI * 2 * 440) * 8000, true);
    const voice = new Blob([wav], { type: "audio/wav" });
    const exported = await exportOfflineVideo({
      imageSrc: background, visualType: "image",
      visualSegments: [{ id: "visual", src: background, type: "image", duration: 1 }],
      voiceAudioSegments: [{ id: "voice", blob: voice, start: 0, duration: 1, volume: 1 }],
      sourceAudioBlob: null, sourceAudioSegments: [], musicBlob: null,
      text: "", captionSegments: [{ id: "caption", text: "E2E CAPTION", start: 0, end: 1 }],
      duration: 1, ratio: { width: 16, height: 9 }, fitMode: "cover", filter: "none",
      captionsEnabled: true, captionPosition: "bottom", captionPlacement: "bottom", captionSize: 12,
      captionStyle: { textColor: "#ffffff", backgroundColor: "#000000", backgroundOpacity: 0.8, fontWeight: 700 },
      captionReferenceSize: { width: 320, height: 180 },
      sticker: null,
      stickerSegments: [{ id: "sticker", src: sticker, start: 0, duration: 1, x: 50, y: 50, scale: 2, opacity: 1 }],
      visualOverlaySegments: [{ id: "overlay", src: overlay, type: "image", start: 0, duration: 1, layer: 1, keyframes: [{ time: 0, x: 30, y: -25, scale: 0.3, rotation: 0, opacity: 1 }] }],
      exportSettings: { codec: "vp9", width: 320, height: 180, frameRate: 30, videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 128_000 },
    });
    const audioContext = new AudioContext();
    const decodedAudio = await audioContext.decodeAudioData((await exported.blob.arrayBuffer()).slice(0));
    await audioContext.close();
    const url = URL.createObjectURL(exported.blob);
    const video = document.createElement("video");
    video.muted = true; video.src = url;
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
    video.currentTime = 0.5;
    await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = reject; });
    const sample = document.createElement("canvas"); sample.width = 320; sample.height = 180;
    const context = sample.getContext("2d"); context.drawImage(video, 0, 0);
    const center = [...context.getImageData(160, 90, 1, 1).data];
    const lower = [...context.getImageData(160, 156, 1, 1).data];
    const overlayPixel = [...context.getImageData(256, 45, 1, 1).data];
    const metadata = {
      width: video.videoWidth, height: video.videoHeight,
      duration: decodedAudio.duration, hasAudio: decodedAudio.length > 0,
      mediaDuration: video.duration, center, lower, overlayPixel, size: exported.blob.size,
      diagnostics: exported.diagnostics,
    };
    URL.revokeObjectURL(url);
    return metadata;
  });
  expect(result.width).toBe(320);
  expect(result.height).toBe(180);
  expect(result.duration).toBeGreaterThanOrEqual(0.95);
  expect(result.mediaDuration).toBeGreaterThanOrEqual(0.95);
  expect(result.hasAudio).toBe(true);
  expect(result.size).toBeGreaterThan(10_000);
  expect(result.center[1]).toBeGreaterThan(result.center[0]);
  expect(result.center[2]).toBeGreaterThan(result.center[0]);
  expect(result.lower[0] + result.lower[1] + result.lower[2]).toBeGreaterThan(40);
  expect(result.overlayPixel[2]).toBeGreaterThan(result.overlayPixel[0]);
  expect(result.diagnostics.frameCount).toBe(30);
  expect(result.diagnostics.audioBitrate).toBe(128_000);
});

test("offline export decodes video sequentially instead of seeking every output frame", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { exportOfflineVideo } = await import("/src/lib/offlineVideoExport.js");
    const sourceCanvas = document.createElement("canvas"); sourceCanvas.width = 160; sourceCanvas.height = 90;
    const sourceContext = sourceCanvas.getContext("2d");
    sourceContext.fillStyle = "#000"; sourceContext.fillRect(0, 0, 160, 90);
    sourceContext.fillStyle = "#fff"; sourceContext.beginPath(); sourceContext.arc(80, 45, 25, 0, Math.PI * 2); sourceContext.fill();
    const sourceImage = sourceCanvas.toDataURL("image/png");
    const sourceExport = await exportOfflineVideo({
      imageSrc: sourceImage, visualType: "image", visualSegments: [{ id: "image", src: sourceImage, type: "image", duration: 0.6 }],
      voiceAudioSegments: [], sourceAudioBlob: null, sourceAudioSegments: [], musicBlob: null, text: "", captionSegments: [],
      duration: 0.6, ratio: { width: 16, height: 9 }, fitMode: "cover", filter: "none", captionsEnabled: false,
      captionSize: 12, captionStyle: {}, captionReferenceSize: { width: 160, height: 90 }, sticker: null, stickerSegments: [],
      exportSettings: { codec: "vp9", width: 160, height: 90, frameRate: 24, videoBitsPerSecond: 1_000_000 },
    });
    const sourceBlob = sourceExport.blob;
    const sourceUrl = URL.createObjectURL(sourceBlob);
    const exported = await exportOfflineVideo({
      imageSrc: sourceUrl, visualType: "video",
      visualSegments: [{ id: "video", src: sourceUrl, blob: sourceBlob, type: "video", duration: 0.6, sourceDuration: 0.6, sourceStart: 0, playbackRate: 1 }],
      voiceAudioSegments: [], sourceAudioBlob: null, sourceAudioSegments: [], musicBlob: null,
      text: "", captionSegments: [], duration: 0.6, ratio: { width: 16, height: 9 },
      fitMode: "cover", filter: "none", captionsEnabled: false, captionSize: 12,
      captionStyle: {}, captionReferenceSize: { width: 160, height: 90 }, sticker: null, stickerSegments: [],
      exportSettings: { codec: "vp9", width: 160, height: 90, frameRate: 24, videoBitsPerSecond: 1_000_000 },
    });
    const exportedUrl = URL.createObjectURL(exported.blob);
    const video = document.createElement("video"); video.muted = true; video.src = exportedUrl;
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
    video.currentTime = 0.3;
    await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = reject; });
    const checkCanvas = document.createElement("canvas"); checkCanvas.width = 160; checkCanvas.height = 90;
    const checkContext = checkCanvas.getContext("2d"); checkContext.drawImage(video, 0, 0);
    const pixels = checkContext.getImageData(0, 0, 160, 90).data;
    let minX = 160; let maxX = 0; let minY = 90; let maxY = 0;
    for (let y = 0; y < 90; y += 1) for (let x = 0; x < 160; x += 1) {
      const offset = (y * 160 + x) * 4;
      if (pixels[offset] > 180 && pixels[offset + 1] > 180 && pixels[offset + 2] > 180) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    URL.revokeObjectURL(sourceUrl); URL.revokeObjectURL(exportedUrl);
    return { size: exported.blob.size, diagnostics: exported.diagnostics, shapeRatio: (maxX - minX + 1) / (maxY - minY + 1) };
  });
  expect(result.size).toBeGreaterThan(500);
  expect(result.diagnostics.videoDecodeModes).toEqual(["sequential-webcodecs"]);
  expect(result.diagnostics.frameCount).toBe(15);
  expect(result.shapeRatio).toBeGreaterThan(0.9);
  expect(result.shapeRatio).toBeLessThan(1.1);
});
