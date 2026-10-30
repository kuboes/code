# 自分の環境でのテスト結果（2026-10-30、kuboes/code）

環境: この VM（Bun 1.4.4、Node v24.22.1、root ユーザー、x86_64）

## 通ったもの
- setup.mjs: 447 packages、73.89秒で完了。スタブ生成あり。exit 0
- `--version`: `2.1.88 (Claude Code)`、exit 0
- `--help`: 全オプション表示、exit 0
- `-p` モック Anthropic: 自作の Bun モックサーバー（`/v1/messages`、stream、モデル claude-sonnet-4-6）に対して `hello-mock` を返した、exit 0
- `-p` リトライ: モックが 529 を2回返して3回目に成功するケースで、CLI は3回リクエストして `retry-ok` を返した
- `--model sonnet`: モックへの model は `claude-sonnet-4-6` になった
- フェーズ1アダプタ: `bun test` で 3 pass / 0 fail（メッセージ変換、models URL、モック `/v1/models` 取得）

## この環境でテストできなかったもの（正直に）
- repo 内にテストファイルがほぼない: `src/**/*.test.*` は 0件（`src/ink/hit-test.ts` のみ別物）
- 実 Anthropic API: API キーなし。モックのみで検証
- 実 Ollama: この VM に ollama コマンドなし、11434 にもサーバーなし。モデル一覧はモックのみ
- 実サンドボックス: setup が作る `@anthropic-ai/sandbox-runtime` は `0.0.0-stub` で、`isSandboxingEnabled() = false`、`isSupportedPlatform() = false`、`wrapWithSandbox` は素通し。つまりこの環境では本物のサンドボックス隔離は検証できない
- 対話 TUI / ModelPicker の画面操作: 非対話モードのみ検証。TUI のキー操作は未検証
- Telegram / Simplex: 未実装のためテスト対象なし
- ARM / Termux: この VM は x86_64 のため未検証

## 注意
- root ユーザーのため `--dangerously-skip-permissions` は使えない（セキュリティで弾かれた）。テストは `--tools ""` で行った
- node_modules はローカルの clone 内のみ。kuboes/code への push はしていない
