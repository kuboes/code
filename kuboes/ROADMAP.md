# kuboes/code 全部入りロードマップ

方針: Claude Code の土台は活かす。Hermes / OpenClaw / Codebuff の機能は「コードの丸写し」ではなく、
公開されている機能の考え方だけ借りて、kuboes/code に合う形で作り直す。
日本語機能はなし。WebUI はいったんなし。autopilot は必須。

## フェーズ0: 土台確認（済み）
- kuboes/code を fork 済み（公開、parent=kubobeem/code）
- tree 1,925ファイルを確認。既存機能は GAP.md 参照
- ローカルに shallow clone してある: `~/workspace/kuboes-code/repo`

## フェーズ1: モデル周り（最優先・土台）
- OpenAI 互換プロバイダを追加する
  - `providers.ts` に `openai-compatible` を追加
  - base_url + api_key + `/v1/models` から一覧取得
  - Anthropic メッセージ形式 ↔ OpenAI chat completions 形式の変換層を新設
  - Ollama（`http://localhost:11434/v1`）を最初の動作確認先にする
- `/model` を opencode 風にする
  - プロバイダ別にグルーピング、検索、最近使ったモデル、カスタムモデル（設定ファイル）を表示
  - 既存の `ModelPicker.tsx` / `model.tsx` を拡張する
- リトライ＋フェイルオーバー
  - 既存の `withRetry.ts`（最大10回、529は3回）は残す
  - 追加: 429 / 529 / 5xx で別モデル・別プロバイダへ逃げるチェーン、失敗の画面表示、バックオフ設定

## フェーズ2: メモリ・検索（Hermes 風）
- 全セッション横断の永続メモリを作る
  - 既存の SessionMemory（セッション内 markdown）は残す
  - 追加: 全文検索（SQLite FTS5 相当 or ローカル検索）、要約して再利用、開始時に自動で引っ張ってくる
  - ユーザーが編集できるメモリファイル、短期→長期への昇格
- セッション検索を強化する
  - 既存の `agenticSessionSearch.ts` を、タグ・日付・プロジェクト横断で使えるようにする

## フェーズ3: autopilot（必須）＋サンドボックス統合
- autopilot ループを新設する
  - 目標だけ渡したら、計画→実行→検証→リトライを聞かずに回す
  - 失敗したらフェーズ1のフェイルオーバーへ、成功したら要約して止まる
  - cron / ハートビート相当の常駐ループ（OpenClaw / Hermes 風）を別プロセスで回す
- サンドボックスと組み合わせる
  - autopilot はデフォルトでサンドボックス内
  - 外に出すのは許可リストに入れた操作だけ
  - 危険操作は diff プレビュー＋電話承認（Telegram 等）に回す
  - 既存の sandbox-runtime アダプタ、許可ルール、bypass を流用する
- 承認フリー＋監査ログ＋巻き戻し
  - 承認をいちいち聞かない代わりに、やったことを全部ログに残す
  - 編集前スナップショットを自動保存し、一発で復元できるようにする

## フェーズ4: MCP・プラグイン集
- kuboes キュレーション済みマーケットプレイスを作る
  - 既存の plugin / MCP の土台（計150ファイル前後）を流用
  - バンドル単位で一発導入（開発用、Web用、モバイル用など）
  - 自分の道具（Saizeriya Worker、SNS 検索など）の MCP もここに入れられるようにする
- Codebuff 風の要素
  - knowledge.md の自動追記、専門サブエージェント、スマートコンパクション

## フェーズ5: チャンネル連携
- Telegram を先にやる（Bot API で現実的）
  - 完了通知、長時間タスクの要約、例外時の承認
  - 既存の bridge をチャンネルアダプタとして使う
- Simplex は後にする
  - Bot API がないため simplex-chat CLI 経由の迂回になる。設計だけ先に決めて、実装は Telegram の後
- OpenClaw 風のゲートウェイは、Telegram が動いてから一般化する

## フェーズ6: ARM ネイティブ（Termux）
- setup.mjs に arch 分岐を入れる
  - arm64 の Bun、ripgrep バイナリ、依存の確認
  - Termux のパス・権限・ストレージ対応
- 実機検証は Nothing Phone (2a) / Termux で行う。VM だけでは検証完了としない

## フェーズ7: その他の機能（後回し・別途）
- 意味検索、依存グラフ、プロジェクトの癖学習
- PR レビュー bot、Issue 振り分け、共有知識庫
- Tailscale 経由のリモート実行、長時間タスクの通知
- ドキュメント・テスト自動生成、画像・PDF 設計書読み
- テーマ、音声入力・読み上げ、オフライン fallback

## 進め方・注意
- 1フェーズずつ動くものを作って、kuboes/code に push するかどうかはその都度確認する
- リーク元のコードをそのまま公開で育てるリスクは残る。公開する範囲と自作部分の分離は、フェーズが進むたびに見直す
- 動作確認は、Agnes AI（`agnes-2.5-flash`）と `localhost:8080` の OpenAI 互換サーバを軸にする。Ollama は使わない（2026-11-01 変更）
