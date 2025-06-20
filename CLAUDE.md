# CLAUDE.md

このファイルは、このリポジトリでコードを扱う際のClaude Code (claude.ai/code)向けのガイダンスを提供します。

## プロジェクト概要

日本の道の駅の地図アプリケーションです。michi-no-eki.jpから駅データをスクレイピングし、インタラクティブなGoogle Mapsインターフェース上に表示します。Pythonによるデータスクレイピング/処理とReactベースのフロントエンドを組み合わせたプロジェクトです。

## 言語ルール

- **Claude Codeとのやり取り**: 日本語を使用
- **コミットログ**: 英語で記述
- **プログラム内のコメント・出力メッセージ**: 英語で記述

## 開発コマンド

### データ生成
- `make all` - 完全な駅データセットを生成（CSV → GeoJSON）
- `make data/stations.csv` - michi-no-eki.jpから駅データをスクレイピング
- `make data/stations.geojson` - CSVをGeoJSON形式に変換
- `make clean` - Python仮想環境を削除

### フロントエンド開発
- `npm run build` - browserify + babelでプロダクションバンドルをビルド
- `npm start` - 開発用ウォッチモード（変更時に自動リビルド）
- `gulp build` - 代替ビルドコマンド
- `gulp serve` - ポート8081で開発サーバーを起動
- `gulp watch` - フロントエンドアセットを監視してリビルド
- `gulp`（デフォルト）- サーバー起動＋ウォッチモード

### Python環境
- `make bin/python` - 依存関係を含むPython 3.10仮想環境をセットアップ
- `bin/python generate_stationlist.py` - 駅データスクレイパーを実行
- `bin/python generate_geojson.py` - 駅データをGeoJSONに変換

## アーキテクチャ

### データパイプライン
1. **generate_stationlist.py** - michi-no-eki.jpから駅データをスクレイピング、都道府県/駅の階層を処理、CSVを出力
2. **generate_geojson.py** - CSVをマッピング用のGeoJSON形式に変換
3. **Makefile** - 適切な依存関係でデータパイプラインを調整

### フロントエンド構造
- **html/js/app.js** - Reactアプリのエントリーポイント、RoadStationMapコンポーネントをレンダリング
- **html/js/roadmap.js** - Google Maps統合を含むメインマップコンポーネント
- **html/js/roadstation/** - 駅データ管理（localStorageと共有クエリ）
- **html/js/storage/** - クエリ永続化ユーティリティ
- **gulpfile.js** - browserify、babelify（ES2015 + React）を使用したビルドシステム

### 主要技術
- **バックエンド**: Python 3.10、HTML解析用lxml、HTTP用requests、データ変換用geojson
- **フロントエンド**: React（レガシーcreateClass）、Google Maps API、バンドル用browserify + babel
- **ビルド**: データパイプライン用Make、フロントエンド用Gulp + npmスクリプト

### データフロー
駅データフロー：Webスクレイピング → CSV → GeoJSON → Reactフロントエンド → Google Maps可視化。アプリはlocalStorageとURLベースのクエリ共有モードの両方をサポートしています。