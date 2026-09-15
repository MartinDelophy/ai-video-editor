# WebMCP integration

Timeline Studio exposes the project open in the editor as 15 structured browser tools. Agents can inspect the timeline and available assets, review and apply supported multi-track edits, seek and undo, save an editable `.timeline` copy, and run a real browser video export with progress and cancellation. The root URL continues to open the editor directly.

This is a progressive enhancement for browsers and agent hosts that provide a compatible WebMCP API. Unsupported browsers keep the normal editor. Registration is not proof that a particular agent host can discover or invoke tools. WebMCP is experimental; the current [specification](https://webmachinelearning.github.io/webmcp/) is a Community Group draft, not a W3C Standard.

## Browser tools and local MCP

| Path | Project being edited | Execution and output |
| --- | --- | --- |
| Browser WebMCP | The live project in the open tab | Shared editor state, semantic review, one undoable edit transaction; browser downloads of a `.timeline` copy or rendered video |
| Local STDIO MCP / CLI | A local `.timeline` archive | Repository command runner, revisioned diff/apply, new output archive; supported headless rendering subset |

The local server remains inside [`skills/edit-timeline-studio`](../skills/edit-timeline-studio). Neither path implements a second timeline engine. Browser plans compile to the existing shared command engine and use the editor's ripple and history integration. Video export uses the same rendering hook, progress UI and cancellation controller as the editor's Export button. The website does not host a remote HTTP MCP server, OAuth service, or media-upload endpoint for this integration.

## Runtime registration

The browser adapter prefers `document.modelContext.registerTool(tool, { signal })`. Registration is tied to the mounted editor and removed through its `AbortController`; execution cancellation uses the callback's `{ signal }` options. An existing `navigator.modelContext.registerTool` API can be used for older native browser implementations. No API is synthesized on an unsupported browser, and no `provideContext()` or polyfill path is used. This follows the [Chrome imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api).

The browser mediates agent access. The editor does not opt tools into cross-origin exposure. Tool titles, descriptions, review controls, and error messages have direct translations in all 13 interface languages. Stable tool names and JSON field names remain language-independent.

## Tool contract

Discover the current page schemas before invoking tools. Browser tools share some names with local MCP tools, but take live-project arguments instead of filesystem paths.

| Tool | Input | Result or effect |
| --- | --- | --- |
| `timeline_project_inspect` | `{}` | Project summary, current editing capabilities, opaque `stateToken` |
| `timeline_track_inspect` | `track`, optional `offset`, `limit` | Paginated clip metadata; `visuals` includes source ranges and trim eligibility |
| `timeline_clip_inspect` | `clipId` | Clip properties, timing, and main-visual editing eligibility |
| `timeline_transcript_inspect` | Optional `audioClipId`, `offset`, `limit` | Existing caption text and timing; does not run speech recognition |
| `timeline_assets_inspect` | Optional `query`, `type`, `readyOnly`, `offset`, `limit` | Available asset metadata, readiness, `assetId`, and `insertableTracks`; no media bytes or URLs |
| `timeline_markers_inspect` | Optional `markerId`, `offset`, `limit` | Point/range markers, chapters and notes |
| `timeline_edit_preview` | `stateToken`, either `operations` or legacy `clips`, optional `summary` | Semantic changes and `previewId`; the timeline is unchanged |
| `timeline_edit_apply` | `previewId` | Applies that exact pending plan as one undoable transaction; returns `transactionId` |
| `timeline_preview_seek` | `time` in timeline seconds | Pauses playback and seeks within the project duration |
| `timeline_edit_undo` | `transactionId` | Reverts the latest agent transaction only while the project is unchanged |
| `timeline_project_save` | `stateToken` | Downloads a new portable `.timeline` project copy; does not render video |
| `timeline_export_prepare` | `stateToken`, optional `settings` | Validates settings, freezes the export plan, returns `exportId`, `resolvedSettings`, range, technical summary and estimate; starts no rendering |
| `timeline_export_start` | `exportId`, `requestId` | Revalidates the project, starts the reviewed export, quickly returns `jobId` and current status |
| `timeline_export_inspect` | `jobId` | Progress, status, reviewed settings and actual output receipt or failure |
| `timeline_export_cancel` | `jobId` | Requests cancellation through the real exporter; inspect until it acknowledges completion |

Track names are `visuals`, `overlays`, `audio`, `captions`, `stickers`, and `music`. Source-audio presence and link state are reported in the project summary; a separate source-audio track read is not exposed. Paginated reads default to 50 entries, with a maximum of 100; follow `nextOffset` until null. A preview accepts at most 500 operations or 500 legacy main-visual entries, and never both payload forms.

Transcript filtering follows a caption's active audio link, or its remembered source when no active link exists. `audioClipId` is the active movement link and `detachedAudioClipId` is the remembered source. Querying a transcript never relinks captions. Project saving also supports projects containing only overlays, stickers, or audio; video rendering requires a usable main visual.

`stateToken`, `previewId`, `transactionId`, `exportId` and `jobId` are session-issued opaque values. Do not construct them or reuse them after reloading. In contrast, an export `requestId` is a caller-chosen unique retry key; reuse it for retries of that same export start. Tool results include success or structured failure information; a completed invocation does not establish successful editing or rendering.

## Reviewed editing operations

Use `operations` for targeted or combined edits. Operations run in order on a temporary project, then appear as one reviewed transaction. Existing clip, marker and asset IDs must come from inspection. Supply distinct new clip or marker IDs for additions; a later operation in the same plan can refer to an ID created by an earlier one.

| Operation | Parameters and limits |
| --- | --- |
| `caption.add` | New `clipId`, `text`, timeline `start`/`end` spanning at least 0.2 seconds; optional existing `audioClipId`. Enables captions and preserves existing caption timing |
| `caption.update` | Existing `clipId`, any requested `text`, `start`, `end` changes; the resulting range must span at least 0.2 seconds |
| `caption.delete` | Existing caption `clipId` |
| `clip.set_property` | Audio or music `clipId`, `property` of `volume`, `fadeIn`, or `fadeOut`, and numeric `value`; volume is a 0–4 multiplier, fades are seconds bounded by the clip duration |
| `clip.set_muted` | Existing `clipId` and boolean `muted` |
| `marker.add`, `marker.update`, `marker.delete` | `markerId`; additions need `time`. Optional `markerType` is `marker`, `chapter`, `range`, or `note`; range markers use `endTime`. Titles, notes and supported colors are editable |
| `visual.split` | Main-visual `clipId`, `at` seconds **from that clip's start**, and a new `rightClipId`; both pieces must retain valid duration and supported source timing |
| `visual.delete` | Main-visual `clipId`; closes the main sequence's gap |
| `visual.duplicate` | Main-visual `clipId`, new `newClipId`, optional zero-based `atIndex` |
| `visual.reorder` | Main-visual `clipId`, zero-based `toIndex` |
| `visual.trim` | Eligible video `clipId`, `sourceIn` and `sourceOut` in **absolute original-source seconds**, within the currently retained range |
| `visual.insert` | New `clipId`, zero-based `atIndex`, either an inspected `assetId` or a supported existing `sourceClipId`; optional `duration` |
| `overlay.add` | New `clipId`, timeline `start`, either `assetId` or `sourceClipId`; optional `duration`, `layer`, `muted`, `transform` |
| `asset.insert` | Inspected `assetId`, new `clipId`, destination `track`; main visuals use `atIndex`, timed tracks use `start`. Optional duration, lane/layer, muting and overlay transform depend on the destination |

For overlay insertion, `transform` can set `x`, `y`, `scale`, `rotation` and `opacity`; discover the schema for numeric bounds. Main-track indices are zero-based. Overlay and requested audio layers are one-based. Inserting an asset references media already available in the editor; it does not fetch an arbitrary URL or read an arbitrary local path. Read `status` and `insertableTracks` first. AI Music assets belong on Music, not a voice lane. Music insertion respects the current single-source music model and rejects incompatible additional sources or overlapping music pieces.

Splitting and source trimming reject unsupported speed curves, reversal, transitions, keyframes, effects and processed-media mappings rather than approximating them. Check the reported eligibility and returned errors. Reordering and duplication preserve retained media identity and source mapping. Markers remain annotations: their end times do not extend rendered content duration.

### Example: remove an interior section, correct a caption, and lower music

Given an eligible eight-second main visual `clip-b`, the following removes its seconds 2–4. The second split is relative to the newly created right piece. IDs shown here are illustrative and must be resolved or allocated for the real project.

```json
{
  "stateToken": "<from timeline_project_inspect>",
  "summary": "Remove the two-second aside, correct the caption and lower the music.",
  "operations": [
    { "type": "visual.split", "clipId": "clip-b", "at": 2, "rightClipId": "new-middle" },
    { "type": "visual.split", "clipId": "new-middle", "at": 2, "rightClipId": "new-tail" },
    { "type": "visual.delete", "clipId": "new-middle" },
    { "type": "caption.update", "clipId": "caption-a", "text": "Corrected caption." },
    { "type": "clip.set_property", "clipId": "music-a", "property": "volume", "value": 0.2 }
  ]
}
```

Read the returned semantic diff, including ripple changes on other tracks, before applying `{ "previewId": "<returned previewId>" }`. Inspect the resulting project and seek across the changed boundaries. If the user requested only a proposal, leave the plan unapplied.

### Legacy complete-order plans

The existing `clips` form remains supported for complete main-track reorder and basic trim plans. Every current main-visual `clipId` must appear exactly once. Each entry is `{ "clipId": "..." }` or `{ "clipId": "...", "sourceIn": 11, "sourceOut": 15 }`. Omit both source bounds to preserve the existing source mapping. Omitting an existing clip is invalid in this form; use explicit `visual.delete` in `operations` for deletion.

## Export a finished video

1. Inspect the current project and call `timeline_export_prepare` with its `stateToken` and the requested settings. Review the returned actual range, resolution, frame rate, codecs, audio/caption delivery and estimated size.
2. For an authorized export, call `timeline_export_start` with that `exportId` and a unique `requestId`. If the response is lost or uncertain, retry with the same pair. The prepared project must still be unchanged; otherwise inspect and prepare again.
3. Inspect the returned `jobId` while rendering continues. The shared editor export dialog reports progress and also permits cancellation. Export inspection and cancellation remain callable while editing is blocked by export activity.
4. Treat `succeeded` as an export result only after examining `result.extension`, `byteSize`, `actualPipeline` and `formatFallback`. `downloadTriggered` means the browser download was initiated, not that the host has verified a file on disk. Verify the downloaded artifact when the host exposes it.

Settings use the existing editor profiles: resolution `"720"`, `"1080"`, `"1440"` or `"2160"`; frame rate 24, 30 or 60; codec `h264` (MP4), `h264-mov` (MOV), `vp9` or `vp8` (WebM); pipeline `auto`, `deterministic` or `compatible`; audio `mix` or `none`; and captions `burned`, `none` or `burned-srt`. Full schema discovery also exposes quality, audio/video bitrate, file name, keyframe interval, and custom range fields. Invalid values and out-of-bounds custom ranges are rejected. MOV uses the deterministic pipeline and rejects an explicit compatible-pipeline request. Prepare resolves defaults once; subsequent UI preference changes do not silently replace the reviewed settings.

Jobs report `queued`, `running`, `succeeded`, `failed` or `cancelled`. Cancellation sets `cancelRequested` and aborts the actual encoder/transcoder; the task remains running until the exporter acknowledges the outcome. A cancellation arriving after a download has already been triggered cannot retract that download, so a completed export may still report success. Tool cancellation signals and page-session closure also abort active work.

An MP4 compatibility export can fall back to a real WebM file if transcoding fails. The receipt reports that actual extension and `formatFallback: true`; do not describe it as MP4. Empty or mismatched output containers are rejected before download. Requests do not upload media or start cloud rendering. Export receipts retain the latest 64 jobs in the page session; up to 1,024 request keys are remembered to prevent a retry from silently starting another download. Evicted job details return a not-found error, and reaching the request limit requires a new page session.

## State, history and data safeguards

- Main visuals stay gapless. Duration changes reuse the current ripple mode; eligible timed tracks shift with the edit, while locked tracks and active caption/audio associations are preserved. Independent tracks retain their absolute timing when ripple is off.
- Apply and export start compare the live project fingerprint, including media identity and editor history. Intervening project or asset changes invalidate the review. Inspect and prepare again after a stale-state failure.
- Applying a multi-operation plan creates one normal history transaction. Guarded tool undo never removes intervening manual work; normal editor history remains available.
- Read tools and review diffs return relevant metadata and caption text, not media bytes, blob URLs or a full archive. Names, captions, marker notes and user summaries remain untrusted data, not agent instructions.
- Browser agents receive tool results under their own data-handling terms. Local editing does not imply local processing by the agent. Project and video delivery initiate browser downloads; optional editor connectors and model downloads retain their documented networking behavior.

The browser tool surface does not expose arbitrary JavaScript, filesystem paths, arbitrary URL imports, model downloads, AI generation, cloud jobs, or advanced effect/retiming commands. Existing editor workflows provide their own supported controls.

## Discovery

The site publishes an [agent guide](https://video-editor.ai-creator.top/agent-guide.md), an [Agent Skills index](https://video-editor.ai-creator.top/.well-known/agent-skills/index.json), and a self-contained [browser editing Skill](https://video-editor.ai-creator.top/.well-known/agent-skills/edit-timeline-studio-browser/SKILL.md). The local project-file Skill remains available from the repository. HTTP `Link` headers, HTML link metadata and `llms.txt` reference the real resources. Missing well-known protocol documents return 404 rather than the editor shell. Explicit Markdown URLs are provided; the root editor is not advertised as supporting Markdown content negotiation.
