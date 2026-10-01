---
title: Timeline Studio
emoji: "🎬"
colorFrom: gray
colorTo: blue
sdk: static
app_file: index.html
fullWidth: true
header: mini
short_description: Local-first AI video editing in your browser
models:
  - haixin/timeline-studio-onnx-models
tags:
  - webgpu
  - onnx
  - video-editing
  - whisper
  - local-first
license: mit
---

# Timeline Studio

## Responsible use of deep synthesis

This tool uses deep-synthesis technology and is intended solely for technical research and learning.

Users must ensure that they:

- use only facial images or videos of themselves or people who have provided lawful authorization;
- do not create or distribute any illegal, infringing, false, or misleading content;
- do not present generated content as authentic footage or impersonate another person without their consent.

Users are solely responsible for any legal liability arising from violations of these requirements.

## Project updates

- **2026-10-01** — AI watermark repair now follows original frame timestamps, including variable-frame-rate video and trimmed clips. Local motion and occlusion checks make neighboring-frame reuse more conservative around subject edges. Adaptive model crops, bilinear reconstruction and continuous, texture-aware blending reduce rectangular repair seams. One repair action refines the current result; native encoding and FFmpeg fallback preserve unselected regions. Prefer nearby frames, then search original frames up to 3 seconds before and after. Distant detail must pass flow and agreement checks. Blend only edges. Recognized white text uses a stable stroke mask and local harmonic blending to preserve surrounding detail through fades; restoring the original clears stale repair previews.
- **2026-09-27** — Automatic captions now use word timestamps with short-phrase or word-by-word grouping, preventing long subtitle blocks in portrait videos. Preview, export and SRT share the same editable timed clips; controls support all 13 interface languages. AI voice generation also splits long scripts before synthesis and times each caption to its own audio, including caption-scoped voice generation. Caption display and SRT hide trailing commas, periods and semicolons while retaining expressive punctuation and the original editing/voice text.
- **2026-09-27** — Desktop playback now pages the timeline at the 85% edge, returning the playhead to 20%. Manual horizontal scrolling suspends following; Return to playhead or restarting playback restores it. Pausing preserves the view.
- **2026-09-27** — Unified video clips: main-video and picture-in-picture clips now combine a filename rail, filmstrip and source-audio waveform. Adjust each clip’s dB directly on its waveform, with matching preview/export gain and gain retained after audio separation. Includes all 13 interface languages. All audio lanes use fine bottom-aligned waveforms that follow gain, with orange caps above the display ceiling and existing track styling preserved. Timeline scrubbing advances the preview without waiting for compositor callbacks; release retains exact-frame confirmation.
- **2026-09-21 — Remove pauses:** Smart now detects long speech pauses locally with Silero VAD, lets you review and select cuts, and trims the selected main-track video with its source audio. Adjustable pause thresholds, retained gaps, ripple editing, cancellation and undo are included, with direct UI copy in all 13 languages.

<a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/daily?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/weekly?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a> <a href="https://linux.do"><img src="https://shorturl.at/ggSqS" alt="LINUX DO" /></a>

This Space is the lightweight showcase for Timeline Studio, an MIT-licensed,
local-first AI video editor. The full editor runs at
[video-editor.ai-creator.top](https://video-editor.ai-creator.top/), and its
source is available on [GitHub](https://github.com/MartinDelophy/ai-video-editor).

## What can it produce?

Explore reproducible before/after examples and editing recipes:

→ [AI Video Editing Skills Handbook](https://github.com/MartinDelophy/timeline-studio-handbook)

If this project helps you, please consider giving it a ⭐ Star. If you encounter a problem, please [open an Issue](https://github.com/MartinDelophy/ai-video-editor/issues).
