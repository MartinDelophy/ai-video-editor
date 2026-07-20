# Timeline Studio — KI-Videoeditor im Browser

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | **Deutsch** | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

Timeline Studio ist ein lokaler KI-Videoeditor für den Browser. Er verbindet eine mehrspurige Timeline im CapCut-Stil mit KI-Sprachausgabe, automatischen Untertiteln, Bildanalyse, sprechenden Avataren und deterministischem Offline-Export.

[Editor öffnen](https://video-editor.ai-creator.top/) · [Demo ansehen](https://youtu.be/mUXduGpBmwE) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Timeline-Studio-Editor](docs/screenshots/editor-timeline.png)

## Hauptfunktionen

- Mehrsprachige Sprachausgabe mit Piper/VITS ONNX und Kokoro 82M.
- Automatische Untertitel mit Whisper small q8 ONNX.
- Intelligenter Bildausschnitt mit YOLOS tiny und MODNet.
- Gesangs-/Musiktrennung und Avatare mit JoyVASA und LivePortrait.
- Mehrspurbearbeitung mit Overlays, Masken, Filtern, Animationen und Keyframes.
- MP4/WebM-Export im Browser mit WebCodecs und Audiomischung.
- Installierbare PWA, lokaler Modellcache und `.timeline`-Projektdateien.

## Schnellstart

Benötigt Node.js 20+ und einen modernen Chromium-Browser. WebGPU wird empfohlen.

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run dev
```

## Prüfung

```bash
npm test
npm run build
npm run check
```

## Lizenz

[MIT](LICENSE)

