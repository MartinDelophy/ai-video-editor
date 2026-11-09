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

- **2026-11-09** — The full editor adds 3D Perspective Beats, with four strips and 16 replaceable picture-in-picture cards, and Memory Vortex Beats, whose stained-glass opening uses photos or video stills from all 48 shot slots. Desktop Color Wheels gain an RGB parade and 4K offline export uses less memory.
- **2026-11-08** — In the full editor, replace a timeline clip with a source range from the media cards. Drag either handle to trim the range, or drag the range itself to move it at the same playback speed. The replacement preserves the clip’s timeline duration. The properties panel follows the selected clip in the timeline and preview, and picture-in-picture settings scroll through the available panel height. Visual clip selections are outlined in the preview, and diamonds mark keyframe times on Visuals and Overlay clips. VFX lane labels fit the sidebar, and dragging the playhead uses a lighter effects preview. Added Spinning Cards, an editable square template with a four-suit neon intro, ten replaceable beat cuts and a tempo-matched soundtrack. Drag a diamond on a Visuals or Overlay clip to retime that keyframe. Spinning Cards can now display photos or video on each rotating suit. Four new editable templates add a seven-panel intro, neon film orbit, concentric ripple cuts, and staggered mask cuts. WebMCP can now preview and append beat templates, inspect timeline effects, and set mask transitions. The Timeline Studio Skill documents the workflow.
- **2026-11-02** — Added compact icon-based alignment menus and split screens that include the main picture and visible overlays, with two-, three- and four-picture layouts, shared preview/export cropping and one-step undo. Agents can now invoke both features through shared CLI, STDIO MCP and browser preview/apply commands, documented in the editing Skill.
- **2026-10-30** — Added preview-video context menus for canvas alignment, fit/fill, overlay start/end alignment, and manual reference-frame synchronization, with undo and locked-track protection.
- **2026-10-24** — Replaced model-based HD restoration with adjustable local contrast and edge enhancement at original resolution, with before/after comparison and saved settings. Comparison playback uses one audible source stream, and enhancement status copy is consistent. Direct frame transfer and reusable buffers now avoid per-frame PNG round trips while keeping the enhancement algorithm unchanged. Detail enhancement now runs luminance, blur and edge processing on WebGPU, prefers a high-performance GPU, and falls back to the CPU when unavailable; the workspace shows the actual backend.

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
