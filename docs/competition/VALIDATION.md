# Competition validation — 2026-10-10

Branch: `codex/alexa-hackathon-2026` (published final commit `3fcc314`).

## Completed checks

- Existing full lint/typecheck/production build passed. Existing repository warnings remain.
- Local API boundary: exact origin, production access token, loopback-only Ollama URL, invalid provider and unsupported operations checked with assertions and a mock provider. No AWS calls.
- Command planner: absolute source-offset trims, music gain, reorder, invalid bounds, operation allowlist, all 13 locale tables and stale snapshot rejection passed.
- Browser: synthetic five-second source imported, duplicated into two clips, synthetic audio inserted as music.
- Browser: `music 20%` reviewed and applied; actual clip volume was 0.2. Undo restored 0.35.
- Browser: `last first` moved the second clip to index zero.
- Browser: first clip trimmed to three seconds; total visual sequence became eight seconds.
- Export: 1280×720, 24 fps H.264 MP4 with AAC audio; full ffmpeg decode exited successfully. Container duration 8.021333 seconds includes audio framing/padding.
- Portable project saved and reimported; restored two visual clips, one music clip and eight-second duration.
- Mobile: viewport 412×915, document width 412; no horizontal overflow.

## Evidence files

- `competition-flow-check.timeline`: portable synthetic validation project.
- `competition-flow-check.mp4`: actual rendered validation video, not the final hackathon presentation.
- `competition-restored.png`: reimported editor state.
- `competition-mobile.png`: mobile assistant and timeline.

## First-attempt issues retained

- File chooser attempts failed while the assistant overlay covered the upload button. Closing the assistant exposed the control and importing succeeded. Automation/interaction issue, not a missing importer.
- Saving a project during active video export returned `EDITOR_BUSY`; saving after export succeeded. Expected concurrency guard.
- Browser export reported completion before an artifact was available to the automation download handler. Repeating export with a download listener produced the actual file, then full decode passed.
- Initial Ollama GPU discovery timed out. Restarting after the model download resolved it; Apple M1 GPU inference loaded all 37 layers.
- Initial unconstrained JSON response echoed the snapshot. Fixed with a project-specific JSON schema, existing clip IDs and trim bounds, and a final user message containing the actual request.
- A model reply claimed completion before review. The UI now shows an explicit review instruction for every proposed edit, and only reports applied after the editor receipt.
- The automation call timed out during final export; the actual browser download completed. The resulting file was verified with ffprobe and full ffmpeg decode.

## Real model and final end-to-end validation — passed

- Official Ollama 0.40.2, Qwen3 4B Q4_K_M; model digest `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`. Local loopback inference, no paid API calls.
- Real English browser request proposed exactly three edits: 16:9 → 9:16, first clip 0–3s → 0–2s, music 35% → 20%. Review displayed those diffs; actual apply yielded seven seconds, vertical ratio and volume 0.2.
- Subsequent Chinese request moved the last clip first and muted music using the updated project. Actual clip order and muted=true were inspected. Undo restored the previous order, volume 0.2 and muted=false.
- Request cancellation returned the editor to idle with no applied changes. Stale preview was rejected after a manual project change.
- Final portable project saved and reopened: ratio 9:16, seven seconds, two visual clips, one music clip, gain 0.2, muted=false.
- Final rendered MP4: H.264 720×1280, video 7.000 seconds; AAC 7.040 seconds (audio framing). Complete ffmpeg decode exit 0.
- Final `npm run check` exit 0: lint, typecheck and production build. Existing warnings remain; `git diff --check` passed.
- Additional final evidence: `competition-ai-applied.png`, `competition-ai-restored.png`, `competition-ai-result.timeline`, `competition-ai-result.mp4`.

## Submission work still pending

A final English public presentation video and Devpost finalization are not complete. The seven-second synthetic export proves rendering; it is not the required competition presentation. AWS Builder eligibility is not claimed, and Bedrock was not live-tested because no AWS account is configured.
