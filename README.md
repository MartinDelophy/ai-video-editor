# Timeline Studio — Browser AI Video Editor

Language: **English** | [中文](README.zh-CN.md)

[![Live Demo](https://img.shields.io/badge/Live_Demo-Timeline_Studio-35ead9?style=flat-square)](https://video-editor.ai-creator.top/)
[![Hugging Face Space](https://img.shields.io/badge/%F0%9F%A4%97_Hugging_Face-Space-ffd21e?style=flat-square)](https://huggingface.co/spaces/haixin/timeline-studio)
[![GitHub stars](https://img.shields.io/github/stars/MartinDelophy/ai-video-editor?style=flat-square)](https://github.com/MartinDelophy/ai-video-editor/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/MartinDelophy/ai-video-editor?style=flat-square)](https://github.com/MartinDelophy/ai-video-editor/forks)
[![MIT License](https://img.shields.io/github/license/MartinDelophy/ai-video-editor?style=flat-square)](LICENSE)
[![Discord](https://img.shields.io/discord/1526147673290313768?label=Discord&logo=discord&style=flat-square)](https://discord.gg/uq2uvUTBr)

A local-first, browser-based AI video editor with ONNX voiceover generation, Whisper automatic captions, JoyVASA + LivePortrait talking avatars, multi-track timeline editing, and MP4/WebM export. Timeline Studio runs its core AI workflows directly in the browser and is inspired by modern editors such as CapCut.

## Demo Video

[Watch the AI video editor demo on YouTube](https://youtu.be/mUXduGpBmwE)

## Screenshots

### English editor workspace

![English editor workspace](docs/screenshots/editor-empty-en.png)

### Timeline editing and AI voiceover workspace

![Timeline editing and AI voiceover workspace](docs/screenshots/editor-timeline.png)

### Voiceover and caption alignment

![Voiceover and caption alignment](docs/screenshots/voice-caption-alignment.png)

### Export progress overlay

![Export progress overlay](docs/screenshots/export-progress.png)

## What It Can Do

- Upload local images, videos, and audio files.
- Display uploaded media in a compact grid-based asset library.
- Drag assets from the media library into matching timeline tracks.
- Arrange, reorder, split, delete, and resize visual clips on the image/video track.
- Preview a project even before generating voiceover audio.
- Generate AI voiceover from typed scripts.
- Insert every generated voiceover at the current playhead without replacing existing audio.
- Automatically create additional voiceover and caption lanes when clips overlap, then compact them again when overlaps are removed.
- Keep generated captions bound to their matching voiceover clip when moving, duplicating, or deleting it.
- Edit voiceover clip position, volume, fade-in, and fade-out from a dedicated context panel.
- Edit captions by dragging, hiding, deleting, and changing placement or size.
- Navigate a dynamic 30-minute default timeline that expands for longer projects and supports frame-level zoom.
- Upload video and separate its original audio onto a dedicated source-audio track.
- Add background music on a dedicated music track.
- Browse generated sticker packs in a 3x3 infinite-loading sticker panel.
- Drop stickers anywhere on the timeline to automatically create a sticker track under the image/video track.
- Move sticker segments on the timeline and render sticker overlays in preview/export.
- Use multi-track controls: visibility, lock, delete, duplicate, split, zoom, snap, and reorder.
- Apply filters, visual effects, stickers, and transition presets.
- Detect the primary subject in an image or scan a complete video into a timestamped YOLOS tiny subject track in a browser worker.
- Generate transparent portrait cutouts with MODNet; videos are pre-analyzed into a full-duration temporal mask track used by preview and export.
- Use normalized subject geometry for smart caption avoidance and subject-aware cropping across aspect ratios.
- Generate a talking portrait from a front-facing image and the current voiceover with the browser JoyVASA audio driver and LivePortrait neural renderer.
- Choose a mixed-FP16 256px fast-preview path or a mixed-FP16 512px quality path, with adaptive neural keyframes and WebM visual-track replacement.
- Export MP4 when browser support is available, with WebM fallback.
- Show export progress during browser-side rendering.
- Persist language selection in `localStorage`.

## Recent Prototype Updates

- Added timeline-native sticker overlays with generated PNG sticker assets, automatic sticker-track creation, movable sticker clips, and a cleaner scrollbar-free sticker picker.
- Added installable PWA metadata, app icons, service-worker app shell/model caching, and cached sticker assets for faster repeat sessions.
- Added browser-side automatic caption groundwork using Whisper ONNX workers, plus timeline snapping/alignment improvements for captions, source audio, and generated voiceover.
- Added lazy-loaded YOLOS tiny and MODNet vision workers with subject overlays, portrait matting, caption avoidance, and preview/export-consistent smart crop geometry.
- Added an end-to-end browser talking-avatar pipeline: JoyVASA audio-to-motion ONNX, LivePortrait WebGPU rendering, adaptive 1–2fps neural keyframes, safe frame holding at the output frame rate, and automatic visual-track replacement.
- Added playhead-based multi-voiceover insertion, automatic overlapping audio/caption lanes, linked caption movement, audio clip properties, and a dynamically expanding 30-minute timeline.
- Moved the 906MB avatar model bundle to the revision-pinned [Timeline Studio ONNX model repository](https://huggingface.co/haixin/timeline-studio-onnx-models/tree/a201b681c8f96672b5c3f624e32d4dc932f150af), keeping large model binaries out of this Git repository.

## AI Features

Current AI capabilities are designed to run in the browser as much as possible:

- Text-to-speech with ONNX/browser engines.
- Chinese voiceover via Piper/VITS browser ONNX models.
- English voice options via Kokoro 82M ONNX.
- Automatic caption generation with Whisper small q8 ONNX running through a browser WASM worker, waveform-aware timestamp snapping, and conservative Chinese homophone cleanup.
- Lightweight voice preview and generation history restore.
- Script-to-caption timeline alignment based on generated audio duration.
- Browser voice recording for manually captured narration.
- Local waveform decoding for voiceover, source audio, and background music.
- YOLOS tiny q8 ONNX subject detection and MODNet q8 ONNX portrait matting with revision-pinned, service-worker-cached model assets.
- JoyVASA and LivePortrait ONNX talking-avatar generation with WebGPU execution, mixed-FP16 generators, GPU feature reuse, parallel model-part downloads, and explicit GPU-session isolation between the two large pipelines.

Talking-avatar model files are loaded from Hugging Face at the immutable revision `a201b681c8f96672b5c3f624e32d4dc932f150af`. Generated keyframes are checked for non-finite or temporally anomalous output; a suspect frame is retried once and, if necessary, replaced with the previous valid frame instead of being encoded as a corrupted texture.

MODNet is portrait-oriented, while YOLOS tiny covers common COCO categories. Images support the full matting path. Videos are pre-analyzed across their full duration before export, then resolve timestamped YOLOS geometry and MODNet masks for preview, caption avoidance, smart crop, and every rendered export time instead of freezing the first-frame result. Long videos automatically use a wider temporal sampling interval to keep WASM inference and memory bounded.

## Multilingual UI

The editor includes a first-run language picker and stores the chosen language locally.

Currently included languages:

- Chinese
- English
- Japanese
- Korean
- Spanish
- French
- German
- Portuguese
- Thai
- Vietnamese

The language picker includes English guidance so non-Chinese users can understand the first screen.

## Future AI Roadmap

Planned or desirable AI capabilities:

- Subtitle translation and multi-language caption refinement.
- AI script writing and rewrite modes for marketing, education, short video, and product demos.
- Voice cloning or custom speaker adaptation, with explicit consent and privacy controls.
- Multi-speaker dubbing and role-based dialogue generation.
- Smart alignment between narration, captions, images, and visual beats.
- AI scene detection for uploaded videos.
- Automatic highlight extraction from long videos.
- AI background music recommendation and beat matching.
- Noise reduction, loudness normalization, and vocal enhancement.
- General-purpose product/animal segmentation and offline per-frame video background removal.
- Cloud-assisted model loading for larger models while keeping an offline/local-first mode.
- Batch export and template-based video generation.

## Tech Stack

- React 19
- Vite 6
- ONNX/browser TTS dependencies
- `@ffmpeg/ffmpeg` for browser-side media processing support
- Browser MediaRecorder/export pipeline
- Phosphor Icons
- Netlify deployment configuration

## Project Structure

```text
src/
  App.jsx
  components/
    PreviewStage.jsx
    Timeline.jsx
    Topbar.jsx
    VoicePanel.jsx
    panels.jsx
    ui.jsx
  config/
    editor.js
    models.js
    joyVasa.js
    livePortrait.js
  lib/
    asr.js
    media.js
    serviceWorker.js
    timeline.js
    timelineScale.js
    ttsText.js
    vision.js
    visualGeometry.js
  workers/
    joyvasa.worker.js
    liveportrait.worker.js
    vision.worker.js
  i18n.js
  main.jsx
  styles.css
public/
  assets/
    stickers/
  icons/
  manifest.webmanifest
  model-cache-sw.js
netlify.toml
```

## Local Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Deployment

This project includes Netlify configuration:

```bash
npm run build
npx netlify-cli deploy --prod --dir=dist
```

`netlify.toml` defines:

- build command: `npm run build`
- publish directory: `dist`
- SPA fallback redirect to `index.html`

## License

Released under the [MIT License](LICENSE). You may use, modify, and distribute this project with attribution.

## Community

Join the Discord community for questions, feedback, and project updates:

[Join the Timeline Studio Discord](https://discord.gg/uq2uvUTBr)

The current star count is updated live in the GitHub Stars badge at the top of this README.

[View current stargazers](https://github.com/MartinDelophy/ai-video-editor/stargazers) · [Star Timeline Studio](https://github.com/MartinDelophy/ai-video-editor)
