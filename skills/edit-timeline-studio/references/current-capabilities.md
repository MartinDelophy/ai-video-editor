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
