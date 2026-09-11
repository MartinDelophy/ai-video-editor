# Anna platform compatibility findings

## Current status — September 11, 2026

CLI `0.1.52` and SDK `0.16.1` are integrated. Both full builds and typecheck pass; ESLint reports 0 errors and 71 existing warnings. The Anna bundle contains **169 files / 210,024,788 bytes (200.3 MiB)** and passes the new CLI's default and strict validation. The diagnostic-string reproduction passes, while a real ungranted `anna.tools.getJob` call still fails with exit code 1. After the user logged in and installed r7, the production entry returned HTTP 200 with the actual `script-src 'self' 'self' 'wasm-unsafe-eval'` header and a SHA matching the local entry. SDK connection and WASM/SW/Worker/IDB/Cache/WebGPU/H.264 probes pass. App iframes still lack COOP/COEP and SAB; `isolation_unavailable` is expected. The `agent.session.auto` permissions-dialog error is **not recorded as fixed**.

The storage adapter no longer treats `if_match: ""` as create-if-absent. Missing references use an unguarded upsert with a last-minute absence check and read-back confirmation; existing references retain etag CAS. All 17 isolated checks pass, but first creation is explicitly **not atomic**. Immutable UUID project files and recovery handles are retained. Actual Identity inference returns `42 → 42` using ORT 1.27 asyncify and Transformers' own ORT 1.22 JSEP with one thread and no SAB in Node. The local non-isolated Anna build generated and delivered a real Piper Siwis French WAV, then exported a 12.032-second 1280×720 H.264/AAC source-audio MP4 with 360 frames. Full-file decode passed. PCM comparison found highly correlated source audio with a residual 1,024-sample / 21.333 ms AAC-frame delay, not perfect sample alignment. These local media results do not establish production model/export or subjective audio-quality acceptance. See the [September 11 adaptation and acceptance record](anna-rollout-adaptation-20260911.md).

The private push with `--if-match 6` completed. At **08:56 UTC**, cloud read-back confirmed **r7 ready**, hash `be3d1d579d2b1677d969bddbb1dc254f09d91acd4f9ffe9a6941f3a0fe771cef`, and the WASM opt-in. The user installed working draft `0.0.0-draft`. A Cloud Agent startup overlay timed out; Dismiss allowed the static app UI to continue, with no claim of successful Cloud Agent/Linux execution. Production Piper generated about 3.26 seconds of speech, but its independent WAV download is unconfirmed. Real Anna AI returned source 2–10 seconds; applying it produced an eight-second project. Both the initial 12-second project and the edited project were cloud-saved. A full page refresh emptied the editor; explicit Anna restore recovered the eight-second visual, source file, Piper clip and caption. Permissions Save all still fails with `manifest does not declare agent.session.auto`.

**Production r8 now completes rendering after r7's source-audio preparation failure.** Direct FFmpeg resource bytes match local files; an isolated reproduction confirmed that a same-byte Worker's cached old CSP could block WASM. Anna-only no-store script fetching and scoped cached-script eviction preserve model weights and the ordinary service worker. **r8 passed its full build, strict validation and final service-worker contract check, was pushed and installed**: 169 files, 210,025,786 bytes, hash `d74673cd7f40a0f15cd0d8f9be69f8de7a4e573c712d6d2c57df2ad0737ca9d9`. After full refreshes and cloud restore, source 2–10 seconds with the Piper clip muted rendered successfully; the UI reports the video generated and the MP4 preview DOM reads duration `8.021333`, readyState `4`. The final remote service worker is HTTP 200 / 14,322 bytes with SHA-256 `123368763214ea6d726b0dc9638bea6472e036ed34243204826befab18fdcb2d`, matching local output. Host download finished without a UI error, but neither that route nor direct download produced an identified local output file. **Production output bytes, the actual audio track, audio quality, full-file decode and download delivery are still unverified.**

The final **09:51:52 UTC** read-back confirms revision 8 ready and the same bundle hash; app `254` remains `rejected`, with no candidate and unpublished version `684` / `0.1.0-alpha.1`. Nothing was re-submitted, released or Git-pushed. The current Versions UI explicitly states that approval publishes immediately. The engineering reply describes an admin option to approve without publication, but it does not guarantee that this app stays private after approval. Details and earlier snapshots are in the [adaptation record](anna-rollout-adaptation-20260911.md). The [public forum topic](https://forum.anna.partners/t/timeline-studio-production-wasm-csp-blocker-and-strict-validator-false-positive-minimal-reproductions/296) contains the engineering response. The dated text below remains historical.

## September 5–7 observations (historical)

Observed on 2026-09-05 with private app `@martindelophy/timeline-studio` (app ID `254`), working draft `0.0.0-draft`, CLI `0.1.51`, browser SDK `0.16.0`, and local runtime `0.2.0a23`.

The follow-up [Developer Forum report](anna-forum-post.md) was submitted to Anna's Developers category on September 7, 2026. The forum confirmed receipt and showed one post pending moderator approval; no public topic URL is available yet. No session tokens, signed URLs, credentials, or user media are included.

Production retest, 2026-09-07: the production-origin CORS preflight now returns 204, with `Access-Control-Allow-Origin: https://anna.partners`, methods GET/PUT/HEAD and header content-type. A complete two-second synthetic project was uploaded in production r3, then restored from Anna after refreshing to an empty timeline; playback advanced to 0.42 seconds. Explicit cloud media transfers were therefore enabled in private r4. This does not establish first-insert CAS, deletion, retention guarantees or filesystem delivery.

WebAssembly still fails the actual production compile/instantiate probe. A fresh GET of the draft entry returns HTTP 200 and `script-src 'self' 'self'`; current official manifest semantic validation still has no WASM allowance. SharedArrayBuffer remains unavailable without cross-origin isolation. Service Worker, Worker, IndexedDB, Cache Storage and WebGPU passed; the H.264 probe timed out in this run and cannot be labeled unsupported from that result alone. The new model-entry gate is a mitigation, not a platform CSP fix.

The official local harness produced playable mixed-media MP4 previews at 1920×1080, 12.032 and 60.032 seconds. IAB download actions did not produce a discoverable local output file; Chrome import was blocked by its extension file-access setting. Full-file decode, cut alignment and mixed-audio acceptance therefore remain pending. Neither preview metadata nor a mock download event is treated as successful file delivery.

The 2026-09-07 production export also exposed a source-audio correctness issue: the console reported `Embedded video audio extraction skipped` after a WASM CSP failure. The known synthetic input contains AAC audio, and the legacy extraction path catches that failure and continues rendering. Therefore the resulting two-second MP4 only proves video/container generation, **not complete audio delivery**. Export must stop when requested source audio cannot be recovered; an explicit no-audio export remains a separate user choice. This makes production WASM support relevant to source-audio export as well as local models.

Private r4's production storage regression passed restore, conditional save against an existing reference etag, listing of four projects plus one exported video, and explicit latest-reference reassignment without another media upload. The exported video listing confirms upload, not filesystem delivery. First-insert CAS, destructive deletion and multipage listing remain unverified. No real files were deleted during this retest.

Private **r5** is now ready, with content hash `e6bd6623cf95fec8ae98eeeaa58c651d53a38d8936eaffb886397a6c2584c61b`. A fresh production window restored the cloud project. Both the Anna panel and top-bar export stopped with the localized `ANNA_SOURCE_AUDIO_UNAVAILABLE` explanation for its unreadable AAC source audio; no result video was created by the failed Anna operation. Selecting the new explicit Muted option then generated a two-second 1920×1080 preview with readyState 4. This is a tested mitigation, not a WASM CSP fix or evidence of successful filesystem delivery. The ordinary build and default official validation passed; no version was cut, submitted for review or released.

## 1. Object-storage CORS — resolved for the tested production origin

The failure below is the **2026-09-05 historical observation**. The 2026-09-07 preflight and actual production project round trip above passed. Localhost origins and every upload/header variant were not rechecked.

The official local harness with real LLM and APS storage successfully returns `files.upload_init` with `put_url` and `headers.Content-Type = application/zip`. The editor sends the archive as a raw PUT using the returned headers. The browser upload fails before `files.upload_finalize` succeeds. The production private app also reports an incomplete file transfer.

The returned storage origin is `https://5244841125c1e42784f5bda924751be6.r2.cloudflarestorage.com`. A read-only OPTIONS request to its `anna-uploads` bucket, with Origin `http://localhost:5182`, requested method PUT and header `content-type`, returns:

```text
HTTP 403 Forbidden
<Error><Code>Unauthorized</Code><Message>CORS not configured for this bucket</Message></Error>
```

The exact storage origin is declared in the app manifest. This allows a CSP connection but cannot configure bucket CORS. Please confirm the supported browser upload route and configure the bucket for the actual approved app origins, methods and headers. Local validation uses `http://localhost:5182`; the observed production iframe is served from `https://anna.partners`. Do not require wildcard CORS or client-side security bypasses.

At the time of the original failure, cloud project save/restore and host-assisted export download were unverified. Project save/restore now has the bounded production evidence recorded above; host-assisted download delivery remains a separate acceptance item.

## 2. Production CSP prevents WebAssembly compilation

The production draft HTML response contains:

```text
script-src 'self' 'self'
worker-src 'self' blob:
```

The app's active WebAssembly compile/instantiate probe fails in that container and passes in the official local harness. The current schema/CLI permits only self, hash and nonce values for `script-src`; it rejects the narrowly scoped `'wasm-unsafe-eval'` permission. Hashes and nonces do not authorize WebAssembly compilation.

Please provide a supported manifest capability or CSP rule for packaged WebAssembly. Browser-local inference and the FFmpeg WASM fallback depend on it. We have not added an invalid override or enabled general JavaScript eval. The tested WebCodecs path produced decodable 1920 × 1080, two-second video despite this limitation, but its requested source audio was skipped after extraction failed. This is not a complete audiovisual export result.

Reference: [UI manifest and CSP](https://anna.partners/developers/apps/app-ui-manifest).

## 3. Strict scanner matches an SDK diagnostic string

`anna-app validate --strict` flags `anna.tools.getJob`, found inside the pinned official SDK's timeout diagnostic string `recover via anna.tools.getJob({jobId})`. Timeline Studio does not call this method. The CLI's text regular expression scans string contents as if they were executable calls.

Default validation and private draft upload pass. Please make strict scanning distinguish calls from diagnostic strings, or document the supported review handling of this false positive. We retained the SDK unchanged and did not add unrelated Executa permissions to silence the result.

## Historical core-workflow evidence and remaining acceptance

The earlier production test imported a three-second H.264/AAC sample, used real Anna AI to plan removal of 0.5 seconds from each end, reviewed and applied the two-second plan, and exercised undo/redo. A generated two-second 1080p MP4 decoded, and an explicitly saved local archive restored its media and timeline after refresh. The 2026-09-07 source-audio finding limits that export result to video/container generation; it does not establish complete audio delivery.

Production cloud project upload and restore, existing-reference conditional save, listing and latest-reference reassignment have since passed the bounded r4 checks above. The source-audio failure guard and explicit muted preview path passed production r5 verification, as recorded above. Remaining acceptance includes first-insert CAS, conflict handling, destructive deletion, multipage listing, downloaded-file verification and broader model/export paths. No version has been frozen, submitted for review or released.

The submitted [Developer Forum report](anna-forum-post.md) includes isolated local reproductions, precise tooling versions and the remaining platform-contract questions. The complete body was submitted once and is awaiting moderator approval. Its key reproduction code is included inline. The supplementary ZIP was not uploaded because the Chrome extension denied file upload; it remains available locally for a later attachment.
