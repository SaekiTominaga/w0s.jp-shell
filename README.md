# w0s.jp-shell-node

w0s.jp サーバーで稼働しているシェルスクリプト（Node.js）

## おことわり

あくまで個人的な趣味で作成しているものです。機密にすることもないので公開している程度のものです。ドキュメントも最低限ですし、必ずしも最新状況に追従できるとも限りません。

## 機能一覧

| 名称 | 機能名 | 使用データベース | 概要 |
|-|-|-|-|
| [テスト](src/component/Test.ts) | Test | ― | 動作確認用。環境整備する際は、まずはこれが動くことを目指す。 |
| [Amazon 商品情報チェッカー](src/component/AmazonDp.ts) | AmazonDp | amazonpa, diary | Amazon 商品情報を PA-API を使用して取得し、 DB に格納済みのデータを照合して更新する。 |
| [ウェブ巡回（新着）](src/component/CrawlerNews.ts) | CrawlerNews | crawler | ウェブページを巡回し（HTML ページのみ）、新着情報の差分を調べて通知する。 |
| [ウェブ巡回（リソース）](src/component/CrawlerResource.ts) | CrawlerResource | crawler | ウェブページを巡回し（HTML リソースに限らない）、レスポンスボディの差分を調べて通知する。 |
| [久米田康治 Twitter ユーザー履歴](src/component/TwitterUserInfoHistoryKumeta.ts) | TwitterUserInfoHistoryKumeta | kumetatwitter | 漫画家、久米田康治の Twitter アカウントについて、アイコン画像やフォロワー数などの変更を検知して [Twitter: @kumeta_icon](https://twitter.com/kumeta_icon) に投稿する。 |
| [まどか Twitter ユーザー履歴](src/component/TwitterUserInfoHistoryMadoka.ts) | TwitterUserInfoHistoryMadoka | madokatwitter | アニメ『魔法少女まどか☆マギカ』関連の Twitter アカウントについて、アイコン画像、バナー画像の変更を検知して履歴を保存する。 |

## 動作手順

1. `npm install`
1. `package.json` 内に書かれている build を実行
1. `log4js.json` を作成（下記にサンプルを掲載）
1. `configure` ディレクトリに共通設定ファイル `Common.json` を作成。ファイル定義は `configure/schema/Common.json` に [JSON Schema](http://json-schema.org/) で書かれている。
1. 同様に、 `configure` ディレクトリ内に動作させたい機能名の設定ファイルを作成（e.g. 「テスト」機能を動作させるなら、 `configure/schema/Test.json` を参考に `configure/Test.json` を作成）
1. データベース（SQLite）を使用する機能は DB ファイルを用意（現状、テーブル定義は非公開）。
1. `build` 実行（`package.json` の `scripts` 内に定義された `build` を実行することで、実行する JavaScript ファイルが出力される）。
1. プログラム実行（`package.json` の `scripts` 内に定義された `shell:{機能名}` を実行することで、プログラムが実行される）。

※ 上記手順のほか Amazon や Twitter などの外部 API を使用する機能については、当該のアカウント作成やアクセスキー申請なども必要になります。

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
