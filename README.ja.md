# Timeline Studio — ブラウザ AI 動画エディター

[English](README.md) | [中文](README.zh-CN.md) | **日本語** | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## ディープシンセシス技術の責任ある利用

本ツールはディープシンセシス技術を使用しており、技術研究および学習のみを目的としています。

利用者は、以下の事項を必ず遵守してください。

- 本人、または適法な許可を得た人物の顔画像・動画のみを使用すること。
- 違法、権利侵害、虚偽、または誤解を招くコンテンツを作成・拡散しないこと。
- 生成コンテンツを実際の映像として提示せず、本人の同意なく他人になりすまさないこと。

上記の要件に違反したことにより生じる一切の法的責任は、利用者自身が負うものとします。

## プロジェクト更新

- **2026年9月3日 — イタリア語・インドネシア語UI：** Timeline Studio は13のインターフェース言語に対応しました。両言語の編集画面と実行時メッセージをすべて追加し、字幕、タイムライン、Smart Frame、AI音楽、ベクターデザイン、生成プラグインの用語を校正。対応フォントとWhisper字幕認識も利用できます。
- **2026年9月1日 — 同期を守る動画の高速準備：** ローカル／オンライン読み込みは、120～240枚のサムネイルではなく、端末性能に応じた少数の実PTSシードフレームだけを待つため、1枚のポスターを引き伸ばさず早く編集可能になります。その後は表示範囲を優先し、範囲外を中点分割順で補完します。サムネイルは必ず対象ソース時刻以前の最後のフレームを使い、再生ヘッドはライブプレビューに追従し、スクラブ中はバックグラウンド更新を停止します。
- **2026年8月29日 — ローカル生成コネクター：** ComfyUI と Stable Diffusion WebUI/Forge を別々のプラグインとして追加しました。ComfyUI はループバック上の API Format ワークフローを実行して画像・動画出力を取り込み、WebUI は実際の txt2img/img2img API を使用します。完了した素材は My assets に自動保存され、汎用 Hugging Face Spaces 埋め込みは削除されました。
- **2026年8月28日 — ブラウザ内スマートノイズ除去：** 映像 → AI修復に DRUNet のフレーム比較、4段階の強度、元音声保持、可逆適用を追加しました。全体処理は元フレームレートの WebCodecs ストリームとなり、次フレームのデコードと推論を重ね、WebGPU Session と Canvas・Tensor・画素バッファを継続再利用し、変化の少ない隣接フレームではノイズ除去残差を慎重に再利用します。PNG/FFmpeg の互換フォールバックも維持し、デスクトップとモバイルの11言語で利用できます。
- **2026年8月28日 — 高精細な動画タイムライン準備：** 新規動画はメタデータと実 PTS サムネイルの解析中に明確な読み込み状態を表示し、単一フレームが引き伸ばされる仮表示を防ぎます。180px の高精細ソースフレーム、ズーム連動の読みやすい密度、再生ヘッド下の正確なソース時間対応、黒帯のない縦動画の中央クロップを採用しました。

計画中の作業は [Roadmap](ROADMAP.md)、公開済みの変更は [Releases](https://github.com/MartinDelophy/ai-video-editor/releases)、個別タスクは [Issues](https://github.com/MartinDelophy/ai-video-editor/issues) を参照してください。

## 何を制作できますか？

再現可能なビフォー・アフター例と編集レシピをご覧ください：

→ [AI Video Editing Skills Handbook](https://github.com/MartinDelophy/timeline-studio-handbook)

<p align="center">
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/daily?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/weekly?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
</p>

Timeline Studio はブラウザで動作するローカルファーストの AI 動画エディターです。CapCut のようなマルチトラックタイムラインに、AI 音声、字幕自動生成、画像解析、トーキングアバター、決定論的なオフライン書き出しを統合しています。

[エディターを開く](https://video-editor.ai-creator.top/) · [デモを見る](https://www.youtube.com/watch?v=chdRPG2ndMs) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Timeline Studio エディター](docs/screenshots/editor-timeline.png)

## 主な機能

- Piper/VITS ONNX と Kokoro 82M による多言語音声。
- Stable Audio 3 Small Q4 ONNX と WebGPU によるローカル AI 音楽生成。自由入力プロンプトの翻訳、30/60/90/120 秒、波形解析による長尺ループ、モデルの永続キャッシュ、マイ素材への自動追加に対応。
- Whisper small q8 ONNX による字幕自動生成。
- YOLOS tiny と MODNet によるスマートフレーミング。
- ボーカル分離、JoyVASA と LivePortrait によるアバター生成。
- オーバーレイ、マスク、フィルター、アニメーション、キーフレーム対応のマルチトラック編集。
- WebCodecs と音声ミックスを使ったブラウザ内 MP4/WebM 書き出し。
- インストール可能な PWA、モデルのローカルキャッシュ、`.timeline` プロジェクト。

## AI 音声デモ

https://github.com/user-attachments/assets/304a744e-d620-4380-9c17-19af3726f5a4

## Agent Skill

このリポジトリには、編集可能な動画タイムラインの計画、操作、検証を行う [`edit-timeline-studio`](skills/edit-timeline-studio/SKILL.md) Agent Skill が含まれています。GitHub CLI 2.90.0 以降でインストールできます。

[skills.sh](https://skills.sh/MartinDelophy/ai-video-editor) からインストールする場合は Node.js 22.20.0 以降が必要です。

```bash
npx skills add MartinDelophy/ai-video-editor --skill edit-timeline-studio
```

```bash
# Claude Code
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent claude-code --scope user

# Codex
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent codex --scope user
```

検証済みのリリースに固定するには `--pin v1.0.0` を追加します。インストール前の確認には `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio` を使用してください。

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
npm run build
npm run check
```

## サポートとフィードバック

このプロジェクトが役に立ったら、ぜひ ⭐ Star をお願いします。問題が発生した場合は、[Issue を作成してください](https://github.com/MartinDelophy/ai-video-editor/issues)。

質問やフィードバックの共有、ほかのユーザーやコントリビューターとの交流には、[Discord コミュニティ](https://discord.gg/uq2uvUTBr)へご参加ください。

## ライセンス

[MIT](LICENSE)
