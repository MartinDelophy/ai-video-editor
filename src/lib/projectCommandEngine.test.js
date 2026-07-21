import { describe, expect, it } from "vitest";
import { applyCommandPlan, inspectProject } from "./projectCommandEngine.js";

function project() {
  return {
    ratioId: "16:9",
    script: "Hello",
    audioSegments: [{ id: "voice-1", start: 2, duration: 3 }],
    captionSegments: [{ id: "caption-1", text: "Hello", start: 2, end: 5, audioSegmentId: "voice-1" }],
    visualSegments: [{ id: "visual-1", duration: 8 }],
  };
}

function plan(operations, overrides = {}) {
  return { schemaVersion: 1, baseRevision: 0, operations, ...overrides };
}

describe("project command engine", () => {
  it("moves linked captions with voiceover clips transactionally", () => {
    const original = project();
    const result = applyCommandPlan(original, plan([{ id: "move-1", type: "timed.move", track: "audio", clipId: "voice-1", start: 7 }]));
    expect(result.ok).toBe(true);
    expect(result.project.audioSegments[0].start).toBe(7);
    expect(result.project.captionSegments[0]).toMatchObject({ start: 7, end: 10 });
    expect(original.audioSegments[0].start).toBe(2);
    expect(result.revision).toBe(1);
  });

  it("unlinks, edits, and relinks a caption with optional alignment", () => {
    const result = applyCommandPlan(project(), plan([
      { id: "unlink-1", type: "caption.unlink_audio", clipId: "caption-1" },
      { id: "caption-1", type: "caption.update", clipId: "caption-1", text: "Updated", start: 8, end: 9 },
      { id: "link-1", type: "caption.link_audio", clipId: "caption-1", audioClipId: "voice-1", align: true },
    ]));
    expect(result.project.captionSegments[0]).toMatchObject({ text: "Updated", start: 2, end: 5, audioSegmentId: "voice-1" });
    expect(result.project.script).toBe("Updated");
  });

  it("rejects a failing batch without changing the input", () => {
    const original = project();
    const result = applyCommandPlan(original, plan([
      { id: "move-1", type: "timed.move", track: "audio", clipId: "voice-1", start: 7 },
      { id: "bad-1", type: "caption.update", clipId: "missing", text: "No" },
    ]));
    expect(result).toMatchObject({ ok: false, code: "CLIP_NOT_FOUND", operationId: "bad-1" });
    expect(original.audioSegments[0].start).toBe(2);
  });

  it("does not apply a previously recorded operation twice", () => {
    const first = applyCommandPlan(project(), plan([{ id: "move-1", type: "timed.move", track: "audio", clipId: "voice-1", start: 7 }]));
    const replay = applyCommandPlan(first.project, plan(
      [{ id: "move-1", type: "timed.move", track: "audio", clipId: "voice-1", start: 12 }],
      { baseRevision: 0 },
    ));
    expect(replay).toMatchObject({ ok: true, revision: 1, appliedOperationIds: [] });
    expect(replay.project.audioSegments[0].start).toBe(7);
  });

  it("inspects stable project facts", () => {
    expect(inspectProject(project())).toMatchObject({ revision: 0, duration: 5, ratio: "16:9", tracks: { captions: 1, audio: 1, visuals: 1 } });
  });
});
