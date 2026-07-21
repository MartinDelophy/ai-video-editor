import { describe, expect, it, vi } from "vitest";
import { createVisualTimelineActions } from "./visualTimelineActions.js";

describe("visual asset metadata updates", () => {
  it("replaces the provisional imported-video duration by matching its source URL", () => {
    let visualSegments = [{
      id: "clip", assetId: "provisional-id", src: "blob:video", type: "video",
      duration: 4, sourceDuration: 0, playbackRate: 1,
    }];
    const actions = createVisualTimelineActions({
      visualSegments, previewVisualSegment: null, imageSrc: "", imageDuration: 4,
      setVisualSegments: (updater) => { visualSegments = updater(visualSegments); },
      setImageDuration: vi.fn(), setImageClipCount: vi.fn(), setImageMeta: vi.fn(),
      setVisualType: vi.fn(), setImageSrc: vi.fn(),
    });

    actions.updateVisualAssetInTimeline("library-id", {
      src: "blob:video", type: "video", duration: 1.2, width: 320, height: 180,
    });

    expect(visualSegments[0]).toMatchObject({ duration: 1.2, sourceDuration: 1.2, width: 320, height: 180 });
  });
});
