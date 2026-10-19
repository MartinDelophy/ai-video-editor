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

- **2026-10-18** — Infinite Canvas output ports now expose directional cables, compatible target highlighting and a next-node menu that creates and connects a downstream node in one undoable edit. Canvas chat supports searchable @ node references with removable pills and explicit node IDs.
- **2026-10-17** — Infinite Canvas adds typed dependencies, reviewed Anna graph edits, real image/video connectors, speech and local music, versioned outputs, recoverable video jobs and account/project-scoped browser media recovery. Generation is explicit and results go to My assets.
- **2026-10-12** — Long-video playback pauses background filmstrip refinement and draws the exact playhead thumbnail without JPEG encoding. Resume prioritizes the latest seek; AAC export preparation copies audio packets without re-encoding or copying the full video into WASM. Visual effects and export settings are preserved. Export now prefers supported hardware encoders and feeds eligible unscaled video frames directly to the compositor, preserving the existing raster path for transforms and effects. Audio encoding and next-frame composition now overlap video submission with a bounded queue.
- **2026-10-02 — Anna adds ChatCut: conversational editing with a two-pane workspace, inspected command previews, explicit application and undo, plus optional current-frame input.** ChatCut now imports media in the conversation and can inspect permissioned, timestamped video frames. Browser-supported voice dictation is available in ChatCut.
- **2026-10-01 — Anna now saves projects and media locally first, with a durable background cloud backup queue, local project switching and separate save/backup status.**
- **September 15, 2026 — Anna cloud autosave by default:** the current project and media save automatically to your Anna account and restore with the same account, without an activation step. Media uploads are deduplicated; Saved appears only after cloud confirmation. Storage errors and legacy local-recovery warnings cover all 13 languages. The X link is removed, leaving Discord and GitHub. Draft r19 is installed; alpha.6 has replaced the review candidate and is pending review, not publicly released. Anna preserves manually chosen window sizes.

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
