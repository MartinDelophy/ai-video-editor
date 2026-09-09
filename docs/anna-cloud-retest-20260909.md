# Anna production draft retest — 2026-09-09

This record covers interactive checks in the real `https://anna.partners` application using the in-app browser. It is production-host evidence for the installed working draft, separate from the September 8 local-harness checks in [review feedback](anna-review-feedback-20260908.md). Results below are limited to the operations actually observed; pending checks are not passes.

## Environment and draft identity

| Item | Observed result |
| --- | --- |
| Application | Timeline Studio, app `254` |
| Working draft | r6, bundle `ready` |
| Server content hash | `895b1a892beefd96dc479142234e107adf1f7bfd4d4ca88e17720d6d9c330bb5` |
| Installation route | Developer Console → Versions → Working draft → **Install & test** succeeded |
| Installed version | Reserved mutable version `0.0.0-draft` |
| Loaded entry | The running application loaded `assets/editor-B61QoiTy.js`, matching the r6 bundle |
| Agent indication | The default Agent indicated **Cloud**, sleeping and waking on use |

The Cloud Agent indication does not establish that a Linux Executa ran. Timeline Studio currently has no required or optional Executa and calls the host's `llm.complete` API for edit planning. Browser-local WASM and worker execution remain in the application window; selecting a Cloud Agent is not evidence that they have moved to a server runtime.

## Capability checks

The running production draft's environment check reported:

| Capability | Result |
| --- | --- |
| WebAssembly | Unavailable, `host_error` |
| SharedArrayBuffer | Unavailable, `isolation_unavailable` |
| Service Worker | Passed |
| IndexedDB | Passed |
| WebGPU | Passed |
| Worker | Passed |
| Cache Storage | Passed |
| H.264 | Passed |

These are capability-probe results. H.264 availability alone does not establish successful MP4 export or file delivery, and WebGPU availability does not establish local model inference. The production WASM blocker remains. This pass has not captured a new response CSP or established a different cause for the reported `host_error`.

## Stock video and media preparation

In Media → Library → Video, the real Commons query **`nature`** returned **24 results**. The first video preview reached `readyState: 4`, reported **35.886 seconds** and **854 × 481**, and was observed playing at `currentTime: 11.823819`. This verifies real production search, result display, remote media loading, and playback for that sample; individual result-thumbnail images were not separately verified.

The same CC0 sample was then imported through the visible **local upload** control from `/tmp/anna-stock-nature.webm`. Its main-track duration displayed **35.88 seconds**, and thumbnail preparation completed. This import verifies the local upload and timeline preparation route; it does not yet verify Library → Import or drag-to-timeline in this production pass.

## Real AI editing and history

The production application made a real Anna LLM request for a source trim from **5 to 15 seconds**. The returned plan was applied through the visible review UI, and the timeline changed to **10 seconds**. One Undo restored **35.88 seconds**; Redo restored **10 seconds**.

A second real request to preserve the current edit produced the no-change explanation and disabled **Apply to Timeline**. This confirms both an effective edit and the corrected no-op behavior in the installed r6 production application. No mocked model response was used.

## Permission-save blocker reproduced

1. Open the permissions dialog for `timeline-studio · v0.0.0-draft`.
2. Observe the single visible **LLM completions** checkbox, `llm.complete`, already checked; no Agent-session control is present.
3. Leave the displayed permission unchanged and click **Save all permissions**.
4. Observe the toast: **`Save failed: manifest does not declare agent.session.auto`**.

The failure persists in the current production draft. No permission was added or changed. Real LLM planning succeeded with the existing grant, so successful LLM calls do not establish that saving the permission dialog is repaired. The outgoing save payload has not been captured here; its serialization remains an investigation point for Anna, not a confirmed application defect.

## Project persistence and delivery checkpoint

| Check | Current status |
| --- | --- |
| Save project to Anna | The visible action completed with **“工程已保存到 Anna”**. The real files list then showed a new `Timeline-Studio.timeline`, **6.41 MiB**, timestamp displayed as **2026/9/9 03:01:04**. The list contained one older rendered video and five project files. |
| Refresh and restore the saved project | Passed through an explicit restore. Refreshing the entire Anna dashboard initially opened an empty editor at 0 seconds. Smart → Save project to Anna → Restore from Anna then reported **“草稿已恢复”** and **“工程包已导入，媒体素材已恢复”**, restoring the 10-second main track. |
| Restore media bytes and source trim after refresh | Passed for this project. Restored video playback used source seconds **5–15**, with `readyState: 4`, source duration **35.886 seconds**, and `error: null`; the edited project remained **10 seconds**. |
| Silent MP4 generation and browser decoding | Passed for **720p, muted, H.264, 10 seconds**. The UI reported the rendered video was generated. The result's `video[controls]` reported duration **10 seconds**, **1280 × 720**, `readyState: 4`, and `error: null`. Advancing playback time was not observed for this exported result. |
| Local MP4 delivery and independent file inspection | Not yet verified. The local-download link declared `download="anna-r6-cloud-10s-silent.mp4"`. After clicking it, the browser tool timed out after 10 seconds waiting for its download event. A file in Downloads and independent `ffprobe` inspection have not been confirmed. This tool-event timeout does **not** establish an Anna download failure. |
| MP4 upload through the Anna download action | Passed for the generated silent result. The real Anna files list gained `anna-r6-cloud-10s-silent.mp4`, **5.91 MiB**, with timestamp displayed as **2026/9/9 03:04:46**, and no error. This action's successful path does not display a toast. This confirms the cloud file listing, not local delivery. |
| Export with source audio | Blocked. A verified 12-second H.264/AAC source failed with `ANNA_SOURCE_AUDIO_UNAVAILABLE`; export stopped without producing a new result or download link. See the reproduction below. |
| WASM-dependent AI Voice or other local model inference | Blocked. Audio → AI Voice displayed **“此功能暂不可用”** and **“当前容器不允许运行此功能所需的本地模型”**. Synthesis, Clone, Favorites, and History entry points remain visible. No inference pass is claimed. |
| Production Library → Import / drag-to-timeline | Pending; the completed import above used local upload |

This establishes a save → full dashboard refresh → explicit cloud restore round trip with usable embedded media and the expected source trim. It does not establish automatic recovery immediately after refresh, since the editor was empty until the explicit restore action. The files-list timestamp is recorded as displayed without inferring its timezone.

## Source-audio export failure

A separate full refresh started an empty project. The visible upload control imported `/tmp/anna-cloud-retest-20260909/anna-qa-nature-with-music-12s-30fps-h264-aac.mp4`. Independent local inspection of this **input fixture** had already confirmed H.264 video at **854 × 480, 30 fps, 360 frames, 12 seconds**, plus **12-second AAC, 48 kHz, stereo** audio. Its audio measured approximately **−20 dB mean** and **−6.9 dB peak**; the input was not silent. These input checks do not inspect or validate any Anna-exported file.

In the production export UI, audio was explicitly set to **mix all enabled tracks**, resolution to **720p**, and the output name to `anna-r6-cloud-12s-with-audio`. Starting MP4 generation reached **2%**, preparing embedded video audio **1/1**, then stopped with `ANNA_SOURCE_AUDIO_UNAVAILABLE`:

> 无法读取所选范围内的视频原声，已停止导出。请保留工程后重试；如只需画面，请在导出设置中将音频设为“静音”。

No new rendered video or download link appeared, and the main track remained **12 seconds**. The fail-stop protection behaved as intended; exporting this valid source with its audio remains blocked. The coexistence of a WASM capability failure is recorded, but this UI result alone does not establish the exact internal decoding failure or prove that selecting a Cloud Agent remedies it.

## Current result

Verified in the installed production r6 draft: real stock search and preview, local media upload/preparation, real AI Apply → Undo → Redo and no-op handling, explicit cloud save/refresh/restore with media, silent MP4 generation/browser decoding, and the resulting cloud file listing.

Still blocked: browser WASM/local AI Voice, saving the LLM-only permission dialog, and the tested export with source audio. Local MP4 delivery and independent output-file decoding remain unverified. Library-native import, broader media combinations, and longer exports have not been covered by this pass. The default Cloud Agent setting does not constitute an Executa/Linux toolchain test.

## Scope and release boundary

The user retains all browser-local AI entry points and is waiting for a supported platform fix before resubmission. This retest does not cut a new immutable version, submit for review, publish a release, or push Git changes remotely. The prior immutable version `0.1.0-alpha.1` / `684` is separate from this mutable draft.

At closeout, another explicit restore from Anna returned the editor to the saved **10-second** project. The final official read-only query still returned **r6 ready** with the same content hash, app `status: rejected`, `review_candidate_version: null`, and the single immutable version **`684` / `0.1.0-alpha.1`**, `published_at: null`.

The strict-validator diagnostic-string false positive was not re-evaluated in this UI pass and is not claimed resolved. This record includes no access tokens, email identifiers, signed storage URLs, or raw authenticated responses. Further repair and local-delivery results should be appended only after they have been observed.
