# Current capability map

## Available in the editor

- Editable main Visuals sequence plus timed picture-in-picture overlays
- Captions, stickers, voiceover, separated source audio, and music tracks
- Persistent markers, chapters, ranges, and notes; compact ruler flags by default, expandable titles/ranges, and UI snapping with Alt bypass
- Visual transforms, property keyframes, masks, filters, effects, constant speed, and editable source-time speed curves with up to eight nodes and optional smooth joins
- Keyframeable Color Wheels for shadows, midtones, highlights, and global offset, plus temperature, tint, and saturation controls
- Person cutout for images and video, product/object cutout analysis, person and object outline styling, and local authorized face swap for a selected image or video target
- Automatic captions; Hojo TTS Light 80M FP16 WebGPU Chinese/mixed Chinese-English TTS with 晴岚 and 若溪; other owned multilingual browser TTS; vocal separation; and vision analysis
- Portable `.timeline` ZIP archives containing `project.json` and media binaries
- Offline WebCodecs composition/export with a recorder fallback
- Undo/redo through the editor history layer

## Available to an Agent today

- Repository inspection and code changes
- Fifteen native browser WebMCP tools for the open project: project/asset/marker inspection, preview seeking, reviewed caption/audio/marker changes, supported main-visual split/delete/duplicate/reorder/trim, existing-asset and picture-in-picture insertion, guarded undo, editable `.timeline` downloads, and real video export with prepared settings, progress receipts and cancellation
- Browser-driven operation of the running editor
- Import and export through visible file controls
- Pure timeline helper functions in `src/lib/`
- Versioned `project.inspect`, `track.inspect`, `clip.inspect`, `transcript.inspect`, `marker.inspect`, field-level `project.diff`, and `project.run` commands, with legacy `inspect`/`run` aliases
- Revision-checked `marker.add`, `marker.update`, and `marker.delete` operations through the same CLI/MCP engine, full annotation inspection, marker counts by type, and semantic annotation diffs
- A local STDIO MCP server inside this Skill that exposes the same inspect, diff, apply, and render command layer to Codex without duplicating reducers
- Transactional, revision-checked, idempotent edits for probed and hashed visual/audio import to Visuals, Music, or multiple portable Voiceover clips; timed edits, captions, Visuals/Overlays, transitions, validated properties, track state, and ratio
- Portable `.timeline` output that preserves archived media entries while replacing only versioned project metadata
- Transactional local `project.render` for the portable Visuals + Voiceover + Music subset, with ffprobe verification and explicit rejection of unsupported composition features

Native browser WebMCP is an experimental structured interface for the documented live-editor subset; availability depends on the browser and agent host. UI automation remains a compatibility mechanism whose labels, selection state, drag thresholds and file pickers are unsuitable for unattended or idempotent jobs. The local STDIO MCP/CLI path remains the default for project files.

For long-video anchors, chapter structure, beat cues, and revision notes, read [timeline-markers.md](timeline-markers.md). Marker-only edits work locally without browser automation or rendering. Annotations retain absolute project times, do not move automatically with ripple edits, and do not change rendered duration or produce visible overlays/container chapters. Beat detection and source-to-project cue mapping remain evidence-driven planning work rather than automatic marker-command capabilities.

Color Wheels, speed curves, and the advanced subject-effect stack are currently editor/browser capabilities. The portable headless renderer explicitly rejects projects containing color grading, `speedCurve`, vision-derived masks, or other visual effects; do not claim headless render parity for them. Face-swap results are generated as new My assets and are not inserted into or substituted on the timeline automatically.

Observed browser-path constraints:

- Vite may select a different port when the default is occupied; use the emitted URL.
- A semantically located Choose File button or file input may fail to emit a chooser in browser control even when the visible upload surface succeeds.
- The first imported visual opens a coach guide whose confirmation persists; an Agent must not confirm it on the user's behalf.
- A video with embedded audio can be audible without a visible source-audio lane.
- The first imported visual auto-enters Visuals, while later imported visuals remain in the asset library until placed.
- Opening a new tab can produce an empty project even after another tab showed “Autosaved”; portable persistence requires an explicit `.timeline` archive because local File/Blob media may not be reconstructed from session autosave.
- Locator-scoped Escape can fail on the coach dialog when browser focus moves; a verified page-level Escape works as a session-only dismissal.
- After splitting a very short visual, toolbar selection can be misread; a right-click clip menu provides a safer clip-scoped delete path.
- Browser-control download events can time out even when `.timeline` or video files are successfully written; confirm with filesystem timestamps and media decoding before retrying.
- The local repository now resolves a timeline video clip's `assetId` when separating source audio, so trimmed clips retain their source start/duration and do not expand the project. Keep a regression for both timeline-clip and asset-library extraction entry points.
- A reloaded project with a separated source track was observed to stall offline export at frame 1/479 without a console error. Preserve the project artifact and treat this as an export product defect; an embedded-audio export completed after removing the derived track.

## Missing for reliable Agent editing

1. Full browser-renderer parity in the headless command runner; the first H.264/AAC Visuals + Voiceover + Music path and ffprobe-backed import probing are available.
2. Broader command coverage for Voiceover generation and advanced render controls; multi-asset Voiceover storage and rendering are available.
   - Chinese and mixed Chinese/English generation is available now through the editor's two-speaker Hojo browser worker, but a shared headless command adapter over that exact runtime is still missing. Do not substitute MeloTTS, the retired Kokoro Chinese bundle, or an operating-system voice.
3. A fully serializable editor core independent of React setters, DOM nodes, Blob URLs, and browser-only refs; the first shared reducers now live in `src/lib/projectCommandEngine.js`.
4. Persisted undo checkpoints; transactions, revision preconditions, idempotency keys, structured errors, and field-level dry-run diffs are available.
5. Richer non-caption analysis inspection; project, track, clip, and caption transcript reads are available.
6. Progress events and cancellation for ASR, TTS, vision, and export.
7. Content-addressed deduplication beyond the current hashed import paths; per-segment portable Voiceover media references are available.
8. Agent-focused integration tests that apply a command plan, reopen the project, exercise both the supported headless render subset and browser-render parity cases, decode, and verify the result.

## Recommended delivery order

1. Add vision/ASR analysis-record inspection beyond serialized caption transcript data.
2. Add persisted undo checkpoints around the existing command transaction.
3. Expand `project.render` with captions, stickers, overlays, transitions, effects, source audio, progress events, and cancellation diagnostics.
4. Add structured progress and cancellation to the MCP and CLI paths for long-running analysis and rendering.
5. Prefer local STDIO MCP, then the CLI, for project files; use browser WebMCP for supported edits to the open project, retaining UI control as the compatibility path.
