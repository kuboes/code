# kuboes/code 連続作業 進捗

## 2026-10-31 00:09 JST — フェーズ1〜6のローカル実装完了（push なし）
作業場所: `~/workspace/kuboes-code/`。GitHub への push、外部送信、課金、秘密情報の扱いは一切していない。
日本語機能と WebUI は作っていない。autopilot は必須として実装した。
既存の `repo/`（kuboes/code の shallow clone）は触っていない。`git status` は clean のまま。

### フェーズ1続き: OpenAI 互換（phase1-openai-provider/）
- 追加: tool_calls ↔ Anthropic tool_use 変換（往復テスト済み）
- 追加: ストリーミング変換（テキスト蓄積＋tool_call 引数の index 別蓄積）
- 追加: 429 / 529 / 5xx の判定、指数バックオフ（500ms起点）、モデル・プロバイダのフェイルオーバーチェーン（401 など非リトライ可能エラーで停止）
- 追加: モデルピッカー（プロバイダ別グループ化、検索、最近使用順）
- テスト: 9 pass / 0 fail（既存3件＋新規6件）

### フェーズ2: 永続メモリ（phase2-memory/）
- ファイル（JSONL）＋人間が編集できる markdown エクスポート
- 検索: トークン一致スコア＋昇格ボーナス＋新しさボーナス
- 開始時想起（recall）、短期→長期への promote、要約（文抽出）
- 未検証: SQLite FTS5 相当の本格全文検索ではなく簡易スコアリングである点
- テスト: 2 pass / 0 fail

### フェーズ3: autopilot（phase3-autopilot/）
- 目標→計画→実行→検証→リトライのループ、最大リトライ回数つき
- サンドボックス統合: デフォルト sandbox、read は許可、allowlist 外の run/external と dangerous は承認へ、承認なしは fail-closed（実行しない）
- 監査ログ（JSONL）、編集前スナップショット／復元
- テスト: 4 pass / 0 fail（ポリシー、スナップショット、リトライ成功、危険操作の fail-closed）

### フェーズ4: MCP 集（phase4-mcp/）
- ローカルレジストリのみ（ネットワーク取得なし）: dev / web / mobile / kuboes-own バンドル
- install は設定 JSON を返すだけで、秘密値は環境変数参照（`${SAIZERIYA_MCP_URL}`）に留めた
- テスト: 1 pass / 0 fail

### フェーズ5: Telegram（phase5-telegram/）
- Bot API の sendMessage（トークンは引数で渡す、ハードコードなし）、モック Bot API で送受信テスト済み
- 要約フォーマット
- Simplex は設計のみ: Bot API がないため simplex-chat CLI 経由の迂回として先送り
- テスト: 1 pass / 0 fail。実 Telegram との疎通は未検証（トークンなしのため）

### フェーズ6: ARM（phase6-arm/）
- arch 判定、Termux 検出（TERMUX_VERSION / PREFIX）、Bun・ripgrep のアセット名マッピング、Termux ホーム解決
- テスト: 1 pass / 0 fail。実機（Nothing Phone 2a / Termux）での検証は未実施

### 合計テスト
- 18 pass / 0 fail（フェーズ1: 9、フェーズ2: 2、フェーズ3: 4、フェーズ4: 1、フェーズ5: 1、フェーズ6: 1）

## 未検証・次に必要なもの（2026-11-01 00:00 JST までの残り）
- 実 Ollama との疎通（この VM に ollama なし、モックのみ）
- 実 Telegram との疎通（トークンなし、モックのみ）
- 実機 Termux / ARM での動作
- `repo/src` への本統合（providers.ts / ModelPicker / QueryEngine）。アダプタは統合設計（PHASE1-INTEGRATION.md）に沿って作ってあるが、src 本体は壊さないよう今回は触っていない
- GitHub への push（親がユーザーに確認すること。ここでは行わない）

## 備考
- この進捗報告は 2026-10-31 00:09 JST 時点のもの。壁時計で 2026-11-01 00:00 JST まで待つだけではローカルで進められる作業は増えないため、上記の未検証項目が次の判断待ちとして残っている。
