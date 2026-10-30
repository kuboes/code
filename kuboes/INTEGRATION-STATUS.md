# 本統合の状態（2026-10-31）
- 済み: `kuboes/phase1-openai-provider/`〜`kuboes/phase6-arm/` の自作アダプタ群（bun test 18 pass）。
- 済み（第一歩）: `src/utils/model/providers.ts` に `'openai-compatible'` を追加、`KUBOES_USE_OPENAI=1` で選択可。デフォルトは firstParty のまま。
- 未済: `src/services/api/` のクエリパスへ translate.ts を配線すること、ModelPicker への OpenAI モデル一覧表示、実 Ollama / 実 Telegram / 実機 Termux での検証。
- 注意: この第一歩だけでは OpenAI 互換モデルでの実際の問い合わせはまだ動かない。配線なしに「対応済み」とは言わないこと。
