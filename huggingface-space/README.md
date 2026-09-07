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

- **September 3, 2026 — Italian and Indonesian interfaces:** Timeline Studio now offers 13 interface languages. Italian and Indonesian include complete editor and runtime-message dictionaries, reviewed terminology for captions, timeline tools, Smart Frame, AI Music, vector design and generation plugins, matching fonts, and Whisper subtitle recognition.
- **September 1, 2026 — Sync-safe instant video readiness:** local and online imports now block only for a small device-adaptive set of real-PTS seed frames instead of 120–240 thumbnails, so a prepared filmstrip becomes editable much sooner without stretching one poster across the clip. Exact frames then refine the visible viewport first and continue through offscreen cells in midpoint-bisection order; thumbnail selection remains strictly at-or-before the requested source time, the playhead uses the live preview frame, and batched background commits pause during scrubbing.
- **August 29, 2026 — Generation connectors that finish the asset workflow:** Puter keeps its real popup sign-in and browser-direct generation, while new separate ComfyUI and Stable Diffusion WebUI/Forge plugins connect only to configurable loopback services. ComfyUI runs API-format workflows and imports declared image/video outputs; WebUI runs real txt2img/img2img requests. All completed media is added automatically to My assets, and the generic Hugging Face Spaces embed has been removed.
- **August 28, 2026 — Browser-local Smart Denoise:** the Visuals → AI Repair workspace now starts with a DRUNet-powered video denoiser offering current-frame comparison, four strength modes, source-audio preservation, and reversible application. Full-clip processing now streams source-rate WebCodecs frames through overlapped decode, persistent WebGPU sessions, pooled canvases/tensors/pixel buffers, and conservative denoise-residual reuse for low-change neighbors, with a PNG/FFmpeg compatibility fallback. The workflow is available on desktop and mobile in all 11 interface languages.
- **August 28, 2026 — High-fidelity video timeline preparation:** newly uploaded videos now remain in a visible preparing state while metadata and real-PTS thumbnails are decoded, preventing stretched placeholder blocks. Timeline filmstrips use sharper 180px source frames, readable zoom-aware density, exact source-time mapping beneath the playhead, and centered fill crops for portrait footage without black bars.

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
