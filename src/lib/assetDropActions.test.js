import { describe, expect, it, vi } from "vitest";

import { createAssetDropActions } from "./assetDropActions.js";

describe("asset timeline drops", () => {
  it("keeps the Media workspace when audio is dropped on the voice track", async () => {
    const asset = {
      id: "ambient-voice",
      type: "audio",
      blob: new Blob(["audio"]),
      duration: 10,
      peaks: [0.2, 0.7],
    };
    const deps = {
      canDropAssetOnTrack: vi.fn(() => true),
      setSelectedLibraryAssetId: vi.fn(),
      replaceAudio: vi.fn(),
      setSelectedTrack: vi.fn(),
      setActiveTool: vi.fn(),
      notify: vi.fn(),
    };

    await createAssetDropActions(deps).applyAssetToTrack(asset, "audio");

    expect(deps.replaceAudio).toHaveBeenCalledWith(asset.blob, 10, asset.peaks, "音频已写入配音轨");
    expect(deps.setSelectedTrack).toHaveBeenCalledWith("audio");
    expect(deps.setActiveTool).not.toHaveBeenCalled();
  });
});
