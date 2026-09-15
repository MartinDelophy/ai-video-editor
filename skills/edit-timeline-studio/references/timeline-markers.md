# Timeline markers for Agent editing

Read this before planning long videos, chapter structure, music beat cues, revision notes, or ranges to revisit. Annotations let the Agent preserve exact editorial anchors in the editable project instead of keeping them only in chat.

## Choose an annotation

| Type | Use |
| --- | --- |
| `marker` | A precise cue, shot boundary, verified beat, or action anchor. |
| `chapter` | The start of a named topic or narrative section. |
| `range` | An interval to review, retain, compare, or work on; it does not select or trim media. |
| `note` | A revision instruction or observation at a precise time, with detail in `notes`. |

Keep titles concise and write titles/notes in the user's language; Unicode text is preserved. Use `notes` for source evidence, the relevant clip ID, rationale, or an unresolved decision. Preserve existing annotations unless the task explicitly changes them. Quote supplied review comments faithfully and label the Agent's own suggestions as Agent observations; never invent comments and attribute them to the user or a reviewer.

Markers remain project annotations. They neither draw into the video nor create MP4/container chapters, subtitles, chapter text exports, or exported loop ranges. They do not extend rendered media duration, including when placed beyond its current end. They remain at absolute project times when clips are reordered, trimmed, or ripple-edited; explicitly update affected annotations when an authorized media edit requires them to follow content.

## Resolve exact project time

1. Read `project.inspect` for revision, duration, and `markers: { count, byType }`. Read `marker.inspect` for existing IDs and full annotation contents, then inspect relevant tracks/clips before choosing times.
2. Derive clip-boundary cues from inspected project timing. For a source-frame event, first verify the source timestamp lies inside the clip's retained source range, then convert it using that clip's source-time mapping. Constant speed uses `clipStart + (sourceTime - sourceStart) / playbackRate`. For an enabled speed curve, use the repository's `getVisualSpeedCurveTimelineProgress` in `src/lib/visualSpeedCurve.js` on `(sourceTime - sourceStart) / sourceDuration`, multiply by the inspected clip duration, then add its project start. Do not divide by an average rate through a speed curve.
3. Musical cues need an evidenced beat origin and tempo: use supplied beat times, inspected audio, or a verified analysis result. BPM means quarter notes (`♩`) per minute. For meter denominator `d`, pulse spacing is `(60 / BPM) × (4 / d)`; `/4` pulses are quarters and `/8` pulses are eighths. Use the numerator/grouping to identify bar starts and secondary accents. Check drift against the actual music before writing a long grid, and avoid filling the ruler with every subdivision unless requested. The marker command and UI do not perform automatic beat detection.
4. Write exact finite project seconds. CLI/MCP commands do not apply pixel-distance snapping: use the inspected playhead time if available, clip boundary, or existing marker edge directly. Never infer a playhead from a screenshot when no exact time is known.

The editor displays compact flags in the ruler by default. Its Markers chevron expands titles and range spans without a redundant left-side label. UI drags/range edges snap to the playhead, clip boundaries, and other markers with the shared alignment axis; Alt bypasses snapping. A whole-range drag preserves its length when either edge snaps. These are browser interaction behaviors, not extra command fields.

## Inspect and apply through the shared command engine

Prefer the bundled MCP when available: `timeline_project_inspect`, `timeline_marker_inspect` with `{ "project": "/absolute/input.timeline" }` and optional `markerId`, then `timeline_project_diff` and `timeline_project_apply` with the same revision and operations. See [mcp-integration.md](mcp-integration.md). CLI fallback from the repository root:

```bash
npm run agent -- project.inspect /absolute/input.timeline
npm run agent -- marker.inspect /absolute/input.timeline
npm run agent -- marker.inspect /absolute/input.timeline review-mix
node skills/edit-timeline-studio/scripts/validate_edit_plan.mjs /absolute/markers-plan.json
npm run agent -- project.diff /absolute/markers-plan.json
npm run agent -- project.run /absolute/markers-plan.json
npm run agent -- marker.inspect /absolute/output-marked.timeline
```

The single-marker read is for an ID returned by inspection. The result contains `schemaVersion`, `revision`, `markerCount`, and `markers`, sorted by time with original order retained for equal times. Build the plan after inspection; its `baseRevision` must match the input archive. The structural validator checks transport shape; the semantic diff checks the actual project and marker constraints. Review `changes.markers`: `added` and `removed` contain full rows; `modified` contains `{ id, fields, before, after }`, with complete before/after marker rows. This section is omitted when annotations are unchanged. Apply only the reviewed revision and operation list, always to a new absolute output path.

| Operation | Required fields beyond unique operation `id` and `type` | Optional fields |
| --- | --- | --- |
| `marker.add` | Stable explicit `markerId`, `time`; `endTime` when `markerType` is `range` | `markerType` (default `marker`), `title`, `notes`, `color` |
| `marker.update` | Existing `markerId` | `markerType`, `time`, `endTime`, `title`, `notes`, `color` |
| `marker.delete` | Existing `markerId` | — |

`type` names the operation (`marker.add`); `markerType` names the annotation (`marker`, `chapter`, `range`, or `note`). `markerId` identifies the persisted annotation and is separate from the operation `id` used for idempotency: it must be a nonempty string, at most 160 characters, without surrounding whitespace. Titles and notes are strings, default to empty, and are limited to 240 and 20000 characters respectively. Allowed colors are `cyan` (default), `amber`, `violet`, `rose`, and `green`. Times must be numbers within `0..86400` seconds; ranges must span at least `0.001` seconds. A time-only range update moves both edges by the same delta and rejects movement outside the time bounds. Supply `endTime` explicitly to resize it or set both edges. Changing a range to a point type removes `endTime`; changing a point to a range requires an explicit valid `endTime`. Do not supply `endTime` for a point annotation.

### Example: four annotation types

These are illustrative times for a project inspected at revision `12`; derive replacements from the user's actual project. The example titles and notes demonstrate Chinese, English, Italian, and Indonesian, rather than requiring multilingual duplicates. The review note is an Agent suggestion, not fabricated user feedback.

```json
{
  "schemaVersion": 1,
  "project": "/projects/interview.timeline",
  "baseRevision": 12,
  "dryRun": false,
  "operations": [
    { "id": "annotate-intro-v1", "type": "marker.add", "markerId": "chapter-intro", "markerType": "chapter", "time": 0, "title": "开场：问题与背景", "notes": "章节起点对应已确认的开场片段。", "color": "cyan" },
    { "id": "annotate-beat-v1", "type": "marker.add", "markerId": "beat-reveal", "markerType": "marker", "time": 16.25, "title": "Reveal · downbeat", "notes": "Use the verified music cue here; retain the evidence in the edit brief.", "color": "amber" },
    { "id": "annotate-range-v1", "type": "marker.add", "markerId": "review-answer", "markerType": "range", "time": 42.5, "endTime": 55.75, "title": "Risposta da rivedere", "notes": "Osservazione dell’agente: valutare la chiarezza di questo passaggio.", "color": "violet" },
    { "id": "annotate-note-v1", "type": "marker.add", "markerId": "review-mix", "markerType": "note", "time": 73, "title": "Periksa transisi audio", "notes": "Catatan agen: dengarkan kesinambungan dialog pada transisi ini.", "color": "rose" }
  ],
  "output": { "project": "/projects/interview-marked.timeline" }
}
```

### Example: revise a range and remove a resolved note

Use these operations only if the user asks to move that review range and remove the resolved note. First inspect `/projects/interview-marked.timeline` again, retain its actual revision (normally `13` after the preceding batch), and verify both IDs. Put the following list in a fresh plan using that archive/revision and a new output such as `/projects/interview-reviewed.timeline`; validate and diff before applying it.

```json
[
  { "id": "move-review-answer-v2", "type": "marker.update", "markerId": "review-answer", "time": 44, "title": "Risposta da rivedere · aggiornata" },
  { "id": "remove-reviewed-mix-v2", "type": "marker.delete", "markerId": "review-mix" }
]
```

The first operation moves `42.5..55.75` to `44..57.25`, preserving `13.25` seconds. Setting only `endTime: 56` instead would resize the existing range. Reuse an operation ID only to retry the same intent; use new IDs for revisions.

| Error | Recovery |
| --- | --- |
| `REVISION_CONFLICT` | Re-inspect, rebuild the plan against current state, and review a new diff; do not merely replace the revision number. |
| `MARKER_NOT_FOUND` | Inspect the actual IDs and confirm the target still exists; never substitute another marker. |
| `MARKER_ALREADY_EXISTS` | Inspect the existing annotation; use an update only if it is the intended target, or assign a distinct stable ID for a new annotation. |
| `INVALID_ARGUMENT` | Correct malformed IDs, types, colors, text, missing/out-of-bounds times, or a point annotation's incompatible `endTime`. |
| `INVALID_RANGE` | Correct a reversed or sub-millisecond range; do not silently clamp it. |
| `OUTPUT_OVERWRITE_BLOCKED` / `OUTPUT_EXISTS` | Choose a new absolute output path. CLI and MCP preserve inputs and reject overwriting existing outputs. |

Failures reject the transaction without writing a partial archive. Preserve unrelated annotations rather than deleting them to make validation succeed.

## Verify and hand off

Inspect the newly written archive with both `project.inspect` and `marker.inspect`. Verify IDs, types, exact times/range lengths, titles, Unicode notes, colors, and the intended deletions. For annotation-only work, confirm duration, tracks, and media inventory remain unchanged and that the semantic diff contains no unintended media changes. Deliver the new editable `.timeline` and a short account of the annotations. No video render, narration, browser round-trip, or model download is required unless the user also requests that work.
