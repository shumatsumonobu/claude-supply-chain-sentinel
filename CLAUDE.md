# vuln-check

サプライチェーン攻撃の早期検知システム。

## Routine 実行手順

1. `node crawler.js` を実行
2. `logs/feed-YYYY-MM-DD.json` を読む
3. articles が空なら「直近48時間に検知なし」と1行報告（Phase 3 に進む）
4. articles があれば各記事を以下のフォーマットで日本語要約:
   - 対象パッケージ / エコシステム（npm, PyPI 等）
   - 攻撃手法（typosquatting, 依存関係乗っ取り等）
   - 影響範囲
   - 自分のプロジェクトへの該当可能性
5. 緊急度が高い場合はその旨を冒頭に明記
6. articles があれば Phase 2 に進む。なければ Phase 3 に進む

## Phase 2: リポ該当チェック

articles が検出された場合、以下を追加で実行する。

1. `targets.txt` を読み、対象リポのパス一覧を取得する
2. 各記事から対象パッケージ名を特定する
3. 各リポの `package.json` を読み、該当パッケージが依存に含まれるか確認する
4. 該当があれば以下のフォーマットで警告:
   - リポ名
   - 該当パッケージ名とバージョン
   - 記事の概要と対応案
5. 該当なしなら「対象リポへの影響なし」と1行報告
6. Phase 3 に進む

## Phase 3: Socket.dev パッケージスキャン

Phase 1/2 の結果に関わらず、毎回実行する。

1. `node scanner.js` を実行
2. `logs/scan-YYYY-MM-DD.json` を読む
3. 各パッケージの alerts を確認し、以下のフォーマットで日本語報告:
   - リポ名
   - パッケージ名とバージョン
   - 検出された問題（severity, category, label）
   - 対応案
4. alerts が全リポで空なら「Socket.dev スキャン: 全パッケージ問題なし」と1行報告
5. critical または supplyChainRisk が検出された場合はその旨を冒頭に明記
