# Timeline Studio — ブラウザ AI 動画エディター

[English](README.md) | [中文](README.zh-CN.md) | **日本語** | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

Timeline Studio はブラウザで動作するローカルファーストの AI 動画エディターです。CapCut のようなマルチトラックタイムラインに、AI 音声、字幕自動生成、画像解析、トーキングアバター、決定論的なオフライン書き出しを統合しています。

[エディターを開く](https://video-editor.ai-creator.top/) · [デモを見る](https://youtu.be/mUXduGpBmwE) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Timeline Studio エディター](docs/screenshots/editor-timeline.png)

## 主な機能

- Piper/VITS ONNX と Kokoro 82M による多言語音声。
- Whisper small q8 ONNX による字幕自動生成。
- YOLOS tiny と MODNet によるスマートフレーミング。
- ボーカル分離、JoyVASA と LivePortrait によるアバター生成。
- オーバーレイ、マスク、フィルター、アニメーション、キーフレーム対応のマルチトラック編集。
- WebCodecs と音声ミックスを使ったブラウザ内 MP4/WebM 書き出し。
- インストール可能な PWA、モデルのローカルキャッシュ、`.timeline` プロジェクト。

## クイックスタート

Node.js 20+ と最新の Chromium ブラウザが必要です。WebGPU を推奨します。

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run dev
```

## 検証

```bash
npm test
npm run build
npm run check
```

## サポートとフィードバック

このプロジェクトが役に立ったら、ぜひ ⭐ Star をお願いします。問題が発生した場合は、[Issue を作成してください](https://github.com/MartinDelophy/ai-video-editor/issues)。

## ライセンス

[MIT](LICENSE)
