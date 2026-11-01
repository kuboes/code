# 本統合の状態（2026-11-01）
- 済み: `kuboes/phase1-openai-provider/`〜`kuboes/phase6-arm/` の自作アダプタ群（bun test 18 pass）。
- 済み（第一歩）: `src/utils/model/providers.ts` に `'openai-compatible'` を追加、`KUBOES_USE_OPENAI=1` で選択可。デフォルトは firstParty のまま。
- 済み（2026-11-01、Termux実機で検証）:
  - `src/services/api/kuboesOpenAI.ts`（新規）＋ `src/services/api/client.ts` 配線: Anthropic SDKのfetchを差し替え、Anthropic形式をOpenAI chat completionsへ翻訳（system/tools/tool_use/tool_result、ストリーミングSSE翻訳、modelは `KUBOES_OPENAI_MODEL` で置換）。単体テスト `kuboesOpenAI.test.ts` 8件 pass（VM・Termuxとも）。
  - `src/components/ConsoleOAuthFlow.tsx`: 初回ログイン選択に4番目「OpenAI-compatible API · Ollama, OpenAI, etc. (KUBOES_OPENAI_*)」を追加、説明画面（KUBOES_OPENAI_BASE_URL / API_KEY / MODEL、thinking・prompt caching・betasは未翻訳で無視）を表示。Termuxの疑似端末＋キー入力で、選択→説明画面→Enterで戻る、まで確認。
  - `src/components/LogoV2/WelcomeV2.tsx`: 端末幅が58列未満ならアートを出さず1行表示に。50列で崩れず、80列でアート表示のまま（Termuxで確認）。
  - `src/components/StructuredDiff/colorDiff.ts`＋`scripts/setup.mjs`: color-diff-napiスタブが `{}` で `new ColorDiff` が落ちる問題を修正（typeof functionチェックで純JSフォールバックへ、スタブはrender()がnullを返すクラス化）。TermuxでWelcome＋サンプルdiffまで落ちずに表示されることを確認。シンタックスハイライトはフォールバック表示になる。
  - `start.sh`: `ANTHROPIC_API_KEY` 必須ゲートを緩和。`KUBOES_OPENAI_BASE_URL` か `KUBOES_USE_OPENAI` があれば通り、未設定時は `ANTHROPIC_API_KEY` を `KUBOES_OPENAI_API_KEY` から補完。OpenAI時は `DISABLE_PROMPT_CACHING` 等を有効化。
  - `src/utils/model/modelStrings.ts`: `ALL_MODEL_CONFIGS` に `openai-compatible` の項目が無く、デフォルトモデル文字列がundefinedになって `getMainLoopModel()` が `undefined.trim` で落ち、-pモードがWebSearchTool.isEnabled()でハングする問題を修正。未知のプロバイダはfirstPartyの文字列にフォールバック（クエリ時にアダプタが `KUBOES_OPENAI_MODEL` に置換するため、firstParty文字列がOpenAI側に送られることはない）。
  - `-p` 問い合わせ（Termux、モックOpenAIサーバ相手）: `--tools ""` あり・なしとも `hello-mock-openai` を返却。Anthropicモック経路の回帰も `hello-mock` で確認。
- 注意: デフォルトモデルは3P用Sonnet 4.5で、上流の非推奨警告（2026-11-30 EOL）が -p 時に2回出る。これは上流の警告で、本変更の不具合ではない。
- 未済: 実Ollama / 実OpenAI互換サーバ（Agnes等、実キーでの問い合わせは未検証）、ModelPickerへのOpenAIモデル一覧表示、実Telegram / 実機での長時間運用。
- 注意: この状態で「OpenAI互換対応済み」と言う場合は、モック＋TUI選択までの検証範囲であることを添えること。

## 2026-11-01 追記（品質・検証・ドキュメント）

### 直した不具合
| 症状 | 原因 | 修正 |
|---|---|---|
| `node scripts/setup.mjs` が Windows で即クラッシュ | `process.env.HOME` が未定義 | `os.homedir()` / `USERPROFILE` へフォールバック、`bun.exe` 名、`ls` / `rm -rf` を Node API に置換 |
| 検索・Grep が何も返さない | npm tarball が `vendor/ripgrep` を同梱しなくなり、`src/utils/vendor/ripgrep/x64-win32/rg.exe` が存在しない | `src/utils/ripgrep.ts` で同梱バイナリが無い場合にシステムの `rg` へフォールバック |
| TUI が `Haiku 4.5` と表示（実際は OpenAI 互換モデル） | `modelStrings` が firstParty のモデル名へフォールバック | `renderModelSetting` / `modelDisplayString` が `KUBOES_OPENAI_MODEL` を表示 |

### 検証マトリクス
| 項目 | 環境 | 結果 |
|---|---|---|
| `bun run test` | Windows / Bun 1.3.14 | 47 pass / 3 skip / 0 fail |
| `-p`（OpenAI 互換） | `localhost:8080` Ornith-1.5-35B-A3B-NVFP4 | `local-ok` を返却 |
| Grep ツール | 同上（ツール有効） | 2 ファイル一致 |
| TUI 起動・モデル表示 | Windows Terminal | `Ornith-1.5-35B-A3B-NVFP4` を表示 |
| TUI 入力・`/status` 候補表示 | Windows Terminal | 表示確認（実行結果の中身は未記録） |
| `-p`（Agnes） | Agnes AI | 未検証（キー未投入） |
| Termux 実機 | Nothing Phone (2a) | 今回は未実施（既存記録のみ） |

### テストの構成
- `src/services/api/kuboesOpenAI.test.ts`（17）: 変換、ストリーム、env 優先順位
- `src/services/api/kuboesOpenAI.fetch.test.ts`（4）: モック HTTP サーバ相手の往復とエラー変換
- `src/utils/model/providers.test.ts`（8）: プロバイダ選択の優先順位
- `kuboes/e2e/agnes.e2e.test.ts`（3）: `KUBOES_E2E=1` のときだけ実行。届かない/認証エラーは SKIP
- 既存 `kuboes/phase*`（26）は変更なし

### 実行方法
- `bun run test`（通常）
- `bun run test:e2e`（Agnes の env を入れた状態で。PowerShell でも動く）

### 既知の残り
- 実 Agnes の疎通（キーを入れて `bun run test:e2e`）
- TUI `/status` の内容記録
- ModelPicker への OpenAI モデル一覧表示
- opencode v1 との差分比較（未実施）
- `-p` 実行時の上流 EOL 警告 2 回（未修正）
- Bun 1.3.14 とリポジトリ想定 1.4.4 の差異
