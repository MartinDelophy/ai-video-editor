# Anna depth-video release review — 2026-10-05

The user authorized publishing the main fix to GitHub/Netlify, switching to `codex/anna-validation`, applying the same fix, updating the Anna draft, and submitting release review. Main commit `77480f9` is published at https://video-editor.ai-creator.top/ (Netlify deploy `6ac3039805839c9d62f2eaa6`). Anna commits `55a0958` and `e3fe3a4` carry the completed-analysis retry fix and the identical depth-video pipeline implementation without replacing Anna host adaptations.

## Changes and validation

Fast/Standard/Fine depth sampling uses 8/16/24 samples per second, with the bounded 720-sample budget retained. Fast and Standard use pinned Practical-RIFE 4.17-lite ONNX inference to produce 24 fps; Fine uses the existing depth rendering route at 24 fps. A bounded producer/consumer pipeline overlaps depth analysis with interpolation and encoding. Source audio keeps trim/speed mapping. Cancellation releases the pipeline; encoding failure preserves completed depth analysis for retry. The static encoder import avoids stale dynamic-chunk failures being misreported as model-download errors. Progress copy is localized in all 13 interface languages. The bundle also includes the relighting inspector scroll/footer correction committed after the preceding beta.9 upload.

Browser-local synthetic smoke checks passed for all three modes: 24 frames per one-second output, source audio retained, encoding starts before the streamed producer finishes, and cancellation releases a producer waiting on backpressure. Real WebGPU and WASM CPU RIFE inference ran; the CPU provider remains internal and WebGPU is the default. These small synthetic checks do not certify real-resolution throughput or production Anna inference. Main and Anna lint/type checks passed (existing warnings remain); main and Anna builds passed, and Anna strict manifest/bundle validation passed. Temporary validation pages were removed before packaging. Required runtime files, license, and model provenance remain. Production Anna RIFE generation and complete production MP4 download validation remain outstanding and are disclosed in the frozen changelog.

## Server receipt

- App: `timeline-studio`, ID 254.
- Working draft: **r92**, **ready**; content hash `d897eac50df33bedd810d39e5cd0aa79d1b9f6ff2b2416acc4fe7dea879d0d1b`.
- Uploaded bundle: 188 files / 229274025 bytes.
- Frozen version: **0.1.1-beta.1**, version ID **1097**, bundle ID **1028**.
- Frozen bundle manifest SHA-256: `9488e029ff66b29cd804e23eba5a026a1ac13165c7624a6b311fa7059d97d03e`.
- Release-review state: **pending**, `is_latest: false`, `published_at: null`.
- Independent status and versions queries confirm `review_candidate_version: 0.1.1-beta.1`. The prior beta.9 candidate is superseded; the current live version remains `0.1.0-beta.1`.

The platform rejected `0.1.0-beta.10` as not strictly greater than `0.1.0-beta.9`; no beta.10 version was created. A patch-number bump to `0.1.1-beta.1` succeeded. The original project-tools 0.1.3 and editing-Skill 0.1.2 bindings were recovered from the previous cut receipt and retained; no new tool or Skill release was created. Draft upload used optimistic revision matching against r91.

This receipt confirms submission, not approval or public publication of the new Anna version.
