# Anna video generation integration

Experimental integration, 2026-10-09. Not a production release.

Both Smart → Generate video and ChatCut's `timeline_video_generate` use the isolated Anna generation adapter and the real `video.generate` / `video.getJob` host API. SDK 0.20.0 and CLI 0.1.58 (schema dispatcher 0.26.0) are required. No Executa dependency is added.

The account-selected model determines defaults for duration and resolution. Smart also exposes an explicit resolution selector; omitted resolution keeps the model default, and unsupported explicit values must fail rather than silently changing quality. Resolution is passed through the same adapter for Smart and ChatCut and retained when resuming an existing job. The interface supports text prompts and one referenced image. Referencing a video decodes one source-time frame locally and uploads that still as imageUrl, never the full video. The selected provider must support image-to-video; support has not yet been verified with a paid generation. Smart opens a compact media picker directly from @ in the description, supports arrow keys/Enter/Escape, and keeps frame selection and preview collapsed unless requested. There is no separate Add media button. Duration is an explicit integer selection from 5–15 seconds, sent unchanged as durationSec; each provider may reject unsupported durations. ChatCut accepts sourceAssetId and optional referenceTime in source seconds. Image-conditioned aspect ratio follows the reference. Completed video bytes are decoded and stored in My assets. Generating alone never inserts a clip. ChatCut may prepare insertion only when the user explicitly requests placement.

Submitting consumes the user's Anna CU. The UI displays this before generation. Polling uses the existing job ID; Stop waiting only aborts local waiting and never claims server cancellation or a refund. Within the open editor session Smart retains the request and job ID when its panel closes, and ChatCut reuses an existing ID for retries of the same request. Recovery after a page reload is not yet supported.

Authoritative references:

- https://anna.partners/developers/tools/executa-media.md (updated 2026-10-08; also links the app SDK companion)
- Published `@anna-ai/app-runtime@0.20.0`: `video.generate`, `getJob`, `cancelJob`, `listJobs`, and per-app `media_grant`.

The app manifest declares `ui.host_api.video`. A separate per-app video/media grant must be granted by Anna; an Agent's selected video model alone does not establish that permission. Host-generated output URLs must also be fetchable under Anna's sandbox CSP. A real cloud-generation check is required before claiming end-to-end support.

## Live validation — 2026-10-09

Working draft r98 completed one real text-to-video request with `durationSec: 5`, `resolution: "480p"`, and `aspectRatio: "16:9"`. Job `vjob_48276fef463d43a5b8e6bfef23a2377e` returned decoded 832×480 video, 5.184 seconds. The adapter downloaded the bytes into My assets and the preview played through to the end (`readyState: 4`, no media error). The existing 19.82-second timeline was unchanged. The per-app video grant was enabled before submission. Image-conditioned generation and other resolution/model combinations remain unverified. After reconnecting the browser, the preview Download button saved the MP4 to the desktop; ffprobe confirmed H.264 832×480, AAC audio, 5.184 seconds and 2,606,133 bytes. Reopening and restoring the project retained the generated asset. Immutable version 0.1.1-beta.6 (id 1201) was submitted for release review and returned release_review_state=pending, is_latest=false; the working draft remains r98.
