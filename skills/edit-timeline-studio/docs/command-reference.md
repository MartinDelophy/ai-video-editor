# How does an Agent call the Timeline Studio command runner?

## Inspect a project

```bash
npm run agent -- inspect /absolute/path/project.timeline
```

The JSON result includes `revision`, duration, ratio, track counts, applied operation IDs, and warnings.

## Apply a plan

```bash
node skills/edit-timeline-studio/scripts/validate_edit_plan.mjs /absolute/path/plan.json
npm run agent -- run /absolute/path/plan.json
```

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
| `timed.move` | `track: "audio"`, `clipId`, `start` | — | Moves a voiceover and any still-linked captions by the same delta. |
| `caption.update` | `clipId` | `text`, `start`, `end` | Updates caption content or its finite, non-negative range. |
| `caption.unlink_audio` | `clipId` | — | Preserves the remembered audio ID but stops synchronization. |
| `caption.link_audio` | `clipId` | `audioClipId`, `align` | Relinks remembered or explicit audio; `align: true` copies its range. |

Set `dryRun: true` to return the predicted before/after summary without writing output. A successful non-empty batch increments revision once. Reusing an applied operation ID is a no-op; a stale revision with new operations returns `REVISION_CONFLICT`. Failures return a stable code and operation ID and write no partial archive.

Headless import, generation, render, and broader edit commands are not shipped yet. Use the browser workflow for those operations rather than inventing command types.
