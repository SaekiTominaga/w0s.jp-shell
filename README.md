# w0s.jp-shell-node

w0s.jp サーバーで稼働しているシェルスクリプト（Node.js）

## 機能一覧

| 名称 | 機能名 | 使用データベース | 概要 |
|-|-|-|-|
| [テスト](src/component/Test.ts) | Test | ― | 動作確認用。環境整備する際は、まずはこれが動くことを目指す。 |
| [Amazon 商品情報チェッカー](src/component/AmazondpUpdate.ts) | AmazondpUpdate | amazonpa, diary | Amazon 商品情報を PA-API を使用して取得し、 DB に格納済みのデータを照合して更新する。 |
| [ウェブ巡回（新着）](src/component/CrawlerNews.ts) | CrawlerNews | crawler | ウェブページを巡回し（HTML ページのみ）、新着情報の差分を調べて通知する。 |
| [ウェブ巡回（リソース）](src/component/CrawlerResource.ts) | CrawlerResource | crawler | ウェブページを巡回し（HTML リソースに限らない）、レスポンスボディの差分を調べて通知する。 |
| [久米田康治 Twitter ユーザー履歴](src/component/TwitterUserInfoHistoryKumeta.ts) | TwitterUserInfoHistoryKumeta | kumetatwitter | 漫画家、久米田康治の Twitter アカウントについて、アイコン画像、バナー画像の変更を検知して画像ファイルを保存する。また、フォロワー数が一定数を超えるたびに通知を行うほか、フォロー数やいいね数などのユーザー情報もチェックする。 |
| [まどか Twitter ユーザー履歴](src/component/TwitterUserInfoHistoryMadoka.ts) | TwitterUserInfoHistoryMadoka | madokatwitter | アニメ『魔法少女まどか☆マギカ』関連の Twitter アカウントについて、アイコン画像、バナー画像の変更を検知して画像ファイルを保存する。 |

## 動作手順

1. `npm install`
1. `package.json` 内に書かれている build を実行
1. `log4js.json` を作成（下記にサンプルを掲載）
1. `configure` ディレクトリ内の `Common.d.ts` を参照しながら [jsonc](https://onury.io/jsonc/) 形式にて `Common.jsonc` を作成する。
1. 同様に、 `configure` ディレクトリ内にある動作させたい機能名の型定義ファイル（*.d.ts）を参照に、同じファイル名の *.jsonc ファイルを作成する（e.g. 「テスト」機能を動作させるなら `Test.jsonc` を作成）。
1. データベース（SQLite）を使用する機能は DB ファイルを用意する。テーブル定義は後日公開します。

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
