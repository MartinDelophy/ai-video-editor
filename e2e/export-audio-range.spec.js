import { expect, test } from "@playwright/test";

for (const pipeline of ["offline", "compatible"]) {
  test(`${pipeline} export crops audio source offsets with the selected range`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    const result = await page.evaluate(async (selectedPipeline) => {
      const [{ exportOfflineVideo }, { exportBrowserVideo }] = await Promise.all([
        import("/src/lib/offlineVideoExport.js"),
        import("/src/lib/media.js"),
      ]);
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 90;
      const context = canvas.getContext("2d");
      context.fillStyle = "#143548";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/png");

      const sampleRate = 8_000;
      const sampleCount = sampleRate * 2;
      const wav = new ArrayBuffer(44 + sampleCount * 2);
      const view = new DataView(wav);
      const write = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
      write(0, "RIFF");
      view.setUint32(4, 36 + sampleCount * 2, true);
      write(8, "WAVEfmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      write(36, "data");
      view.setUint32(40, sampleCount * 2, true);
      for (let index = 0; index < sampleCount; index += 1) {
        const frequency = index < sampleRate ? 220 : 880;
        view.setInt16(44 + index * 2, Math.sin(index / sampleRate * Math.PI * 2 * frequency) * 12_000, true);
      }
      const voice = new Blob([wav], { type: "audio/wav" });
      const options = {
        imageSrc: image,
        visualType: "image",
        visualSegments: [{ id: "image", src: image, type: "image", duration: 2 }],
        voiceAudioSegments: [{ id: "voice", blob: voice, start: 0, duration: 2, volume: 1 }],
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
        visualOverlaySegments: [],
        exportSettings: {
          codec: "vp9",
          width: 160,
          height: 90,
          frameRate: 24,
          videoBitsPerSecond: 1_000_000,
          audioBitsPerSecond: 128_000,
          keyFrameInterval: 1,
        },
      };
      const exported = selectedPipeline === "offline"
        ? await exportOfflineVideo(options)
        : await exportBrowserVideo(options);
      const audioContext = new AudioContext();
      const decoded = await audioContext.decodeAudioData((await exported.blob.arrayBuffer()).slice(0));
      const samples = decoded.getChannelData(0);
      let positiveCrossings = 0;
      for (let index = 1; index < samples.length; index += 1) {
        if (samples[index - 1] <= 0 && samples[index] > 0) positiveCrossings += 1;
      }
      const result = { duration: decoded.duration, positiveCrossings, sampleRate: decoded.sampleRate };
      await audioContext.close();
      return result;
    }, pipeline);
    expect(result.duration).toBeGreaterThan(0.35);
    expect(result.duration).toBeLessThan(0.8);
    expect(result.positiveCrossings).toBeGreaterThan(300);
  });
}
