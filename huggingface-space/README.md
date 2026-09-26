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

- **2026-09-26** — Sanity storyboards: an optional workbench now supports script and shot editing, revision-checked review and approval, and appending approved shots with locally matched media and editable timeline notes. The editor stays local-first; the new controls support 13 languages.
- **2026-09-21 — Remove pauses:** Smart now detects long speech pauses locally with Silero VAD, lets you review and select cuts, and trims the selected main-track video with its source audio. Adjustable pause thresholds, retained gaps, ripple editing, cancellation and undo are included, with direct UI copy in all 13 languages.
- **2026-09-20 — Playhead marker snapping:** Dragging the white playhead previews the picture live and snaps to markers and range edges, with a shared alignment guide and time readout. Hold Alt to scrub freely. Marker details show Done until edited, then Apply changes.
- **2026-09-17 — WebMCP finishing and review:** 21 browser tools now cover 26 reviewed edits, including timed-clip movement and source trimming, overlay transforms, caption style/position and project framing. Agents can request rendered frame/audio samples, run browser-local voiceover or transcription with progress and cancellation, and review results before timeline insertion. New controls and messages support all 13 interface languages.
- **2026-09-15 — Edited audio export:** exporting an audio clip now renders its trimmed range with playback speed, volume, fades and space effects applied. Clips and the complete timeline mix can be exported as WAV or MP3; audio-only export is available alongside video export.

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
