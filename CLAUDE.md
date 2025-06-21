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
  - または `npm run lint:fix` で自動修正

## コミットルール

- **コミット前確認**: 必ずユーザーに確認してからコミットを実行
- **自動コミット禁止**: ユーザーの明示的な許可なしにコミットしない
- **変更内容の説明**: コミット前に変更内容と影響を簡潔に説明する

## 開発コマンド

### データ生成
- `npm run generate:all` - 完全な駅データセットを生成（CSV → GeoJSON）
- `npm run generate:stations` - michi-no-eki.jpから駅データをスクレイピング
- `npm run generate:geojson` - CSVをGeoJSON形式に変換

### フロントエンド開発
- `npm run build` - browserify + babelでプロダクションバンドルをビルド
- `npm start` - 開発用ウォッチモード（変更時に自動リビルド）
- `gulp build` - 代替ビルドコマンド
- `gulp serve` - ポート8081で開発サーバーを起動
- `gulp watch` - フロントエンドアセットを監視してリビルド
- `gulp`（デフォルト）- サーバー起動＋ウォッチモード


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
- **gulpfile.js** - browserify、babelify（ES2015 + React）を使用したビルドシステム

### 主要技術
- **バックエンド**: TypeScript、HTML解析用cheerio、HTTP用fetch API、テキスト正規化用jaconv
- **フロントエンド**: React（レガシーcreateClass）、Google Maps API、バンドル用browserify + babel
- **ビルド**: フロントエンド用Gulp + npmスクリプト

### データフロー
駅データフロー：Webスクレイピング → CSV → GeoJSON → Reactフロントエンド → Google Maps可視化。アプリはlocalStorageとURLベースのクエリ共有モードの両方をサポートしています。