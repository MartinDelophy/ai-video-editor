# Agent command contract

Use JSON as a transport-neutral plan. The CLI and a future MCP server should call the same application service.

## Plan envelope

```json
{
  "schemaVersion": 1,
  "project": "/absolute/path/project.timeline",
  "baseRevision": 12,
  "dryRun": false,
  "operations": [
    {
      "id": "op-001",
      "type": "visual.trim",
      "clipId": "visual-123",
      "sourceIn": 1.2,
      "sourceOut": 8.4
    }
  ],
  "output": {
    "project": "/absolute/path/project-edited.timeline",
    "render": "/absolute/path/project-edited.mp4"
  }
}
```

All times are finite seconds. IDs are stable across reads and writes. A repeated operation ID must return its prior result without applying twice.

## Minimum read commands

- `project.inspect`: format version, revision, duration, ratio, tracks, media inventory, warnings
- `track.inspect`: ordered or timed clip summaries for one track
- `clip.inspect`: source mapping, timing, transforms, effects, links, analysis records
- `transcript.inspect`: timestamped words/segments and speakers
- `project.diff`: predicted state changes, duration changes, and validation warnings

## Minimum write operations

- `asset.import`
- `visual.append`, `visual.insert`, `visual.trim`, `visual.split`, `visual.reorder`
- `overlay.add`, `timed.move`, `timed.resize`
- `clip.delete`, `clip.set_property`, `clip.set_speed`, `clip.set_muted`
- `caption.add`, `caption.update`, `caption.generate`
- `audio.separate`, `voice.generate`, `music.add`
- `transition.set`, `track.set_visibility`, `track.set_locked`
- `project.set_ratio`, `project.save`, `project.render`

## Result envelope

```json
{
  "ok": true,
  "revision": 13,
  "appliedOperationIds": ["op-001"],
  "warnings": [],
  "artifacts": {
    "project": "/absolute/path/project-edited.timeline",
    "render": "/absolute/path/project-edited.mp4"
  }
}
```

On failure, return `ok: false`, a stable error `code`, a human-readable `message`, the failing `operationId`, and no partial state unless the operation explicitly permits partial output.

## Architectural rule

Do not implement CLI and MCP editing separately. Both must call a single command registry backed by pure project-state reducers and shared validation. The React UI should eventually dispatch those same commands so manual and Agent edits cannot diverge.
