# Current capability map

## Available in the editor

- Editable main Visuals sequence plus timed picture-in-picture overlays
- Captions, stickers, voiceover, separated source audio, and music tracks
- Visual transforms, property keyframes, masks, filters, effects, speed, and animations
- Automatic captions, multilingual browser TTS, vocal separation, vision analysis, and digital-human generation
- Portable `.timeline` ZIP archives containing `project.json` and media binaries
- Offline WebCodecs composition/export with a recorder fallback
- Undo/redo through the editor history layer

## Available to an Agent today

- Repository inspection and code changes
- Browser-driven operation of the running editor
- Import and export through visible file controls
- Pure timeline helper functions in `src/lib/`

Browser-driven editing is a compatibility mechanism, not a stable public API. UI labels, selection state, drag thresholds, and file pickers make it unsuitable for unattended or idempotent jobs.

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

1. A headless command runner that owns project load, media probing, command application, save, and render.
2. A versioned command schema with stable asset/clip/track IDs and explicit time units.
3. A serializable editor core independent of React setters, DOM nodes, Blob URLs, and browser-only refs.
4. Transactional validation, revision preconditions, idempotency keys, structured errors, undo checkpoints, and dry-run diffs.
5. Read tools at three levels: project summary, track/clip detail, and transcript/analysis detail.
6. Progress events and cancellation for ASR, TTS, vision, avatar generation, and export.
7. Deterministic media ingestion with content hashes and portable asset references.
8. Agent-focused integration tests that apply a command plan, reopen the project, render, decode, and verify the result.

## Recommended delivery order

1. Extract `EditorProjectState` and pure reducers from the existing timeline action modules.
2. Add read-only `project.inspect` and `project.diff` commands.
3. Add core edit commands: import, append, trim, split, move, delete, caption, overlay, property, and track mute/visibility.
4. Wrap command batches in history transactions and persist revision numbers.
5. Add `project.open/save/render` to a local Node/browser-worker runner.
6. Expose the same runner through CLI first; add MCP later as a thin transport adapter.
7. Replace the Skill's UI compatibility path with the CLI while keeping the command contract unchanged.
