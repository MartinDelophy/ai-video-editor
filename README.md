# Timeline Studio — Browser AI Video Editor

**English** | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![Live Demo](https://img.shields.io/badge/Live_Demo-Timeline_Studio-35ead9?style=flat-square)](https://video-editor.ai-creator.top/)
[![GitHub release](https://img.shields.io/github/v/release/MartinDelophy/ai-video-editor?style=flat-square)](https://github.com/MartinDelophy/ai-video-editor/releases)
[![MIT License](https://img.shields.io/github/license/MartinDelophy/ai-video-editor?style=flat-square)](LICENSE)
[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)

Timeline Studio is a local-first AI video editor that runs in the browser. It combines a CapCut-style multi-track timeline with browser-side AI voiceovers, automatic captions, vision tools, talking-avatar generation, and deterministic offline export.

[Open the editor](https://video-editor.ai-creator.top/) · [Watch the demo](https://www.youtube.com/watch?v=chdRPG2ndMs) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

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

The repository includes the [AI Video Editing Skill for Codex, Claude Code, Copilot and Gemini CLI](skills/edit-timeline-studio/README.md), backed by [`edit-timeline-studio`](skills/edit-timeline-studio/SKILL.md) for planning, executing, and verifying editable video timelines.

It helps an agent:

- inspect media and preserve the user's editing brief;
- describe reversible edits with stable clip IDs and explicit timestamps;
- operate the hosted or local editor through the browser compatibility path;
- validate declarative edit plans with `skills/edit-timeline-studio/scripts/validate_edit_plan.mjs`;
- verify track placement, transitions, captions, overlays, audible audio, and final export artifacts;
- keep the editable `.timeline` project as the source of truth instead of returning only an opaque render.

The versioned headless command runner loads and inspects portable projects, validates revisioned JSON plans, applies supported operations transactionally, supports dry runs and idempotent operation IDs, and writes a new `.timeline` archive without rewriting its media files. It also renders the documented portable Visuals + Voiceover + Music subset to a verified H.264/AAC MP4. Browser control remains the compatibility path for richer compositions and operations that are not in the command registry yet.

```bash
npm run agent -- project.inspect /absolute/path/project.timeline
npm run agent -- track.inspect /absolute/path/project.timeline visuals
npm run agent -- clip.inspect /absolute/path/project.timeline visual-123
npm run agent -- transcript.inspect /absolute/path/project.timeline voice-123
npm run agent -- project.diff /absolute/path/edit-plan.json
npm run agent -- project.run /absolute/path/edit-plan.json
npm run agent -- project.render /absolute/path/render-request.json
```

The legacy `inspect` and `run` aliases remain available. The write registry supports ffprobe-backed, hashed visual/audio import to Visuals, Music, or the portable Voiceover slot, plus transactional timed edits, captions, source-accurate Visuals/Overlays, transitions, validated properties, track state, and ratio changes. Read commands return project, track, clip, transcript, media-inventory, and field-level predicted diffs. See the [command contract](skills/edit-timeline-studio/references/command-contract.md) for the plan envelope.

Install through the public [skills.sh](https://skills.sh/MartinDelophy/ai-video-editor) directory (the current CLI requires Node.js 22.20.0 or later):

```bash
npx skills add MartinDelophy/ai-video-editor --skill edit-timeline-studio
```

Or install it with GitHub CLI 2.90.0 or later:

```bash
# Claude Code
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent claude-code --scope user

# Codex
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent codex --scope user
```

To install the tested release instead of following the latest release, add `--pin v0.6.1`. Preview the Skill before installing with:

```bash
gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio
```

## Roadmap

- **Now:** expand the versioned command registry, harden deterministic offline export, and improve timeline editing reliability.
- **Next:** expand headless render parity and expose the shared command engine through MCP.
- **Later:** add collaborative review workflows, a plugin extension surface, and more locally verified AI models.

Roadmap priorities are shaped in [GitHub Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions). Feature requests and real-world workflow feedback are welcome.

## Help wanted

Timeline Studio is looking for contributors interested in browser media, WebCodecs, WebGPU/ONNX, timeline UX, localization, testing, and documentation.

- Try the [live editor](https://video-editor.ai-creator.top/) and report reproducible bugs in [Issues](https://github.com/MartinDelophy/ai-video-editor/issues).
- Join [Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions) to propose features, share projects, or help prioritize the roadmap.
- Contributions of focused fixes, tests, translations, documentation, and example projects are especially useful.

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

## Support and feedback

If this project helps you, please consider giving it a ⭐ Star. If you encounter a problem, please [open an Issue](https://github.com/MartinDelophy/ai-video-editor/issues).

Join our [Discord community](https://discord.gg/uq2uvUTBr) to ask questions, share feedback, and connect with other users and contributors.

## License

[MIT](LICENSE)
