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
│   ├── handlers/            visits / shares のリクエストハンドラ
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
- **認証**: Google OAuth 2.0 の ID トークンを `jose` で検証し、`requireAuth` ミドルウェアで保護
- **エンドポイント**:
  - `GET /health` - ヘルスチェック
  - `GET /shares/:shareId` - 共有用：他ユーザーの訪問データを公開取得
  - `POST /api/shares` - 認証済みユーザーの共有IDを発行・取得
  - `GET /api/visits` - 認証済みユーザーの訪問一覧を取得
  - `PUT /api/visits/:stationId` - 訪問記録の作成・更新（styleId 1〜4）
  - `DELETE /api/visits/:stationId` - 訪問記録の削除
- **テーブル**:
  - `visits` (`migrations/0001_create_visits.sql`) - user_id, station_id, style_id, updated_at
  - `shares` (`migrations/0002_create_shares.sql`) - share_id, user_id, created_at（1ユーザー1共有ID）

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
  - `auth-manager.ts` - `AuthState` を保持するシングルトン。ID トークンはブラウザの `localStorage` に直接永続化
  - `jwt.ts` - Google ID トークンの検証
  - `use-auth.ts` - React フックで `AuthState` を購読
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
```