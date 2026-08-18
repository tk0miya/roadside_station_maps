# 道の駅マップ

日本の道の駅を Google Maps 上に出す。地図は 2 つある。

- **既存の駅の地図**（`html/index.html`） — michi-no-eki.jp からスクレイピングした全国の道の駅。訪問記録をログインして保存・共有できる。要件と設計は [`docs/station-map.md`](docs/station-map.md)
- **整備計画マップ**（`html/plan.html`） — これから開業する駅を追う。仕様は [`docs/plan-map.md`](docs/plan-map.md)

開発の手引きは [`CLAUDE.md`](CLAUDE.md) にある。

## データの出典

**道の駅の情報** — [道の駅公式ホームページ](https://www.michi-no-eki.jp/)（全国「道の駅」連絡会）から取得している。

**市区町村と代表点** — 「アドレス・ベース・レジストリ」（デジタル庁）をもとに作成（[利用規約](https://www.digital.go.jp/policies/base_registry_address_tos)）。詳細は [`docs/cities.md`](docs/cities.md)。
