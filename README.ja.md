# Timeline Studio — ブラウザ AI 動画エディター

[English](README.md) | [中文](README.zh-CN.md) | **日本語** | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

Timeline Studio はブラウザで動作するローカルファーストの AI 動画エディターです。CapCut のようなマルチトラックタイムラインに、AI 音声、字幕自動生成、画像解析、トーキングアバター、決定論的なオフライン書き出しを統合しています。

[エディターを開く](https://video-editor.ai-creator.top/) · [デモを見る](https://www.youtube.com/watch?v=chdRPG2ndMs) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Timeline Studio エディター](docs/screenshots/editor-timeline.png)

## 主な機能

- Piper/VITS ONNX と Kokoro 82M による多言語音声。
- Whisper small q8 ONNX による字幕自動生成。
- YOLOS tiny と MODNet によるスマートフレーミング。
- ボーカル分離、JoyVASA と LivePortrait によるアバター生成。
- オーバーレイ、マスク、フィルター、アニメーション、キーフレーム対応のマルチトラック編集。
- WebCodecs と音声ミックスを使ったブラウザ内 MP4/WebM 書き出し。
- インストール可能な PWA、モデルのローカルキャッシュ、`.timeline` プロジェクト。

## ロードマップ

- **現在：** 決定論的オフライン書き出しの安定化、タイムライン編集の信頼性向上、ブラウザ E2E テストの拡充。
- **次：** エージェント駆動編集向けのバージョン管理されたヘッドレスコマンドランナーと、共有しやすい再利用可能なプロジェクトテンプレート。
- **将来：** 共同レビュー、プラグイン拡張基盤、ローカルで検証済みの AI モデルの追加。

優先順位は [GitHub Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions) で話し合います。

## コントリビューター募集

ブラウザメディア、WebCodecs、WebGPU/ONNX、タイムライン UX、翻訳、テスト、ドキュメントへの協力を歓迎します。再現可能な不具合は [Issues](https://github.com/MartinDelophy/ai-video-editor/issues) へ、提案や作品は [Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions) へお寄せください。小さな修正、テスト、翻訳、サンプルも歓迎します。

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

## ライセンス

[MIT](LICENSE)
