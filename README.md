# ai-video-editor

A browser-first AI video editor for image/video timelines, AI voiceover generation, captions, background music, and MP4/WebM export. The current prototype is inspired by modern dark timeline editors such as CapCut, but focuses on fully client-side AI voiceover workflows.

中文简介：这是一个 Web 端 AI 视频编辑器原型，支持本地上传图片/视频/音频、时间轴剪辑、字幕、AI 配音、背景音乐、多语言界面和浏览器内导出。

## Live Demo

- Production: https://web-player-ai-voice-editor.netlify.app

## What It Can Do

- Upload local images, videos, and audio files.
- Drag assets from the media library into timeline tracks.
- Arrange and resize visual clips on the image/video track.
- Preview a project even before generating voiceover audio.
- Generate AI voiceover from typed scripts.
- Align generated audio, captions, and visual clips on the timeline.
- Edit captions by dragging, hiding, deleting, and changing placement/size.
- Add video source audio and separate it onto its own track.
- Add background music on a dedicated music track.
- Use multi-track timeline controls: visibility, lock, delete, duplicate, split, zoom, snap, and reorder.
- Apply filters, effects, stickers, and transition presets.
- Export MP4 when browser support is available, with WebM fallback.
- Show export progress during local rendering.
- Persist language selection in `localStorage`.

## AI Features

Current AI capabilities are designed to run in the browser as much as possible:

- Text-to-speech with ONNX/browser engines.
- Chinese voiceover via Piper/VITS browser ONNX models.
- English voice options via Kokoro 82M ONNX.
- Lightweight voice preview and history restore.
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
- Voice cloning or custom speaker adaptation, with clear consent and privacy controls.
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
- Netlify deployment

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

This project is configured for Netlify:

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

## 中文说明

### 当前能力

- 本地上传图片、视频、音频素材。
- 素材库九宫格展示，并支持拖拽到对应轨道。
- 图片/视频轨道支持多片段、拖拽排序、缩放时长、删除和切分。
- 配音轨、视频原声轨、背景音乐轨独立管理。
- 无需先生成配音，也可以播放图片/视频时间线预览。
- AI 配音支持中文 Piper/VITS ONNX 和英文 Kokoro ONNX 方向。
- 字幕可编辑、可拖动、可隐藏、可删除，并随音频时长对齐。
- 支持多语言首屏选择，并自动保存到本地。
- 支持浏览器端 MP4/WebM 导出，并显示导出进度。

### 后续 AI 方向

- 自动识别视频语音并生成字幕。
- 字幕翻译和多语言配音。
- AI 文案生成、改写、风格化。
- 声音克隆和多角色配音。
- 根据语音自动对齐图片、字幕和节奏点。
- 视频场景检测、长视频高光提取。
- 背景音乐推荐、节拍匹配、音频增强。
- 图片/视频画质增强、抠图、主体分割。

## License

Prototype project. Add a license before public production use.
