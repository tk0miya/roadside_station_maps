# CLAUDE.md

このリポジトリでコードを扱う際の Claude Code (claude.ai/code) 向けガイダンス。

## プロジェクト概要

日本の道の駅の地図アプリケーション。Google Maps 上に 2 つの地図を出す — michi-no-eki.jp からスクレイピングした**既存の駅の地図**と、これから開業する駅を追う**整備計画マップ**。データ生成 CLI（TypeScript）、React フロントエンド、Cloudflare Workers + D1 バックエンドで構成される。

## ドキュメント

要件と設計は `docs/` にある。**同じことをここに書き足さない** — 変わったとき片方だけ直されて、残った側が嘘になる。

| 文書 | 扱うもの |
|---|---|
| `docs/station-map.md` | 道の駅マップの要件と設計 |
| `docs/plan-map.md` | 整備計画マップの仕様と、台帳を保守する運用ルール |
| `docs/cities.md` | 市区町村マスタ（`data/cities.json`）の中身と再生成 |
| `docs/plan-reports.md` | 計画データの調査で出た、メンテナ判断が要る相談事項 |

アルゴリズムや具体的な手続きは各実装のコメントにある。

## ルール

### 言語

- **Claude Code とのやり取り**: 日本語
- **コミットログ**: 英語
- **プログラム内のコメント・出力メッセージ**: 英語

### コード品質

- TypeScript を変更したら Biome の lint / format と型チェックを実行する（`npm run lint:fix` + `npm run typecheck`）
- 作業完了時には必ず lint・format・typecheck を通す
- JSON の読み書きに外部ライブラリは使わない（標準の `JSON.parse` / `Response.json()`）

### コミット

- コミットログは「何を変更したか」と「その結果何が達成されたか」を書く
- 作業の経緯や途中の試行錯誤は含めない

### テスト

- モックオブジェクトが必要な場合は `src/test-utils/test-utils.ts` のヘルパーを使う
- StyleManager を使うテストでは原則 `MemoryStorage` で StyleManager を生成する（オンメモリ実装なので外部モック不要）

## 開発コマンド

- **フロントエンド**: `npm start`（ウォッチビルド） / `npm run serve`（開発サーバー、ポート 8081） / `npm run build`
- **バックエンド**: `npm run dev:backend`（wrangler dev） / `npm run deploy:backend` / `npm run db:migrate:local` / `npm run db:migrate`
- **データ生成**: `npm run generate:stations`（`data/stations.geojson` を生成）
- **市区町村マスタ**: `npm run generate:cities`（`data/cities.json` を再生成し、`data/plans.json` を追随させる。**直接書き換えない。** `docs/cities.md`）
- **整備計画マスタ**: `npm run plan`（`data/plans.json` の読み取りと更新。**直接書き換えない。** サブコマンドは `list` / `show` / `update` / `url` / `add`。`npm run plan -- --help`）
- **品質**: `npm test` / `npm run lint` / `npm run format` / `npm run typecheck` / `npm run lint:fix`

### generate:stations のデバッグモード

全件スクレイピングは 10 分程度かかるため、開発時は件数を絞る:

```
npm run generate:stations -- --debug --max-prefs=2 --max-stations=3
```

`--debug` は処理状況の詳細表示、`--max-prefs=N` / `--max-stations=N` は処理する都道府県数・各県の駅数の上限。

**⚠️ デバッグ実行で生成された `data/` はコミットしないこと。** データが不完全なため本番データを破損させる。`git status` を確認し、必要なら `git restore data/` で戻す。

## ディレクトリ構成

```
src/
├── backend/     Cloudflare Workers（Hono）API。auth / handlers / db / middleware
├── frontend/    React 19 フロントエンド。components / auth / storage / types
├── shared/      フロント・バック共通の型定義
├── lib/         scripts が使うモジュール（GeoJSON 出力、Station 型、整備計画マスタと市区町村マスタの正規形）
├── scripts/     CLI のエントリーポイント（npm script から実行する）
└── test-utils/  テスト用ヘルパー

docs/         人が読むドキュメント（Pages には配信されない）
migrations/   Cloudflare D1 マイグレーション（SQL）
html/         静的アセット（index.html / plan.html の 2 ページ、CSS、ビルド成果物）
data/         生成データ（GeoJSON）と 2 つのマスタ（市区町村 cities.json / 整備計画 plans.json）
.claude/      Claude Code の設定（skills / hooks）
```
