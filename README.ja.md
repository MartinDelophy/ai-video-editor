# Timeline Studio — ブラウザ AI 動画エディター

[English](README.md) | [中文](README.zh-CN.md) | **日本語** | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## Anna で広がる動画制作

Anna 版では、AI による編集支援とプロジェクトの継続を利用できます。

- Anna に編集内容を伝え、要望と素材メタデータに基づく計画を確認してから、対応するクリップの並べ替えや通常速度（1×）での簡単な動画トリミングを適用できます。
- プロジェクトと素材は Anna のクラウドに自動保存され、同じアカウントなら別のブラウザーでも再開できます。ローカルのチェックポイントも保存できます。
- 編集可能なマルチトラックタイムラインで調整し、AI ナレーションや手動字幕を追加して、ブラウザーで利用可能なエンコーダーで MP4 を書き出せます。

現在はデスクトップ向けプレビュー版です。計画は映像や音声の解析を行わず、ローカル AI 機能は Anna コンテナの対応状況に依存します。

→ [Anna で Timeline Studio を体験](https://anna.partners/store/@martindelophy/timeline-studio)

## ディープシンセシス技術の責任ある利用

本ツールはディープシンセシス技術を使用しており、技術研究および学習のみを目的としています。

利用者は、以下の事項を必ず遵守してください。

- 本人、または適法な許可を得た人物の顔画像・動画のみを使用すること。
- 違法、権利侵害、虚偽、または誤解を招くコンテンツを作成・拡散しないこと。
- 生成コンテンツを実際の映像として提示せず、本人の同意なく他人になりすまさないこと。

上記の要件に違反したことにより生じる一切の法的責任は、利用者自身が負うものとします。

## プロジェクト更新

- **2026-10-10** — `/paypal` にサンドボックス試作を追加。固定見積もり、サーバー注文、支払い確認後に編集アシスタントへ。認証情報と実 AI 検証は未完了、納品は手動です。
- **2026-10-10** — `/nebius` に大会プレビューを追加。サーバー側 Token Factory で NVIDIA Nemotron に対応し、メタデータのみ送信して編集を確認します。実推論には API キーと無料クレジットが必要です。
- **2026-10-07** — 映像クリップの最短時間を0.05秒に変更し、0.45秒などの短い冒頭でカットできない問題を修正しました。トリミング、速度変更、プロジェクト復元も同じ下限を使用します。 大画面プレビューの開閉時に映像が停止する問題を修正。再作成された動画要素のソース時刻、再生状態、フレームコールバックを復元します。
- **2026-10-05** — 深度サンプリングを高速 8、標準 16、高精細 24 枚/秒に変更しました。高速・標準は RIFE で 24fps に補間し、サンプリングとエンコードを上限付きパイプラインで並行処理します。原音を保持し、生成失敗後も完了済みの分析を再利用できます。 固定サンプリング時刻と RIFE セッション・画素・テンソルの再利用により、精度、解像度、サンプル数を下げずに不要な補間を削減します。 RIFE は自社の固定版 Hugging Face・ModelScope ミラーを使用し、ハッシュ検証、自動切替、共通キャッシュに対応します。
- **2026-10-04** — 深度マップ — 動画をグレースケール深度に変換。近くは明るく、遠くは暗く。 深度解析はフレーム取得と推論を並行し、PNG生成をWorkerに移し、画面更新頻度を抑えます。 深度マップのプレビューと書き出しにフレーム間補間を追加し、トリミング・速度変更時のソース時刻を修正。デコード画像を再利用します。 深度マップ動画をマイ素材に保存しました. 生成した深度動画は元のクリップを置き換え、素材は保持します。画面シーケンスから再生時間を算出し、削除後の再挿入で0秒になる問題を修正。 深度動画にもトリミング・速度に同期した元の音声を収録。元動画とその音声も保持します。 深度に基づく編集可能な照明、球形ライト位置、長押し比較、タイムライン操作後のプレビュー更新を追加。
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
