import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);

function silentWav(seconds = 0.1, sampleRate = 8000) {
  const samples = Math.max(1, Math.round(seconds * sampleRate));
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVE", 8);
  buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

function solidPpm(width = 16, height = 16) {
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`);
  return Buffer.concat([header, Buffer.alloc(width * height * 3, 128)]);
}

describe("timeline command CLI", () => {
  it("renders and verifies a portable image and voice project transactionally", async () => {
    const directory = await mkdtemp(join(tmpdir(), "timeline-render-"));
    const input = join(directory, "input.timeline");
    const output = join(directory, "output.mp4");
    const requestPath = join(directory, "render.json");
    const payload = {
      format: "timeline-studio-archive",
      version: 2,
      project: {
        ratioId: "16:9",
        visualSegments: [{ id: "visual", type: "image", duration: 0.25 }],
        audioSegments: [{ id: "voice", start: 0, duration: 0.1 }],
      },
      media: {
        visuals: [{ id: "visual", path: "media/visuals/image.ppm", type: "image/x-portable-pixmap" }],
        audio: { path: "media/audio/voice.wav", type: "audio/wav" },
      },
    };
    await writeFile(input, zipSync({
      "project.json": strToU8(JSON.stringify(payload)),
      "media/visuals/image.ppm": solidPpm(),
      "media/audio/voice.wav": silentWav(),
    }));
    await writeFile(requestPath, JSON.stringify({
      schemaVersion: 1,
      project: input,
      output: { video: output },
      render: { width: 160, height: 90, frameRate: 24, preset: "ultrafast", crf: 28 },
    }));
    const rendered = JSON.parse((await execute(process.execPath, ["scripts/timeline-command.mjs", "project.render", requestPath], { cwd: process.cwd() })).stdout);
    expect(rendered).toMatchObject({
      ok: true,
      artifacts: { project: input, video: output },
      render: { width: 160, height: 90, frameRate: 24, hasAudio: true, codec: "h264", container: "mp4" },
      verification: { width: 160, height: 90, hasAudio: true },
    });
    expect(rendered.verification.duration).toBeGreaterThanOrEqual(0.2);
    expect((await readFile(output)).length).toBeGreaterThan(1000);
  }, 60_000);

  it("dry-runs and writes a new archive while preserving media entries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "timeline-command-"));
    const input = join(directory, "input.timeline");
    const output = join(directory, "output.timeline");
    const planPath = join(directory, "plan.json");
    const importedImage = join(directory, "imported.png");
    const importedMusic = join(directory, "music.wav");
    await writeFile(importedImage, new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]));
    await writeFile(importedMusic, silentWav());
    const payload = {
      format: "timeline-studio-archive",
      version: 2,
      project: {
        audioSegments: [{ id: "voice", start: 0, duration: 2 }],
        captionSegments: [{ id: "caption", text: "Old", start: 0, end: 2, audioSegmentId: "voice", speaker: "Host", words: [{ text: "Old", start: 0.1, end: 0.5 }] }],
        visualSegments: [{ id: "visual", type: "video", duration: 4, sourceStart: 0, sourceDuration: 4, playbackRate: 1 }],
      },
      media: { visuals: [{ id: "visual", path: "media/visuals/source.mp4", name: "source.mp4", type: "video/mp4", size: 3 }] },
    };
    await writeFile(input, zipSync({
      "project.json": strToU8(JSON.stringify(payload)),
      "media/audio/voice.wav": new Uint8Array([1, 2, 3]),
      "media/visuals/source.mp4": new Uint8Array([4, 5, 6]),
    }));
    const basePlan = {
      schemaVersion: 1,
      project: input,
      baseRevision: 0,
      operations: [
        { id: "edit-caption", type: "caption.update", clipId: "caption", text: "New" },
        { id: "add-caption", type: "caption.add", clipId: "caption-2", text: "Later", start: 2, end: 3 },
        { id: "split-visual", type: "visual.split", clipId: "visual", at: 1.5, rightClipId: "visual-b" },
        { id: "set-volume", type: "clip.set_property", clipId: "voice", property: "volume", value: 0.75 },
        { id: "speed-visual", type: "clip.set_speed", clipId: "visual-b", speed: 2 },
        { id: "mute-visual", type: "clip.set_muted", clipId: "visual", muted: true },
        { id: "hide-audio", type: "track.set_visibility", track: "audio", visible: false },
        { id: "set-ratio", type: "project.set_ratio", ratio: "9:16" },
        { id: "append-visual", type: "visual.append", sourceClipId: "visual", clipId: "visual-c", duration: 1 },
        { id: "add-overlay", type: "overlay.add", sourceClipId: "visual", clipId: "overlay-a", start: 0.5, duration: 1, layer: 1 },
        { id: "set-transition", type: "transition.set", clipId: "visual", transitionId: "fade", duration: 0.5 },
        { id: "import-image", type: "asset.import", file: importedImage, track: "visuals", clipId: "visual-imported", name: "imported.png", duration: 2, width: 640, height: 480 },
        { id: "import-music", type: "asset.import", file: importedMusic, track: "music", clipId: "music-imported", name: "music.wav", start: 1 },
      ],
      output: { project: output },
    };
    const projectInspect = JSON.parse((await execute(process.execPath, ["scripts/timeline-command.mjs", "project.inspect", input], { cwd: process.cwd() })).stdout);
    expect(projectInspect).toMatchObject({ ok: true, archiveVersion: 2, revision: 0, duration: 4, mediaInventory: { count: 2, paths: ["media/audio/voice.wav", "media/visuals/source.mp4"] } });
    const trackInspect = JSON.parse((await execute(process.execPath, ["scripts/timeline-command.mjs", "track.inspect", input, "visuals"], { cwd: process.cwd() })).stdout);
    expect(trackInspect).toMatchObject({ ok: true, track: "visuals", clipCount: 1, clips: [{ id: "visual", start: 0, end: 4 }] });
    const clipInspect = JSON.parse((await execute(process.execPath, ["scripts/timeline-command.mjs", "clip.inspect", input, "visual"], { cwd: process.cwd() })).stdout);
    expect(clipInspect).toMatchObject({ ok: true, track: "visuals", source: { sourceStart: 0, sourceDuration: 4, playbackRate: 1 } });
    const transcriptInspect = JSON.parse((await execute(process.execPath, ["scripts/timeline-command.mjs", "transcript.inspect", input, "voice"], { cwd: process.cwd() })).stdout);
    expect(transcriptInspect).toMatchObject({ ok: true, audioClipId: "voice", segmentCount: 1, wordCount: 1, segments: [{ id: "caption", speaker: "Host", words: [{ text: "Old" }] }] });

    await writeFile(planPath, JSON.stringify({ ...basePlan, dryRun: false }));
    const archiveBeforeDiff = await readFile(input);
    const diff = JSON.parse((await execute(process.execPath, ["scripts/timeline-command.mjs", "project.diff", planPath], { cwd: process.cwd() })).stdout);
    expect(diff).toMatchObject({ ok: true, revision: 1, artifacts: {}, diff: { before: { revision: 0 }, after: { revision: 1 } } });
    expect(diff.diff.changes.projectFields).toEqual(expect.arrayContaining([{ field: "ratioId", before: null, after: "9:16" }]));
    expect(diff.diff.changes.tracks.visuals).toMatchObject({ added: ["visual-b", "visual-c", "visual-imported"], modified: [{ id: "visual" }] });
    expect(diff.diff.changes.tracks.overlays).toMatchObject({ added: ["overlay-a"] });
    expect(await readFile(input)).toEqual(archiveBeforeDiff);
    await expect(readFile(output)).rejects.toThrow();

    await writeFile(planPath, JSON.stringify({ ...basePlan, dryRun: true }));
    const dryRun = JSON.parse((await execute(process.execPath, ["scripts/timeline-command.mjs", "run", planPath], { cwd: process.cwd() })).stdout);
    expect(dryRun).toMatchObject({ ok: true, revision: 1, artifacts: {} });
    await expect(readFile(output)).rejects.toThrow();

    await writeFile(planPath, JSON.stringify({ ...basePlan, dryRun: false }));
    const run = JSON.parse((await execute(process.execPath, ["scripts/timeline-command.mjs", "run", planPath], { cwd: process.cwd() })).stdout);
    expect(run.artifacts.project).toBe(output);
    const files = unzipSync(new Uint8Array(await readFile(output)));
    expect([...files["media/audio/voice.wav"]]).toEqual([1, 2, 3]);
    expect([...files["media/visuals/source.mp4"]]).toEqual([4, 5, 6]);
    const savedPayload = JSON.parse(strFromU8(files["project.json"]));
    const importedManifest = savedPayload.media.visuals.find((item) => item.id === "visual-imported");
    expect(importedManifest).toMatchObject({ name: "imported.png", type: "image/png", size: 8 });
    expect([...files[importedManifest.path]]).toEqual([137, 80, 78, 71, 1, 2, 3, 4]);
    expect(savedPayload.media.music).toMatchObject({ id: "music-imported", name: "music.wav", type: "audio/wav" });
    expect(files[savedPayload.media.music.path].length).toBeGreaterThan(44);
    expect(savedPayload.project).toMatchObject({
      captionSegments: [{ id: "caption", text: "New" }, { id: "caption-2", text: "Later" }],
      audioSegments: [{ id: "voice", volume: 0.75 }],
      visualSegments: [
        { id: "visual", duration: 1.5, muted: true, transition: { id: "fade", duration: 0.5 } },
        { id: "visual-b", duration: 1.25, sourceStart: 1.5, sourceDuration: 2.5, playbackRate: 2 },
        { id: "visual-c", duration: 1, archiveMediaId: "visual" },
        { id: "visual-imported", duration: 2, archiveMediaId: "visual-imported", width: 640, height: 480 },
      ],
      visualOverlaySegments: [{ id: "overlay-a", start: 0.5, duration: 1, archiveMediaId: "visual" }],
      ratioId: "9:16",
      trackVisibility: { audio: false },
      musicSegments: [{ id: "music-imported", start: 1, name: "music.wav" }],
      commandState: { revision: 1, appliedOperationIds: ["edit-caption", "add-caption", "split-visual", "set-volume", "speed-visual", "mute-visual", "hide-audio", "set-ratio", "append-visual", "add-overlay", "set-transition", "import-image", "import-music"] },
    });
  }, 60_000);
});
