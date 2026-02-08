# w0s.jp-shell

`w0s.jp` サーバーで稼働しているシェルスクリプト

## おことわり

あくまで個人的な趣味で作成しているものです。機密にすることもないので公開している程度のものです。ドキュメントも最低限ですし、必ずしも最新状況に追従できるとも限りません。

## 機能一覧

| 名称                                                              | 機能名          | 概要                                                                                                                                    |
| ----------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [テスト](node/src/component/test.ts)                              | test            | 動作確認用。環境整備の際はまずはこれが動くことを目指す                                                                                  |
| [ウェブ巡回（新着）](node/src/component/crawlerNews.ts)           | crawlerNews     | ウェブページをスクレイピングし（HTML ページのみ）、新着情報の差分を調べて通知する                                                       |
| [ウェブ巡回（リソース）](node/src/component/crawlerResource.ts)   | crawlerResource | ウェブページを巡回し（HTML リソースに限らない）、レスポンスボディの差分を調べて通知する                                                 |
| [JR 列車空席確認](node/src/component/jrSearchTrain.ts)            | jrSearchTrain   | JR CYBER STATION で在来線列車の空席があれば通知する                                                                                     |
| [サムネイル画像生成](node/src/component/thumbImage.ts)            | thumbImage      | `media.w0s.jp` と連携し、サムネイル画像を生成する                                                                                       |
| [横浜市立図書館　予約情報](node/src/component/yokohamaLibrary.ts) | yokohamaLibrary | [横浜市立図書館蔵書検索](https://opac.lib.city.yokohama.lg.jp/winj/opac/top.do?lang=ja)で予約した本の予約状態（予約順位など）を通知する |
