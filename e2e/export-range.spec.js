import { expect, test } from "@playwright/test";

for (const pipeline of ["offline", "compatible"]) {
  test(`${pipeline} export renders the selected timeline range and rebases duration`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    const result = await page.evaluate(async (selectedPipeline) => {
      const [{ exportOfflineVideo }, { exportBrowserVideo }, { ALL_FORMATS, BlobSource, CanvasSink, EncodedPacketSink, Input }] = await Promise.all([
        import("/src/lib/offlineVideoExport.js"),
        import("/src/lib/media.js"),
        import("/node_modules/.vite/deps/mediabunny.js"),
      ]);
      const makeImage = (color) => {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 90;
        const context = canvas.getContext("2d");
        context.fillStyle = color;
        context.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      };
      const red = makeImage("#e4212b");
      const blue = makeImage("#1769ef");
      const green = makeImage("#19d18f");
      const options = {
        imageSrc: red,
        visualType: "image",
        visualSegments: [
          { id: "red", src: red, type: "image", duration: 1 },
          { id: "blue", src: blue, type: "image", duration: 1 },
        ],
        voiceAudioSegments: [],
        sourceAudioBlob: null,
        sourceAudioSegments: [],
        musicBlob: null,
        text: "",
        captionSegments: [],
        duration: 0.5,
        timelineOffset: 1,
        captionTargetDuration: 2,
        ratio: { width: 16, height: 9 },
        fitMode: "cover",
        filter: "none",
        captionsEnabled: false,
        captionSize: 12,
        captionStyle: {},
        captionReferenceSize: { width: 160, height: 90 },
        sticker: null,
        stickerSegments: [],
        visualOverlaySegments: [{
          id: "overlay",
          src: green,
          type: "image",
          start: 1,
          duration: 0.5,
          layer: 1,
          keyframes: [{ time: 0, x: 25, y: 0, scale: 0.25, rotation: 0, opacity: 1 }],
        }],
        exportSettings: {
          codec: "vp9",
          width: 160,
          height: 90,
          frameRate: 24,
          videoBitsPerSecond: 1_000_000,
          keyFrameInterval: 1,
        },
      };
      const exported = selectedPipeline === "offline"
        ? await exportOfflineVideo(options)
        : await exportBrowserVideo(options);
      const input = new Input({ source: new BlobSource(exported.blob), formats: ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      const lastPacket = await new EncodedPacketSink(track).getPacket(Infinity);
      const duration = lastPacket.timestamp + lastPacket.duration;
      const sink = new CanvasSink(track);
      const frame = await sink.getCanvas(0.2);
      const sample = frame.canvas;
      const context = sample.getContext("2d");
      const pixel = [...context.getImageData(20, 45, 1, 1).data];
      const overlayPixel = [...context.getImageData(120, 45, 1, 1).data];
      const metadata = {
        duration,
        width: sample.width,
        height: sample.height,
        pixel,
        overlayPixel,
        size: exported.blob.size,
      };
      return metadata;
    }, pipeline);
    expect(result.width).toBe(160);
    expect(result.height).toBe(90);
    expect(result.duration).toBeGreaterThan(0.35);
    expect(result.duration).toBeLessThan(0.8);
    expect(result.pixel[2]).toBeGreaterThan(result.pixel[0] * 2);
    expect(result.overlayPixel[1]).toBeGreaterThan(result.overlayPixel[0] * 2);
    expect(result.overlayPixel[1]).toBeGreaterThan(result.overlayPixel[2]);
    expect(result.size).toBeGreaterThan(500);
  });
}
