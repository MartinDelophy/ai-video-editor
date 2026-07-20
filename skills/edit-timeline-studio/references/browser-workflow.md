# Browser workflow

Use this path only when the command runner is unavailable.

## Start and select the editor

1. In a local repository, run the existing development command and keep the process alive.
2. Read the actual URL from the server output. Ports may shift when the default is occupied.
3. Open that URL in the selected browser and confirm the page is Timeline Studio before importing media. A newly opened tab may start with an empty in-memory project even when another tab previously displayed “Autosaved.”
4. On the hosted path, use only `https://video-editor.ai-creator.top/`.
5. Inspect the current project before changing it. Do not reset or replace existing work without authorization. Treat “Autosaved” as session state, not proof that local File/Blob media can be reconstructed in a new tab.

## Import one explicit asset

1. Resolve the requested file to an absolute path and probe its media type, dimensions, duration, frame rate, and audio streams.
2. Follow the browser tool's file-upload documentation. Begin listening for the file chooser before activating an upload control.
3. Prefer the visible upload drop zone or visible upload button. If that does not emit a chooser, try the media-specific `input[type=file]`.
4. If semantic activation fails twice, take a current screenshot and use one coordinate click on the visible upload surface while the chooser listener is active. Do not reuse stale coordinates.
5. Upload only the explicitly resolved asset. Never sweep a directory.
6. Verify the asset card filename, dimensions, displayed duration, project duration, and resulting timeline clip.
7. Remember that only the first imported visual is automatically placed on Visuals. Later imports remain assets until explicitly dragged.

## Handle onboarding without stealing the user's decision

The first visual may open a shortcuts coach guide. Do not click an action that permanently records completion unless the user explicitly asked. For autonomous editing, dismiss it only for the current page session with the corner close control or Escape. If locator-scoped Escape fails because focus moved, take a fresh snapshot and send one page-level Escape keypress. Verify the dialog disappeared. For a handoff or trial request, leave the guide visible.

## Edit through visible state

- Pause or seek only when the requested interaction requires it; timeline drag behavior may intentionally pause after the drag threshold.
- After each edit, verify the authoritative UI signal: clip range, selected value, visible timeline placement, preview frame, toast, or dialog state.
- After splitting a narrow clip, do not infer selection from inspector time or a toolbar's active styling. Right-click the intended clip body, verify its clip context menu opened, and use the menu's clip-scoped action. If the wrong clip is changed, undo immediately and reselect through the context menu.
- For direct manipulation, use a fresh screenshot and verify the resulting numeric transform values where available.
- Preserve the user's playhead unless the requested operation requires a seek.
- Save an editable `.timeline` archive before a destructive batch and before final handoff when supported. Reopen that archive when persistence matters; do not rely on a fresh tab restoring local media blobs. A browser-control download event may time out even though the file was saved; after a timeout, inspect the UI and the expected download directory for a newly created non-empty artifact before retrying.

## Verify audio correctly

- A newly imported video can play embedded audio without a visible source-audio lane.
- Separating audio creates derived source-audio clips and mutes embedded playback to prevent doubling.
- Deleting a separated piece does not imply that the original visual has lost its embedded audio.
- Verify audible playback, clip mute state, separation state, and exported audio instead of treating lane visibility as proof.
- When separating audio from a trimmed video clip, verify immediately that the project duration is unchanged and the visible source-audio piece matches the clip's timeline duration. The piece must resolve the visual clip's source start and source duration, not expose the full original media range.
- Generate captions from the selected mapped source-audio piece so transcription uses its source start, duration, and timeline start. Stop if separation expands the project or the caption source falls outside the visual clip.
- If export with a separated source track remains at the first frame for several progress checks without errors, preserve the `.timeline` archive and classify it as a product defect. After captions are safely stored, removing the derived source track is a valid recovery only when the video is configured to resume its embedded audio; verify the final file is audible.

## Handoff

For a trial request with no edit brief, leave the editor open with the requested media imported and do not export. Report the media facts, automatic placement, current duration, and any visible onboarding guide. For completed edits, return both the editable project and rendered file when created.

For rendered video, decode the entire video stream and probe frame count, dimensions, codec, duration, and audio streams. Confirm audio has real samples or measurable non-silent signal when sound is expected. Compare timeline duration with decoded video duration using a practical tolerance of `max(0.1 seconds, 2 / fps)` to allow frame rounding and audio-container padding.
