# Anna official music generation

Implemented on `codex/anna-validation`, 2026-10-25. This is a source-integrated extension of the registered Anna connector, not the browser-local Stable Audio worker.

Sources: [official App UI Media](https://anna.partners/developers/apps/app-ui-media.md), [music API](https://anna.partners/developers/reference/host-api-music.md). Runtime SDK pinned to 0.26.0. Declare `ui.host_api.music` generate/getJob/cancelJob/listJobs; the user's Anna music grant is required. No provider credentials are embedded.

Smart places Music generation after Automatic captions. Clicking opens the right inspector (Properties on compact layouts), using the shared thin inspector scrollbar. Discovery is read-only through `llm.catalog({serviceType:'music_gen'})`. The selected official model determines prompt length, lyrics support, instrumental mode, range-only duration controls, formats and license note. Fixed-duration models receive no duration. Lyrics go in the official `lyrics` field; the host handles `prompt_embedded` provider mapping. Advanced reference-image, stems, continuation and model-native options are not exposed.

Each explicit Generate action persists its exact request and UUID idempotency key in account/app-scoped Anna storage before submitting. One in-flight operation is allowed per mounted editor; the host key deduplicates the same request after reload. Ambiguous outcomes retain that receipt. Retrieve result checks job history for the same key before replaying the identical request within a conservative 23-hour window; it never invents a fresh key. Expired ambiguous receipts require manual investigation rather than another billed submission. Different windows can deliberately create different jobs; this is not a distributed generation lock. No automatic paid retry occurs. Cancellation reflects the host response: a running/non-cancellable job continues monitoring. Existing terminal failures can be acknowledged through Check job status.

Successful jobs download actual audio bytes; a 403 refreshes the URL through getJob, never generate. The shared generation host decodes duration/waveform, marks the audio `kind:'music'`, and adds it to My assets for explicit timeline placement on the Music track. Playback uses the downloaded object URL, not the expiring signed URL. Durable records contain job IDs and requests, not presigned URLs. Asset import deduplicates existing generation job IDs. The result can be retrieved again after a download/decoding failure without paying for another composition.

All new UI copy is directly localized in 13 languages. Existing video/image connector behavior and local music outside Anna are retained.

Validation: Anna production build; official CLI manifest/bundle validation; temporary external contract checks for model capabilities, both lyrics modes, range/fixed duration, 403 re-signing without another submission, existing-job terminal failures, and all 13 locale fields. Local browser verifies the card position, inspector and unavailable-host behavior. No paid music generation or live Anna permission changes were performed; live account availability and audio quality remain to be checked in an authorized real generation. Temporary checks and fixtures are outside the repository.

## Catalog rendering correction (2026-10-25)

Draft 176 exposed a React error #31 when catalog display names or license notes arrived as `{zh,en}` objects. The inspector now resolves localized strings with an English/Chinese fallback and a safe model-ID fallback; unknown objects never enter React children. Catalog model IDs and format entries are also guarded. A temporary render check reproduced the pre-fix exception with the real inspector, then passed Chinese/English, another-language fallback, and legacy string data after the correction. The rendered fixture was visually checked separately from any live paid generation.

## Review submission

2026-10-25: uploaded corrected draft revision 177 (`ready`), cut immutable version `0.1.2-beta.4` (version ID 1639), and submitted it for release review. The returned `release_review_state` is `pending`, `is_latest` is false, and `published_at` is null. This is a review submission, not a claim that the music feature is publicly live. No paid generation was submitted during this work.
