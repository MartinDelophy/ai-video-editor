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

- **2026-09-14 — Export reliability:** clips with solid-color backgrounds and opacity keyframes now export correctly without a person mask. Failed exports keep the error visible and can be retried with the same settings.
- **2026-09-14 — Large-project performance:** project import reduces main-thread work, while cached audio-lane calculations, compact waveform rendering and fewer audio seeks make scrubbing and playback lighter. Media, clip timing, editing controls, effects and export behavior are preserved. Import shows real progress and opens the editor once media is restored; thumbnails continue refining in the background.
- **September 12, 2026 — Best AI Tool badge:** the first-run language chooser now shows the Best AI Tool badge beside the Timeline Studio brand. The layout adapts to desktop and mobile, and the badge opens the external site in a new tab.
- **September 11, 2026 — WebMCP editing and video delivery:** 15 browser tools now cover reviewed caption changes, audio volume and fades, markers, main-visual splitting/deletion/duplication, existing-asset discovery and insertion, and picture-in-picture. Agents can prepare export settings, start the real editor exporter, inspect progress and actual output metadata, or cancel. Multi-operation edits retain conflict checks, ripple behavior, track locks and undo; repeated export requests do not trigger duplicate downloads. Tool and review copy covers all 13 interface languages.
- **September 10, 2026 — WebMCP for the live editor:** supported browsers can expose the open project to agents for structured inspection, preview seeking, and reviewed visual reorder/trim plans. The browser adapter reuses the shared command engine, checks for concurrent edits before applying, and preserves editor undo. Agent discovery and integration documentation are included; the root URL still opens directly into the editor.

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
