# Anna project covers — 2026-09-22

The My projects list now displays a compact cover from the first available visual thumbnail. This is a media cover, not a composited editor screenshot; captions and effects are not baked into it. Empty, audio-only, older unsaved projects and unavailable thumbnails retain a neutral document placeholder.

Capture runs alongside project preparation, with a 1.2-second bound, at 240×135 JPEG and at most 32 KiB. The optional cover is uploaded separately and referenced in the cloud catalog. Cover capture/upload failure must not prevent the project transaction. Cover blobs are excluded from the project graph and autosave fingerprint. Object URLs are revoked when list entries unmount.

Verification: targeted ESLint, Anna production build and strict bundle validation passed. An external temporary harness exercised catalog serialization, fresh-store reads, switching projects while retaining earlier covers, missing covers and failed optional uploads without losing the saved project. Browser inspection of the real dialog and cover-capture module confirmed the image and fallback layout. No test harness or fixture media was added to the repository.
