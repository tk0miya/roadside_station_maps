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

- **コミット前確認**: 必ずユーザーに確認してからコミットを実行
- **自動コミット禁止**: ユーザーの明示的な許可なしにコミットしない
- **変更内容重視**: コミットログは「何を変更したか」を説明し、作業の経緯や途中の改善作業は含めない
- **結果説明**: 変更の結果として何が達成されたかを明確に示す
- **簡潔性**: コミット前に最終的な変更内容と影響を簡潔に説明する

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
- **StyleManagerを使用するテスト**: StyleManagerを使用するテストでは、基本的に `QueryStorage` インスタンスを使用してStyleManagerを作成（オンメモリ実装のため外部モックは不要）


## アーキテクチャ

### データパイプライン
1. **src/scripts/generate_stationlist.ts** - michi-no-eki.jpから駅データをスクレイピング、都道府県/駅の階層を処理、CSVを出力
2. **src/scripts/generate_geojson.ts** - CSVをマッピング用のGeoJSON形式に変換
3. **npm scripts** - 適切な依存関係でデータパイプラインを調整

### フロントエンド構造
- **html/js/app.js** - Reactアプリのエントリーポイント、RoadStationMapコンポーネントをレンダリング
- **html/js/roadmap.js** - Google Maps統合を含むメインマップコンポーネント
- **html/js/roadstation/** - 駅データ管理（localStorageと共有クエリ）
- **html/js/storage/** - クエリ永続化ユーティリティ
- **esbuild.config.js** - esbuildを使用した現代的なビルドシステム

### 主要技術
- **バックエンド**: TypeScript、HTML解析用cheerio、HTTP用fetch API、テキスト正規化用jaconv
- **フロントエンド**: React（レガシーcreateClass）、Google Maps API
- **ビルド**: esbuild（高速JavaScript/TypeScriptバンドラー）
- **テスト**: Vitest（高速テストフレームワーク）
- **コード品質**: Biome（linting + formatting）

### データフロー
駅データフロー：Webスクレイピング → CSV → GeoJSON → Reactフロントエンド → Google Maps可視化。アプリはlocalStorageとURLベースのクエリ共有モードの両方をサポートしています。