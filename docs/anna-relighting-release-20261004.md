# Anna release review — 2026-10-04

The user authorized updating the working draft and submitting the complete current changes for review. Working draft **r91** is ready, content hash `f6de4e9f839228d8ece3ca69180407a4c8621ae8375605915c5862af01186443`. The uploaded bundle contains 188 files / 229,151,160 bytes.

Draft r91 was frozen as **0.1.0-beta.9**, version ID **1081**, bundle ID **1013**. The existing app is already published, so the first-release submit-review endpoint rejected that lifecycle state. The supported `apps release` flow then returned **release_review_state: pending**, `is_latest: false`, and no publication timestamp. Independent status and versions queries confirm **review_candidate_version: 0.1.0-beta.9**. This is review submission, not approval or a new public release.

The candidate adds editable depth-assisted relighting, a live 3D lamp-position sphere, rear silhouette-light estimation and hold-original comparison. It also includes effect-card alignment/routing fixes, lightweight edge-guided depth smoothing, worker cancellation/quota handling, and decoded-frame repaint notifications for scrubbing. Anna production build and strict validation passed. Model inference and sample settings remain unchanged. Relighting estimates visible surfaces from single-view depth; it does not reconstruct hidden geometry or physical material/shadow transport. Complete production MP4 download validation remains outstanding and is disclosed in the version changelog.

The cut retains project tools 0.1.3 and editing Skill 0.1.2; no new tool/Skill release was requested or created.
