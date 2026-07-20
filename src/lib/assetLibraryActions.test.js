import { describe, expect, it, vi } from "vitest";
import { createAssetLibraryActions } from "./assetLibraryActions.js";

describe("asset library visual selection", () => {
  it("preserves the Media workspace when music is placed by timeline drag", async () => {
    const audio = {
      id: "music-1",
      type: "audio",
      blob: new Blob(["audio"]),
      name: "ambient.mp3",
      duration: 12,
      peaks: [0.2, 0.8],
    };
    const deps = { replaceMusic: vi.fn(), notify: vi.fn() };
    const { selectAsset } = createAssetLibraryActions(deps);

    await selectAsset(audio, { focusAudio: false });

    expect(deps.replaceMusic).toHaveBeenCalledWith(
      audio.blob,
      12,
      audio.peaks,
      audio.name,
      undefined,
      { focusAudio: false },
    );
  });

  it("does not extract video audio until the user requests it from the clip menu", async () => {
    const video = { id: "video-1", type: "video", src: "blob:video", duration: 8 };
    const deps = {
      replaceVisualTimeline: vi.fn(),
      getVisualDurationForAsset: vi.fn(() => 8),
      extractVideoSourceAudio: vi.fn(),
      notify: vi.fn(),
    };

    const { selectAsset } = createAssetLibraryActions(deps);
    await selectAsset(video);

    expect(deps.replaceVisualTimeline).toHaveBeenCalledWith(video, 8);
    expect(deps.extractVideoSourceAudio).not.toHaveBeenCalled();
  });
});
