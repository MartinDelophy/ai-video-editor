# Anna video watermark removal — 2026-10-01

Ported main's video repair implementation (including f7f3c40 and da0fcbf) selectively into codex/anna-validation. Anna Smart exposes one video-watermark card only. The inspector requires a selected video and keeps the original/result switch. Other Smart capabilities remain hidden.

The shared repair implementation retains multiple regions, independent time ranges, moving-region keyframes, text masks, temporal references, iterative repair, cancellation, comparison, and original-media recovery. Native video composition preserves frames outside selected ranges, with the existing FFmpeg fallback. Model and worker assets use the existing Anna asset rebasing and permissions.

Validation:
- Production Anna build succeeded: 173 files, 202.2 MiB.
- Anna CLI 0.1.52 strict validation passed.
- Targeted ESLint: 0 errors; 26 existing hook/dependency warnings.
- Chrome local integration using production hook/dialog and real MI-GAN inference: a 1-second 320×180, 5-fps video completed frame processing and composition at 100%; Apply to video created one asset and retained the original in repair metadata.
- Full local Anna UI: Smart has exactly one card; no selected video leaves Open disabled with a selection hint.
- Temporary fixtures/media remained outside the repository. This is a bounded functional test, not a quality guarantee for long or complex watermark footage; production Anna inference still needs user acceptance.

No live version or review submission is included in this change.

Remote working draft updated successfully to r38 (ready), 173 files / 212,047,756 bytes. Content hash: `14bbe0bfb2e338eff2e443dc243999c04daf5275801848dae0fb927fd5702791`. Developer console confirms r38 ready. No cut or review request was made. The Install draft action was invoked, but its transient result was not captured; do not treat that click alone as installation verification.
