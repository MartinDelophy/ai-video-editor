import { describe, expect, it } from "vitest";

import {
  getMediaFileExtension,
  getMediaFileKind,
  isLibavCompatibilityEnabled,
  isSupportedMediaFile,
  MEDIA_BACKENDS,
  selectMediaBackends,
  shouldProbeWithLibav,
} from "./mediaCompatibility.js";

describe("media compatibility routing", () => {
  it("accepts Matroska files even when the browser supplies no MIME type", () => {
    const file = { name: "camera-master.MKV", type: "" };
    expect(getMediaFileExtension(file)).toBe("mkv");
    expect(getMediaFileKind(file)).toBe("video");
    expect(isSupportedMediaFile(file)).toBe(true);
    expect(shouldProbeWithLibav(file)).toBe(true);
  });

  it("keeps ordinary browser-readable MP4 on the native fast path", () => {
    expect(
      selectMediaBackends({
        nativeReadable: true,
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "aac",
        webCodecsVideoSupported: true,
        webCodecsAudioSupported: true,
      }),
    ).toEqual({
      probe: MEDIA_BACKENDS.NATIVE,
      video: MEDIA_BACKENDS.NATIVE,
      audio: MEDIA_BACKENDS.NATIVE,
      needsNormalization: false,
    });
  });

  it("routes MKV H.264 through WebCodecs and AC3 through the custom libav decoder", () => {
    expect(
      selectMediaBackends({
        container: "matroska",
        videoCodec: "h264",
        audioCodec: "ac3",
        webCodecsVideoSupported: true,
        webCodecsAudioSupported: false,
        libavAudioSupported: true,
      }),
    ).toEqual({
      probe: MEDIA_BACKENDS.LIBAV,
      video: MEDIA_BACKENDS.WEBCODECS,
      audio: MEDIA_BACKENDS.LIBAV,
      needsNormalization: true,
    });
  });

  it("supports disabling the optional compatibility layer", () => {
    const file = { name: "archive.mkv", type: "video/x-matroska" };
    expect(isLibavCompatibilityEnabled({ VITE_MEDIA_COMPATIBILITY_FALLBACK: "false" })).toBe(false);
    expect(
      shouldProbeWithLibav(file, {
        env: { VITE_MEDIA_COMPATIBILITY_FALLBACK: "false" },
        nativeMetadataError: true,
      }),
    ).toBe(false);
  });

  it("does not require browser globals for pure routing", () => {
    expect(getMediaFileKind({ name: "voice.flac", type: "" })).toBe("audio");
    expect(getMediaFileKind({ name: "surround.ac3", type: "" })).toBe("audio");
    expect(getMediaFileKind({ name: "audio-only.mka", type: "video/x-matroska" })).toBe("audio");
  });
});
