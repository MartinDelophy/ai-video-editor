---
title: "I Built a Local-First AI Video Editor That Runs in the Browser"
published: false
description: "How Timeline Studio combines React, ONNX Runtime Web, Whisper, WebGPU, and a real multi-track timeline to create voiceovers, captions, vision effects, and talking avatars locally."
tags: webdev, ai, react, opensource
---

What if an AI video editor did not need to upload your media to a server before it could do anything useful?

That question became **Timeline Studio**, an open-source, local-first video editor built with React. It generates voiceovers, transcribes audio, analyzes subjects, creates talking portraits, and exports a finished video — with the core AI workflows running directly in the browser.

You can [try the live demo](https://video-editor.ai-creator.top/), browse the [source code on GitHub](https://github.com/MartinDelophy/ai-video-editor), or watch the [demo video on YouTube](https://youtu.be/mUXduGpBmwE).

![Timeline Studio editor](https://raw.githubusercontent.com/MartinDelophy/ai-video-editor/main/docs/screenshots/editor-timeline.png)

This post is not a claim that browsers have replaced desktop editors. They have not. It is a practical account of what worked, what became unexpectedly difficult, and what I learned while moving a surprisingly large AI media pipeline to the client.

## The product idea

The first version started as a simple image-to-voiceover tool. A user could upload an image, enter a script, generate speech, preview the result, and export a video.

But a useful editor needs more than a happy-path generation button. Users need to move clips, overlap narration, edit captions, keep audio and text synchronized, add music, recover from mistakes, and understand what the exporter will actually produce.

That pushed the project toward a CapCut-like desktop workspace with:

- image, video, sticker, caption, source-audio, voiceover, and music tracks;
- clip splitting, resizing, moving, duplicating, locking, hiding, and deletion;
- automatic lanes for overlapping voiceovers and captions;
- waveform-aware captions and a zoomable timeline;
- browser-side MP4/WebM export;
- installable PWA behavior and persistent model caching.

The important architectural decision was to make the timeline the source of truth. AI features do not produce isolated downloads; they create or update editor assets and timeline clips.

## A browser AI stack with different runtimes

There is no single model or runtime that handles every part of this application well. Timeline Studio uses several specialized paths:

| Task | Model/runtime | Execution |
| --- | --- | --- |
| Chinese and multilingual TTS | Piper/VITS ONNX | WASM |
| English TTS | Kokoro 82M v1.0 q8 | WASM |
| Automatic captions | Whisper small q8 | WASM worker |
| Object detection | YOLOS tiny q8 | WASM worker |
| Portrait matting | MODNet q8 | WASM worker |
| Audio-to-face motion | JoyVASA ONNX | Browser worker |
| Neural portrait rendering | LivePortrait ONNX | WebGPU |

Models are lazy-loaded. Opening the editor should not immediately download every neural network it might eventually use.

For example, the English speech path imports Kokoro only when the selected voice requires it:

```js
const { KokoroTTS } = await import("kokoro-js");

const tts = await KokoroTTS.from_pretrained(
  "onnx-community/Kokoro-82M-v1.0-ONNX",
  {
    dtype: "q8",
    device: "wasm",
    progress_callback: reportProgress,
  },
);

const audio = await tts.generate(text, { voice, speed });
```

Piper handles the multilingual voice catalog, while Chinese text goes through a dedicated pinyin-aware path. A key product rule is that a failed voice must fail visibly. Silently falling back to a different speaker would make the UI appear successful while producing the wrong result.

## Workers are not optional

Model inference, audio decoding, frame analysis, and export are all capable of freezing the main thread. Moving the work into Web Workers was necessary for progress reporting and editor responsiveness.

The vision worker keeps model instances alive after their first load and serializes analysis requests:

```js
let detectorPromise = null;
let backgroundRemoverPromise = null;
let analysisQueue = Promise.resolve();

async function getDetector() {
  detectorPromise ??= pipeline("object-detection", "Xenova/yolos-tiny", {
    device: "wasm",
    dtype: "q8",
  });
  return detectorPromise;
}
```

Keeping a session warm makes repeated actions much faster. Serializing selected workloads also avoids memory spikes and execution-provider conflicts — especially important when several large ONNX graphs compete for browser resources.

## Video vision has to be temporal

Running subject detection on the first frame of a video is easy. It is also wrong as soon as the subject moves.

Timeline Studio pre-analyzes a video at adaptive intervals and stores timestamped YOLOS geometry and MODNet masks. Preview, smart crop, caption avoidance, background removal, and export all resolve the analysis record for the current source time.

This creates a reusable temporal track:

```text
video time ──► 0.0s ───── 0.8s ───── 1.6s ───── 2.4s
subject box    A           B           C           D
matte mask     A'          B'          C'          D'
```

Longer videos use wider sample intervals to bound inference time and memory. It is a compromise, but it is much more honest than freezing a first-frame result across the entire clip.

## Rewriting LivePortrait for WebGPU

The talking-avatar pipeline was the hardest part of the project.

JoyVASA converts voice audio into motion. LivePortrait then applies that motion to a source portrait through appearance extraction, motion extraction, lip retargeting, stitching, warping, and SPADE generation.

The available combined generator contained rank-5 operations and two 5D `GridSample` nodes. Its native Linux plugin could not run in a browser, and the graph was not directly compatible with ONNX Runtime Web's WebGPU execution provider.

I rewrote the 5D sampling as batched 4D `GridSample` operations plus linear interpolation along depth. The rewritten graph grew from 277 to 316 nodes, but it could execute in the browser. Comparing the full 512×512 output against the original graph produced:

- maximum absolute error: `7.8976e-6`;
- mean absolute error: `1.3853e-7`;
- 99.9th-percentile error: `1.7881e-6`.

Those numbers mattered. “It looks close” is not a sufficient validation strategy for replacing a core neural-network operator.

The browser pipeline now offers a mixed-FP16 256px preview tier and a mixed-FP16 512px quality tier. It renders sparse neural keyframes, interpolates them for encoding, and keeps the reusable appearance feature on the GPU between frames.

It is still not real-time. On the hardware used for validation, 512px neural frames remain expensive. The UI therefore reports real progress rather than pretending a slow operation is instant.

The large avatar bundle also does not live in the Git repository. It is split into 50 MB parts and served from an immutable, revision-pinned [Hugging Face model repository](https://huggingface.co/haixin/timeline-studio-onnx-models/tree/a201b681c8f96672b5c3f624e32d4dc932f150af).

## Automatic captions need more than transcription

Whisper returns text and timestamps, but subtitle quality inside an editor also depends on alignment.

The current caption pipeline uses Whisper small q8 in a WASM worker. Tiny models were faster, but Chinese tests produced unstable hallucinations. WebGPU was also less stable for this workload, so captions deliberately stay on WASM until that path is revalidated.

After transcription, segment boundaries are nudged toward nearby source-audio energy. This makes subtitle bars line up with the waveform instead of blindly trusting coarse chunk timestamps.

Chinese cleanup is conservative and context-aware. Broad rewriting would make subtitles read more smoothly while risking changes to what the speaker actually said — a bad trade in an automatic transcription path.

## Making the timeline feel like an editor

AI demos often focus on inference and underestimate interaction design. In practice, much of the work went into ordinary editor behavior:

- inserting a generated voiceover at the playhead rather than replacing the previous result;
- moving linked captions with their voiceover;
- creating extra lanes when clips overlap and compacting them afterward;
- keeping clip geometry time-accurate at every zoom level;
- using transparent hit targets for very short clips instead of visually stretching them;
- making Delete and Backspace clip-scoped without firing while the user edits a text field;
- keeping preview and export subtitle layout WYSIWYG.

Timeline zoom is based on visible duration rather than an arbitrary CSS scale. At the widest level it can show a long project; at the closest level it reaches frame-oriented ruler ticks:

```js
export function getTimelineTrackWidthPercent(duration, zoom) {
  const visibleDuration = getTimelineVisibleDuration(zoom);
  return Math.max(100, (duration / visibleDuration) * 100);
}
```

This keeps a five-second clip representing five seconds no matter how far the user zooms in or out.

![Voiceover and captions aligned on the timeline](https://raw.githubusercontent.com/MartinDelophy/ai-video-editor/main/docs/screenshots/voice-caption-alignment.png)

## Caching models without hiding storage costs

Repeatedly downloading hundreds of megabytes makes a browser AI application unusable. Timeline Studio registers a service worker that uses cache-first behavior for model assets and network-first behavior for the app shell.

```js
async function cacheFirst(request) {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone()).catch(() => {});
  return response;
}
```

Model URLs are revision-pinned so a cached graph and its runtime assumptions do not silently drift apart. The app can also clear the model cache when browser storage becomes tight.

Local-first does not mean “free.” It exchanges server cost and upload latency for model downloads, device storage, memory pressure, and hardware variability. Those costs need to be visible in progress UI and error messages.

## Export is another rendering engine

The preview canvas and exported video must agree about crop geometry, captions, stickers, filters, transitions, and current timeline time.

Export composes the visual canvas and audio tracks in the browser, records a supported native format, and uses FFmpeg WASM only when MP4 transcoding is needed. If MP4 conversion fails, the editor preserves the successfully rendered WebM instead of discarding the user's work.

This fallback hierarchy turned out to be important because browser codec support varies considerably.

![Browser export progress](https://raw.githubusercontent.com/MartinDelophy/ai-video-editor/main/docs/screenshots/export-progress.png)

## What I learned

The largest lesson was that browser AI is a systems problem, not just a model-loading problem.

You have to design model selection, execution providers, workers, caching, memory lifetime, timeline semantics, rendering, codecs, and failure states as one product. A fast model with poor orchestration still creates a slow editor. An accurate model without temporal data can create visually incorrect output. A successful inference that is not inserted cleanly into the timeline is still a poor editing experience.

The browser is already capable of much more local media intelligence than many applications use today. But the best results come from acknowledging its constraints: lazy-load aggressively, cache carefully, keep heavy work off the main thread, validate graph rewrites numerically, and never hide a degraded result behind a “success” message.

Timeline Studio is still evolving, and contributions are welcome. If you want to experiment with local-first creative tooling, check out the [GitHub repository](https://github.com/MartinDelophy/ai-video-editor), try the [live editor](https://video-editor.ai-creator.top/), and let me know which part of the browser AI stack you would like to see explored next.

