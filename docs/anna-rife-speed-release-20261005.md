# Anna RIFE speed optimization review — 2026-10-05

The user explicitly authorized updating the Anna working draft and review candidate, and porting the same optimization to main/GitHub/Netlify. Source commit: `f125217` on `codex/anna-validation`.

The change aligns uncapped depth sampling to fixed 8/16/24 Hz clocks and invalidates analysis made with the previous clock. It reuses real frames at effectively exact output timestamps, adjacent-pair grayscale pixels, canvases, ImageData and the current pair input tensor. Successful jobs retain at most one idle verified RIFE session per backend for 60 seconds; cancellation, failures and idle errors terminate the worker. Active jobs do not share a session. Model precision, depth resolution and sample counts are unchanged; capped long clips keep the existing even-coverage budget. Source audio and 24 fps encoding remain unchanged.

Real browser-local GPU and single-threaded WASM comparisons each matched five baseline interpolation frames pixel-for-pixel. Warm session reuse and cancellation passed. A 1.13-second synthetic fixture retained sample/output counts while reducing Fast/Standard RIFE calls from 24/25 to 18. This does not establish full-video speedup or production Anna throughput. Type checks, changed-file lint, Anna production build and strict validation passed. Temporary comparison pages and baseline worker copies were removed before building. The frozen changelog discloses that production Anna RIFE throughput and complete MP4 download validation remain outstanding.

## Receipt

- App `timeline-studio`, ID 254.
- Draft **r93**, **ready**. Optimistic upload matched r92.
- Content hash: `d3eac8839358fa3e3992b8b4f23cb5276d52ebcc19d37e66eb2f3f55d13186fa`.
- Uploaded bundle: 188 files / 229275068 bytes.
- Frozen version **0.1.1-beta.2**, version ID **1098**, bundle ID **1029**.
- Frozen manifest SHA-256: `e09192d0a563860059d814fea437468cada75e0375f478efb028fb53e1b19a99`.
- Release review **pending**; `is_latest: false`, `published_at: null`.
- Independent status and versions queries confirm `review_candidate_version: 0.1.1-beta.2`. The previous `0.1.1-beta.1` candidate is superseded. The current public version remains `0.1.0-beta.1`.

Project tools 0.1.3 and editing Skill 0.1.2 remain pinned to their existing frozen executa versions. No new tool or Skill version was published. This is submission, not review approval or publication of the new Anna version.
