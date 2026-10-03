# Anna ChatCut

Anna's Smart workspace includes ChatCut (对话剪辑). Opening it shows conversation on the left and the live preview/timeline on the right. Narrow windows stack these surfaces. The back control returns to the normal editor. Video watermark removal remains available.

## Execution contract

ChatCut calls the existing Anna `llm.complete` host grant. It does not create a cloud Agent session, require `agent.session.auto`, or claim to expose a standard MCP server. A bounded browser-owned loop gives the model the existing editor command schemas. Only project/track/clip/asset/caption/marker inspections and `timeline_edit_preview` are callable. Actual application and undo use the existing WebMCP review UI and the editor's normal transaction/history actions.

Each turn captures the current state token. A generated preview must still match that initial state; edits made while the model is running invalidate it. The review engine validates IDs, timings, supported operations, media availability and locked tracks. No model-generated code, arbitrary URL or shell instruction is executed. Eight model calls per turn is the hard bound. Stop abandons the result and prevents subsequent local tool work; an already-running provider request may still finish remotely. Closing ChatCut or switching projects aborts the local turn.

Chat history is in-memory for the open ChatCut panel. Clearing it does not delete the project. Project saving continues through Anna's existing local-first persistence and background backup.

## Media understanding

Requests contain current project metadata and bounded conversation context. The optional frame checkbox sends a downscaled JPEG of the currently displayed source media. It is a single source frame, not a rendered composite: captions, overlays and effects are not captured. It does not upload the full video or audio. Without an image the model must not claim visual understanding; with one image it still cannot infer unseen scene timestamps or transcribe audio. Automatic speech transcription and whole-video scene analysis are not part of this release.

## Platform references

- https://anna.partners/developers/apps/llm-and-agent
- https://anna.partners/developers/reference/host-api-llm
- https://anna.partners/developers/skills/skill-intro
- https://anna.partners/developers/tools/executa-intro

Anna Skill instructions and an Executa adapter can be added later if the cloud Agent must call this command surface. WebMCP browser registration alone does not make the tools discoverable to Anna's cloud Agent.

## Imported media and visual inspection

The conversation composer imports images, video and audio through the same file picker and media pipeline as the editor. Imported assets remain browser-owned; the existing first-visual insertion behavior is preserved. The visible asset chips identify available files, and normal asset inspection supplies their IDs to the model.

Visual analysis is opt-in per open panel. `timeline_media_frames` accepts an imported asset ID and absolute source times, never an arbitrary URL. It uses an independent decoder, bounded JPEG frames (768px), abort/timeout cleanup, and does not seek the visible preview. At most six frames per call and eighteen per conversation request are allowed. Images produce one frame. Audio can be imported and edited but is not transcribed by this tool. Sparse frames are not exhaustive scene analysis or precise cut detection.

The frame schema and browser service form a transport-independent tool boundary. ChatCut currently exposes it only inside the permissioned conversation loop; it is not globally registered as an unrestricted WebMCP tool. A future MCP adapter must preserve the same media consent and asset boundary. Editorial strategy belongs in Skill guidance; parsing, decoding and edits remain in shared code. There is no need to depend on native Anna Skill/MCP hosting to run this browser-owned workflow.

## Voice dictation

ChatCut exposes microphone input only when a secure browser context provides `SpeechRecognition` or `webkitSpeechRecognition` and its microphone permissions policy allows use. API availability is feature detection, not a guarantee that a browser recognition service is reachable. Starting dictation is user initiated; the browser manages microphone permission. Recognition language follows all thirteen interface locales. Final transcripts append to the current draft without automatically sending it, interim words appear in the listening status, and Send is disabled until recognition ends. Stop completes recognition, while panel unmount, language change or backgrounding aborts it. Sessions are limited to sixty seconds. Permission denial, silence and service errors have localized recovery copy. Some browser implementations transmit audio to their own recognition service; this is disclosed beside the control. Dictation does not upload microphone audio through Anna or add recordings to the timeline.

## Inline change receipts — 2026-10-02

ChatCut keeps edit receipts beside the corresponding assistant reply. Pending edits expose an explicit Apply action; applied edits expose Undo while the transaction remains current. The detailed WebMCP review opens only through View changes and closing it preserves the receipt. Sessions persist safe semantic previews without runtime media; historical or expired receipts are read-only and cannot apply or undo an unrelated transaction. Receipt data is excluded from model conversation history. Other browser-agent flows retain their automatic review panel.

ChatCut now automatically applies each validated preview through the host registry and exposes Undo and View changes on one horizontal receipt row. Model tools still cannot apply directly; stale-state, track-lock and cancellation guards remain enforced before the host commit.

### Video narration (working draft)

ChatCut can inspect selected video frames, write short Chinese or English narration, then call `timeline_ai_process` with `kind: "narration"`, the inspected clip ID, and non-overlapping clip-relative `{start, end, text}` slots. It uses the existing Hojo Light 80M 晴岚/若溪 synthesis path. Generated audio and captions compile through the shared semantic preview/apply reducer as one undoable edit; the video, its trim/speed, and original sound remain unchanged. Caption boundaries use measured speech durations. Speech that exceeds a requested slot fails with `AI_NARRATION_TOO_LONG`, allowing the Agent to shorten its script and retry rather than truncate speech or extend picture. Cancellation, stale project state and locked tracks prevent application. This initial Agent route uses built-in voices; saved clone conversion is not exposed here yet.

### Generated media (working draft, 2026-10-03)

Anna image generation and image editing use the shared provider adapter. ChatCut retains output asset IDs beside the assistant reply and exposes image/video preview, an Edit prompt, and the existing pointer-drag asset insertion path. Generated images save to My assets; timeline placement remains explicitly requested and undoable. Processed video receipts expose their output asset in the same card format; this does not advertise a video-generation API. Completed outputs survive later model-envelope failures. A malformed model JSON envelope gets one format-only retry before any tool execution.

Real Anna draft testing generated 1024×1024 images through both Library and ChatCut, opened a preview, dragged the ChatCut image into the main visual lane (19.9 → 23.9 seconds), and undid to 19.9 seconds. Refresh restored the generated assets. The configured image-edit provider returned APP_PROVIDER_ERROR; successful remote image editing is not yet verified. Mocked contract checks cover generation receipts, apply/undo, cancellation, stale results, source validation and all 13 locales; they are not a substitute for the platform tests.

Working draft r52 is ready and installed for testing; no new immutable version or review was created. After the format-only retry fix, a plain Chinese request successfully generated a new image and returned its card/My assets entry without modifying the 19.9-second timeline. Lint has zero errors and 71 existing warnings; typecheck, Anna build/default validation and mocked image/narration contracts passed.

The subsequent-turn insertion test exposed duplicate asset IDs: a completed generation was present both in My assets and the AI receipt collection. The editor now passes one canonical entry per ID into the shared operation review, preserving strict duplicate rejection inside the reducer. The image contract regression now covers insertion after committing the receipt into the regular asset list. Working draft r54 includes this fix.

Real r54 verification accepted the minimal asset.insert plan for the restored generated image, auto-applied a two-second tail (19.9 → 21.9 seconds), and undid to 19.9 seconds. Plain natural-language generation succeeded on r52; later natural-language insertion still intermittently returned invalid_plan from the model envelope despite the one retry, while an explicit minimal tool request passed. This remaining model reliability limit and the upstream image-edit error must not be presented as completed successful paths.

On 2026-10-03, the user's existing Chrome editor was inspected: seven ready assets had distinct public IDs and the repaired visual remained a single 19.902993-second clip. After reloading working draft r58, the exact minimal insertion of restored asset 09a077fa-cba8-4475-be9a-1149a208dc58 succeeded (19.90 → 21.90 seconds) and was undone. Historical failing payloads were unavailable, so the old rejection is not attributed conclusively to clip naming, stale bundles, or receipt state. r58 adds machine-readable validation reasons for unsupported fields, irrelevant fields, duplicate identities, and command-engine failures, while retaining localized user-facing errors and all validation guards. A follow-up ordinary Chinese placement request failed with a network error; the platform also logged failed token renewal and agent loading. It did not change the project. No new review was submitted.

### Local Remotion animation (working draft, 2026-10-03)

ChatCut exposes `timeline_animation_generate` for data-only table, bar-chart, animated-text and information-card scenes. It lazily loads pinned Remotion 4.0.532 and its web renderer, renders real 30 fps MP4/H.264 video locally (WebM/VP8 fallback after capability checks), reports actual renderer progress, and keeps the event loop responsive. Every encoded frame receives an explicit duration so the final frame preserves its intended hold. The renderer accepts no agent-supplied executable HTML, React, CSS or scripts. Scenes support 16:9, 9:16 and 1:1, 1–20 seconds, bounded text/rows/items, colors and reveal/fade/no-motion. There is no remote image-model request.

The output enters the existing generated-asset receipt flow. ChatCut displays the video card, allows playback and existing asset dragging, and saves it to My assets. Generation alone never inserts it. Requested placement uses the existing inspected `asset.insert` preview/apply/undo contract. Animation source data remains in `asset.generation.scene`, is included in asset inspection, and is retained by browser project recovery. Editing an untrimmed generated animation can render a new asset of the same source duration with `targetClipId`; after frame inspection the existing replacement receipt preserves clip ID and timing. Trimmed, reversed or curved-speed replacement is rejected. It does not masquerade as watermark repair. Every tool title, description and renderer error has direct copy in all thirteen interface locales.

Generated assets are committed in the same apply transaction before its undo fingerprint is captured. Host media restoration deduplicates assets already saved in My assets against job receipts. These guards also apply to other ChatCut generation workflows.

Remotion is a separately licensed dependency, not MIT-licensed project code. Its complete upstream license ships at `public/vendor/licenses/remotion-LICENSE.md`. Eligible individuals/small organizations may use its free license; other organizations must meet Remotion's company-license requirements. The web renderer's upstream usage telemetry is retained; it reports render usage/origin/status, not scene/media bytes. See [Remotion licensing](https://www.remotion.dev/license) and [web renderer telemetry](https://www.remotion.dev/docs/client-side-rendering/telemetry). This renderer is an editor command capability, not a remote generation-provider connector or an arbitrary third-party plugin runtime.

### Composer shortcuts (working draft, 2026-10-03)

The composer supports `@` media references and `/image` / `/remotion` commands. The media picker searches project assets by name, shows thumbnails, disambiguates duplicate names, and carries the selected asset's exact identity in `referencedAssets` rather than relying on filename inference. Selected references appear as compact thumbnail/name pills above the text field, remain with the conversation draft, and are omitted when the pill or asset is removed. Earlier plain-text references migrate to pills. Sending clears the draft references after capturing their exact identities for that request. Choosing a previously excluded asset restores it to that conversation's attachments.

The command picker and the information icon expose the same three concise, localized actions. `/image` selects Anna image generation/editing and `/remotion` selects structured local animation; the opposite generator is excluded from the model catalog and rejected if called. These shortcuts do not authorize timeline insertion by themselves. The input supports arrow-key selection, Enter/Tab completion, Escape dismissal, pointer selection, and IME composition. All new labels and placeholders are localized directly in 13 interface languages.

The ChatCut composer also accepts clipboard media files and screenshot/image clipboard items through the shared file importer. Paste imports add My assets and selected reference pills, with first-visual auto-insertion disabled for this route. Plain-text paste retains normal textarea behavior. File access depends on what the browser exposes in the paste event; a copied filesystem path alone is not imported as media.

ChatCut media previews render in a body-level modal so animated/sidebar transforms cannot constrain their viewport. The preview has a filename header with a centered close icon, an uncropped contain-fit image/video stage, and dimensions plus Download/Edit actions in its footer. Escape, backdrop dismissal, bounded keyboard focus and return focus are supported; modal key events do not reach timeline shortcuts. All added preview labels have direct 13-language translations.

### Startup project recovery

Anna startup reads the account-scoped project catalog before enabling autosave. Returning users choose Restore project or Start new; full project media is read only after restoration is requested. The recovery dialog loads an optional small cover independently, reports downloaded bytes and timeline preparation counts, and allows cancellation before import commits. Starting new preserves prior snapshots under their existing project identity. First-run language selection remains unchanged. Startup edits and revision conflicts are protected from replacement.
