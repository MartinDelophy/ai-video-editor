# Anna project switching recovery — 2026-09-24

The projects dialog previously disabled actions during background saving without showing that status. Cloud project switching also downloaded media under a five-minute transfer deadline with no byte progress/cancel action; a failed target read paused all project management.

The dialog now reflects background session activity, displays aggregate downloaded bytes and percentage from real stream reads, offers cancellation during the target-read phase, and exposes retry plus localized session error reasons. Existing translations are reused in all supported languages. An idle GET aborts after 45 seconds with no received bytes; each advancing chunk resets this stall deadline, while the original total deadline remains. Cancellation propagates through catalog reads, signed URL requests and media downloads; it is not offered once project writes/import begin. Unmount aborts a pending project read.

Pre-mutation read failures leave current editor content and save state intact and permit a new attempt. Failures after mutations begin retain the conservative paused state and existing guarded save retry. Revision/ETag checks and pre-import edit conflict checks remain intact.

Validation outside the product repository: production hook browser fixture passed progress delivery, cancellation, no writes on target-read failure, current-state preservation, and successful subsequent retry. Production transfer-function fixture (accelerated clock) passed stalled GET timeout, continuously advancing chunks resetting idle time, exact byte progress and user cancellation. Existing cloud catalog/cover/deletion fixtures also passed. No real user projects were switched or deleted during validation.

This addresses the confirmed client handling defects; the original reviewer's specific network failure has not been reproduced against their account and is not attributed to the platform.

Production build, targeted ESLint and strict Anna validation passed. Uploaded working draft r35, ready, hash `a04f04182377733b2de5be343765506fd50199c1d15a5a5ad9cc204f61d556f8`. Existing frozen alpha.9 remains the review candidate; this draft has not been cut/resubmitted. UI fixture also confirmed 25% / 1.0 of 4.0 MB progress and enabled actions after cancellation.

Layout follow-up: moved the restore Cancel action into the progress header's trailing edge, with flexible wrapping status text and the full-width progress rail below. Verified the production component at regular and 350px dialog widths and exercised cancellation in an isolated browser fixture. Targeted ESLint, production build and strict Anna validation passed. Uploaded ready draft r36, hash `ca621f32eabd5d97d99c8581c52fa74d4a7ba6710f578385b3d756222323396a`; no new review submission.
