# CLAUDE.md

このリポジトリでコードを扱う際の Claude Code (claude.ai/code) 向けガイダンス。

## プロジェクト概要

日本の道の駅の地図アプリケーション。Google Maps 上に 2 つの地図を出す — michi-no-eki.jp からスクレイピングした**既存の駅の地図**と、これから開業する駅を追う**整備計画マップ**。データ生成 CLI（TypeScript）、React フロントエンド、Cloudflare Workers + D1 バックエンドで構成される。

## ルール

### 言語

- **Claude Code とのやり取り**: 日本語
- **コミットログ**: 英語
- **プログラム内のコメント・出力メッセージ**: 英語

### コード品質

- TypeScript を変更したら Biome の lint / format と型チェックを実行する（`npm run lint:fix` + `npm run typecheck`）
- 作業完了時には必ず lint・format・typecheck を通す

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
- **整備計画マスタ**: `npm run plan`（`data/plans.json` の読み取りと更新。**直接書き換えない。** サブコマンドは `list` / `show` / `update` / `url` / `add`。`npm run plan -- --help`）
- **品質**: `npm test` / `npm run lint` / `npm run format` / `npm run typecheck` / `npm run lint:fix`

### generate:stations のデバッグモード

全件スクレイピングは 10 分程度かかるため、開発時は件数を絞る:

```
npm run generate:stations -- --debug --max-prefs=2 --max-stations=3
```

`--debug` は処理状況の詳細表示、`--max-prefs=N` / `--max-stations=N` は処理する都道府県数・各県の駅数の上限。

**⚠️ デバッグ実行で生成された `data/` はコミットしないこと。** データが不完全なため本番データを破損させる。`git status` を確認し、必要なら `git restore data/` で戻す。

## アーキテクチャ

### ディレクトリ構成

```
src/
├── backend/     Cloudflare Workers（Hono）API。auth / handlers / db / middleware
├── frontend/    React 19 フロントエンド。components / auth / storage / types
├── shared/      フロント・バック共通の型定義
├── lib/         scripts が使うモジュール（GeoJSON 出力、Station 型、整備計画マスタの正規形）
├── scripts/     CLI のエントリーポイント（npm script から実行する）
└── test-utils/  テスト用ヘルパー

docs/         人が読むドキュメント（Pages には配信されない）
migrations/   Cloudflare D1 マイグレーション（SQL）
html/         静的アセット（index.html / plan.html の 2 ページ、CSS、ビルド成果物）
data/         生成データ（GeoJSON）と整備計画マスタ（plans.json）
.claude/      Claude Code の設定（skills / hooks）
```

### バックエンド（Cloudflare Workers + Hono + D1）

エンドポイント:

- `GET /health` - ヘルスチェック
- `POST /sessions` - Google ID トークンを検証してセッション JWT を発行
- `POST /sessions/refresh` - 残期限が 30 日未満なら新しいセッション JWT を発行（十分なら 204）
- `GET /shares/:shareId` - 共有用：他ユーザーの訪問データを公開取得（認証不要）
- `POST /api/shares` - ログインユーザーの共有 ID を発行・取得
- `GET /api/visits` / `PUT /api/visits/:stationId` / `DELETE /api/visits/:stationId` - 訪問記録（styleId 1〜4）

テーブル（`migrations/`）:

- `visits` - user_id, station_id, style_id, updated_at
- `shares` - share_id, user_id, created_at（1 ユーザー 1 共有 ID）

認証は `/api/*` のみ `requireAuth` で保護する。`POST /sessions` と `GET /shares/:shareId` は公開。

### 認証（Google ID トークン交換 + 自前セッション JWT）

ログイン時のみ Google ID トークン（RS256, 約 1 時間）を JWKS で検証し、以後は自前のセッション JWT（HS256, 1 年）で認証を回す。フロントは `localStorage` の `auth:sessionToken` に保管し、`Authorization: Bearer <token>` で送る。起動時とタブ復帰時（`visibilitychange`）に `POST /sessions/refresh` を呼び、残期限が 30 日未満なら新トークンを受け取って上書きする。401 を受けたら localStorage をクリアして再ログイン UI を出す。

設計判断:

- **Implicit Flow のまま**: 用途は身元確認（`sub`）のみで Google API を継続呼び出さないため、`client_secret` も Google refresh token も不要。ID トークンを 1 回検証すれば足りる
- **セッション JWT はステートレス + スライディング延長**: D1 にセッションテーブルを持たず HS256 署名のみで検証する。30 日以内に 1 度でも開けばセッションは事実上失効しない。即時 revoke が必要になったら `sessions` テーブルを追加する
- **One Tap によるサイレント再認証は使わない**: 複数 Google アカウント環境で機能しないため、1 年セッション + 延長で代替する
- **`sub` の扱い**: Google `sub` は（アカウント × クライアント ID）ごとの不透明 ID でクレデンシャルではないが、ログ・URL・他ユーザー向けレスポンスには露出させない。共有 API は所有者の `sub` を返さず、別 UUID の `share_id` を介する
- **エンドポイントはリソース指向**: プロバイダはパスではなく body の `provider` で指定する。ログアウトは将来 `DELETE /sessions/current` で対称に書ける

シークレット:

- `GOOGLE_CLIENT_ID` - 公開 ID。`wrangler.toml` の `[vars]` に記載
- `SESSION_SECRET` - セッション JWT の HS256 署名鍵。`wrangler secret put SESSION_SECRET`（本番は `--env production`）。ローテーションすると全ユーザーが強制ログアウトされる

### フロントエンド（React 19）

`src/frontend/app.tsx` が `GoogleOAuthProvider` で地図コンポーネントを包む。駅データは GeoJSON を Google Maps Data Layer として描画する。

訪問データ（駅 → styleId）の永続化は `src/frontend/storage/` の `Storage` インターフェースで抽象化され、`style-manager.ts` の `createStyleManager()` がアプリの状態に応じて実装を選ぶ:

- `?share=<id>` 付き: 共有 API から取得したデータで初期化した `MemoryStorage`
- ログイン済み: Workers + D1 と同期する `RemoteStorage`（デバウンス付き）
- 未ログイン: 空の `MemoryStorage`（ゲストモード、永続化なし）

### データパイプライン

1. `generate-stationlist.ts` - michi-no-eki.jp を都道府県・駅の階層でたどり、Point Feature の GeoJSON（`data/stations.geojson`）を直接出力する（`cheerio` で HTML 解析、`jaconv` でテキスト正規化）
2. フロントエンドが GeoJSON を読み込んで描画

書き出しは `src/lib/station-geojson.ts`。

### 整備計画マップ

2 つ目のアプリ（`html/plan.html`）。仕様は `docs/plan-map.md`、データを最新化する調査の手順は `.claude/skills/michi-no-eki-plan-research/SKILL.md` にある。**同じことをここに書き足さない** — 変わったとき片方だけ直されて、残った側が嘘になる。

### ビルド・デプロイ

- `esbuild.config.ts` - `app.tsx` と `plan-app.tsx` を `html/js/` へバンドル（`bundle.js` / `plan.js`。watch / serve / build モード）
- `wrangler.toml` - Workers 設定。D1 バインディング（`DB`）、`migrations_dir`、`env.production` の許可オリジン
- TypeScript 設定はフロント（`tsconfig.json`）とバックエンド（`tsconfig.backend.json`）で分かれており、`npm run typecheck` は両方を実行する
- デプロイ先は Cloudflare Workers（バックエンド）と静的ホスティング（`html/`）

### 主要技術

Cloudflare Workers / Hono / D1 / jose、React 19 / Google Maps API / `@react-oauth/google`、cheerio / jaconv、esbuild、Vitest（`@testing-library/react` + jsdom）、Biome。JSON の読み書きに外部ライブラリは使わない（標準の `JSON.parse` / `Response.json()`）。
