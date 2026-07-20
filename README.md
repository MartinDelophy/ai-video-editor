# Timeline Studio — Browser AI Video Editor

**English** | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![Live Demo](https://img.shields.io/badge/Live_Demo-Timeline_Studio-35ead9?style=flat-square)](https://video-editor.ai-creator.top/)
[![GitHub release](https://img.shields.io/github/v/release/MartinDelophy/ai-video-editor?style=flat-square)](https://github.com/MartinDelophy/ai-video-editor/releases)
[![MIT License](https://img.shields.io/github/license/MartinDelophy/ai-video-editor?style=flat-square)](LICENSE)

Timeline Studio is a local-first AI video editor that runs in the browser. It combines a CapCut-style multi-track timeline with browser-side AI voiceovers, automatic captions, vision tools, talking-avatar generation, and deterministic offline export.

[Open the editor](https://video-editor.ai-creator.top/) · [Watch the demo](https://youtu.be/mUXduGpBmwE) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Timeline Studio editor](docs/screenshots/editor-timeline.png)

## AI capabilities

- **Multilingual voiceover:** Chinese Piper/VITS ONNX voices, English Kokoro 82M, and browser Piper voices for German, Spanish, French, Italian, and Brazilian Portuguese.
- **Automatic captions:** Whisper small q8 ONNX with waveform-aware timing and conservative Chinese recognition cleanup.
- **Smart framing:** YOLOS tiny subject detection and MODNet portrait matting for smart crop, caption avoidance, and background removal across images and complete videos.
- **AI vocal separation:** isolate vocals and place the instrumental stem on the music track without leaving the browser workflow.
- **Digital human:** JoyVASA audio-to-motion and LivePortrait neural rendering with WebGPU, 256px preview and 512px quality paths.
- **Local-first inference:** large models are lazy-loaded, revision-pinned, and cached by the service worker; supported workflows run without uploading project media to an editing backend.

## Editing and export

- Contiguous main Visuals track plus timed picture-in-picture overlays.
- Direct canvas selection, movement, proportional resize, rotation, masks, filters, effects, animation, speed, and explicit keyframes.
- Captions, stickers, voiceover, separated source audio, and music on independent timed tracks.
- CapCut-style snapping, alignment guides, clip menus, split/duplicate/delete, timeline zoom, undo/redo, and portable `.timeline` projects.
- Native media playback for a responsive preview; export uses a separate deterministic offline rendering path.
- WebCodecs MP4/WebM composition with shared preview/export geometry, audio mixing, captions, overlays, effects, and MediaRecorder fallback.
- Installable PWA with a cached app shell and multilingual UI.

## Agent Skill

The repository includes [`edit-timeline-studio`](skills/edit-timeline-studio/SKILL.md), a Codex-compatible Skill for planning, executing, and verifying editable video timelines.

It helps an agent:

- inspect media and preserve the user's editing brief;
- describe reversible edits with stable clip IDs and explicit timestamps;
- operate the hosted or local editor through the browser compatibility path;
- validate declarative edit plans with `skills/edit-timeline-studio/scripts/validate_edit_plan.mjs`;
- verify track placement, transitions, captions, overlays, audible audio, and final export artifacts;
- keep the editable `.timeline` project as the source of truth instead of returning only an opaque render.

The current Skill is honest about its boundary: browser-driven editing is available today, while the versioned headless command runner described in its command contract is the next automation layer.

## Quick start

Requirements: Node.js 20+ and a modern Chromium browser. WebGPU is recommended for the heaviest AI workflows.

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run dev
```

Open the local URL printed by Vite. The first AI run may download model files; later runs reuse the browser cache.

## Validate and build

```bash
npm test
npm run build
npm run preview
```

Run the complete repository check with:

```bash
npm run check
```

## Deploy

The included [`netlify.toml`](netlify.toml) builds with `npm run build`, publishes `dist`, enables the cross-origin isolation headers required by browser AI/media workers, and provides the SPA fallback.

```bash
npx netlify-cli deploy --prod --dir=dist
```

## License

[MIT](LICENSE)
