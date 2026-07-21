import { describe, expect, it, vi } from "vitest";
import { createTimelineClipboardActions } from "./timelineClipboardActions.js";

function createSourceDeleteHarness(linkedSourceAudioSegments) {
  const commitVisualSegments = vi.fn();
  const clearSourceAudioTrack = vi.fn();
  const setSelectedSourceAudioSegmentId = vi.fn();
  const visualSegments = [
    { id: "selected-video", type: "video", duration: 2, sourceAudioOffset: 0, sourceAudioDisabled: true },
    { id: "other-video", type: "video", duration: 2, sourceAudioOffset: 2 },
  ];
  const actions = createTimelineClipboardActions({
    trackLocks: {}, selectedTrack: "source", sourceAudioLinked: true,
    selectedSourceAudioSegmentId: "selected-video", visualSegments, linkedSourceAudioSegments,
    commitVisualSegments, clearSourceAudioTrack, setSelectedSourceAudioSegmentId,
    notify: vi.fn(),
  });
  return { actions, clearSourceAudioTrack, commitVisualSegments, setSelectedSourceAudioSegmentId };
}

describe("source-audio deletion", () => {
  it("removes only the selected mapping and restores embedded video audio", () => {
    const harness = createSourceDeleteHarness([
      { id: "selected-video" },
      { id: "other-video" },
    ]);
    harness.actions.handleDeleteTrack();

    const [segments] = harness.commitVisualSegments.mock.calls[0];
    expect(segments[0]).not.toHaveProperty("sourceAudioOffset");
    expect(segments[0].sourceAudioDisabled).toBe(false);
    expect(segments[1].sourceAudioOffset).toBe(2);
    expect(harness.clearSourceAudioTrack).not.toHaveBeenCalled();
  });

  it("clears the shared source track when its final mapped piece is deleted", () => {
    const harness = createSourceDeleteHarness([{ id: "selected-video" }]);
    harness.actions.handleDeleteTrack();

    expect(harness.clearSourceAudioTrack).toHaveBeenCalledWith("");
    expect(harness.setSelectedSourceAudioSegmentId).toHaveBeenCalledWith("");
  });
});
