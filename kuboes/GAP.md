# kuboes/code ギャップ表（2026-10-30 時点）

元: kuboes/code = kubobeem/code のフォーク = JiaranI/start-claude-code のフォーク。
Claude Code v2.1.88 のソース約1,925ファイル。`scripts/setup.mjs` で Bun 経由で動く。
調査元: Hermes（Nous Research）、OpenClaw、Codebuff の公開情報。実装はまだしていない。

## 凡例
- あり: 既に code 内に相当機能がある
- 部分: 土台はあるが、ユーザーの要望までは届いていない
- なし: code 内に相当ファイルが見つからない（2026-10-30 の tree 検索）

## 1. モデル・プロバイダ
| 機能 | code の現状 | 判定 |
|---|---|---|
| Anthropic / Bedrock / Vertex / Foundry | `src/utils/model/providers.ts` で4種のみ | 部分 |
| Ollama / OpenAI 互換 | tree に ollama / openai が0件。README の `ANTHROPIC_BASE_URL` は Anthropic 互換プロキシ用 | なし |
| `/model` 選択 UI | `src/commands/model/model.tsx` + `src/components/ModelPicker.tsx`、Anthropic の許可リスト中心 | 部分 |
| opencode 風の切替（プロバイダ別・検索・最近・カスタム） | なし | なし |
| フェイルオーバー（別モデル・別プロバイダへ逃げる） | `src/services/api/withRetry.ts` は最大10回、529は3回。モデル切替のフェイルオーバーではない | 部分 |
| リトライの可視化 | リトライ自体はあるが、画面での進捗表示は弱い | 部分 |

## 2. メモリ・検索
| 機能 | code の現状 | 判定 |
|---|---|---|
| セッション内メモリ | `src/services/SessionMemory/sessionMemory.ts`（会話から markdown に抽出、フォークしたサブエージェントで更新） | あり |
| セッション検索 | `src/utils/agenticSessionSearch.ts`、`src/utils/listSessionsImpl.ts` | 部分 |
| Hermes 風の永続メモリ（全セッション横断・SQLite FTS5・要約して再利用） | 横断・全文検索・自動整理まではない | なし |
| OpenClaw 風の dreaming 整理（light→REM→deep） | なし | なし |
| Codebuff 風の knowledge.md 自動追記 | knowledge 読み込みは Codebuff 側の話。code 側は CLAUDE.md 系の読み込みが中心 | 部分 |

## 3. autopilot（必須）
| 機能 | code の現状 | 判定 |
|---|---|---|
| autopilot という名前の機能 | tree に autopilot / autonomous が0件 | なし |
| 自動承認（autoMode） | `src/cli/handlers/autoMode.ts` + `src/utils/permissions/yoloClassifier.ts`（AI 分類で自動承認） | 部分 |
| バックグラウンドタスク | `src/utils/background/*`、`src/components/tasks/BackgroundTask*` | 部分 |
| リモートセッション（bridge） | `src/bridge/*`（40ファイル） | あり |
| cron / ハートビート常駐（OpenClaw / Hermes 風） | code 内に cron / heartbeat の常駐ループはない | なし |
| 目標→計画→実行→検証→リトライの自律ループ | なし（1セッション内のループはあるが、目標完結までの自律ループではない） | なし |

## 4. サンドボックス・承認
| 機能 | code の現状 | 判定 |
|---|---|---|
| サンドボックス本体 | `@anthropic-ai/sandbox-runtime` のアダプタ `src/utils/sandbox/sandbox-adapter.ts`、FS読み書き制限、ネットワーク制限、違反記録 | あり |
| サンドボックス設定・診断・トグル | `src/components/sandbox/*`、`src/commands/sandbox-toggle/*` | あり |
| コマンドごとの使用判定 | `src/tools/BashTool/shouldUseSandbox.ts` | あり |
| 許可ルール / bypass | `src/components/permissions/*`（95ファイル）、`BypassPermissionsModeDialog` | あり |
| autopilot 用の縛り（デフォルト sandbox 内、許可リストだけ外へ） | なし | なし |
| ARM / Termux でのサンドボックス動作検証 | なし | なし |

## 5. チャンネル・常駐ゲートウェイ
| 機能 | code の現状 | 判定 |
|---|---|---|
| bridge / リモート操作 | `src/bridge/*` | あり |
| Telegram 連携 | tree に telegram が0件 | なし |
| Simplex 連携 | tree に simplex が0件。Simplex 側に Bot API がないため CLI 経由の迂回になる見込み | なし |
| OpenClaw 風のゲートウェイ（20以上のチャンネル、WebSocket 18789 的な常駐） | なし | なし |
| Hermes 風のゲートウェイ（Telegram / Discord / Slack / WhatsApp / Signal / メール、横断会話継続） | なし | なし |

## 6. MCP・プラグイン・スキル
| 機能 | code の現状 | 判定 |
|---|---|---|
| MCP クライアント・サーバー | `src/services/mcp/*`、`src/entrypoints/mcp.ts`、計71ファイル | あり |
| プラグイン市場 | `src/commands/plugin/*`、`src/services/plugins/*`、計79ファイル | あり |
| kuboes キュレーション済みマーケットプレイス（バンドル一発導入） | なし | なし |
| Codebuff 風の SDK / ストア（エージェントを MCP として再利用） | なし | なし |
| Hermes 風の agentskills.io 互換スキル | なし | なし |

## 7. マルチエージェント・実行
| 機能 | code の現状 | 判定 |
|---|---|---|
| サブエージェント | フォークしたエージェント（SessionMemory 等で使用）、swarm 系ファイルあり | 部分 |
| Codebuff 風の専門サブエージェント＋MAX 並列 | なし | なし |
| OpenClaw 風の ACP 経由の外部 harness（Pi / Codex 等） | なし | なし |
| Hermes 風のターミナルバックエンド（local / Docker / SSH / Modal / Daytona / Vercel Sandbox） | local 中心。Docker / SSH 等の切替はない | 部分 |
| スマートコンパクション（Codebuff 風） | compact 系はあるが、要約後の関連ファイル再読込まで含めた設計ではない | 部分 |
| undo / redo（Codebuff 風） | ファイル編集の undo は Codebuff 側の話。code 側はスナップショット復元が別途必要 | 部分 |

## 8. 環境・ARM
| 機能 | code の現状 | 判定 |
|---|---|---|
| Bun での起動 | `package.json` は `bun src/entrypoints/cli.tsx`、Bun 1.4.4 で動く見込み | あり |
| setup.mjs | Bun 導入、依存導入、スタブ生成、ripgrep バイナリ取得まで | あり |
| ARM / Termux ネイティブ対応 | arch 分岐・Termux パス対応・arm64 バイナリ検証なし | なし |
| Hermes 風の Android / Termux 向け aarch64 APT | なし | なし |

## 9. その他（2026-10-30 にユーザーが追加で挙げたもの）
- 承認フリー＋監査ログ＋一発巻き戻し: 部分（許可ルールはあるが、監査ログ＋巻き戻しの一体化はない）
- 編集前スナップショット: なし
- 意味検索（ローカル・セマンティック）: なし（ripgrep の文字列検索が中心）
- 依存グラフ・影響範囲表示: なし
- プロジェクトの癖学習: 部分（SessionMemory のみ）
- PR レビュー bot / Issue 振り分け / 共有知識庫: なし
- サンドボックス実行の隔離強化: 部分（上記4参照）
- Tailscale 経由のリモート実行: 部分（bridge はあるが Tailscale 前提の設計ではない）
- 長時間タスクの完了通知: なし
- ドキュメント・テスト自動生成: 部分（コマンドはあるが自動生成ループではない）
- 画像・PDF 設計書読み: 部分（添付系はあるが設計書→実装の一気通貫ではない）
- テーマ（Windows XP 風の無機質など）: なし
- 音声入力・読み上げ: なし
- オフライン fallback（ローカルモデルへ自動切替）: なし

## 採用しないもの（ユーザー指定）
- 日本語機能: なしでいく
- WebUI: いったんなし
