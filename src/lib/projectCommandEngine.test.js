import { describe, expect, it } from "vitest";
import { applyCommandPlan, diffProjects, inspectClip, inspectProject, inspectTrack, inspectTranscript } from "./projectCommandEngine.js";

function project() {
  return {
    ratioId: "16:9",
    script: "Hello",
    audioSegments: [{ id: "voice-1", start: 2, duration: 3 }],
    captionSegments: [{ id: "caption-1", text: "Hello", start: 2, end: 5, audioSegmentId: "voice-1", speaker: "Narrator", words: [{ word: "Hello", start: 2.1, end: 2.6, confidence: 0.98 }] }],
    visualSegments: [
      { id: "visual-1", type: "video", duration: 8, sourceStart: 1, sourceDuration: 16, playbackRate: 2, keyframes: [{ time: 1, scale: 1 }, { time: 5, scale: 2 }] },
      { id: "visual-2", type: "image", duration: 2 },
    ],
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

  it("resizes timed clips and clamps linked captions to the new audio end", () => {
    const result = applyCommandPlan(project(), plan([
      { id: "resize-1", type: "timed.resize", track: "audio", clipId: "voice-1", start: 4, duration: 2 },
    ]));
    expect(result.project.audioSegments[0]).toMatchObject({ start: 4, duration: 2 });
    expect(result.project.captionSegments[0]).toMatchObject({ start: 4, end: 6 });
  });

  it("trims video source time and remaps clip-local keyframes", () => {
    const result = applyCommandPlan(project(), plan([
      { id: "trim-1", type: "visual.trim", clipId: "visual-1", sourceIn: 3, sourceOut: 11 },
    ]));
    expect(result.project.visualSegments[0]).toMatchObject({ sourceStart: 3, sourceDuration: 8, duration: 4 });
    expect(result.project.visualSegments[0].keyframes).toEqual([{ time: 0, scale: 1 }, { time: 4, scale: 2 }]);
  });

  it("splits visuals with an explicit stable ID and preserves source mapping", () => {
    const result = applyCommandPlan(project(), plan([
      { id: "split-1", type: "visual.split", clipId: "visual-1", at: 3, rightClipId: "visual-1b" },
    ]));
    expect(result.project.visualSegments.slice(0, 2)).toMatchObject([
      { id: "visual-1", duration: 3, sourceStart: 1, sourceDuration: 6 },
      { id: "visual-1b", duration: 5, sourceStart: 7, sourceDuration: 10 },
    ]);
    expect(result.project.visualSegments[1].keyframes).toEqual([{ time: 2, scale: 2 }]);
  });

  it("reorders contiguous visual clips by stable ID", () => {
    const result = applyCommandPlan(project(), plan([
      { id: "reorder-1", type: "visual.reorder", clipId: "visual-2", toIndex: 0 },
    ]));
    expect(result.project.visualSegments.map((segment) => segment.id)).toEqual(["visual-2", "visual-1"]);
  });

  it("sets validated clip properties, speed, mute, track state, and project ratio", () => {
    const result = applyCommandPlan(project(), plan([
      { id: "property-1", type: "clip.set_property", clipId: "visual-1", property: "opacity", value: 0.6 },
      { id: "speed-1", type: "clip.set_speed", clipId: "visual-1", speed: 4 },
      { id: "mute-1", type: "clip.set_muted", clipId: "visual-1", muted: true },
      { id: "visibility-1", type: "track.set_visibility", track: "visuals", visible: false },
      { id: "lock-1", type: "track.set_locked", track: "captions", locked: true },
      { id: "ratio-1", type: "project.set_ratio", ratio: "9:16" },
    ]));
    expect(result.project.visualSegments[0]).toMatchObject({ opacity: 0.6, playbackRate: 4, sourceDuration: 16, duration: 4, muted: true });
    expect(result.project.visualSegments[0].keyframes).toEqual([{ time: 0.5, scale: 1 }, { time: 2.5, scale: 2 }]);
    expect(result.project).toMatchObject({ ratioId: "9:16", trackVisibility: { image: false }, trackLocks: { caption: true } });
    expect(inspectTrack(result.project, "visuals")).toMatchObject({ visible: false, locked: false });
    expect(inspectTrack(result.project, "captions")).toMatchObject({ visible: true, locked: true });
  });

  it("keeps source duration while speeding up audio and clamps linked captions", () => {
    const result = applyCommandPlan(project(), plan([
      { id: "speed-1", type: "clip.set_speed", clipId: "voice-1", speed: 1.5 },
    ]));
    expect(result.project.audioSegments[0]).toMatchObject({ sourceDuration: 3, playbackRate: 1.5, duration: 2 });
    expect(result.project.captionSegments[0]).toMatchObject({ start: 2, end: 4 });
  });

  it("rejects unsafe arbitrary clip properties transactionally", () => {
    const original = project();
    const result = applyCommandPlan(original, plan([
      { id: "ratio-1", type: "project.set_ratio", ratio: "1:1" },
      { id: "property-1", type: "clip.set_property", clipId: "visual-1", property: "sourceStart", value: 99 },
    ]));
    expect(result).toMatchObject({ ok: false, code: "UNSUPPORTED_PROPERTY", operationId: "property-1" });
    expect(original.ratioId).toBe("16:9");
    expect(original.visualSegments[0].sourceStart).toBe(1);
  });

  it("appends and inserts archived visual media without breaking the contiguous sequence", () => {
    const result = applyCommandPlan(project(), plan([
      { id: "append-1", type: "visual.append", sourceClipId: "visual-1", clipId: "visual-3", duration: 2 },
      { id: "insert-1", type: "visual.insert", sourceClipId: "visual-2", clipId: "visual-4", duration: 1, atIndex: 1 },
    ]));
    expect(result.project.visualSegments.map((clip) => clip.id)).toEqual(["visual-1", "visual-4", "visual-2", "visual-3"]);
    expect(result.project.visualSegments[1]).toMatchObject({ id: "visual-4", type: "image", duration: 1, archiveMediaId: "visual-2" });
    expect(result.project.visualSegments[3]).toMatchObject({ id: "visual-3", type: "video", duration: 2, sourceDuration: 4, archiveMediaId: "visual-1" });
    expect(inspectTrack(result.project, "visuals")).toMatchObject({ duration: 13 });
  });

  it("adds a prepared binary asset to Visuals with integrity metadata", () => {
    const result = applyCommandPlan(project(), plan([
      {
        id: "import-1", type: "asset.import", prepared: true, track: "visuals", clipId: "visual-imported",
        mediaType: "image", mimeType: "image/png", name: "card.png", duration: 3,
        sha256: "a".repeat(64), size: 128, archivePath: "media/visuals/import-card.png", width: 800, height: 600,
      },
    ]));
    expect(result.project.visualSegments.at(-1)).toMatchObject({
      id: "visual-imported", type: "image", name: "card.png", duration: 3, archiveMediaId: "visual-imported",
      integrity: { sha256: "a".repeat(64), size: 128, mimeType: "image/png", archivePath: "media/visuals/import-card.png" },
    });
  });

  it("rejects unprepared asset imports without changing the project", () => {
    const original = project();
    const result = applyCommandPlan(original, plan([
      { id: "import-1", type: "asset.import", track: "visuals", clipId: "visual-imported", file: "/tmp/card.png" },
    ]));
    expect(result).toMatchObject({ ok: false, code: "ASSET_NOT_PREPARED", operationId: "import-1" });
    expect(original.visualSegments).toHaveLength(2);
  });

  it("imports prepared audio into Music and protects the occupied Voiceover media slot", () => {
    const music = applyCommandPlan(project(), plan([{
      id: "music-1", type: "asset.import", prepared: true, track: "music", clipId: "music-1", mediaType: "audio",
      mimeType: "audio/wav", name: "bed.wav", duration: 6, start: 1, sha256: "b".repeat(64), size: 256, archivePath: "media/audio/bed.wav",
    }]));
    expect(music.project).toMatchObject({ musicName: "bed.wav", musicDuration: 6, musicStart: 1, musicSegments: [{ id: "music-1", start: 1, duration: 6, volume: 0.35 }] });
    expect(inspectTrack(music.project, "music")).toMatchObject({ clipCount: 1, duration: 7 });

    const voice = applyCommandPlan(project(), plan([{
      id: "voice-2", type: "asset.import", prepared: true, track: "audio", clipId: "voice-2", mediaType: "audio",
      mimeType: "audio/wav", name: "voice.wav", duration: 1, sha256: "c".repeat(64), size: 64, archivePath: "media/audio/voice.wav",
    }]));
    expect(voice).toMatchObject({ ok: false, code: "MEDIA_SLOT_OCCUPIED", operationId: "voice-2" });
  });

  it("adds a timed overlay from archived media with a validated transform", () => {
    const result = applyCommandPlan(project(), plan([
      { id: "overlay-1", type: "overlay.add", sourceClipId: "visual-1", clipId: "overlay-1", start: 3, duration: 2, layer: 2, transform: { x: -20, y: 15, scale: 0.4 } },
    ]));
    expect(result.project.visualOverlaySegments[0]).toMatchObject({
      id: "overlay-1", archiveMediaId: "visual-1", start: 3, duration: 2, layer: 2,
      sourceStart: 1, sourceDuration: 4, playbackRate: 2,
      baseTransform: { x: -20, y: 15, scale: 0.4, rotation: 0, opacity: 1 },
    });
  });

  it("sets a bounded transition on an outgoing visual junction", () => {
    const result = applyCommandPlan(project(), plan([
      { id: "transition-1", type: "transition.set", clipId: "visual-1", transitionId: "fade", duration: 0.8 },
    ]));
    expect(result.project.visualSegments[0].transition).toEqual({ id: "fade", duration: 0.8 });
  });

  it("rolls back when a transition targets the final visual", () => {
    const original = project();
    const result = applyCommandPlan(original, plan([
      { id: "append-1", type: "visual.append", sourceClipId: "visual-2", clipId: "visual-3", duration: 1 },
      { id: "transition-1", type: "transition.set", clipId: "visual-3", transitionId: "fade", duration: 0.2 },
    ]));
    expect(result).toMatchObject({ ok: false, code: "INVALID_TRANSITION_TARGET", operationId: "transition-1" });
    expect(original.visualSegments.map((clip) => clip.id)).toEqual(["visual-1", "visual-2"]);
  });

  it("rejects trims outside the serialized source range without partial edits", () => {
    const original = project();
    const result = applyCommandPlan(original, plan([
      { id: "reorder-1", type: "visual.reorder", clipId: "visual-2", toIndex: 0 },
      { id: "trim-1", type: "visual.trim", clipId: "visual-1", sourceIn: 0, sourceOut: 20 },
    ]));
    expect(result).toMatchObject({ ok: false, code: "SOURCE_RANGE_EXCEEDED", operationId: "trim-1" });
    expect(original.visualSegments.map((segment) => segment.id)).toEqual(["visual-1", "visual-2"]);
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

  it("adds captions in timeline order and can link them to audio", () => {
    const result = applyCommandPlan(project(), plan([
      { id: "add-1", type: "caption.add", clipId: "caption-2", text: "Earlier", start: 0, end: 1, audioClipId: "voice-1" },
    ]));
    expect(result.project.captionSegments.map((caption) => caption.id)).toEqual(["caption-2", "caption-1"]);
    expect(result.project.captionSegments[0]).toMatchObject({ text: "Earlier", audioSegmentId: "voice-1" });
    expect(result.project.script).toBe("Earlier\nHello");
  });

  it("deletes clips and preserves a reversible caption-to-audio association", () => {
    const result = applyCommandPlan(project(), plan([
      { id: "delete-1", type: "clip.delete", track: "audio", clipId: "voice-1" },
    ]));
    expect(result.project.audioSegments).toEqual([]);
    expect(result.project.captionSegments[0]).toMatchObject({ audioSegmentId: "", detachedAudioSegmentId: "voice-1" });
  });

  it("rolls back caption additions with duplicate clip IDs", () => {
    const original = project();
    const result = applyCommandPlan(original, plan([
      { id: "add-1", type: "caption.add", clipId: "caption-2", text: "New", start: 0, end: 1 },
      { id: "add-2", type: "caption.add", clipId: "caption-1", text: "Duplicate", start: 1, end: 2 },
    ]));
    expect(result).toMatchObject({ ok: false, code: "CLIP_ALREADY_EXISTS", operationId: "add-2" });
    expect(original.captionSegments).toHaveLength(1);
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
    expect(inspectProject(project())).toMatchObject({ revision: 0, duration: 10, ratio: "16:9", tracks: { captions: 1, audio: 1, visuals: 2, stickers: 0, overlays: 0 } });
  });

  it("inspects ordered tracks and detailed clips without mutating the project", () => {
    const original = project();
    expect(inspectTrack(original, "visuals")).toMatchObject({
      track: "visuals",
      clipCount: 2,
      duration: 10,
      clips: [{ id: "visual-1", start: 0, end: 8 }, { id: "visual-2", start: 8, end: 10 }],
    });
    expect(inspectClip(original, "visual-1")).toMatchObject({
      track: "visuals",
      summary: { id: "visual-1", index: 0, start: 0, duration: 8 },
      source: { sourceStart: 1, sourceDuration: 16, playbackRate: 2 },
      properties: { type: "video", keyframes: [{ time: 1, scale: 1 }, { time: 5, scale: 2 }] },
    });
    expect(original.visualSegments[0].duration).toBe(8);
  });

  it("inspects timestamped transcript segments, speakers, words, and audio scope", () => {
    expect(inspectTranscript(project(), "voice-1")).toMatchObject({
      audioClipId: "voice-1",
      segmentCount: 1,
      wordCount: 1,
      duration: 5,
      text: "Hello",
      segments: [{ id: "caption-1", speaker: "Narrator", start: 2, end: 5, words: [{ text: "Hello", start: 2.1, end: 2.6, confidence: 0.98 }] }],
    });
    expect(inspectTranscript(project(), "missing")).toMatchObject({ segmentCount: 0, wordCount: 0, text: "" });
  });

  it("produces field-level project and clip changes", () => {
    const before = project();
    const result = applyCommandPlan(before, plan([
      { id: "ratio-1", type: "project.set_ratio", ratio: "1:1" },
      { id: "property-1", type: "clip.set_property", clipId: "visual-1", property: "opacity", value: 0.5 },
      { id: "append-1", type: "visual.append", sourceClipId: "visual-2", clipId: "visual-3", duration: 1 },
    ]));
    expect(result.changes).toMatchObject({
      projectFields: [{ field: "ratioId", before: "16:9", after: "1:1" }],
      tracks: { visuals: { added: ["visual-3"], removed: [], modified: [{ id: "visual-1", fields: ["opacity"] }] } },
    });
    expect(diffProjects(before, result.project)).toEqual(result.changes);
  });
});
