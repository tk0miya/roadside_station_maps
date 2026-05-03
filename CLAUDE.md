# CLAUDE.md

このファイルは、このリポジトリでコードを扱う際のClaude Code (claude.ai/code)向けのガイダンスを提供します。

## プロジェクト概要

日本の道の駅の地図アプリケーションです。michi-no-eki.jpから駅データをスクレイピングし、インタラクティブなGoogle Mapsインターフェース上に表示します。TypeScriptによるデータスクレイピング/処理とReactベースのフロントエンドを組み合わせたプロジェクトです。

## 言語ルール

- **Claude Codeとのやり取り**: 日本語を使用
- **コミットログ**: 英語で記述
- **プログラム内のコメント・出力メッセージ**: 英語で記述

## コード品質ルール

- **TypeScriptコードの変更時**: 必ずBiomeでlintとformatを実行
  - `npm run lint` でコードチェック
  - `npm run format` でコードフォーマット
  - `npm run typecheck` で型チェック
  - または `npm run lint:fix` で自動修正
- **プロジェクト完了時**: 必ずlint、format、typecheckを実行してコードの品質を確保

## コミットルール

- **変更内容重視**: コミットログは「何を変更したか」を説明し、作業の経緯や途中の改善作業は含めない
- **結果説明**: 変更の結果として何が達成されたかを明確に示す

## 開発コマンド

### データ生成
- `npm run generate:all` - 完全な駅データセットを生成（CSV → GeoJSON）
- `npm run generate:stations` - michi-no-eki.jpから駅データをスクレイピング
- `npm run generate:geojson` - CSVをGeoJSON形式に変換

### デバッグモード
`generate:stations`は実行に10分程度かかるため、開発時はデバッグオプションを使用してください：

- `npm run generate:stations -- --debug --max-prefs=2 --max-stations=3`
  - `--debug`: デバッグモードを有効化（処理状況の詳細表示）
  - `--max-prefs=N`: 処理する都道府県数を制限
  - `--max-stations=N`: 各都道府県で処理する道の駅数を制限

**使用例:**
- 動作確認: `npm run generate:stations -- --debug --max-prefs=1 --max-stations=2`
- 部分テスト: `npm run generate:stations -- --debug --max-prefs=5 --max-stations=10`

**⚠️ 重要な注意事項:**
- **デバッグ実行後は`data/`以下をコミットしないでください**
- デバッグモードで生成されるデータは不完全なため、本番データを破損させる可能性があります
- `git status`でdataディレクトリの変更を確認し、必要に応じて`git restore data/`で元に戻してください

### フロントエンド開発
- `npm run build` - esbuildでプロダクションバンドルをビルド（高速）
- `npm start` - 開発用ウォッチモード（変更時に自動リビルド）
- `npm run serve` - ポート8081で開発サーバーを起動（ライブリロード付き）
- `npm run dev` - 開発サーバー起動（serveのエイリアス）

### テスト・品質管理
- `npm test` - Vitestでユニットテストを実行
- `npm run lint` - Biomeでコード品質チェック
- `npm run format` - Biomeでコードフォーマット
- `npm run typecheck` - TypeScriptの型チェック
- `npm run lint:fix` - Biomeでコードの自動修正

## テストルール

- **test-utilsの使用**: テストでモックオブジェクトが必要な場合は `src/test-utils/test-utils.ts` のヘルパー関数を使用
- **StyleManagerを使用するテスト**: StyleManagerを使用するテストでは、基本的に `MemoryStorage` インスタンスを使用してStyleManagerを作成（オンメモリ実装のため外部モックは不要）


## アーキテクチャ

### ディレクトリ構成

```
src/
├── backend/    Cloudflare Workers（Hono）バックエンドAPI
│   ├── index.ts             ルーティング・アプリ初期化
│   ├── env.ts               Workers環境変数の型定義
│   ├── auth/                Google OAuth code 交換 / セッション JWT 発行
│   ├── handlers/            auth / visits / shares のリクエストハンドラ
│   ├── db/                  D1（SQLite）アクセスレイヤ
│   └── middleware/          CORS / 認証ミドルウェア
├── frontend/   React 19 製フロントエンド（TSX）
│   ├── app.tsx              エントリーポイント（GoogleOAuthProvider）
│   ├── style-manager.ts     駅マーカーのスタイル管理 + ストレージ抽象の組み立て
│   ├── components/          UIコンポーネント
│   ├── auth/                Google OAuth + JWT 認証
│   ├── storage/             訪問データのストレージ抽象（memory / remote）+ APIクライアント
│   ├── types/               GeoJSON型など
│   └── config.ts            フロントエンド設定（Google Client ID等）
├── shared/     フロント・バック共通の型定義
│   ├── api-types.ts         APIリクエスト・レスポンス型
│   └── auth-types.ts        AuthUser / AuthState 型
├── lib/        共通ユーティリティ
│   ├── station-csv.ts       CSV パース
│   └── types.ts             Station 型
├── scripts/    データパイプライン用CLIスクリプト
│   ├── generate-stationlist.ts
│   └── generate-geojson.ts
└── test-utils/ テスト用ヘルパー

migrations/    Cloudflare D1 マイグレーション（SQL）
html/          静的アセット（index.html、CSS、ビルド成果物 bundle.js）
data/          生成データ（CSV / GeoJSON）
```

### バックエンド（Cloudflare Workers + Hono）

- **フレームワーク**: Hono を Cloudflare Workers 上で実行（`src/backend/index.ts`）
- **データベース**: Cloudflare D1（SQLite）を `DB` バインディングとして利用
- **認証**: Google OAuth 2.0 Implicit Flow（ID トークン）+ 自前のセッション JWT（`requireAuth` で保護）
- **エンドポイント**:
  - `GET /health` - ヘルスチェック
  - `POST /sessions` - フロントから受け取った Google ID トークンを検証し、自前のセッション JWT を発行（リソース指向：将来のログアウトを `DELETE /sessions/current` で対称に表現できる）
  - `GET /shares/:shareId` - 共有用：他ユーザーの訪問データを公開取得
  - `POST /api/shares` - 認証済みユーザーの共有IDを発行・取得
  - `GET /api/visits` - 認証済みユーザーの訪問一覧を取得
  - `PUT /api/visits/:stationId` - 訪問記録の作成・更新（styleId 1〜4）
  - `DELETE /api/visits/:stationId` - 訪問記録の削除
- **テーブル**:
  - `visits` (`migrations/0001_create_visits.sql`) - user_id, station_id, style_id, updated_at
  - `shares` (`migrations/0002_create_shares.sql`) - share_id, user_id, created_at（1ユーザー1共有ID）

### 認証アーキテクチャ（Google ID トークン交換 + 自前セッション JWT）

#### 背景

複数 Google アカウントにログインしている環境では One Tap によるサイレント再認証が機能せず、Google ID トークン（有効期限 1 時間）を毎リクエストに添付する従来方式ではセッションが頻繁に切れていた。これを解決するため、**ログイン時のみ Google ID トークンを検証して自前のセッション JWT を発行し、以後は Google から完全に独立して認証を回す方式**に切り替えている。

Authorization Code Flow ではなく Implicit Flow のままにしているのは、用途が身元確認 (`sub`) のみで Google API を継続呼び出す要件がなく、`client_secret` も Google refresh token も不要だからである。

#### 登場するトークン

| 名称 | 形式 | 寿命 | 発行者 | 用途 |
|---|---|---|---|---|
| **Google ID Token** | JWT (RS256, Google 署名) | 約 1 時間 | Google | 「このアプリにログインしようとしている本人」を Google が保証 |
| **Session JWT** | JWT (HS256, 自前署名) | 1 年（自動延長） | バックエンド | 継続的な認証手段。`sub` クレームに Google `sub` を格納 |

#### システム別の責務

> **バックエンドは Google ID Token / Session JWT の検証と Session JWT の発行に責任を持つ。フロントエンドは Google ID Token の取得、Session JWT の保存と送信に責任を持つ。**

| 責務 | バックエンド | フロントエンド |
|---|---|---|
| Google ID Token の取得 | - | ✅ `@react-oauth/google` 経由で Google から取得 |
| Google ID Token の検証 | ✅ `auth/google.ts` で JWKS 検証 | - |
| Session JWT の発行 | ✅ `auth/session.ts:issueSessionToken` | - |
| Session JWT の検証（毎リクエスト） | ✅ `middleware/auth.ts:requireAuth` | - |
| Session JWT の保存 | - | ✅ `localStorage` キー `auth:sessionToken` |
| Session JWT の送信 | - | ✅ `Authorization: Bearer <token>` ヘッダ |
| Session JWT のローテーション発火 | ✅ 残期限が 30 日未満になったら新トークンを発行 | - |
| ローテーション後トークンの保存 | - | ✅ レスポンスヘッダから読み取って localStorage 上書き |

#### フロー

```
1. 初回ログイン
   フロント: GoogleLogin（@react-oauth/google の Implicit Flow）でユーザーがアカウントを選択
            → Google ID トークン取得
   フロント → POST /sessions { provider: 'google', idToken }
   バックエンド:
     - id_token を Google JWKS (RS256) で検証
     - sub を取り出し、自前のセッション JWT（HS256, 1 年）を発行
     - 201 Created で { sessionToken, expiresAt } を返却
   フロント: localStorage に sessionToken を保存（Google ID トークンは破棄）

2. 通常 API リクエスト
   フロント → Authorization: Bearer <sessionToken>
   バックエンド: requireAuth が SESSION_SECRET で HS256 検証 → user.sub を取得

3. スライディング期限延長（リフレッシュ）
   requireAuth は検証成功後に sessionToken の残期限を確認し、
   残り 30 日未満であれば新しい sessionToken を発行してレスポンスヘッダ
   X-Session-Token / X-Session-Expires-At に載せる。
   フロントは fetch ラッパーでヘッダの有無を確認し、あれば localStorage を上書きする。
   → 30 日以内に 1 回でもアクセスがあればセッションは半永久的に維持される。

4. セッション期限切れ
   30 日以上アクセスが途絶えた状態で残期限が尽きると失効。
   フロントは 401 を受けたら localStorage をクリアして再ログイン UI を表示する。
```

#### 設計判断

- **Authorization Code Flow ではなく Implicit Flow を採用**: 用途は身元確認 (`sub`) のみで、Google API を継続呼び出す要件がないため、Google refresh token も `client_secret` も不要。Implicit Flow で得た ID トークンを 1 回検証するだけで十分。
- **セッション JWT は 1 年・ステートレス + スライディング延長**: D1 にセッションテーブルを増やさず、`SESSION_SECRET` による HS256 署名のみで検証する。残期限が 30 日未満になった時点で `requireAuth` が新しいトークンを発行し、レスポンスヘッダ経由でフロントに渡す（リフレッシュ専用エンドポイントは設けない）。アクティブなユーザーのセッションは事実上失効しない。失効・即時 revoke が必要になった段階で `sessions` テーブルを追加する余地は残している。
- **`sub` 漏洩耐性**: Google `sub` は (Google アカウント × OAuth クライアント ID) ごとに発行される不透明 ID で、クレデンシャルではない。そのため `sub` 単体が漏れてもなりすましや個人情報逆引きには使えない。共有 API は所有者の `sub` を返さず、別 UUID の `share_id` を介して訪問データを公開する設計を維持する。ログ・URL・他ユーザー向けレスポンスには `sub` を露出させない。
- **DB スキーマ変更なし**: `user_id` は引き続き Google `sub` を利用する。
- **`POST /sessions` は公開エンドポイント**: `requireAuth` の対象外（`/api/*` のみ保護）。
- **エンドポイントはリソース指向**: 認証手段（プロバイダ）はパスではなく body の `provider` で指定する。プロバイダを追加しても URL は不変。将来ログアウトを実装する場合は `DELETE /sessions/current` で対称に書ける。

#### シークレット

- `GOOGLE_CLIENT_ID` - 公開 ID。`wrangler.toml` の `[vars]` に記載
- `SESSION_SECRET` - 自前セッション JWT の HS256 署名鍵。`wrangler secret put SESSION_SECRET` でローカル / `--env production` で本番に投入。ローテーションすると全ユーザーが強制ログアウトされる

#### バックエンド構成

- `src/backend/auth/google.ts` - Google ID トークンを JWKS で検証し `sub` を取り出す（`verifyGoogleIdToken`）
- `src/backend/auth/session.ts` - 自前セッション JWT の sign / verify ヘルパー（HS256, `sub` クレーム, 1 年有効）。`verifySessionToken` は `sub` と `exp` を返す
- `src/backend/handlers/sessions.ts` - `POST /sessions` ハンドラ（`sessionsRouter` を `app.route('/sessions', ...)` で mount）
- `src/backend/middleware/auth.ts` - `requireAuth` は Session JWT を検証し、残期限が 30 日未満なら新トークンを発行してヘッダ `X-Session-Token` / `X-Session-Expires-At` に載せる
- `src/backend/middleware/cors.ts` - 上記 2 ヘッダを `exposeHeaders` に列挙し、ブラウザがフロントから読めるようにする

#### フロントエンド実装要件

- `auth-manager.ts`
  - `localStorage` キー `auth:sessionToken` に Session JWT を保管
  - 起動時に payload をデコードして `exp` を確認（署名検証はしない・できない）
  - `updateSessionToken(token, expiresAt)` メソッドを公開し、ローテーション後の上書き保存と購読者通知を担う
- `LoginButton` / ログインフロー
  - `GoogleLogin` 成功時に取得した ID トークンを `POST /sessions { provider: 'google', idToken }` で送信し、返却された `sessionToken` を保存
- API クライアント (`visits-api-client.ts` / `shares-api-client.ts`)
  - `Authorization: Bearer <sessionToken>` を毎リクエスト付与
  - レスポンスヘッダ `X-Session-Token` を確認し、あれば `authManager.updateSessionToken(...)` を呼ぶ
  - 401 を受けたら `authManager` を未ログイン状態に戻し、再ログイン UI を表示
- 不要になる仕組み
  - One Tap によるサイレント再認証 (`SilentSignIn` 相当) は撤去可能（1 年セッション + スライディング延長で代替）
  - Google ID トークンの永続化は不要（受領後すぐにバックエンドへ送って破棄）

### フロントエンド（React 19 + TypeScript）

- **エントリーポイント**: `src/frontend/app.tsx` が `GoogleOAuthProvider` で `RoadStationMap` を包んで描画
- **主要コンポーネント** (`src/frontend/components/`)
  - `RoadStationMap` - 地図全体のオーケストレーション
  - `Markers` - GeoJSON 駅データを Google Maps Data Layer として描画
  - `InfoWindow` - 駅詳細のポップアップ
  - `StationCounter` - スタイル別の訪問数カウンタ
  - `LoginButton` - Google OAuth ログインボタン
  - `ShareButton` - 共有リンク生成ボタン
- **認証** (`src/frontend/auth/`)
  - `auth-manager.ts` - `AuthState` を保持するシングルトン。バックエンド発行の **セッション JWT** を `localStorage` に永続化
  - `jwt.ts` - セッション JWT のクライアント側デコード（`sub` / 期限の参照用、署名検証はサーバー側で実施）
  - `use-auth.ts` - React フックで `AuthState` を購読
  - **ログイン**: `GoogleLogin` コンポーネントで取得した Google ID トークンを `POST /auth/google` に送り、返却された `sessionToken` を保存する
  - **詳細**: 「認証アーキテクチャ」セクションを参照
- **ストレージ抽象** (`src/frontend/storage/`) - 訪問データ（駅 → styleId のマッピング）の永続化レイヤ
  - `types.ts` - `Storage` インターフェース
  - `memory-storage.ts` - オンメモリ実装。ゲスト閲覧・共有ビュー・テストで使用
  - `remote-storage.ts` - Workers API と同期するリモート実装（デバウンス付き）
  - `visits-api-client.ts` / `shares-api-client.ts` - REST API クライアント
- **スタイル管理**: `style-manager.ts` の `createStyleManager()` がアプリの状態に応じて適切な `Storage` 実装を選択し、`StyleManager` を生成
  - `?share=<id>` 付き: 共有 API から取得したデータで `MemoryStorage` を初期化
  - ログイン済み: Workers + D1 と同期する `RemoteStorage`
  - 未ログイン: 空の `MemoryStorage`（ゲストモード、データはセッション内のみ保持）

### データパイプライン

1. `src/scripts/generate-stationlist.ts` - michi-no-eki.jp をスクレイピング、都道府県・駅の階層をたどって `data/stations.csv` を出力（`jaconv` でテキスト正規化、`cheerio` で HTML 解析）
2. `src/scripts/generate-geojson.ts` - CSV を読み込み、Point Feature の GeoJSON (`data/stations.geojson`) に変換
3. フロントエンドは生成された GeoJSON を読み込み Google Maps 上に描画

### ビルド・デプロイ

- **`esbuild.config.ts`** - `src/frontend/app.tsx` を `html/js/bundle.js` にバンドル。watch / serve / build モードを切り替え
- **`html/index.html`** - Google Maps API と `js/bundle.js` を読み込む静的HTML
- **`wrangler.toml`** - Workers の設定。D1 バインディング（`DB`）、`migrations_dir`、`env.production` の許可オリジン等を定義
- **TypeScript設定** - フロント (`tsconfig.json`) とバックエンド (`tsconfig.backend.json`) で別構成。`npm run typecheck` は両方を実行

### 主要技術

- **バックエンド**: Cloudflare Workers, Hono, D1 (SQLite), jose（JWT検証）
- **フロントエンド**: React 19, Google Maps API, `@react-oauth/google`
- **データ生成**: TypeScript, cheerio, jaconv, fetch API
- **ビルド**: esbuild
- **テスト**: Vitest（`@testing-library/react` + jsdom）
- **コード品質**: Biome（lint + format）
- **デプロイ**: Cloudflare Workers（バックエンド）、静的ホスティング（フロントエンド `html/`）

### データフロー

```
michi-no-eki.jp → スクレイピング → CSV → GeoJSON
                                          ↓
                                     React フロントエンド
                                          ↓
                                     Google Maps 描画

ユーザー操作（訪問記録）
  ├─ 未ログイン: MemoryStorage（セッション内のみ保持、永続化なし）
  ├─ ログイン:   RemoteStorage → Workers API → D1 に永続化
  └─ 共有閲覧:   ?share= で Workers API から取得 → MemoryStorage で表示

認証
  Google ── id_token ──▶ フロント ── POST /sessions ──▶ バックエンド
                                                              │
                                                              ▼
  フロント ◀── sessionToken (1年) + 残期限 < 30日なら自動延長 ──┘
     │
     └─ 以後の API: Authorization: Bearer <sessionToken>
```