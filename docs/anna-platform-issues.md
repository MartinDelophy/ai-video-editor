# Anna platform compatibility findings

Observed on 2026-09-05 with private app `@martindelophy/timeline-studio` (app ID `254`), working draft `0.0.0-draft`, CLI `0.1.51`, browser SDK `0.16.0`, and local runtime `0.2.0a23`.

These are prepared reports, **not messages sent to Anna**. No session tokens, signed URLs, credentials, or user media are included.

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

Production cloud project upload and restore, existing-reference conditional save, listing and latest-reference reassignment have since passed the bounded r4 checks above. Remaining acceptance includes first-insert CAS, conflict handling, destructive deletion, multipage listing, downloaded-file verification and broader model/export paths. The next candidate's source-audio failure guard and explicit Anna no-audio choice still need production verification. No version has been frozen, submitted for review or released.
