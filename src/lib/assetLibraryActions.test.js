import { describe, expect, it, vi } from "vitest";
import { createAssetLibraryActions } from "./assetLibraryActions.js";

describe("asset library visual selection", () => {
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
