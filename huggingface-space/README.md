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

- **2026-10-24** — Replaced model-based HD restoration with adjustable local contrast and edge enhancement at original resolution, with before/after comparison and saved settings. Comparison playback uses one audible source stream, and enhancement status copy is consistent. Direct frame transfer and reusable buffers now avoid per-frame PNG round trips while keeping the enhancement algorithm unchanged. Detail enhancement now runs luminance, blur and edge processing on WebGPU, prefers a high-performance GPU, and falls back to the CPU when unavailable; the workspace shows the actual backend.
- **2026-10-21** — Integrated optional local-host source analysis, reviewed plans, transcript semantic review and offline visual search (#112–#115). These native capabilities require separate runtimes and are not available in the hosted Space. [Setup and limits](https://github.com/MartinDelophy/ai-video-editor/blob/main/docs/material-analysis.md).
- **2026-10-13** — Agent relighting and depth-video conversion now reuse the production browser pipeline through WebMCP prepare/start/inspect/cancel. Lighting parameters use shared reviewed, undoable commands; generated depth videos stay in My assets until a separate reviewed insertion. The editing Skill documents the complete workflow and local CLI limits.
- **2026-10-12** — Long-video playback pauses background filmstrip refinement and draws the exact playhead thumbnail without JPEG encoding. Resume prioritizes the latest seek; AAC export preparation copies audio packets without re-encoding or copying the full video into WASM. Visual effects and export settings are preserved. Export now prefers supported hardware encoders and feeds eligible unscaled video frames directly to the compositor, preserving the existing raster path for transforms and effects. Audio encoding and next-frame composition now overlap video submission with a bounded queue. Scrubbing separates decoder/playhead updates from editor reconciliation, preserves marker snapping and commits the exact release position.
- **2026-10-01** — AI watermark repair now follows original frame timestamps, including variable-frame-rate video and trimmed clips. Local motion and occlusion checks make neighboring-frame reuse more conservative around subject edges. Adaptive model crops, bilinear reconstruction and continuous, texture-aware blending reduce rectangular repair seams. One repair action refines the current result; native encoding and FFmpeg fallback preserve unselected regions. Prefer nearby frames, then search original frames up to 3 seconds before and after. Distant detail must pass flow and agreement checks. Blend only edges. Recognized white text uses a stable stroke mask and local harmonic blending to preserve surrounding detail through fades; restoring the original clears stale repair previews.

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
