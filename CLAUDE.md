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
- **開発計画マスタ**: `npm run plan:list`（調査キュー） / `plan:show` / `plan:edit` / `plan:touch` / `plan:add` / `plan:url:add` / `plan:url:rm`（`plan:list` 以外は引数を渡さずに実行すると使い方が出る）
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
├── lib/         scripts と、それが書くデータの検証が共有するモジュール（CSV パース、Station 型、plans.json のレコード順）
├── scripts/     CLI のエントリーポイント（npm script から実行する）
└── test-utils/  テスト用ヘルパー

docs/         人が読むドキュメント（Pages には配信されない）
migrations/   Cloudflare D1 マイグレーション（SQL）
html/         静的アセット（index.html、CSS、ビルド成果物 bundle.js）
data/         生成データ（CSV / GeoJSON）と開発計画マスタ（plans.json）
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

開発計画マップは `data/plans.json` を `src/frontend/planned-stations.ts` の `loadPlannedStations()` で読む。純粋変換 `toPlannedStations(records, cities)` を分離してあり、`lat` / `lng` が `null` のレコードは `data/cities.json` の市区町村代表点にフォールバックする（`coordSource` の 3 値 `exact` / `city` / `none`）。

情報ウィンドウは `urls` 列（`{ title, url }` の配列）を出典リストとして描画する（`src/frontend/components/PlanInfoWindow.tsx`）。

- **リンクを構造として持つ**: この列に入るのは出典リンクだけなので、記法を決めて 1 つの文字列に詰めると、書くたびに記法を守らせ、読むたびに解析することになる。配列なら書き手も読み手も分解しなくてよい

開発計画マップの並び順は `src/frontend/plan-order.ts` が決める。カテゴリ順に並べ、`開業` / `登録済み` / `計画中(予定あり)` は開業（予定）日順、`計画中(未定)` / `凍結` / `中止` は都道府県順（どちらも同着は都道府県 → 市区町村 → 名前で決める）。粒度の混在した `date` をどう順序に落とすかは同ファイルのコメントを参照。

- **並び替えるのは読み込み直後（`toPlannedStations()`）**: サイドバーはカテゴリごとに push するだけなので配列の順序がそのまま表示順になる。並び順をレンダリングなしでテストできる
- **都道府県順は `data/cities.json` の並びから引く**: 全国地方公共団体コード順のテーブルそのもので、地図が既に読み込んでいる。47 件のリストをコード側に持つと二重管理になる

開発計画マップは地図の右クリックでその地点の座標を `[lat, lng]` 形式でクリップボードにコピーする（`src/frontend/components/PlanCoordCopy.tsx`）。座標が未記入の駅を調査するとき、地図で位置を当てて `data/plans.json` の `lat` / `lng` に貼るための機能。丸め桁とブラウザの右クリックメニューを抑止する理由は同ファイルのコメントを参照。

### データパイプライン

1. `generate-stationlist.ts` - michi-no-eki.jp を都道府県・駅の階層でたどり `data/stations.csv` を出力（`cheerio` で HTML 解析、`jaconv` でテキスト正規化）
2. `generate-geojson.ts` - CSV を Point Feature の GeoJSON（`data/stations.geojson`）へ変換
3. フロントエンドが GeoJSON を読み込んで描画

### 開発計画マスタ（`data/plans.json`）

開発計画マップ（`html/plan.html`）のデータ元。人手と調査セッションが育てる台帳で、**このリポジトリが唯一のマスタ**。地図はこのファイルをそのまま読む（`deploy.yml` が `data/` をまるごと GitHub Pages に載せるので、マスタがそのまま配信ファイルになる）。

もとは Google スプレッドシートに置き、GAS の Web App（`doGet` / `doPost`）と公開 CSV で読み書きしていた。git に移した理由:

- **承認ゲートが約束から仕組みになる**: 「報告して承認を得てから書く」という運用上の約束が PR レビューになる。誤った上書きは revert できる
- **書き込み口が push 権限になる**: GAS Web App は `ANYONE_ANONYMOUS` で公開された無認証の書き込み口だった
- **読み取り経路が 1 つになる**: 地図は公開 CSV、CLI は `doGet` という二重性がなくなる
- **外部サービスへの依存が読み書きの両方から消える**

#### 形式

1 要素 1 駅の JSON 配列（現在 175 件）。キー順は固定で `name` / `pref` / `city` / `status` / `date` / `lat` / `lng` / `urls` / `checked_on`。型は `lat` / `lng` が number または null、`urls` が `{ title, url }`（キー順も固定）の配列、残りは string（空は `""`）。レコード順も固定で `pref` → `city` → `name`（`pref` と `city` は `data/cities.json` の出現順 = 全国地方公共団体コード順。`cities.json` に引き当たらない `city` はその `pref` の末尾に文字列順）。

- **キー順を固定する**: 差分の安定のためだけでなく、`name` が一意でない（「道の駅 川崎町」が福岡県と宮城県にある）ため、レコードを特定するには `name` の直後に `pref` が来る必要がある
- **レコード順を固定する**: 順序が動くと差分が壊れる。都道府県順にすると GitHub の編集 UI で目的の駅に当たりが付く（表示順は別物で、`plan-order.ts` が読み込み後に決める）
- **単一ファイルにする**: マスタがそのまま配信ファイルになりビルド工程が増えない。1 駅 1 ファイルにするとバンドル生成が必要になり、生成物のコミット漏れという失敗モードを新たに作る。この規模ならコンフリクト耐性のためにそれを払う価値はない
- **pretty-print（1 行 1 フィールド）にする**: 差分が読め、コンフリクトが同一レコードに限定される。JSONL はレコード全体が 1 行に潰れ、出典が 5 本ある駅では `urls` だけで数百桁になって GitHub の編集 UI で扱いづらい
- **`date` は形式を決めない**: 判明している粒度をそのまま記録するため、`2026-04-01` / `2026-04` / `2026` / `2026夏` のいずれもありうる
- **`checked_on` はその駅を最後に調査した日**: 調査は古い順に少しずつ進めるため**この列は調査キューの並び替えキー**で、書き忘れるとキューが進まなくなる
- **`urls` は 1 レコード 10 件まで**: 上限がないと古い記事が積もり、新しい出典がその中に埋もれる。上限があれば 10 件に達した駅では 1 本足すたびにいちばん弱い 1 本を見直すことになり、出典が新陳代謝する。どの 1 本を落とすかの基準はスキル側にある（本数だけを `npm run ci` が検証する）

#### 読み書きは `npm run plan:*`

Edit ツールでも jq でもなく `src/scripts/plan.ts` が引き受ける（`plan:list` / `plan:show` / `plan:edit` / `plan:touch` / `plan:add` / `plan:url:add` / `plan:url:rm`）。**どの規則がなぜ jq では守れなかったかは `plan.ts` 冒頭のコメントにある。**

- **1 モジュールを 7 つの npm script から呼ぶ**: 呼ぶ側にはサブコマンドがなくコマンド名だけがある。verb は npm script が渡す
- **駅は位置引数、オプションは新しい値**: `plan:edit "道の駅 石川町" "福島県" --name "道の駅石川"` は「いまこの名前で入っている駅の名前を変える」と読める。位置引数とオプションで役割が割れているので、`--new-` のような prefix が要らない
- **`checked_on` はコマンドが押す**: 書き手に見えるフィールドではなく、書き込みの結果として付く（下記「`checked_on` の更新は CI で強制しない」）
- **`plan:add` はメンテナのコマンド**: 調査セッションは台帳にない駅を自分で足さず `docs/plan-reports.md` に報告する。新規レコードは既存レコードの更新より大きな主張で、取り違えたときに残るのが値の誤りではなく実在しない計画になるため、承認を挟む。位置決めが手作業では面倒なのでコマンド自体は残す
- **出典の件数だけは検証しない**: 書き手が管理し、`plan-data.test.ts` が最後に 1 度だけ検証する（理由は `plan.ts` 冒頭）

レコード順の定義は `src/lib/plan-record-order.ts` に 1 つだけ置く。

手順（調査の進め方、出典の選び方、PR の出し方）は `.claude/skills/michi-no-eki-plan-research/SKILL.md` にある。**同じことをここに書き足さない** — 手順が変わったとき片方だけ直されて、残った側が嘘になる。

#### 整形は Biome、構造は vitest

整形は Biome に任せ、正規形のための専用コマンドは作らない。`.gitignore` の例外により `data/plans.json` だけが Biome の対象になる（`vcs.useIgnoreFile: true`）。Biome の JSON 整形は展開方向にのみ正規化するので（4 スペースの pretty JSON は無変更、2 スペースや 1 行に潰れたものは 4 スペースに展開）、編集の道具と争わない。整形崩れは `npm run lint` が検出し `npm run lint:fix` が直す。

構造の検証は `src/frontend/plan-data.test.ts` が実データを読んで行う（キーの集合と順序、`status` の 5 値、`pref` の実在、`name` の非空、`name` + `pref` の一意性、座標の型、`urls` の形（1 件以上 10 件以下、`title` の非空、`url` の重複なし、`http` / `https` スキーム）、レコード順）。**インデントやバイト一致は検証しない** — 前者は Biome の担当で、後者は数値のレンダリングが書き手によって揺れる（座標がちょうど整数のとき `36.0` と `36` のどちらもありうる）ため、原因の分かりにくい赤になる。

**`checked_on` の更新は CI で強制しない。** 「差分に現れた駅は `checked_on` が更新されている」を CI ルールにすると、GitHub UI で `city` の誤字を直しただけの PR が落ちる。押印忘れのコスト（再調査 1 枠）より誤検知のコストが大きいので、検証ではなく `plan.ts` の既定動作に置く（どの書き込みでも押す）。

#### 相談事項は `docs/plan-reports.md` に書く

調査で出た、データの列に書けない相談事項（所在地の食い違い、代替の見つからないリンク切れ、判断を仰ぎたい事項、台帳にない駅の報告）の置き場所。旧経路では `plan:update --report` が GAS 経由で Slack に流していたが、その経路も GAS と一緒に消えた。

Issue にしないのは、ファイルなら contents 権限だけで扱えて、GitHub API に到達できないセッションでも調査ループが完結するため。リポジトリの既存の作法（App トークンに `permission-contents: write` と `permission-pull-requests: write` だけを明示）とも揃う。PR の差分に出るのでレビューで必ず目に入る。

**調査セッションは追記するだけ**で、対応と消し込みはメンテナが行う。読んで判断する責務を調査側に持たせない。

`deploy.yml` は `html/` と `data/` だけを Pages にコピーするので `docs/` は配信されない。

### ビルド・デプロイ

- `esbuild.config.ts` - `src/frontend/app.tsx` を `html/js/bundle.js` にバンドル（watch / serve / build モード）
- `wrangler.toml` - Workers 設定。D1 バインディング（`DB`）、`migrations_dir`、`env.production` の許可オリジン
- TypeScript 設定はフロント（`tsconfig.json`）とバックエンド（`tsconfig.backend.json`）で分かれており、`npm run typecheck` は両方を実行する
- デプロイ先は Cloudflare Workers（バックエンド）と静的ホスティング（`html/`）

### 主要技術

Cloudflare Workers / Hono / D1 / jose、React 19 / Google Maps API / `@react-oauth/google`、cheerio / jaconv、esbuild、Vitest（`@testing-library/react` + jsdom）、Biome。CSV / JSON のパースに外部ライブラリは使わない（CSV は `src/lib/station-csv.ts` の手書き、JSON は標準の `JSON.parse` / `Response.json()`）。
