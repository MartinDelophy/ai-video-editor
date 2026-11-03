# Browser-local editing proxies

Video proxies are rebuildable preview media. Timeline `src`/`blob` fields retain
canonical source media; proxy URLs and bytes never enter project snapshots,
archives, undo history, source analysis, or export composition descriptions.

## Routing

- `src/lib/videoProxy.js` owns one serial queue, runtime URL ownership and the
  independent `timeline-studio-video-proxies` IndexedDB cache.
- `src/hooks/useVideoProxy.js` selects preview URLs without changing a source
  during continuous playback or a pointer gesture. Natural clip changes can
  select an already available proxy. Decoder failures fall back to the source.
- `PreviewStage` routes the main picture, overlays, transitions and blurred
  smart-frame backgrounds through preview selection. Source metadata continues
  to describe the full-resolution media.
- `editorComposition.js` keeps original references and rejects runtime proxy URLs
  before either deterministic or compatibility export or agent composition.
- Timeline filmstrip extraction, progressive refinement and exact playhead
  overrides continue to read the original source and original source-time map.

## Encoding and timing

The worker scales videos whose display long edge exceeds 1280 pixels to a
1280-pixel long edge, using H.264 at 3 Mbps with a 0.5-second GOP. It keeps native
presentation timestamps, including variable frame rate, rather than forcing
30 fps. Fragmented MP4 is emitted incrementally as Blob chunks without a
contiguous full-video output buffer.

Before publication, the worker compares every source and proxy presentation
timestamp (2 microsecond rounding tolerance), frame count, first timestamp and
video end time (2 ms tolerance). HDR and nonzero video origins currently retain
source playback. Missing WebCodecs, unsupported codecs, validation failures and
cache failures do not block ordinary editing.

Proxies contain **video only**. `ProxySourceAudio` plays the canonical source
through an audio element, using the existing source-time, playback-rate, gain
and acoustic-space helpers. The proxy video is muted. This avoids re-encoding
AAC priming samples and changing audible synchronization. Source-audio
separation and existing clip mute decisions remain authoritative. The audio
player follows proxy seek/buffering/play/pause events and retains pitch. Proxy
playback and the main timeline clock wait for original audio readiness and seek
completion before starting together, including after a trim or speed change. Separated linked source audio uses the same readiness gate, then checks each animation frame and corrects drift against the presented picture without repeatedly pausing it. The gate runs before paint when a clip changes so muting embedded audio cannot precede source-audio readiness by a rendered frame.

Splitting a speed curve retains a normalized window into its original curve,
including partial smooth easing. Source trims, local rates, exact thumbnails
and export therefore share the same source-time mapping across the cut.
Background preparation updates refresh runtime media without becoming undo
steps or discarding redo history.

## Scheduling and storage

Generation waits for the import thumbnail seed to finish. The serial worker
pauses at frame boundaries during playback, export, pointer interaction and
hidden-tab periods; cancellation terminates it. Removing all references to a
source cancels its job. Generation does not set the timeline clip's existing
`preparing` state.

Cache identity hashes all source bytes in bounded 4 MiB chunks and hashes the
ordered chunk hashes together with a versioned encoding profile and source
size. Filenames, temporary object URLs and partial-file hashes are not cache
identities. Split clips share runtime source records; reimported byte-identical
sources can reuse the persistent proxy after hashing.

Persistent cache writes are transactional and optional, with capacity preflight
and oldest-first eviction to a 512 MiB budget. Larger proxies remain session-only.
Clearing the cache cancels pending work and selects original preview mode.
Mounted players retain their proxy URLs until they release them. Original
project media is never evicted by proxy cache operations.

The View menu groups automatic proxies, original playback, actual playback-source
status and cancellation in all 13 interface languages. Cache management opens a
separate panel; clearing it returns preview to original media. Phones use a compact
View icon and a scrollable bottom sheet, leaving preview transport controls clear.
The menu explicitly states that export always uses original media. Switching back
to automatic mode also permits retry of previously canceled or unsupported sources.
