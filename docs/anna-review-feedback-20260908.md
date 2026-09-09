# Anna review feedback and draft update — 2026-09-09

Investigation date: 2026-09-08. Anna Dev's initial-review email reported that Timeline Studio did not pass its first check and supplied five issues. The reviewed immutable version is **`0.1.0-alpha.1` (version ID `684`)**, created on 2026-09-07 from the previously tested r5 draft. The email establishes the review feedback; it does not, by itself, establish the current control-panel status enum.

The user chose to retain browser-local AI capabilities and wait for a supported production WASM fix before resubmitting. No unused agent-session capability is being granted, and no new review submission is part of this repair pass.

## Authorized draft update — 2026-09-09

The user authorized updating Anna with the local fixes and then making a local Git commit, with no Git remote push or renewed review submission. Official CLI **`0.1.51`** completed `apps push --if-match 5`; the working draft is now **r6 ready**. `build:anna` and default official validation passed again before this update.

| Read-back evidence | Result |
| --- | --- |
| Bundle | 159 files, **170,906,925 bytes**; 152 files reused and only 7 uploaded |
| Content identity | Server `content_hash` **`895b1a892beefd96dc479142234e107adf1f7bfd4d4ca88e17720d6d9c330bb5`**, equal to the locally computed official `bundleHash`; entry `editor-B61QoiTy.js` |
| Manifest | Server read-back includes the Commons API, upload and thumbnail origins |
| Screenshots | Two uploaded screenshots are associated with app 254: [editor and library](https://cdn.anna.partners/production/app-screenshots/254-timeline-studio/20260909023730_fd3c4baf.webp), [export settings](https://cdn.anna.partners/production/app-screenshots/254-timeline-studio/20260909023731_e3afa8e1.webp) |
| Screenshot delivery | Both CDN HEAD requests returned HTTP 200 with `image/webp`; editor/library is 85,910 bytes and export settings is 82,080 bytes |
| Release state | Still `rejected`, `review_candidate_version: null`; the only immutable version remains `0.1.0-alpha.1` / `684`, with `published_at: null`. No new version was cut or submitted for review. |

This proves the updated draft is ready, its listing assets are associated on the server, and both screenshot URLs respond successfully. It does not prove a new production-window workflow pass or a platform WASM/permission fix. No Git remote push was performed.

## Production draft retest — 2026-09-09

After the upload checkpoint above, the real Anna production UI installed r6 through **Working draft → Install & test** as `0.0.0-draft`; the running entry was `assets/editor-B61QoiTy.js`. The full evidence and reproduction steps are in the [production retest report](anna-cloud-retest-20260909.md). The default Agent displayed Cloud, sleeping/waking on use; this frontend-only application has no Executa, so no Linux toolchain execution is claimed.

Production checks now pass for Commons `nature` search (24 results) and real video preview, local upload with prepared thumbnails, real Anna AI trimming 35.886 seconds to 10 seconds with Apply/Undo/Redo, and a second real no-op request with Apply disabled. A 6.41 MiB project completed cloud save → full dashboard refresh → explicit restore, including its media and source trim 5–15 seconds. Silent H.264 export produced a decoded browser preview reporting 10 seconds, 1280 × 720 and `readyState: 4`; advancing playback time was not checked for the export. The Anna files list then showed its 5.91 MiB MP4.

Three failures remain reproducible: WebAssembly reports `host_error` and AI Voice remains unavailable; the LLM-only permissions dialog still fails saving with `manifest does not declare agent.session.auto`; and a separately verified 12-second H.264/AAC input fails export with source audio at `ANNA_SOURCE_AUDIO_UNAVAILABLE`. That export stopped without a new result, preserving the 12-second timeline. Local MP4 delivery and independent decoding of an exported file remain unverified: the browser tool's download-event timeout alone does not establish an Anna download failure. The strict-validator false positive was not rerun in this UI pass. No new immutable version or review submission was created.

The sections below retain their September 8 investigation and September 9 upload-checkpoint evidence. Their then-pending production checks should be read together with this later retest; none of these sample passes resolves the three failures or the remaining delivery checks.

At closeout, the saved 10-second cloud project was restored again. Official read-only verification still returned r6 ready with the same hash, `status: rejected`, no review candidate, and only immutable version `684` / `0.1.0-alpha.1`, `published_at: null`.

## Five reported issues and repair state

| Initial-review finding | This repair pass | Remaining evidence |
| --- | --- | --- |
| Missing product screenshots | Two authentic local Anna-edition captures were prepared on September 8 and uploaded with the September 9 update; server metadata now associates both screenshots with app 254. | Verify against the final release candidate and add the final production AI workflow capture; local screenshot provenance does not establish production compatibility. |
| Permissions save fails with `manifest does not declare agent.session.auto` | Confirmed the LLM-only application contract; retained the narrow manifest and documented the host-dialog reproduction below. | Anna must investigate its permission-save payload/defaults; the error is not repaired in production by this code change. |
| Library → Video → `nature` reports `Failed to fetch` | Added the observed Commons API/media/thumbnail origins and media CSP rule; stabilized Anna's provider selection, bounded search waiting, and added localized recovery with Retry. Local browser search, preview and import passed; these changes are now in r6. | Retest the installed r6 production container with its actual CSP. |
| AI Voice says local models are unavailable in the container | Kept the real WASM capability check, its explanation, retry, and all local AI feature entry points. No fabricated cloud voice substitute or bypass was added. | A supported platform WASM policy and real production voice/model/export retesting are required. |
| Auto Edit → review → Apply to Timeline produces no visible change | Detects semantically unchanged plans and disables Apply with an explanation; real edits show reordered/trimmed counts and source ranges, then select and seek to the first changed clip. Temporary checks and real-LLM local-harness Apply → Undo → Redo passed. | Repeat real AI editing in the future production candidate after its platform blockers are resolved. |

These fixes are now in working draft r6. They have not changed immutable version `684` or been resubmitted. The pre-existing [forum report](https://forum.anna.partners/t/timeline-studio-production-wasm-csp-blocker-and-strict-validator-false-positive-minimal-reproductions/296) also records the WASM/CSP limitation and strict-validator false positive; neither is claimed resolved by the draft update.

## Permissions: reported reproduction

1. Open the Permissions dialog for Timeline Studio, `timeline-studio · v0.1.0-alpha.1`.
2. The dialog shows **All permissions granted** and says toggles appear only for capabilities actually declared.
3. The sole visible App permissions toggle is **LLM completions**, `llm.complete`, enabled. There is no agent-session toggle.
4. Click **Save all permissions**.
5. The host dialog reports: `Save failed: manifest does not declare agent.session.auto`.

Expected: saving the displayed LLM-completion grant should succeed without granting or requesting an unrelated agent session. The screenshot supplies the observed UI behavior; the actual outgoing grant request has not yet been captured, so its serialization is a suspected cause rather than a confirmed payload defect.

### Application and platform contract

Timeline Studio's planning adapter calls `llm.complete`; it does not create a multi-turn agent session. Its manifest declares `permissions: ["llm.complete", ...]` and `ui.host_api.llm: ["complete"]`, with no `ui.host_api.agent` entry. Source connection only initializes the SDK and subscribes to window events.

Anna's [LLM and Agent API](https://anna.partners/developers/apps/llm-and-agent) distinguishes a stateless completion from a multi-turn tool-using session. Its [agent reference](https://anna.partners/developers/reference/host-api-agent) says session submodes are granted under `ui.host_api.agent.session`, with `auto` disabled and `fixed` absent by default. The pinned `@anna-ai/app-schema@0.22.0` JSON schema agrees: `auto` defaults to `false`, and `fixed` defaults to `null`.

Adding `agent.session.auto` to top-level `permissions` is not a repair: it is absent from the official [manifest permission allow-list](https://anna.partners/developers/apps/app-manifest) and the pinned schema package's `acl/capabilities.json`. Setting `ui.host_api.agent.session.auto: true` would grant an unused capability. An explicit deny object is valid but has the same documented meaning as the current omission, and there is no evidence that it corrects the host's grant-save behavior. The application therefore keeps its existing LLM-only AI grant.

### Local checks and remaining verification

Isolated static bundles under `/tmp` were checked with `@anna-ai/cli@0.1.51` and schema `0.22.0`. Both the current manifest and the equivalent explicit-deny variant passed. The CLI also accepted a deliberately invalid top-level `agent.session.auto` permission: its manifest JSON schema types the array elements as strings, whereas the separate capability table excludes this token. A CLI pass alone is therefore insufficient evidence that this permission is allowed by the production contract. None of these isolated variants was uploaded.

Platform follow-up: reproduce the LLM-only dialog above, inspect which agent grant fields the host sends or defaults during saving, and ignore absent/disabled agent grants when the app declares only `llm.complete`. After a platform fix, save the same LLM-only grant and run one real Timeline Studio edit-plan request. Preserve the absence of agent-session access throughout that check.

## Stock-library network declaration

The existing Wikimedia video search calls `https://commons.wikimedia.org/w/api.php`. An anonymous `nature` search on 2026-09-08 returned HTTP 200 with 24 video results and `Access-Control-Allow-Origin: *`; the real response included media from `https://upload.wikimedia.org` and thumbnails from both `https://upload.wikimedia.org` and `https://thumb.wikimedia.org`. These three exact origins were missing from the Anna manifest.

The manifest now declares those origins in `ui.bundle.external_origins`, which Anna adds to `connect-src` and `img-src`. It additionally allows `https://upload.wikimedia.org` in `media-src`, because the library's preview video uses a remote source before the user imports it. Imported assets continue to download into the existing blob-backed media flow. No wildcard domain, unrestricted connection policy, or agent capability is added. The corrected declaration was read back from working draft r6 on September 9; a real installed-draft browser check is still required. Immutable version `684` is unchanged.

Anna's image, video, and music searches now use Commons consistently; independent-site Pexels build keys and Openverse audio URLs cannot silently change the Anna edition's provider or destination hosts. Existing independent-site provider selection remains unchanged. Search failure preserves the query, shows localized recovery copy rather than a raw transport exception, and offers an explicit Retry action. Slow requests have a deadline, and cancelled or superseded searches cannot commit stale results.

For Music, the actual `ambient music filetype:audio` API response returned HTTP 200, `Access-Control-Allow-Origin: *`, and 24 pages, of which 12 met the existing 15–600 second duration bound. The first sample, *Ambient music test Yamaha CK61*, supplied a real Commons MP3 derivative: 4,334,666 bytes, 197.754 seconds, 44.1 kHz stereo. Its source, creator, CC0 label, and license/source URLs remain attached to the asset. These public API and downloaded-file observations do not replace an Anna browser import/preview check.

## Auto Edit: semantic changes and history

The reviewer-visible symptom is now handled explicitly when the model returns the existing order and timing. The compiler emits only effective reorder/trim commands. A no-op review preserves its command revision and has no semantic project delta; Apply is disabled, and runtime guards also reject it before the history checkpoint. A model summary cannot turn an unchanged plan into an apparent completed edit.

Real reorders remain actionable even when total duration stays constant. The review shows affected-clip counts and the before/after source range for trims. Applying a real plan uses the existing timeline commit and media-restoration path, checks the project fingerprint, records history before the batched edit, selects the first changed clip, and moves the playhead to that clip's new start. All new review labels are directly provided in the 13 supported interface languages.

Temporary checks outside the repository passed for the unchanged 242.21-second reviewer-style fixture, no-op revision preservation, every three-clip permutation, same-duration reorders, source-relative trims, sub-epsilon timing rounding, lock/stale/complex-plan rejection, live media restoration, timeline selection, and localized review labels. Independent read-only review found no material defect in the new semantic-change guards or commit/history ordering. These checks are bounded local evidence; they do not establish the behavior of the unmodified production version.

## Final verification record — 2026-09-08

This table preserves the September 8 checkpoint. Its then-unuploaded screenshots and local-only bundle were subsequently updated on September 9, as recorded above; its browser and real-LLM results remain local-harness evidence.

| Item | Status at this documentation checkpoint |
| --- | --- |
| Exact final Anna/independent-site build and official validation output | Both builds passed. Anna: 159 files, 163.0 MiB, entry `editor-B61QoiTy.js`, SHA-256 `dc4a6fe0547efc06b79befb6120cda5d59f19e431c3119a5d8290fb6e46c6b9d`. CLI 0.1.51 / schema 0.22.0 default validation passed; strict validation still fails on the previously reported SDK diagnostic-string `anna.tools.getJob` false positive. Known vendor eval / chunk-size warnings remain. Focused ESLint and diff whitespace checks passed. |
| Browser search/preview/import | Actual Anna-edition Vite page: `nature` returned real Commons videos; first video preview reached readyState 4, duration 35.886 s, and importing it produced the decoded timeline filmstrip. `ambient` music returned real results; MP3 preview reached readyState 4, duration 197.754104 s. Dragging that asset into the Music target produced a Background Music track, not a voice lane. |
| Real AI Apply → Undo → Redo | Official local harness 0.2.0a23 with real LLM bridge and SDK 0.16.0: a 35.886 s CC0 source received a 5–15 s trim plan. Apply changed the timeline to 10 s, one Undo restored 35.886 s, and Redo restored 10 s. A second real request to preserve the current sequence produced a truthful no-op notice and disabled Apply. No mocked response was used. A further real 10→8 s request displayed source range 5–15→5–13 s. Four React 19 StrictMode history checks also passed outside the repository. |
| Product screenshots | `anna/listing/editor-library.jpg` and `anna/listing/export-settings.jpg` are actual 1280×720 local Anna-edition captures, visually inspected and configured in `anna/app.json`. They are not production captures and have not been uploaded. See `anna/listing/NOTES.md` for provenance and scope. |
| Current Anna server status | Read-only official `apps status timeline-studio --json` returned `status: rejected`, `is_published: false`, no review candidate, one version: `0.1.0-alpha.1` / `684`, `published_at: null`, `is_latest: false`. This is server evidence independent of the email. |
| Production deployment and resubmission | Not performed. Retain all local AI features and wait for the supported platform WASM fix before another submission. |

Before resubmission, verify the uploaded screenshots against the actual candidate and add the production AI workflow capture, retest the platform permission dialog and WASM-dependent voice/model paths, repeat stock/media and real-AI editing flows in the installed r6 or later production container, and complete the remaining delivery/privacy checks in [release readiness](anna-release-readiness.md). A future fixed candidate must use a new version; the existing `0.1.0-alpha.1` is immutable.

The local harness used legacy in-memory storage during these AI checks; this pass does not revalidate production cloud storage or end-to-end MP4 delivery. Local serving has a different CSP from production, so the browser results above must not be described as a production WASM or media-network pass.
