# Anna long-video optimization — 2026-10-12

Merged main commit `4f9930af204a8fecb727f92b4432a63c02a836d2` from the “优化长视频播放与导出性能” task into `codex/anna-validation` as `4c45323`.

The migration pauses background thumbnail refinement during playback, draws the presented playhead frame without repeated JPEG conversion, prioritizes the newest playback seek, extracts camera AAC packets without full-video WASM copies, prefers supported hardware encoders, and overlaps bounded audio/video encoding and frame preparation. Original-size eligible frames take the direct VideoFrame route; transformed, resized and effect-bearing frames retain the existing compositor path. Export dimensions, frame rate and requested bitrates are unchanged.

Merge resolutions preserve Anna's strict source-audio preflight and `ANNA_SOURCE_AUDIO_UNAVAILABLE` error, its generation integration, empty Executa dependency lists, and branch-specific README history. Export cleanup releases depth caches and sequential frame readers for both main visuals and overlays.

The source task's synthetic eight-minute 1440×1080, 30 fps H.264 benchmark reported roughly 31% lower average audio-preparation-plus-export time. This is source-task evidence, not a new Anna browser benchmark or a guarantee for all footage. QA files remain outside the product repository in `/tmp/timeline-vlog-qa`.

Validation and release results are recorded below after the Anna bundle is built and submitted.

- `npm run lint`: passed with 0 errors and 72 existing warnings.
- `npm run typecheck`: passed.
- `npm run build:anna`: passed after restoring locked dependencies with `npm ci`; 187 files, 229,327,071 bytes.
- `npm run anna:validate`: passed.
- Mutable working draft uploaded as **r99**, bundle ready.
- Immutable **0.1.1-beta.7**, version id **1296**, bundle id **1203**, submitted through `apps release`.
- Submission response: `release_review_state=pending`, `is_latest=false`, `published_at=null`. This confirms submission, not approval or public availability. The previously approved latest version remains 0.1.1-beta.5 at submission time.
- No new Anna browser performance benchmark was run during this migration. Source-task benchmark evidence is distinguished above from this migration's lint/type/build/package validation.

## Scrubbing follow-up

The first queue-only adjustment (`180538c`, draft r100) did not resolve the user's reported preview stutter. A second adjustment separates native seek requests and playhead positioning from full-editor reconciliation: pointer positions remain display-frame coalesced, editor state updates are bounded to 30 Hz, and press, release, cancellation, and visual-clip crossings commit synchronously. Native playhead animations are suppressed during pointer scrubbing. The active filmstrip receives stable props during the gesture, then restores its exact presented-frame override after release. No export settings or source-media resolution are changed.

A temporary Node gesture simulation outside the repository verified 62 playhead position notifications, 24 editor updates, and an exact final 6.35-second position. This is a scheduling regression check, not a measured browser preview FPS result. Real-footage responsiveness remains subject to user verification on the refreshed online draft.
