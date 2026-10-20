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

- **2026-10-19** — 無限キャンバスとストーリーボードで、ノード・接続・指示・素材を含むプロジェクトの保存、読み込み、Annaクラウドへのバックアップとコピー復元に対応。両画面のトラックパッド操作も統一しました。 AI透かし除去の比較プレビューが終了後に再生できない問題を修正しました。
- **2026-10-18** — 再生に同期するキャラクター動作・カメラトラックと、時間編集・クリック移動に対応した脚本カルーセルを追加。 白模の対話にChatCutを再利用し、会話履歴、下書き復元、オブジェクト参照、変更確認を統一。 ストーリーボードの既定モデルを GPT Image 2（fal）に変更。会話モデルのルーティングと長い物語の文脈保持を修正し、実際のモデル切り替え応答を確認しました。開始・終了フレーム動画は Anna の API 拡張待ちです。仕様案: docs/storyboard-anna-video-contract.md。 ワークフローの読み込みエラーを編集画面から分離し、再試行・戻る操作とAnna草稿更新時の互換リソース保持に対応。 無限キャンバスの出力ポートに方向付き接続線、互換入力の強調表示、次ノードの作成と接続を一度に取り消せるメニューを追加しました。 キャンバスのチャットで @ によるノード検索と参照に対応し、削除可能なタグと明示的なノード ID を使用します。
- **2026-10-17** — 型付きノードと接続、確認後に適用するAnnaの編集、実際の生成コネクター、音声とローカル音楽、結果の履歴、動画タスクの再照会、アカウント・プロジェクト別のブラウザー復元を備えた無限キャンバスを追加。生成素材はマイ素材に保存され、明示的な操作時のみ生成します。 2枚の内蔵参考画像は生成時のみ添付され、素材一覧・@候補・キャンバスには表示されません。
- **2026-10-17** — ブラウザー内の音声処理に RNNoise、DeepFilterNet3、EQ、コンプレッサー、ゲイン、リミッターを追加。試聴・適用・原音復元に対応し、原音パネル、字幕の整列とキーワード強調、多言語フォント、連動編集、動画境界の再生を改善。 Anna に音声カタログ対応のクラウド読み上げと ChatCut 音声入力を追加。素材に保存され、ホストとマイクの権限が必要です。 Anna の音声を既存の音声カードと生成操作に統合し、3 種類の仮想アバターを追加。 Anna 版の自動字幕と ChatCut 転写を Anna 音声認識に統一し、音声・映像の関連付けを維持。 ChatCut に字幕スタイル、連動移動、ステッカー編集、空間音響、ローカル音声処理を追加。Anna のナレーションは優先 TTS を使用。 字幕ごとに選択文字を強調し、色の設定と消去ができます。 Anna 音声カードで対応する公式サンプルを直接再生でき、字幕操作の重複も解消しました。 Anna の上部音声アシスタントで機能確認、パネル移動、ChatCut 編集が可能になり、ミュート、中断、メディア生成確認に対応しました。 自動字幕は既定ですべての動画クリップを各時間位置で処理し、個別選択も可能です。 原音・音声・音楽クリップに、既定でオフの自動音声回避を追加。ローカルSilero検出と共通のプレビュー・書き出し音量カーブを使用します。 Anna音声通話は上部の波形バーに統合され、ミュート・中断・終了を保ち、画面を覆いません。 動画の切り替えでは次の対象フレームが表示されるまで直前のフレームを保持し、空白のちらつきを防ぎます。 自動音量調整の読み込み状況と実際の音量カーブをタイムラインに表示します。 3段階の音声強調、元音声との比較と復元を追加しました。 自動音量調整は読み込み済みモデルを再利用し、0%から進捗を表示します。 挨拶と明確な画面操作はローカルで即応し、複雑な編集は従来の検証を保持します。 ワークフローにブラウザー3Dブロックアウトの試作を追加。変形、カメラショット、再生、取り消し、確認後のAnna編集に対応し、人物音声は未対応。 ストーリーボードに ChatCut 入力、@素材参照、初期状態が空の移動可能ノードキャンバス、対話モデル設定、アカウント・プロジェクト別のブラウザ復元を追加。16コマは1枚の生成画像です。終了フレーム指定は Anna API の対応待ちです。
- **2026-10-12** — 長い動画の再生中は背景のサムネイル補完を停止し、再生ヘッドの正確なフレームを JPEG 変換なしで描画します。再開時は最新のシークを優先。AAC 音声は再エンコードや動画全体の WASM コピーなしで抽出し、映像効果と書き出し設定を維持します。 書き出しでは対応するハードウェアエンコーダーを優先し、条件を満たす等倍映像フレームを直接合成します。変形やエフェクトでは従来の描画経路を維持します。 音声エンコードと次フレームの合成を映像の送信待ちと並行して進め、キューの上限を維持します。

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

検証済みのリリースに固定するには `--pin v1.0.8` を追加します。インストール前の確認には `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio` を使用してください。

## ロードマップ

- **現在：** 決定論的オフライン書き出しの安定化、タイムライン編集の信頼性向上、ブラウザ E2E テストの拡充。
- **次：** ヘッドレス描画とブラウザ出力の対応範囲を広げ、確認可能な WebMCP 編集コマンドと共有しやすいプロジェクトテンプレートを充実させます。
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
