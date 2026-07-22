# How does an Agent call the Timeline Studio command runner?

## Inspect a project

```bash
npm run agent -- project.inspect /absolute/path/project.timeline
npm run agent -- track.inspect /absolute/path/project.timeline visuals
npm run agent -- clip.inspect /absolute/path/project.timeline visual-123
npm run agent -- transcript.inspect /absolute/path/project.timeline voice-123
```

The project result includes `revision`, duration, ratio, track counts, archived media inventory, applied operation IDs, and warnings. Track inspection returns ordered timing summaries; clip inspection returns source mapping, links, transforms, effects, and other serialized properties. Transcript inspection returns ordered caption segments, speaker labels, linked audio IDs, and word timing/confidence when available; omit the audio ID to inspect all captions.

## Apply a plan

```bash
node skills/edit-timeline-studio/scripts/validate_edit_plan.mjs /absolute/path/plan.json
npm run agent -- project.diff /absolute/path/plan.json
npm run agent -- project.run /absolute/path/plan.json
```

The standalone validator checks JSON transport shape, finite time fields, and duplicate operation IDs. It does not prove that an operation is implemented or valid for the selected project. Treat `project.diff` as the authoritative semantic dry run because it executes the same registry, revision checks, and reducers as `project.run` without writing an archive.

```json
{
  "schemaVersion": 1,
  "project": "/projects/input.timeline",
  "baseRevision": 0,
  "dryRun": false,
  "operations": [
    { "id": "move-voice-001", "type": "timed.move", "track": "audio", "clipId": "voice-1", "start": 3 },
    { "id": "caption-001", "type": "caption.update", "clipId": "caption-1", "text": "Available today" }
  ],
  "output": { "project": "/projects/output.timeline" }
}
```

Supported write operations:

| Type | Required fields | Optional fields | Effect |
|---|---|---|---|
| `asset.import` | `file`, `track`, `clipId` | `name`, `duration`, `width`, `height`, `start`, `volume`, `muted`, `replace` | Probes, hashes, and embeds an absolute local visual/audio path. Supports Visuals, Music, and an empty Voiceover media slot. |
| `timed.move` | `track: "audio"`, `clipId`, `start` | — | Moves a voiceover and any still-linked captions by the same delta. |
| `timed.resize` | `track`, `clipId`, `duration` | `start` | Resizes audio, sticker, or overlay clips; linked captions follow audio movement and clamp to its end. |
| `visual.trim` | `clipId`, `sourceIn`, `sourceOut` | — | Trims a video within its serialized source range and remaps keyframes. |
| `visual.split` | `clipId`, `at`, `rightClipId` | — | Splits at clip-local seconds using an explicit stable ID for the right clip. |
| `visual.reorder` | `clipId`, `toIndex` | — | Reorders the contiguous main Visuals sequence. |
| `visual.append` | `sourceClipId`, `clipId` | `duration` | Appends a new stable clip reusing media already stored in the archive. |
| `visual.insert` | `sourceClipId`, `clipId`, `atIndex` | `duration` | Inserts archived media at a main-sequence boundary. |
| `overlay.add` | `sourceClipId`, `clipId`, `start` | `duration`, `layer`, `muted`, `transform` | Adds a timed Overlay that reuses archived visual media. |
| `transition.set` | `clipId`, `transitionId` | `duration` | Sets or clears a validated transition on an outgoing Visuals junction. |
| `caption.add` | `clipId`, `text`, `start`, `end` | `audioClipId` | Adds a timed caption, optionally linked to voiceover audio. |
| `caption.update` | `clipId` | `text`, `start`, `end` | Updates caption content or its finite, non-negative range. |
| `caption.unlink_audio` | `clipId` | — | Preserves the remembered audio ID but stops synchronization. |
| `caption.link_audio` | `clipId` | `audioClipId`, `align` | Relinks remembered or explicit audio; `align: true` copies its range. |
| `clip.delete` | `track`, `clipId` | — | Deletes a caption or voiceover; deleting audio leaves caption relink metadata intact. |
| `clip.set_property` | `clipId`, `property`, `value` | — | Sets an allowlisted numeric transform/audio/layer property with range validation. |
| `clip.set_speed` | `clipId`, `speed` | — | Sets 0.25–4× video/audio speed while preserving source duration and remapping keyframes. |
| `clip.set_muted` | `clipId`, `muted` | — | Mutes or unmutes video, overlay-video, or audio clips. |
| `track.set_visibility` | `track`, `visible` | — | Changes serialized track visibility using the editor's canonical base-track key. |
| `track.set_locked` | `track`, `locked` | — | Changes serialized track locking using the editor's canonical base-track key. |
| `project.set_ratio` | `ratio` | — | Sets `16:9`, `9:16`, `1:1`, or `4:5`. |

Set `dryRun: true` to return the predicted before/after summary without writing output. `project.diff` also includes project-field changes plus per-track added, removed, modified, and reordered clip IDs; modified clips identify their exact changed fields and before/after values. A successful non-empty batch increments revision once. Reusing an applied operation ID is a no-op; a stale revision with new operations returns `REVISION_CONFLICT`. Failures return a stable code and operation ID and write no partial archive.

`asset.import` supports JPG, PNG, WebP, GIF, MP4, WebM, MOV, MP3, WAV, M4A, AAC, OGG, and FLAC from an explicit absolute path. Missing duration and visual dimensions are probed with ffprobe; images still default to four seconds when no media duration exists. It computes SHA-256, embeds bytes under `media/visuals/` or `media/audio/`, adds the correct manifest entry, and writes integrity metadata. Music preserves its stable timed segment when reopened in the browser. Voiceover currently has one portable binary slot: importing into a populated Voiceover track fails unless `replace: true` is explicit. Diff and dry-run probe and validate but never change the input archive.

## Render a portable project

```bash
npm run agent -- project.render /absolute/path/render.json
```

```json
{
  "schemaVersion": 1,
  "project": "/projects/edited.timeline",
  "output": { "video": "/renders/edited.mp4" },
  "render": { "width": 1280, "height": 720, "frameRate": 30, "crf": 18, "preset": "medium" }
}
```

The initial renderer uses local `ffmpeg`, writes a temporary output, atomically renames it only after encoding succeeds, and verifies the final dimensions, duration, and audio-track presence with `ffprobe`. It renders contiguous image/video Visuals with contain fitting plus portable Voiceover and Music clips into H.264/AAC MP4. Width and height are normalized to even values; defaults come from the project ratio.

The command fails with `UNSUPPORTED_RENDER_FEATURE` instead of silently dropping visible captions, stickers, overlays, transitions, visual effects, or separated source audio. Use the browser renderer for those projects. `project.render` does not run AI generation and is intentionally separate from `project.run`; the editable `.timeline` remains the source of truth.
