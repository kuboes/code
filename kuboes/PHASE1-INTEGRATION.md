# フェーズ1 統合設計（ローカル作業分）

## できていること（テスト済み）
- `phase1-openai-provider/translate.ts`: Anthropic ↔ OpenAI のメッセージ変換、system 扱い
- `openAIModelsUrl`: 末尾 `/v1` の二重付与バグを修正済み
- `fetchOpenAIModels`: モック Ollama（Bun.serve の `/v1/models`）で `llama3.1` / `qwen3` を取得できることを確認
- テスト: `bun test` で 3 pass / 0 fail（2026-10-30）

## src への統合ポイント（まだ src は編集していない）
1. `src/utils/model/providers.ts`
   - 現状: `APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry'`
   - 追加: `'openai-compatible'`。環境変数ではなく設定ファイルで base_url / api_key / model を持つ
2. `src/utils/model/modelAllowlist.ts` / `src/components/ModelPicker.tsx`
   - 追加: `fetchOpenAIModels` で取った一覧を、プロバイダ別・検索付きで出す
   - 既存の Anthropic 許可リストは壊さない
3. API 呼び出し層（QueryEngine / services/api 系）
   - 追加: OpenAI chat completions への変換と、tool_calls ↔ Anthropic tool_use の変換
   - 既存の `withRetry.ts` は残し、429 / 529 / 5xx で別モデル・別プロバイダへ逃げるチェーンを上に被せる
4. 設定
   - 例: `~/.kuboes/models.json` に `{ provider, base_url, model }` を書く形。秘密値は Secure Vault / 環境変数経由で、ファイルに平文で置かない

## 未検証・ブロック要因
- 実機 Ollama がこの VM にない（`ollama` コマンドなし）。モックでは通っているが、実 Ollama との疎通は未検証
- src への統合と kuboes/code への push は、ユーザー確認なしではやらない（外部送信のため）
- 次に必要なユーザー判断: (1) src に統合して kuboes/code に push していいか、(2) 実 Ollama のテスト環境は Termux / 自宅マシンのどちらでやるか
