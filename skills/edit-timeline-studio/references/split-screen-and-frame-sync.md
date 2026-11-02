# Split screens and reference-frame synchronization

Both operations use the shared project command registry. CLI `project.diff`/`project.run`, the STDIO MCP diff/apply tools, and browser `timeline_edit_preview`/`timeline_edit_apply` accept them. UI and commands reuse the same layout, source-time and collision helpers. Do not replace these operations with inferred pixel transforms or unreviewed mouse actions.

## Inspect and choose evidence

Inspect the project, Visuals and Overlay tracks, then each chosen clip. Keep the current revision (CLI/MCP) or `stateToken` (browser). Read real `width`/`height`, visibility, locks, timing and existing keyframes. In browser inspections and semantic reviews, `splitScreenRect` is a normalized canvas rectangle and numeric keyframes are included; media URLs/bytes remain excluded.

For alignment evidence, inspect actual media frames before deciding that two frames correspond. In an open browser project, `timeline_media_sample` returns rendered project frames without moving the playhead; seek or temporarily inspect the source as needed to distinguish overlapping pictures. Do not claim semantic/optical/audio auto-matching: synchronization receives two explicitly chosen project-time frame observations. Local source-frame tools can inspect media offline; convert source-time observations to project times with each clip's existing trim/speed-curve mapping. Never equate source seconds with project seconds for trimmed or retimed media.

## `project.split_screen`

```json
{"id":"layout-01","type":"project.split_screen","time":2,"layout":"grid","clipIds":["main-a","overlay-a","overlay-b"]}
```

- `time` is absolute project seconds within `0..86400`.
- `clipIds` is an explicit, unique, ordered list of 2–100 existing pictures. Include **every** visible main picture and overlay active at that exact time; the main track counts as one. Offscreen/non-overlapping clips are excluded. Every selected clip needs real positive media dimensions. Locked targets, hidden clips and incomplete lists are rejected atomically.
- Input order determines cells: normally main first, then overlay layer order. `columns` gives equal-width side-by-side cells; `rows` gives equal-height stacked cells; `grid` gives a compact grid. Three pictures yield two above and one full-width below; four yield 2×2. An incomplete final row uses its whole width.
- Each cell crops proportionally to fill it. There is no distortion, letterbox selector or automatic subject-aware reframing in this operation. Mixed landscape/portrait sources may lose edges: inspect faces, titles and diagrams before accepting the result. `splitScreenRect` persists on each clip; it is not an ephemeral playhead-only effect. Reapply when the participant set changes at another time if the edit calls for a different arrangement.
- Base transforms and existing transform keyframes shift together to establish the layout at `time`. Other animated properties, source trims, speed curves, audio, clip timing and sequence order remain. Existing motion can subsequently move a subject within or outside its fixed cell; validate across the actual edit range, not just the anchor frame.

## `overlay.sync_reference`

```json
{"id":"sync-01","type":"overlay.sync_reference","clipId":"depth-overlay","targetTime":3,"referenceClipId":"original-main","referenceTime":2}
```

Both clips must be videos. The target is an overlay; the reference can be main or another overlay. `targetTime` and `referenceTime` are absolute project seconds **before this operation**, each within its clip's half-open visible interval `[start,end)`. References may be on locked tracks because they are read-only; the target must be unlocked. Distinct IDs are required.

The new target start is `oldStart + referenceTime - targetTime`. This places the selected target frame at the reference frame's project time without changing trims, source duration, rate/curve, keyframes or sound. A negative start or end after 86400 seconds is rejected. A collision on the target's lane moves only that target to a new unused overlay layer; inspect the resulting start/layer in the semantic diff. Other timed clips and the main sequence are not rippled. Matching one frame does not prove sustained sync when source speeds differ.

## Review, apply and verify

For CLI plans include schemaVersion 1, input project path, inspected baseRevision, stable operation IDs and a **new** output archive path. Run the structural validator, then `project.diff`, then `project.run` with the same operations/revision. The STDIO MCP transport uses those same commands. Repeated IDs do not reapply; stale revisions and failed batches do not change the project.

Browser inputs omit operation IDs (the preview service assigns them). Pass the freshly inspected `stateToken` and operations to `timeline_edit_preview`; check transforms, keyframes, crop rectangles, timing and any lane change, then apply exactly its `previewId`. A stale unapplied preview must be reinspected and regenerated. A retry of an already applied preview returns its original receipt without applying again, including after undo; inspect the reported current state before planning another edit. Apply produces one undo step. Inspect afterward and verify rendered output/sample frames.

The browser deterministic and compatibility renderers share split-cell cropping. The current local FFmpeg renderer still rejects overlays and main-picture split cells (`UNSUPPORTED_RENDER_FEATURE`); it must not silently render a full-frame substitute. Use an explicitly authorized browser render for a split-screen deliverable, or hand off the new editable archive with that limitation clearly stated.
