# WebMCP integration

Timeline Studio exposes the project open in the editor as 21 structured browser tools. Agents can inspect the timeline and available assets, review and apply supported multi-track edits, inspect rendered frame/audio samples, run browser-local voiceover and transcription jobs, seek and undo, save an editable `.timeline` copy, and run a real browser video export with progress and cancellation. The root URL continues to open the editor directly.

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
| `timeline_media_sample` | `stateToken`, optional `times` (1–4), `maxDimension` (256–1024), `audio: {start, duration}` (up to 10 seconds); requires frames or audio | Rendered JPEG frames and/or a WAV timeline mix, returned as data URLs without moving the playhead |
| `timeline_ai_capabilities` | Optional interface `language` code | Supported built-in voices, local runtime requirements, model-readiness disclosure and task limits; no model execution |
| `timeline_ai_prepare` | `stateToken`, `request` | Validates a local voiceover or transcription request; returns `aiId` and the resolved plan without downloading or running models |
| `timeline_ai_start` | `aiId`, `requestId`, `allowModelDownload: true` | Starts the unchanged reviewed AI request and returns `jobId`; may download required models |
| `timeline_ai_inspect` | `jobId` | Actual task state, progress, generated asset receipts or proposed caption operations, and errors |
| `timeline_ai_cancel` | `jobId` | Requests cancellation; inspect until the worker or synthesis service acknowledges the outcome |
| `timeline_preview_seek` | `time` in timeline seconds | Pauses playback and seeks within the project duration |
| `timeline_edit_undo` | `transactionId` | Reverts the latest agent transaction only while the project is unchanged |
| `timeline_project_save` | `stateToken` | Downloads a new portable `.timeline` project copy; does not render video |
| `timeline_export_prepare` | `stateToken`, optional `settings` | Validates settings, freezes the export plan, returns `exportId`, `resolvedSettings`, range, technical summary and estimate; starts no rendering |
| `timeline_export_start` | `exportId`, `requestId` | Revalidates the project, starts the reviewed export, quickly returns `jobId` and current status |
| `timeline_export_inspect` | `jobId` | Progress, status, reviewed settings and actual output receipt or failure |
| `timeline_export_cancel` | `jobId` | Requests cancellation through the real exporter; inspect until it acknowledges completion |

Track names are `visuals`, `overlays`, `audio`, `captions`, `stickers`, and `music`. Source-audio presence and link state are reported in the project summary; a separate source-audio track read is not exposed. Paginated reads default to 50 entries, with a maximum of 100; follow `nextOffset` until null. A preview accepts at most 500 operations or 500 legacy main-visual entries, and never both payload forms.

Transcript filtering follows a caption's active audio link, or its remembered source when no active link exists. `audioClipId` is the active movement link and `detachedAudioClipId` is the remembered source. Querying a transcript never relinks captions. Project saving also supports projects containing only overlays, stickers, or audio; video rendering requires a usable main visual.

`stateToken`, `previewId`, `transactionId`, `exportId`, `aiId` and `jobId` are session-issued opaque values. Do not construct them or reuse them after reloading. In contrast, an export or AI `requestId` is a caller-chosen unique retry key; reuse it for retries of that same start. Tool results include success or structured failure information; a completed invocation does not establish successful editing or rendering.

## Reviewed editing operations

Use `operations` for targeted or combined edits. Operations run in order on a temporary project, then appear as one reviewed transaction. Existing clip, marker and asset IDs must come from inspection. Supply distinct new clip or marker IDs for additions; a later operation in the same plan can refer to an ID created by an earlier one.

| Operation | Parameters and limits |
| --- | --- |
| `caption.add` | New `clipId`, `text`, timeline `start`/`end` spanning at least 0.2 seconds; optional existing `audioClipId`. Enables captions and preserves existing caption timing |
| `caption.update` | Existing `clipId`, any requested `text`, `start`, `end` changes; the resulting range must span at least 0.2 seconds |
| `caption.delete` | Existing caption `clipId` |
| `caption.set_style` | `scope: "default"` or `"current"`, `style`; `clipId` is required only for `current`. Supports caption size, font, text/background/border/stroke colors, opacity, border/stroke widths, padding, radius, shadow and supported text effects |
| `caption.set_position` | `scope`, `placement: {x, y}`; both coordinates are the caption **center point** as percentages from 10 to 90. `clipId` is required only for `current` |
| `caption.sync_position` | Existing caption `clipId`; promotes its effective center point to the shared default and clears every per-caption placement override |
| `timed.move` | `track` of `audio`, `music`, `overlays` or `stickers`, `clipId`, timeline `start`; optional one-based `layer` for audio/overlays only |
| `timed.resize` | Timed `track`, `clipId`, `duration`, optional timeline `start`; retains the source start and respects the retained source range for audio/video |
| `timed.trim` | `track` of `audio`, `music` or `overlays`, `clipId`, absolute original-source `sourceIn`/`sourceOut` within the retained range; trims both ends, keeps timeline start and derives duration from fixed playback speed |
| `clip.delete` | Timed `track` and `clipId`; removes that exact audio/music/overlay/sticker segment |
| `overlay.set_transform` | Existing overlay `clipId`, nonempty `transform` containing `x`, `y`, `scale`, `rotation` and/or `opacity` |
| `project.set_ratio` | `ratio` of `"16:9"`, `"9:16"`, `"1:1"` or `"4:5"` |
| `project.set_fit` | `fitMode` of `"contain"` or `"cover"` |
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

The 26 operations share the same preview/apply path. Caption style uses `captionSize`, `fontId`, `textColor`, `backgroundColor`, `backgroundOpacity`, `borderColor`, `borderWidth`, `radius`, `paddingX`, `paddingY`, `shadowOpacity`, `effect`, `textStrokeColor` and `textStrokeWidth`; discover the schema for allowed values. Caption size is 12–42; colors are six-digit `#RRGGBB`; opacity is 0–1; stroke width is 0–6, border width 0–8, radius 0–28, horizontal padding 0–52 and vertical padding 0–32; effects are `normal` or `neon`. Font IDs come from the actual catalog enum. Editing the default style clears overrides only for the edited fields and preserves unrelated overrides. Current-caption changes remain explicit. Audio moves without an explicit layer preserve their current lane when free and choose a new lane when needed; existing audio stays in its lanes. An explicit overlapping layer is rejected. Layer indices are one-based from 1 to 1000. Timed-clip moves preserve active caption/audio associations and obey track locks; remembered detached links remain independent. Timed resizing does not shift the source start or invent additional source media. Use `timed.trim` for actual source-range trimming. It rejects unsupported speed curves, reversal and video effects; linked captions move by the removed leading duration and are clipped to the new audio range. If that would create a caption shorter than 0.2 seconds, revise or delete that caption first in the plan.

For overlay insertion or `overlay.set_transform`, `transform` can set `x`, `y`, `scale`, `rotation` and `opacity`; discover the schema for numeric bounds. Main-track indices are zero-based. Overlay and requested audio layers are one-based. Inserting an asset references media already available in the editor; it does not fetch an arbitrary URL or read an arbitrary local path. Read `status` and `insertableTracks` first. AI Music assets belong on Music, not a voice lane. Music insertion respects the current single-source music model and rejects incompatible additional sources or overlapping music pieces.

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

### Example: make a vertical version and adjust its overlay and captions

```json
{
  "stateToken": "<from timeline_project_inspect>",
  "summary": "Create a vertical version with larger captions and a smaller upper overlay.",
  "operations": [
    { "type": "project.set_ratio", "ratio": "9:16" },
    { "type": "project.set_fit", "fitMode": "cover" },
    { "type": "caption.set_style", "scope": "default", "style": { "captionSize": 36 } },
    { "type": "caption.set_position", "scope": "default", "placement": { "x": 50, "y": 80 } },
    { "type": "timed.move", "track": "overlays", "clipId": "overlay-a", "start": 1.5 },
    { "type": "timed.resize", "track": "overlays", "clipId": "overlay-a", "duration": 3 },
    { "type": "overlay.set_transform", "clipId": "overlay-a", "transform": { "x": 25, "y": -25, "scale": 0.5 } }
  ]
}
```

Resolve the real overlay ID first and choose a duration within its source bounds. After applying, get a fresh state token and sample relevant frames to check framing, overlay placement and subtitle legibility.

### Legacy complete-order plans

The existing `clips` form remains supported for complete main-track reorder and basic trim plans. Every current main-visual `clipId` must appear exactly once. Each entry is `{ "clipId": "..." }` or `{ "clipId": "...", "sourceIn": 11, "sourceOut": 15 }`. Omit both source bounds to preserve the existing source mapping. Omitting an existing clip is invalid in this form; use explicit `visual.delete` in `operations` for deletion.

## Review rendered frames and audio

`timeline_media_sample` is the explicit media-reading tool. Ordinary project/track/clip/asset inspection still returns metadata only. Request one to four distinct `times` in timeline seconds, a short `audio` range, or both. Frame times must be at least zero and strictly before the project end; the audio range must fit inside the project and last at most 10 seconds. `maxDimension` defaults to 640 pixels and accepts integers from 256 to 1024.

The shared composition renderer applies the actual project ratio, fit, source timing, visual effects, overlays and enabled captions. It returns JPEG frame data URLs and, when requested, a 24 kHz mono WAV mix with `peak`, `rms` and `clippedSamples` measurements. These bounded review samples are not a full-resolution export or a substitute for listening. The tool neither moves the playhead nor edits the project, rejects stale state, and responds to cancellation. If the project changes during rendering, discard the stale sample and inspect again.

Media data is delivered to the browser agent. Request only the frames and audio needed for the user's review task; neither this tool nor metadata inspection uploads files to a Timeline Studio service. A host that cannot display or listen to media must not claim it visually or audibly verified the result from metadata alone.

```json
{
  "stateToken": "<current stateToken>",
  "times": [1, 2.5, 4],
  "maxDimension": 640,
  "audio": { "start": 1, "duration": 4 }
}
```

## Browser-local voiceover and transcription

1. Call `timeline_ai_capabilities` and inspect supported voices, task limits and runtime availability. Its model readiness is disclosed as unprobed; it does not silently download or warm up models. Optional `language` filters the built-in voice catalog.
2. Prepare with the current project `stateToken` and one request shape below. Read the returned `aiId` and plan, including model downloads, source range, output destination and cancellation behavior.
3. For an authorized AI task and model download, call `timeline_ai_start` with `aiId`, a unique `requestId` and `allowModelDownload: true`. The same key retries the same start; do not generate a new key merely because a response is uncertain. Preparation never grants model-download permission by itself. Project changes before start invalidate the plan.
4. Inspect `jobId` with `timeline_ai_inspect`. Progress is reported by the actual service stages, not a fabricated estimate. Use `timeline_ai_cancel` to request cancellation, then inspect until a terminal result is acknowledged. Voice synthesis may finish its current inference before discarding output; transcription cancellation stops its worker.
5. On success, inspect the result and create a separate reviewed edit if timeline insertion is wanted. AI jobs never insert voiceover or replace captions automatically.

Voiceover requests use `{kind: "voiceover", voiceId, text, speed?, gain?, timelineOffset?}`. Choose `voiceId` from capabilities. Text is limited to 2,000 characters and split into at most 80 sentence/breath groups with one stable speaker. The optional speed is 0.7–1.3 for voices with `adjustableSpeed: true` (currently Kokoro); other voices require 1; gain is 0.1–4 with browser-local limiting. All groups must succeed before the generated clips are committed to My assets. The receipt provides asset IDs, durations and suggested placements with 0.4-second gaps; these are suggestions, not a timeline edit. Chinese and mixed Chinese/English use the existing two-speaker Hojo route. This tool does not enroll or use clone profiles.

Transcription requests use `{kind: "transcription", assetId, language?, sourceStart?, duration?, timelineOffset?}`. The source must be a ready audio asset already in My assets, with a range of 0.2–120 seconds. Omitted duration uses the remaining source, capped at 120 seconds. The optional language is a recognition preference; inspect the actual output. Times are measured from source audio, then offset by `timelineOffset` into proposed `caption.add` operations. This does not infer a selected clip's trim/speed curve or promise automatic alignment to retimed footage. Inspect and adjust the proposals, then use the normal edit preview/apply path. A cancelled or failed task leaves the existing timeline untouched.

Both requests default `timelineOffset` to zero. One AI task can run at a time; job receipts and retry keys are bounded to the page session. Voiceover artifacts use the editor's owned mirrors pinned to immutable revisions. Transcription reuses the existing `onnx-community/whisper-small` service and its cache. Voiceover and transcription use the production browser-local services; this tool surface does not expose remote provider generation or arbitrary model execution.

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
- Metadata read tools and review diffs return relevant metadata and caption text, not media bytes, blob URLs or a full archive. Only the explicitly requested `timeline_media_sample` returns bounded rendered media. Names, captions, marker notes and user summaries remain untrusted data, not agent instructions.
- Browser agents receive tool results under their own data-handling terms. Local editing does not imply local processing by the agent. Project and video delivery initiate browser downloads; optional editor connectors and model downloads retain their documented networking behavior.

The browser tool surface does not expose arbitrary JavaScript, filesystem paths, arbitrary URL imports, arbitrary model execution, remote generation, cloud jobs, or advanced effect/retiming commands. Browser-local voiceover and transcription are limited to the reviewed AI task contract above. Existing editor workflows provide other supported controls.

## Discovery

The site publishes an [agent guide](https://video-editor.ai-creator.top/agent-guide.md), an [Agent Skills index](https://video-editor.ai-creator.top/.well-known/agent-skills/index.json), and a self-contained [browser editing Skill](https://video-editor.ai-creator.top/.well-known/agent-skills/edit-timeline-studio-browser/SKILL.md). The local project-file Skill remains available from the repository. HTTP `Link` headers, HTML link metadata and `llms.txt` reference the real resources. Missing well-known protocol documents return 404 rather than the editor shell. Explicit Markdown URLs are provided; the root editor is not advertised as supporting Markdown content negotiation.
