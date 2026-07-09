# ai-video-editor

Language: **English** | [中文](README.zh-CN.md)

A browser-first AI video editor for image/video timelines, AI voiceover generation, captions, source audio, background music, and MP4/WebM export. The current prototype is inspired by modern dark timeline editors such as CapCut, but focuses on client-side AI voiceover and lightweight video editing workflows.

## What It Can Do

- Upload local images, videos, and audio files.
- Display uploaded media in a compact grid-based asset library.
- Drag assets from the media library into matching timeline tracks.
- Arrange, reorder, split, delete, and resize visual clips on the image/video track.
- Preview a project even before generating voiceover audio.
- Generate AI voiceover from typed scripts.
- Align generated audio, captions, and visual clips on the timeline.
- Edit captions by dragging, hiding, deleting, and changing placement or size.
- Upload video and separate its original audio onto a dedicated source-audio track.
- Add background music on a dedicated music track.
- Use multi-track controls: visibility, lock, delete, duplicate, split, zoom, snap, and reorder.
- Apply filters, visual effects, stickers, and transition presets.
- Export MP4 when browser support is available, with WebM fallback.
- Show export progress during browser-side rendering.
- Persist language selection in `localStorage`.

## AI Features

Current AI capabilities are designed to run in the browser as much as possible:

- Text-to-speech with ONNX/browser engines.
- Chinese voiceover via Piper/VITS browser ONNX models.
- English voice options via Kokoro 82M ONNX.
- Lightweight voice preview and generation history restore.
- Script-to-caption timeline alignment based on generated audio duration.
- Browser voice recording for manually captured narration.
- Local waveform decoding for voiceover, source audio, and background music.

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

- Automatic speech recognition for uploaded videos and recorded narration.
- Auto subtitle generation and subtitle translation.
- AI script writing and rewrite modes for marketing, education, short video, and product demos.
- Voice cloning or custom speaker adaptation, with explicit consent and privacy controls.
- Multi-speaker dubbing and role-based dialogue generation.
- Smart alignment between narration, captions, images, and visual beats.
- AI scene detection for uploaded videos.
- Automatic highlight extraction from long videos.
- AI background music recommendation and beat matching.
- Noise reduction, loudness normalization, and vocal enhancement.
- AI image/video enhancement, background removal, and object segmentation.
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
  lib/
    media.js
    timeline.js
  i18n.js
  main.jsx
  styles.css
public/
  assets/
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

## Repository Hygiene

The following are intentionally excluded from git:

- `node_modules/`
- `dist/`
- `qa/`
- local downloads, screenshots, and generated QA media
- `.netlify/`
- local npm cache and machine-specific config
- local Codex/agent notes

## License

Prototype project. Add a license before public production use.
