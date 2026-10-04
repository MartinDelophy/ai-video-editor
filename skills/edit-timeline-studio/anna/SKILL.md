---
name: timeline-studio-project-editing
description: Inspect, preview, edit and render a user-provided portable Timeline Studio .timeline project using bundled project tools. Use for clip timing, captions, markers and deterministic project-file editing.
metadata: {"matrix":{"emoji":"🎬","execution_mode":"prompt","category_name":"productivity"}}
---

# Timeline Studio project editing

Use the installed Timeline Studio Project Tools Executa. This workflow handles an explicit local `.timeline` archive on the user's Anna Agent host. It cannot read the open editor's private cloud project or operate its live timeline. Ask the user to export/provide the intended project and make it available on the Agent host when no accessible archive is supplied. A browser file, cloud URL or filename alone is not a local filesystem path. Do not claim access you do not have.

1. Call `timeline_project_inspect` with the absolute project path. Keep its exact revision and review warnings and media inventory. Use track, clip, marker or transcript inspections for the relevant scope. Existing transcript inspection is not audio transcription or video understanding.
2. Build supported shared-registry operations with stable operation IDs. Call `timeline_project_diff` with the inspected revision. Read its field-level changes and explain material edits to the user. Do not apply a failed or unexpected diff.
3. Call `timeline_project_apply` only within the user's authorized editing request, using the exact project, revision and operations from that diff, its returned `previewId`, and a new outputProject path. Do not overwrite inputs or existing outputs. The receipt expires after 15 minutes, is single-use, and is lost when the plugin restarts. Reinspect and preview after changes or expiration.
4. Inspect the returned output archive and verify the requested changes. Return the actual artifact path. It remains separate from the currently open browser project until the user imports it.
5. Render only when requested and supported: `timeline_project_render` requires an inspected source, a new MP4 path and FFmpeg/ffprobe on the Agent host. Treat unsupported filters, spatial audio, overlays, browser AI and other rich composition as explicit limitations; preserve those settings and use the editor for full rendering. Never claim a video exists until the tool returns a verified artifact.

Tools never synthesize speech, generate images, run Remotion, fetch URLs or import new filesystem media. Use established editor/CLI workflows for those operations, then inspect the resulting archive. Do not invent media, transcripts, visual analysis, approvals, capabilities or completed exports. No unrestricted shell/HTML/React payload is accepted.

## Scope and failure recovery

Use project inspection to obtain revision and inventory; use track inspection for clip IDs, clip inspection for exact timing/settings, marker inspection for annotations, and transcript inspection only for saved text. Use seconds for timeline values. Never substitute an asset ID or filename for a clip ID. Keep the operation array in its reviewed order; JSON object field order does not affect the preview receipt.

On INVALID_ARGUMENT, correct the reported details rather than repeating the same call. On INSPECTION_REQUIRED or REVISION_CONFLICT, inspect again and rebuild the preview. On PREVIEW_REQUIRED, obtain a fresh preview for the exact intended operations. On OUTPUT_EXISTS, select another filename. An unsupported operation/render requires a supported narrower edit or the editor workflow, not repeated retries. A failed preview never authorizes apply.

If apply loses its response, inspect the requested output before retrying: the write may have succeeded and consumed the receipt. Verify the output revision and requested changes; never delete an existing output to force a retry. Return the new archive path and explain that importing it is required to update the open editor.

## Current editor summary (experimental window route)

When the user asks about the open Anna editor rather than an archive, and open_app_view is available, use the installed app numeric app_id (254 for Timeline Studio on anna.partners; the production tool rejects string slugs) and send the main view a payload.timelineStudioRequest with schemaVersion 1, a fresh requestId (8–80 alphanumeric, underscore or hyphen characters), method project.inspect and issuedAt set to current Unix milliseconds. Await the matching app_event artifact; window opening is not inspection success. Requests expire after two minutes. EDITOR_NOT_READY means the user must finish startup/recovery before a new inspection request. This route returns summary counts, duration and ratio only; it does not expose media, caption text, edit receipts or mutating methods. The archive Executa remains file-only. Do not claim the experimental route is available in an older installed app version.
