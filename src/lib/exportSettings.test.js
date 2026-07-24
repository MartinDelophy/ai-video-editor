import { describe, expect, it } from "vitest";

import {
  getExportContentDuration,
  getExportDimensions,
  getEffectiveExportBitrate,
  getExportEstimate,
  getExportFormatProfile,
  getExportRange,
  getExportRuntimeCapabilities,
  getExportTechnicalSummary,
  getExportVideoEncoderConfig,
  loadExportSettings,
  formatEstimatedFileSize,
  probeExportRuntimeCapabilities,
  sanitizeExportFileName,
  saveExportSettings,
} from "./exportSettings.js";

describe("export dimensions", () => {
  it("uses the selected resolution as the short edge for landscape video", () => {
    expect(getExportDimensions({ width: 16, height: 9 }, 2160)).toEqual({ width: 3840, height: 2160 });
  });

  it("produces full vertical 4K instead of 1216x2160", () => {
    expect(getExportDimensions({ width: 9, height: 16 }, 2160)).toEqual({ width: 2160, height: 3840 });
  });

  it("keeps square exports square", () => {
    expect(getExportDimensions({ width: 1, height: 1 }, 1080)).toEqual({ width: 1080, height: 1080 });
  });
});

describe("export format settings", () => {
  it("derives duration only from real timeline content instead of script reading estimates", () => {
    expect(getExportContentDuration({
      visualDuration: 5,
      voiceDuration: 0,
      captionDuration: 0,
      sourceAudioDuration: 0,
      musicDuration: 0,
      stickerDuration: 0,
    })).toBe(5);
    expect(getExportContentDuration({
      visualDuration: 5,
      overlaySegments: [{ start: 4, duration: 3 }],
    })).toBe(7);
  });

  it("keeps container, video, and audio codecs in a valid profile", () => {
    expect(getExportFormatProfile("h264")).toEqual({
      container: "MP4",
      video: "H.264",
      audio: "AAC",
      extension: "mp4",
    });
    expect(getExportFormatProfile("vp9").audio).toBe("Opus");
    expect(getExportFormatProfile("h264-mov")).toEqual({
      container: "MOV",
      video: "H.264",
      audio: "AAC",
      extension: "mov",
    });
  });

  it("builds the technical summary and supports silent exports", () => {
    expect(getExportTechnicalSummary({
      resolution: "1080",
      frameRate: 30,
      codec: "h264",
      quality: "high",
      audio: "none",
    }, { width: 16, height: 9 })).toEqual({
      width: 1920,
      height: 1080,
      frameRate: 30,
      bitrateMbps: 10,
      container: "MP4",
      video: "H.264",
      audio: null,
      audioBitrateKbps: null,
    });
  });

  it("reports deterministic and compatibility runtime availability separately", () => {
    expect(getExportRuntimeCapabilities({
      VideoEncoder: function VideoEncoder() {},
      MediaRecorder: undefined,
    })).toEqual({ deterministic: true, compatible: false });
  });

  it("builds a codec-specific WebCodecs configuration", () => {
    expect(getExportVideoEncoderConfig({
      resolution: "2160",
      frameRate: 60,
      codec: "h264",
      quality: "high",
    }, { width: 16, height: 9 })).toMatchObject({
      codec: "avc1.640034",
      width: 3840,
      height: 2160,
      bitrate: 76_000_000,
      framerate: 60,
    });
  });

  it("probes the selected deterministic config and a usable recorder fallback", async () => {
    const checkedConfigs = [];
    class VideoEncoder {
      static async isConfigSupported(config) {
        checkedConfigs.push(config);
        return { supported: config.codec.startsWith("vp09") };
      }
    }
    class MediaRecorder {
      static isTypeSupported(mimeType) {
        return mimeType === "video/webm";
      }
    }
    await expect(probeExportRuntimeCapabilities({
      resolution: "1080",
      frameRate: 30,
      codec: "vp9",
      quality: "high",
    }, { width: 16, height: 9 }, { VideoEncoder, MediaRecorder })).resolves.toEqual({
      deterministic: true,
      compatible: true,
    });
    expect(checkedConfigs[0]).toMatchObject({ codec: "vp09.00.10.08", width: 1920, height: 1080 });
  });

  it("sanitizes filenames and removes known output extensions", () => {
    expect(sanitizeExportFileName('  launch:final?.MP4  ')).toBe("launch-final-");
    expect(sanitizeExportFileName("editor-master.mov")).toBe("editor-master");
    expect(sanitizeExportFileName("...")).toBe("ai-video");
  });

  it("persists only normalized export preferences", () => {
    const values = new Map();
    const runtime = {
      localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
    };
    saveExportSettings({
      codec: "h264-mov",
      resolution: "2160",
      frameRate: 60,
      quality: "ultra",
      pipeline: "deterministic",
      audio: "mix",
      audioBitsPerSecond: 320_000,
      captions: "burned-srt",
      fileName: "Final / Cut.mov",
      unexpected: "discard",
    }, runtime);
    expect(loadExportSettings(runtime)).toEqual({
      codec: "h264-mov",
      resolution: "2160",
      frameRate: 60,
      quality: "ultra",
      pipeline: "deterministic",
      audio: "mix",
      audioBitsPerSecond: 320_000,
      captions: "burned-srt",
      fileName: "Final - Cut",
      range: "full",
      rangeStart: 0,
      rangeEnd: 10,
      bitrateMode: "auto",
      customVideoBitsPerSecond: 12_000_000,
      keyFrameInterval: 2,
    });
  });

  it("estimates frames and output size from the selected video and audio bitrates", () => {
    const estimate = getExportEstimate({
      resolution: "1080",
      frameRate: 30,
      codec: "h264",
      quality: "high",
      audio: "mix",
      audioBitsPerSecond: 192_000,
    }, { width: 16, height: 9 }, 60);
    expect(estimate.frameCount).toBe(1800);
    expect(estimate.estimatedBytes).toBeGreaterThan(75_000_000);
    expect(formatEstimatedFileSize(estimate.estimatedBytes)).toMatch(/MB$/);
  });

  it("clamps a custom export range to the current timeline", () => {
    expect(getExportRange({ range: "custom", rangeStart: 2.5, rangeEnd: 8 }, 6)).toEqual({
      start: 2.5,
      end: 6,
      duration: 3.5,
    });
    expect(getExportRange({ range: "full", rangeStart: 2, rangeEnd: 3 }, 10)).toEqual({
      start: 0,
      end: 10,
      duration: 10,
    });
  });

  it("uses a bounded manual video bitrate when selected", () => {
    expect(getEffectiveExportBitrate({
      bitrateMode: "custom",
      customVideoBitsPerSecond: 16_500_000,
    })).toBe(16_500_000);
    expect(getEffectiveExportBitrate({
      bitrateMode: "custom",
      customVideoBitsPerSecond: 400_000_000,
    })).toBe(100_000_000);
  });

  it("uses the custom range and bitrate in output estimates", () => {
    const estimate = getExportEstimate({
      resolution: "1080",
      frameRate: 30,
      codec: "h264",
      quality: "high",
      audio: "none",
      range: "custom",
      rangeStart: 2,
      rangeEnd: 5,
      bitrateMode: "custom",
      customVideoBitsPerSecond: 8_000_000,
    }, { width: 16, height: 9 }, 10);
    expect(estimate.duration).toBe(3);
    expect(estimate.frameCount).toBe(90);
    expect(estimate.estimatedBytes).toBeGreaterThan(3_000_000);
    expect(estimate.estimatedBytes).toBeLessThan(3_200_000);
  });
});
