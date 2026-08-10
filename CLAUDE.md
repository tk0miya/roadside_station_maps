# CLAUDE.md

このリポジトリでコードを扱う際の Claude Code (claude.ai/code) 向けガイダンス。

## プロジェクト概要

日本の道の駅の地図アプリケーション。michi-no-eki.jp から駅データをスクレイピングし、Google Maps 上にインタラクティブに表示する。データ生成 CLI（TypeScript）、React フロントエンド、Cloudflare Workers + D1 バックエンドで構成される。

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
- **データ生成**: `npm run generate:all`（`generate:stations` → `generate:geojson`）
- **開発計画データ**: `npm run --silent plan:list` / `npm run plan:update`（`.env` の `PLAN_API_URL` が必要）
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
├── lib/         scripts が使うモジュール（CSV パース、Station 型、開発計画 API クライアント）
├── scripts/     CLI のエントリーポイント（npm script から実行する）
└── test-utils/  テスト用ヘルパー

gas/          開発計画スプレッドシート API（Google Apps Script）
migrations/   Cloudflare D1 マイグレーション（SQL）
html/         静的アセット（index.html、CSS、ビルド成果物 bundle.js）
data/         生成データ（CSV / GeoJSON）
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

1. `generate-stationlist.ts` - michi-no-eki.jp を都道府県・駅の階層でたどり `data/stations.csv` を出力（`cheerio` で HTML 解析、`jaconv` でテキスト正規化）
2. `generate-geojson.ts` - CSV を Point Feature の GeoJSON（`data/stations.geojson`）へ変換
3. フロントエンドが GeoJSON を読み込んで描画

### 開発計画スプレッドシート API（Google Apps Script）

開発計画マップ（`html/plan.html`）のデータ元は人手管理の Google スプレッドシート。`gas/` はそのスプレッドシートに紐づく GAS プロジェクトで、**一覧取得（`doGet`）と更新（`doPost`）**を Web App として公開する。行の追加・削除はスプレッドシート上で人手が行うため公開しない。

**読み取り経路は 2 つある**:

- **地図（`html/plan.html`）は CSV 公開版を読む** — 地図の表示を GAS の実行時間・クォータに依存させないため
- **CLI（`npm run plan`）は `doGet` を読む** — 必要なデータ形が地図と違うため。地図は `data/cities.json` で市区町村代表点にフォールバックした `PlannedStation` を使うが、CLI が扱うのは `update` で書き戻せるシートの生の値。加えて公開 CSV は Google 側で数分キャッシュされるので、`update` 直後の確認に使えない

どちらもヘッダ行から列を引くので形は揃う。

- **TypeScript ではなく JavaScript**: 個人利用の小さなスクリプトで、ビルド工程を挟まずそのまま GAS に反映することを優先
- **`doGet` / `doPost` で分ける**: verb 分岐は Apps Script が提供しているので、`doPost({ action })` のような分岐を自前で作らない。読み取りは副作用がなく冪等で、`/exec` をブラウザで開けばデプロイの確認もできる
- **値の正規化**: `doGet` は Date セルを `yyyy-MM-dd` に揃え、文字列セルは前後の空白を落として返す。セルの表示書式や余分な空白に API の応答が左右されず、一覧で見た値をそのまま `update` の一致キーに使えるようにするため。数値は素通しするので `lat` / `lng` は JSON の数値、空セルは空文字になる
- **列の解決**: 列位置はハードコードせずヘッダ行（`name` / `pref` / `city` / `status` / `date` / `lat` / `lng` / `memo`）から引く。API のフィールド名は公開 CSV のヘッダ名と一致する
- **エントリーの特定**: `name` 列と `pref` 列の完全一致。`name` は一意ではない（「道の駅 川崎町」が福岡県と宮城県にある）ので、`pref` はキーの片割れとして必須にする。**一致が 1 件のときだけ書き込む** — 複数一致で先頭行を書くと取り違えに気づけないため
- **`Content-Type: text/plain`**: CORS プリフライトを避けるため（Apps Script は preflight に応答しない）
- **公開範囲**: `ANYONE_ANONYMOUS`。個人利用前提の割り切りなので URL は共有しない
- **Biome**: `gas/` は GAS のグローバルスコープ前提（`export` を持たない）のため `biome.json` の `overrides` で `noUnusedVariables` を無効化

リクエスト・レスポンス:

```
GET https://script.google.com/macros/s/xxx/exec
→ [{ "name": "道の駅◯◯", "pref": "福井県", "status": "計画中", "date": "", "lat": 36.1, ... }, ...]

POST https://script.google.com/macros/s/xxx/exec   (Content-Type: text/plain)
{ "name": "道の駅◯◯", "pref": "福井県", "values": { "status": "開業", "date": "2026-04-01" } }
→ { "updated": true, "row": 12, "matched": 1 }
```

`name` と `pref` は両方必須。`values` に含めたフィールドのみ上書きし、含めなかったフィールドは現在値を保つ。`values.name` を含めるとエントリーを改名する。`matched` は一致件数で、1 件でなければ何も書かず `{ "updated": false, "row": null, "matched": <件数> }` を返す。

### 開発計画データ CLI（`npm run plan:*`）

上記 API の唯一のクライアント。`src/scripts/plan.ts`（エントリーポイント、引数解析・検証）と `src/lib/plan-api.ts`（通信）。

```
npm run --silent plan:list | jq -r '.[] | select(.status == "計画中") | .name'
npm run plan:update -- "道の駅◯◯" 福井県 --status=開業 --date=2026-04-01
npm run plan:update -- "道の駅◯◯（仮称）" 福井県 --name=道の駅◯◯
```

- **`list` は JSON を出すだけ**で絞り込み・整形のオプションを持たない。`jq` のほうが上手くやれるため
- **`npm run` のバナーは stdout に出る**ので、`jq` に流すときは `--silent` が要る
- **script 名は `plan:list` / `plan:update`**: `db:migrate` / `gas:push` と同じ `<名前空間>:<動詞>` 形式に揃える。サブコマンドを script 側に埋めてあるので、`list` は `--` なしで `jq` に流せる
- **`update` は送信前に検証する**: 更新可能フィールド（`name` / `status` / `date` / `lat` / `lng` / `memo`）以外のフラグ、範囲外の `status`、非数値の座標、空の `name`、フィールド無指定、キー（名前・都道府県）の欠落や不正を弾く。GAS 側にエラー処理がなく、不正入力は HTML のエラーページとして返るため
- **`date` は検証しない**: シートは判明している粒度をそのまま記録するため、`2026-04-01` / `2026-04` / `2026` / `2026夏` のいずれもありうる。単一のパターンに押し込められない
- **`pref` / `city` は更新対象外**: エントリーを同定・配置する列で、進捗を表す列ではない（`city` は地図の市区町村代表点フォールバックの引き当てに使う）。修正は文脈の見えるスプレッドシート上で行う
- **`PLAN_API_URL`**: `/exec` の URL。`.env`（gitignore 済み、`.env.example` を参照）に置き、`dotenv` で読む

### ビルド・デプロイ

- `esbuild.config.ts` - `src/frontend/app.tsx` を `html/js/bundle.js` にバンドル（watch / serve / build モード）
- `wrangler.toml` - Workers 設定。D1 バインディング（`DB`）、`migrations_dir`、`env.production` の許可オリジン
- TypeScript 設定はフロント（`tsconfig.json`）とバックエンド（`tsconfig.backend.json`）で分かれており、`npm run typecheck` は両方を実行する
- デプロイ先は Cloudflare Workers（バックエンド）と静的ホスティング（`html/`）

### 主要技術

Cloudflare Workers / Hono / D1 / jose、React 19 / Google Maps API / `@react-oauth/google`、cheerio / jaconv、esbuild、Vitest（`@testing-library/react` + jsdom）、Biome。
