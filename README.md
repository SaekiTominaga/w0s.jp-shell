# w0s.jp-shell-node

w0s.jp サーバーで稼働しているシェルスクリプト（Node.js）

## 機能一覧

- [テスト](src/component/Test.ts)　動作確認用
- [Amazon 商品情報チェッカー](src/component/AmazondpUpdate.ts)　Amazon 商品情報を PA-API を使用して取得し、 DB に格納済みのデータを照合して更新する

## 動作手順

1. `npm install`
1. package.json 内に書かれている build を実行
1. log4js.json を作成
1. `mkdir configure` の後、そのディレクトリ内に common.jsonc を [jsonc](https://onury.io/jsonc/) 形式で記述
1. さらに、同じディレクトリ内に実行したい機能名をファイル名にした設定ファイルを記述（e.g. src/component/Hoge.ts は configure/Hoge.jsonc を参照する）

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

## configure/*.jsonc サンプル

必要なプロパティは src/Component.ts および src/component/*.ts のソースコードから読み解いてください。

※ 実際に使っているファイルはシークレットキーなど機密情報が含まれるため公開できないので、各自の環境に合わせて手動で書いていただく形となっています。

`this.configCommon` は common.jsonc を、 `this.config` は各機能名をファイル名にした設定ファイル内のプロパティを参照します。

例えば src/Component.ts の Component.noticeExecute() 内では `this.configCommon.mail.port` や `this.configCommon.mail.smtp` など E-mail 関連の情報を参照しているため、 common.jsonc に以下のような記述を設定します。

```jsonc
{
	/**
	 * E-mail
	 */
	"mail": {
		"smtp": "smtp.example.com",
		"user": "webmaster",
		"password": "password1234",
		"port": 587,
		"address": "webmaster@example.com"
	}
}
```
