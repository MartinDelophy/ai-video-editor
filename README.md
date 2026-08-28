# Timeline Studio — Browser AI Video Editor

**English** | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![Live Demo](https://img.shields.io/badge/Live_Demo-Timeline_Studio-35ead9?style=flat-square)](https://video-editor.ai-creator.top/)
[![MIT License](https://img.shields.io/github/license/MartinDelophy/ai-video-editor?style=flat-square)](LICENSE)
[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)
<a href="https://toolindex.net/tools/timeline-studio?ref=badge" target="_blank" rel="noopener">
  <img src="https://toolindex.net/badge/timeline-studio/small.svg?theme=dark" alt="Timeline Studio - Listed on Tool Index" width="130" height="30" />
</a>

## Responsible use of deep synthesis

This tool uses deep-synthesis technology and is intended solely for technical research and learning.

Users must ensure that they:

- use only facial images or videos of themselves or people who have provided lawful authorization;
- do not create or distribute any illegal, infringing, false, or misleading content;
- do not present generated content as authentic footage or impersonate another person without their consent.

Users are solely responsible for any legal liability arising from violations of these requirements.

## Project updates

- **August 28, 2026 — High-fidelity video timeline preparation:** newly uploaded videos now remain in a visible preparing state while metadata and real-PTS thumbnails are decoded, preventing stretched placeholder blocks. Timeline filmstrips use sharper 180px source frames, readable zoom-aware density, exact source-time mapping beneath the playhead, and centered fill crops for portrait footage without black bars.
- **August 28, 2026 — Live Chrome built-in model download progress:** Auto Edit now reports the visual-understanding and caption-translation models separately with their real Chrome progress, completion state, and visible attempt count. If Chrome emits no progress for 45 seconds, the UI shows a clear stalled state and a user-activated Retry download action so Chrome can reuse any partial download state without losing the required click activation.
- **August 27, 2026 — Precision timeline editing:** added source-safe Slip for video clips, three-clip Slide with synchronized neighboring trims, and edit-point selection with frame-level arrow-key rolling adjustments. All modes preserve the gapless main visual sequence, respect track locks and source-media limits, provide live drag feedback, and are localized in all 11 interface languages. Portrait and 9:16 timeline thumbnails now use a centered fill crop so thumbnail cells never show letterbox or pillarbox bars.
- **August 26, 2026 — Lock-aware ripple editing:** added an explicit timeline-toolbar ripple mode. Dragging media over the main track now opens a duration-sized insertion slot and moves following clips plus their transition junctions before drop. Main clips now have leading rolling-boundary handles, while picture-in-picture drops preview their true duration and pointer time on the targeted lane. Main-visual insertion, duplication, deletion, and duration changes shift eligible timed clips by the exact edit delta, preserve active caption/audio links, derive linked source audio from the visual sequence, and leave locked tracks untouched.
- **August 26, 2026 — Portable visual splits:** fixed Agent `visual.split` projects so both contiguous clips retain their archived source media after reopening, preserving the full video and embedded source audio through browser export.

See the public [Roadmap](ROADMAP.md) for planned work, [Releases](https://github.com/MartinDelophy/ai-video-editor/releases) for shipped changes, and [Issues](https://github.com/MartinDelophy/ai-video-editor/issues) for focused tasks and bugs.

## What can it produce?

Explore reproducible before/after examples and editing recipes:

→ [AI Video Editing Skills Handbook](https://github.com/MartinDelophy/timeline-studio-handbook)

<p align="center">
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/daily?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/weekly?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
</p>

Timeline Studio is a local-first AI video editor that runs in the browser. It combines a CapCut-style multi-track timeline with WebGPU AI music and repair, multilingual voiceovers, automatic captions, talking-avatar generation, and deterministic offline export.

[Open the editor](https://video-editor.ai-creator.top/) · [Watch on YouTube](https://youtu.be/bqKhpPPa-qo) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

## Video demo

### Auto Edit

Visual analysis, keyframes, captions, and export.

https://github.com/user-attachments/assets/e8327caa-429e-40ff-a7fe-a59e6cf7a464

### AI Repair

Timed watermark removal with before/after review.

https://github.com/user-attachments/assets/aea9f5b4-c720-4b0c-9067-5ec124eef982

### AI Voiceover

https://github.com/user-attachments/assets/304a744e-d620-4380-9c17-19af3726f5a4

![Timeline Studio editor](docs/screenshots/editor-timeline.png)

## AI capabilities

- **Multilingual voiceover:** Chinese and mixed Chinese/English Hojo TTS Light 80M FP16 reference voices (晴岚 and 若溪), with autoregressive generation on WebGPU and stable waveform decoding on WASM; English Kokoro 82M; and browser Piper voices for German, Spanish, French, Italian, and Brazilian Portuguese.
- **Local AI music:** Stable Audio 3 Small Q4 ONNX runs through WebGPU with translated free-form prompts, 30/60/90/120-second choices, waveform-aware long-track looping, persistent model caching, and automatic insertion into My Assets.
- **Automatic captions:** Whisper small q8 ONNX with waveform-aware timing and conservative Chinese recognition cleanup.
- **Smart framing:** YOLOS tiny subject detection and MODNet portrait matting for smart crop, caption avoidance, and background removal across images and complete videos.
- **AI Repair:** browser-local MI-GAN watermark/object removal with multiple timed repair regions, plus NanoVSR 644K WebGPU 4× restoration for images and videos with synchronized before/after comparison.
- **AI vocal separation:** isolate vocals and place the instrumental stem on the music track without leaving the browser workflow.
- **Digital human:** JoyVASA audio-to-motion and LivePortrait neural rendering with WebGPU, 256px preview and 512px quality paths.
- **Local-first inference:** large models are lazy-loaded, revision-pinned, and cached by the service worker; supported workflows run without uploading project media to an editing backend.

## Resilient model delivery

Browser AI models are mirrored on both Hugging Face and ModelScope. Timeline Studio uses ModelScope first for Chinese interfaces and domestic sessions, uses Hugging Face first elsewhere, remembers the first working source for the current runtime, and automatically falls back to the other source when needed. Cache identities are shared across both providers, so switching routes does not download the same revision twice.

- Stable Audio: [Hugging Face](https://huggingface.co/haixin/stable-audio-3-small-music-onnx) · [ModelScope](https://www.modelscope.cn/models/martindelophy/stable-audio-3-small-music-onnx/files?version=main)
- Voice models: [Hugging Face](https://huggingface.co/haixin/timeline-studio-voice-models/tree/074a57bc4dac9c58568b031898ea79da6f36b282) · [ModelScope](https://www.modelscope.cn/models/martindelophy/timeline-studio-voice-models/files?version=9cb5ab964c014b182701153bd00f7a2202f5dce8) (mixed upstream licenses; see the repository model card)
- Timeline Studio ONNX models: [Hugging Face](https://huggingface.co/haixin/timeline-studio-onnx-models) · [ModelScope](https://www.modelscope.cn/models/martindelophy/timeline-studio-onnx-models/files?version=main)
- Depth Anything V2 Small Q4F16: [Hugging Face](https://huggingface.co/haixin/timeline-studio-onnx-models/tree/a0806c6fb9484894dcb78df523156d244461515d/depth-anything-v2-small) · [ModelScope](https://www.modelscope.cn/models/martindelophy/timeline-studio-onnx-models/files?version=4cc757f80330e22cb8f82b628c53ceca6307fd12&subpath=depth-anything-v2-small) (Apache-2.0)
- Vocal remover: [Hugging Face](https://huggingface.co/haixin/timeline-studio-vocal-remover) · [ModelScope](https://www.modelscope.cn/models/martindelophy/timeline-studio-vocal-remover/files?version=main)

## Editing and export

- Contiguous main Visuals track plus timed picture-in-picture overlays.
- Direct canvas selection, movement, proportional resize, rotation, masks, filters, effects, animation, speed, and explicit keyframes, plus desktop four-way color grading with fully keyframeable temperature, tint, saturation, hue, wheel saturation, and luminance controls.
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

To install the tested release instead of following the latest release, add `--pin v1.0.0`. Preview the Skill before installing with:

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
- Read the [contribution guide](CONTRIBUTING.md) for setup, validation, and first-contribution guidance.
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

Timeline Studio's original source code is licensed under the [MIT License](LICENSE).

The MIT License does **not** automatically apply to third-party models, model
weights, datasets, fonts, stock media, or other bundled or remotely downloaded
assets. Those materials remain subject to their respective upstream licenses
and terms, regardless of where they are hosted or how they are downloaded or
integrated. Review [MODEL_LICENSES.md](MODEL_LICENSES.md) before redistribution
or commercial use.
