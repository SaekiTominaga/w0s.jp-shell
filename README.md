# w0s.jp-shell

`w0s.jp` サーバーで稼働しているシェルスクリプト

## おことわり

あくまで個人的な趣味で作成しているものです。機密にすることもないので公開している程度のものです。ドキュメントも最低限ですし、必ずしも最新状況に追従できるとも限りません。

## 機能一覧

| 名称                                                                        | 機能名                    | 使用データベース | 概要                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------- | ------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [テスト](node/src/component/Test.ts)                                        | Test                      | ―                | 動作確認用。環境整備の際はまずはこれが動くことを目指す                                                                                                                                                                                                                                                            |
| [ウェブ巡回（新着）](node/src/component/CrawlerNews.ts)                     | CrawlerNews               | crawler          | ウェブページを巡回し（HTML ページのみ）、新着情報の差分を調べて通知する                                                                                                                                                                                                                                           |
| [ウェブ巡回（リソース）](node/src/component/CrawlerResource.ts)             | CrawlerResource           | crawler          | ウェブページを巡回し（HTML リソースに限らない）、レスポンスボディの差分を調べて通知する                                                                                                                                                                                                                           |
| [JR 空席確認](node/src/component/JrCyberStation.ts)                         | JrCyberStation            | ―                | JR CYBER STATION で空席があれば通知する                                                                                                                                                                                                                                                                           |
| [横浜市立図書館　予約連絡](node/src/component/YokohamaLibraryHoldNotice.ts) | YokohamaLibraryHoldNotice | ―                | [横浜市立図書館蔵書検索](https://opac.lib.city.yokohama.lg.jp/winj/opac/top.do?lang=ja)で予約した本は受取可能になっても連絡メールは翌朝配信なため、到着日に受け取れるようログインページをスクレイピングして独自に通知メールを送る（受取可能になる時間帯は各館によって概ね決まっているため、その時間帯に実行する） |

## 動作手順

1. `npm install`
1. `build` 実行（`package.json` の `scripts` 内に定義された `build` を実行することで JavaScript ファイルが出力される）。
1. `log4js.json` を作成（下記にサンプルを掲載）
1. `env` ファイルを作成
1. `configure` ディレクトリ内に動作させたい機能名の設定ファイルを作成（e.g. 「テスト」機能を動作させるなら、 `node/configure/schema/test.json` を参考に `node/configure/test.json` を作成）
1. データベース（SQLite）を使用する機能は DB ファイルを用意（現状、テーブル定義は非公開）。
1. プログラム実行（`package.json` の `scripts` 内に定義された `shell:{機能名}` を実行することで、プログラムが実行される）。

## log4js.json サンプル

```json
{
  "appenders": {
    "stdout": {
      "type": "stdout"
    }
  },
  "categories": {
    "default": {
      "appenders": ["stdout"],
      "level": "debug"
    }
  }
}
```

- [Documentation](https://log4js-node.github.io/log4js-node/)
- [log4js-example レポジトリに掲載されているサンプル](https://github.com/log4js-node/log4js-example/blob/master/config/log4js.json)
