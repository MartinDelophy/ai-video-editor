import { expect, test } from "@playwright/test";

test("linked 2x source audio exports at half duration without doubling pitch", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { exportOfflineVideo, } = await import("/src/lib/offlineVideoExport.js");
    const { exportBrowserVideo } = await import("/src/lib/media.js");
    const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 90;
    const context = canvas.getContext("2d"); context.fillStyle = "#18253d"; context.fillRect(0, 0, 160, 90);
    const image = canvas.toDataURL("image/png");
    const sampleRate = 48_000; const frames = sampleRate * 2;
    const wav = new ArrayBuffer(44 + frames * 2); const view = new DataView(wav);
    const write = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    write(0, "RIFF"); view.setUint32(4, 36 + frames * 2, true); write(8, "WAVEfmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, frames * 2, true);
    for (let index = 0; index < frames; index += 1) view.setInt16(44 + index * 2, Math.sin(index / sampleRate * Math.PI * 2 * 440) * 12000, true);
    const sourceAudio = new Blob([wav], { type: "audio/wav" });
    const options = {
      imageSrc: image, visualType: "image", visualSegments: [{ id: "image", src: image, type: "image", duration: 1 }],
      voiceAudioSegments: [], sourceAudioBlob: sourceAudio,
      sourceAudioSegments: [{ id: "linked", start: 0, duration: 1, sourceStart: 0, sourceDuration: 2, playbackRate: 2 }],
      sourceAudioVolume: 1, musicBlob: null, text: "", captionSegments: [], duration: 1,
      ratio: { width: 16, height: 9 }, fitMode: "cover", filter: "none", captionsEnabled: false,
      captionSize: 12, captionStyle: {}, captionReferenceSize: { width: 160, height: 90 }, stickerSegments: [],
      exportSettings: { codec: "vp9", width: 160, height: 90, frameRate: 24, videoBitsPerSecond: 800_000 },
    };
    const [offline, compatibility] = await Promise.all([
      exportOfflineVideo(options),
      exportBrowserVideo(options),
    ]);
    const audioContext = new AudioContext();
    const inspect = async (blob) => {
      const decoded = await audioContext.decodeAudioData((await blob.arrayBuffer()).slice(0));
      const samples = decoded.getChannelData(0); const start = Math.floor(samples.length * 0.2); const end = Math.floor(samples.length * 0.8);
      let crossings = 0;
      for (let index = start + 1; index < end; index += 1) if (samples[index - 1] <= 0 && samples[index] > 0) crossings += 1;
      return { duration: decoded.duration, frequency: crossings / ((end - start) / decoded.sampleRate), samples: decoded.length };
    };
    const inspected = { offline: await inspect(offline.blob), compatibility: await inspect(compatibility.blob) };
    await audioContext.close();
    return inspected;
  });
  for (const exported of [result.offline, result.compatibility]) {
    expect(exported.duration).toBeGreaterThan(0.9);
    expect(exported.duration).toBeLessThan(1.1);
    expect(exported.frequency).toBeGreaterThan(420);
    expect(exported.frequency).toBeLessThan(460);
    expect(exported.samples).toBeGreaterThan(40_000);
  }
});

test("offline export restores enabled embedded video audio when no separated source track exists", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [{ exportOfflineVideo }, { prepareEmbeddedVideoAudio }] = await Promise.all([
      import("/src/lib/offlineVideoExport.js"),
      import("/src/lib/embeddedVideoAudioExport.js"),
    ]);
    const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 90;
    const context = canvas.getContext("2d"); context.fillStyle = "#254fd4"; context.fillRect(0, 0, 160, 90);
    const image = canvas.toDataURL("image/png");
    const sampleRate = 48_000; const frames = sampleRate / 2;
    const wav = new ArrayBuffer(44 + frames * 2); const view = new DataView(wav);
    const write = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    write(0, "RIFF"); view.setUint32(4, 36 + frames * 2, true); write(8, "WAVEfmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, frames * 2, true);
    for (let index = 0; index < frames; index += 1) view.setInt16(44 + index * 2, Math.sin(index / sampleRate * Math.PI * 2 * 440) * 9000, true);
    const voice = new Blob([wav], { type: "audio/wav" });
    const source = await exportOfflineVideo({
      imageSrc: image, visualType: "image", visualSegments: [{ id: "image", src: image, type: "image", duration: 0.5 }],
      voiceAudioSegments: [{ id: "voice", blob: voice, start: 0, duration: 0.5, volume: 1 }],
      sourceAudioBlob: null, sourceAudioSegments: [], musicBlob: null, text: "", captionSegments: [],
      duration: 0.5, ratio: { width: 16, height: 9 }, fitMode: "cover", filter: "none", captionsEnabled: false,
      captionSize: 12, captionStyle: {}, captionReferenceSize: { width: 160, height: 90 }, stickerSegments: [],
      exportSettings: { codec: "vp9", width: 160, height: 90, frameRate: 24, videoBitsPerSecond: 800_000 },
    });
    const sourceUrl = URL.createObjectURL(source.blob);
    const visuals = [{ id: "video", assetId: "video-asset", name: "source.webm", src: sourceUrl, blob: source.blob, type: "video", duration: 0.5, sourceStart: 0, sourceDuration: 0.5, playbackRate: 1 }];
    const embedded = await prepareEmbeddedVideoAudio(visuals);
    const exported = await exportOfflineVideo({
      imageSrc: sourceUrl, visualType: "video", visualSegments: visuals,
      voiceAudioSegments: [], sourceAudioBlob: embedded.blob, sourceAudioSegments: embedded.segments,
      musicBlob: null, text: "", captionSegments: [], duration: 0.5, ratio: { width: 16, height: 9 },
      fitMode: "cover", filter: "none", captionsEnabled: false, captionSize: 12, captionStyle: {},
      captionReferenceSize: { width: 160, height: 90 }, stickerSegments: [],
      exportSettings: { codec: "vp9", width: 160, height: 90, frameRate: 24, videoBitsPerSecond: 800_000 },
    });
    const audioContext = new AudioContext();
    const decoded = await audioContext.decodeAudioData((await exported.blob.arrayBuffer()).slice(0));
    await audioContext.close(); URL.revokeObjectURL(sourceUrl);
    return { duration: decoded.duration, samples: decoded.length, segmentCount: embedded.segments.length, size: exported.blob.size };
  });
  expect(result.segmentCount).toBe(1);
  expect(result.duration).toBeGreaterThan(0.45);
  expect(result.samples).toBeGreaterThan(20_000);
  expect(result.size).toBeGreaterThan(2_000);
});
