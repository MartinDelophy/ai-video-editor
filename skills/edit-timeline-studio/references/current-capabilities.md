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
- A versioned JSON command plan runner through `npm run agent -- inspect <project.timeline>` and `npm run agent -- run <plan.json>`
- Transactional, revision-checked, idempotent, dry-run-safe edits for moving voiceover clips, updating caption text/timing, and unlinking or relinking caption audio
- Portable `.timeline` output that preserves archived media entries while replacing only versioned project metadata

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

1. Media probing and render support in the headless command runner (load, inspect, edit, and save are now available).
2. Broader command coverage beyond the initial voiceover/caption operations.
3. A fully serializable editor core independent of React setters, DOM nodes, Blob URLs, and browser-only refs; the first shared reducers now live in `src/lib/projectCommandEngine.js`.
4. Persisted undo checkpoints and richer semantic diffs; transactions, revision preconditions, idempotency keys, structured errors, and summary dry-run diffs are available.
5. Read tools at three levels: project summary, track/clip detail, and transcript/analysis detail.
6. Progress events and cancellation for ASR, TTS, vision, avatar generation, and export.
7. Deterministic media ingestion with content hashes and portable asset references.
8. Agent-focused integration tests that apply a command plan, reopen the project, render, decode, and verify the result.

## Recommended delivery order

1. Extend the shared reducers with import, append, trim, split, delete, overlay, property, and track mute/visibility.
2. Add track/clip/transcript inspection and richer `project.diff` output.
3. Add persisted undo checkpoints around the existing command transaction.
4. Add media probing and `project.render` to the local Node/browser-worker runner.
5. Add MCP as a thin transport adapter over the same registry.
6. Prefer the CLI from this Skill when an operation is supported, retaining browser control as the compatibility path.
