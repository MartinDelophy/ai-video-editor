# Anna project covers — 2026-09-22

The My projects list now displays a compact cover from the first available visual thumbnail. This is a media cover, not a composited editor screenshot; captions and effects are not baked into it. Empty, audio-only, older unsaved projects and unavailable thumbnails retain a neutral document placeholder.

Capture runs alongside project preparation, with a 1.2-second bound, at 240×135 JPEG and at most 32 KiB. The optional cover is uploaded separately and referenced in the cloud catalog. Cover capture/upload failure must not prevent the project transaction. Cover blobs are excluded from the project graph and autosave fingerprint. Object URLs are revoked when list entries unmount.

Verification: targeted ESLint, Anna production build and strict bundle validation passed. An external temporary harness exercised catalog serialization, fresh-store reads, switching projects while retaining earlier covers, missing covers and failed optional uploads without losing the saved project. Browser inspection of the real dialog and cover-capture module confirmed the image and fallback layout. No test harness or fixture media was added to the repository.

Deployment: Anna app 254 working draft r29, ready; content hash `a5a7bb18ff4caf8cb5c2bcbb38aa6dec79e0682620919095e7b0062f7122a394`. No new frozen release or review submission.

The project list now scrolls independently inside the dialog, capped at approximately four desktop rows and shrinking with the available viewport height. The heading and New project / Refresh controls remain above the scrolling region. The thin scrollbar stays inside the list; the region is keyboard-focusable and has a localized accessible name. A temporary 12-project browser fixture confirmed the bounded list and scrollbar placement.

Scrolling update: production build, targeted lint and strict validation passed. Uploaded working draft r30, ready, hash `8bed0c7465607c8138a21da463bc88d10c2f9294515ec27319b0f116437ffa84`; no review submission.

Video-cover correction: uploaded videos populate `trackFrames` entries (`{src, sourceTime}`), not the image-only `thumbnail` field. Cover capture now consumes those frames (including legacy string entries). When no still frame is available, it decodes the video source in a separate muted element and seeks to the clip's source start; temporary media elements and object URLs are cleaned up. The optional capture timeout is now 2.5 seconds. A temporary browser fixture passed with the production frame shape, a real H.264 MP4 Blob with a nonzero source start, and an empty project. No user project was changed for the check.
