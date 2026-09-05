# Anna platform compatibility findings

Observed on 2026-09-05 with private app `@martindelophy/timeline-studio` (app ID `254`), working draft `0.0.0-draft`, CLI `0.1.51`, browser SDK `0.16.0`, and local runtime `0.2.0a23`.

These are prepared reports, **not messages sent to Anna**. No session tokens, signed URLs, credentials, or user media are included.

## 1. Browser uploads blocked by object-storage CORS

The official local harness with real LLM and APS storage successfully returns `files.upload_init` with `put_url` and `headers.Content-Type = application/zip`. The editor sends the archive as a raw PUT using the returned headers. The browser upload fails before `files.upload_finalize` succeeds. The production private app also reports an incomplete file transfer.

The returned storage origin is `https://5244841125c1e42784f5bda924751be6.r2.cloudflarestorage.com`. A read-only OPTIONS request to its `anna-uploads` bucket, with Origin `http://localhost:5182`, requested method PUT and header `content-type`, returns:

```text
HTTP 403 Forbidden
<Error><Code>Unauthorized</Code><Message>CORS not configured for this bucket</Message></Error>
```

The exact storage origin is declared in the app manifest. This allows a CSP connection but cannot configure bucket CORS. Please confirm the supported browser upload route and configure the bucket for the actual approved app origins, methods and headers. Local validation uses `http://localhost:5182`; the observed production iframe is served from `https://anna.partners`. Do not require wildcard CORS or client-side security bypasses.

Until resolved, cloud project save/restore and host-assisted export download are unverified. Browser-local archive save/restore and local MP4 generation work.

## 2. Production CSP prevents WebAssembly compilation

The production draft HTML response contains:

```text
script-src 'self' 'self'
worker-src 'self' blob:
```

The app's active WebAssembly compile/instantiate probe fails in that container and passes in the official local harness. The current schema/CLI permits only self, hash and nonce values for `script-src`; it rejects the narrowly scoped `'wasm-unsafe-eval'` permission. Hashes and nonces do not authorize WebAssembly compilation.

Please provide a supported manifest capability or CSP rule for packaged WebAssembly. Browser-local inference and the FFmpeg WASM fallback depend on it. We have not added an invalid override or enabled general JavaScript eval. The tested WebCodecs export path produced a playable 1920 × 1080, two-second MP4 despite this limitation.

Reference: [UI manifest and CSP](https://anna.partners/developers/apps/app-ui-manifest).

## 3. Strict scanner matches an SDK diagnostic string

`anna-app validate --strict` flags `anna.tools.getJob`, found inside the pinned official SDK's timeout diagnostic string `recover via anna.tools.getJob({jobId})`. Timeline Studio does not call this method. The CLI's text regular expression scans string contents as if they were executable calls.

Default validation and private draft upload pass. Please make strict scanning distinguish calls from diagnostic strings, or document the supported review handling of this false positive. We retained the SDK unchanged and did not add unrelated Executa permissions to silence the result.

## Verified first-release workflow

In the actual production private app: import a three-second H.264/AAC sample; request removal of 0.5 seconds at each end through real Anna AI; review and apply the two-second plan; undo and redo; generate a playable two-second 1080p MP4; explicitly save the full local archive; refresh; restore its media and timeline; play the restored video. Broader model features, long exports and cloud persistence still need verification. No version has been frozen, submitted for review or released.
