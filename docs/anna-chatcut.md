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
