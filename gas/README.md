# 計画マップ用スプレッドシート API（Google Apps Script）

開設計画のスプレッドシートの**既存行を更新**する Apps Script ウェブアプリです。行の追加・削除は
扱いません。ソースは `src/gas/`、ビルドとリリースは `npm run gas:build` / `gas:push` / `gas:deploy`。

デプロイ URL とトークンの**両方が秘密**です。認証は Google ではなく共有トークンで行うため、
URL を知られた時点で防御はトークンだけになります。

## シートの前提

1 行目がヘッダ行で、次の列を持つこと（順序は自由・API が扱わない列を足すのも自由）。

| 列 | 更新 | 内容 |
|---|---|---|
| `name` | ✅ | 道の駅名。行の識別子 |
| `pref` | – | 都道府県。同名の道の駅を絞り込む第二の識別子 |
| `city` | – | 市区町村 |
| `status` | ✅ | `開業` / `登録済み` / `計画中` / `中止` のいずれか |
| `date` | ✅ | 開業（予定）日。`2027年春` のような粗い表記も可（自由記述） |
| `lat` / `lng` | ✅ | 緯度・経度。空欄可 |
| `memo` | ✅ | 備考。改行を含められる |

列の定義は `src/shared/plan-types.ts` にあります。

## API

エンドポイントはデプロイ URL（`https://script.google.com/macros/s/<deploymentId>/exec`）です。

Apps Script のウェブアプリは HTTP ステータスを選べず常に 200 を返します。そのため成否はボディで表します。

```jsonc
{ "ok": true,  "stations": [ /* ... */ ] }
{ "ok": true,  "station":  { /* ... */ } }
{ "ok": false, "error": { "code": "not_found", "message": "No station named \"道の駅 X\"" } }
```

`code` は `bad_request` / `unauthorized` / `not_found` / `conflict` / `internal` のいずれかです。
どれも自動リトライ向けではありません（`internal` には Sheets 側の一時障害も含まれるため、
原因を実行ログで確認してから叩き直してください）。

入口は `POST` だけです。Apps Script はリクエストヘッダを読めないため、トークンは JSON ボディに載せます。

### 一覧取得

更新対象の行を探すための読み取りです。

```bash
curl -sL "$URL" -H 'Content-Type: application/json' -d '{"token": "'"$TOKEN"'", "action": "list"}'
```

### 更新

対象行はトップレベルの `name`（必須）と `pref`（任意）で特定し、`station` に書いた列**だけ**を
上書きします。
`lat` に `null` を渡すとセルを空にできます。`station.name` を渡せばリネームできます。

```bash
curl -sL "$URL" -H 'Content-Type: application/json' -d '{
  "token": "'"$TOKEN"'",
  "action": "update",
  "name": "道の駅 なんとか",
  "pref": "長野県",
  "station": { "status": "開業", "date": "2027-04-01", "lat": 36.238, "lng": 137.972 }
}'
```

同名の道の駅は全国では存在しますが、同一県内には無いため、`pref` を足せば必ず一意に決まります。
`name` だけで一意なら `pref` は省略できます。絞り込みに使うのは**トップレベルの** `pref` で、
`station` の中の `pref` は他の更新できない列と同じく無視されます。

### 注意点

- 対象行が見つからなければ `not_found`、`name`（+ `pref`）で絞っても複数残れば `conflict` です。
  行が追加されることはありません。
- `station` のうち、更新できない列（`pref` / `city`）と未知のキーは**無視**します。書き込む列が
  1つも残らなければ、何もせず成功を返します。
- リネーム先の名前が同じ県内で使われていれば `conflict` です。他県での重複は許容します。
- 排他制御はありません。**呼び出しは1つずつ**にしてください。対象行はリクエスト先頭で読んだ
  シート全体から決めるため、同時に走らせると同じ名前へのリネームが二重に通ります。
- クライアントはリダイレクト追従を有効にしてください。`/exec` は `script.googleusercontent.com`
  にリダイレクトします。

## 開発

```bash
npm run gas:build    # src/gas → gas/main.js
npm run gas:watch    # 変更のたびに再ビルド
npm test             # src/gas/*.test.ts を含むユニットテスト
npm run typecheck    # tsconfig.gas.json を含む型チェック
```

コードを書くときの制約は CLAUDE.md の「計画マップ用スプレッドシートAPI」節を参照してください。
